import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  isConfigured,
  searchProducts,
  getProductSellers,
  getProductDetail,
  UnwrangleError,
} from "../competitors/unwrangle";
import { diagnoseCompetitor } from "../competitors/diagnosis";
import { getSourcesStatus, searchAllSources } from "../competitors/orchestrator";
import {
  createSearch,
  findLatestByQuery,
  getSearchView,
  listRecentSearches,
  normalizeQuery,
  recoverStalledForUser,
} from "../competitors/searchStore";
import { isInFlight, launchSearchJob } from "../competitors/searchJob";
import { getUsageStatus } from "../competitors/usage";
import type { MyListingBaseline } from "@shared/competitors";

/**
 * "Radar de Concorrentes" router.
 *
 * SECURITY: every procedure here uses ONLY the isolated Unwrangle client. It
 * never touches the ML OAuth token, the seller account or the CNPJ. The user's
 * own listing baseline (for the diagnosis) is passed in by the client from the
 * already-protected account data — it is just numbers/labels, never credentials.
 */

/** Map an UnwrangleError to a friendly tRPC error. */
function toTRPC(err: unknown): never {
  if (err instanceof UnwrangleError) {
    if (err.code === "not_configured") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: err.message });
    }
    if (err.code === "credits" || err.code === "auth") {
      throw new TRPCError({ code: "FORBIDDEN", message: err.message });
    }
    if (err.code === "bad_input") {
      throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
    }
    throw new TRPCError({ code: "BAD_GATEWAY", message: err.message });
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Erro inesperado ao consultar a inteligência de concorrentes.",
  });
}

const myListingSchema = z.object({
  title: z.string(),
  price: z.number().nullable(),
  soldQuantity: z.number().nullable(),
  reputationLabel: z.string().nullable(),
  hasFull: z.boolean().nullable(),
  hasFreeInstallments: z.boolean().nullable(),
  photosCount: z.number().nullable(),
  rating: z.number().nullable(),
  totalRatings: z.number().nullable(),
});

export const competitorsRouter = router({
  /** Public probe — is the third-party intelligence API configured? */
  status: publicProcedure.query(() => {
    return { configured: isConfigured() } as const;
  }),

  /**
   * Multi-source status: which of the 4 sources are configured. Public so the
   * Radar can render the source panel even before a search.
   */
  sourcesStatus: publicProcedure.query(() => {
    return getSourcesStatus();
  }),

  /**
   * Triangulated competitor search across ALL configured sources. Per-source
   * failures are isolated, so a result is returned as long as ANY source
   * answers; the response carries per-source health + per-field consensus.
   */
  searchMulti: protectedProcedure
    .input(z.object({ query: z.string().min(2, "Digite ao menos 2 caracteres.") }))
    .query(async ({ input }) => {
      const result = await searchAllSources(input.query.trim());
      if (
        result.competitors.length === 0 &&
        result.sourcesUsed.every((s) => !s.configured || s.health !== "ok")
      ) {
        const anyConfigured = result.sourcesUsed.some((s) => s.configured);
        if (!anyConfigured) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Nenhuma fonte de dados de concorrentes está configurada no momento.",
          });
        }
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message:
            "As fontes de dados estão temporariamente indisponíveis. Tente novamente em instantes.",
        });
      }
      return result;
    }),

  /**
   * ASYNC competitor search (job + cache).
   *
   * Starts (or reuses) a background collection for the term and returns the
   * search id immediately. The client then polls `getSearch` until the status
   * is "done"/"failed". When a recent finished result exists and `refresh` is
   * false, we return it straight from cache (no new collection, no credits).
   */
  startSearch: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2, "Digite ao menos 2 caracteres."),
        refresh: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const query = input.query.trim();
      const normalized = normalizeQuery(query);

      // Reuse a fresh, finished cache hit unless an explicit refresh is asked.
      if (!input.refresh) {
        const existing = await findLatestByQuery(userId, normalized);
        if (existing) {
          // If a job is already pending/running, keep polling the same row.
          if (existing.status === "pending" || existing.status === "running") {
            return { id: existing.id, cached: false } as const;
          }
          // Reuse a recent successful result as cache.
          if (existing.status === "done") {
            const finishedAt = existing.finishedAt ?? 0;
            const fresh = Date.now() - finishedAt < 6 * 60 * 60 * 1000;
            if (fresh) return { id: existing.id, cached: true } as const;
          }
        }
      }

      const id = await createSearch(userId, query);
      launchSearchJob(id, query);
      return { id, cached: false } as const;
    }),

  /** Poll a search by id; include the unified competitors when finished. */
  getSearch: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        includeResults: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Runtime fallback: before reading, recover any of this user's orphaned
      // collections (e.g. lost to a server restart) so the poll never hangs
      // on "Coletando…" forever — even before the sweep cron is deployed.
      // Jobs still alive in THIS process are excluded via isInFlight.
      await recoverStalledForUser(ctx.user!.id, Date.now(), isInFlight);
      const view = await getSearchView(
        ctx.user!.id,
        input.id,
        input.includeResults ?? true,
      );
      if (!view) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Busca não encontrada." });
      }
      return view;
    }),

  /**
   * Consumption panel: per-source quota/state (ScrapingBee credits, Oxylabs /
   * Unwrangle panel-only) plus the user's own search counts (today / 30 days).
   * Each search consumes the paid sources, so this gives the team visibility
   * over the "tank" before it runs low.
   */
  usageStatus: protectedProcedure.query(async ({ ctx }) => {
    return getUsageStatus(ctx.user!.id);
  }),

  /** The user's most recent searches (for the "recent searches" panel). */
  recentSearches: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      await recoverStalledForUser(ctx.user!.id, Date.now(), isInFlight);
      return listRecentSearches(ctx.user!.id, input?.limit ?? 12);
    }),

  /** Active competitor search by keyword / category term. */
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2, "Digite ao menos 2 caracteres."),
        page: z.number().int().min(1).max(20).optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await searchProducts(input.query.trim(), input.page ?? 1);
      } catch (err) {
        toTRPC(err);
      }
    }),

  /** All sellers competing on a specific product page. */
  sellers: protectedProcedure
    .input(
      z.object({
        productUrl: z.string().url("URL de produto inválida."),
        page: z.number().int().min(1).max(20).optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await getProductSellers(input.productUrl, input.page ?? 1);
      } catch (err) {
        toTRPC(err);
      }
    }),

  /** Full product detail for a single competitor listing. */
  detail: protectedProcedure
    .input(z.object({ productUrl: z.string().url("URL de produto inválida.") }))
    .query(async ({ input }) => {
      try {
        return await getProductDetail(input.productUrl);
      } catch (err) {
        toTRPC(err);
      }
    }),

  /**
   * Diagnose "por que ele vende mais": fetch the competitor detail and compare
   * it factor-by-factor against MY listing baseline (passed by the client).
   */
  diagnose: protectedProcedure
    .input(
      z.object({
        competitorUrl: z.string().url("URL de produto inválida."),
        myListing: myListingSchema,
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const competitor = await getProductDetail(input.competitorUrl);
        const baseline: MyListingBaseline = input.myListing;
        return diagnoseCompetitor(baseline, competitor);
      } catch (err) {
        toTRPC(err);
      }
    }),
});
