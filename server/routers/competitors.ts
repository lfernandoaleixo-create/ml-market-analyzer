import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getAppConfig, upsertAppConfig } from "../dbMl";
import {
  createHeartbeatJob,
  deleteHeartbeatJob,
  updateHeartbeatJob,
} from "../_core/heartbeat";
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

type ClassifiedError = {
  code: "PRECONDITION_FAILED" | "FORBIDDEN" | "BAD_REQUEST" | "BAD_GATEWAY" | "INTERNAL_SERVER_ERROR";
  message: string;
};

/**
 * Pure classification of a competitor-data failure into a tRPC-ready code +
 * honest message. Exported for unit testing. Key behavior: parse/network
 * failures (e.g. an upstream HTML error page hitting JSON.parse, producing
 * "Unexpected token '<'") are treated as transient provider instability
 * (BAD_GATEWAY) rather than leaking a raw stack to the user.
 */
export function classifyCompetitorError(err: unknown): ClassifiedError {
  if (err instanceof UnwrangleError) {
    if (err.code === "not_configured") return { code: "PRECONDITION_FAILED", message: err.message };
    if (err.code === "credits" || err.code === "auth") return { code: "FORBIDDEN", message: err.message };
    if (err.code === "bad_input") return { code: "BAD_REQUEST", message: err.message };
    return { code: "BAD_GATEWAY", message: err.message };
  }
  const msg = err instanceof Error ? err.message : String(err);
  const looksLikeUpstream =
    err instanceof SyntaxError ||
    err instanceof TypeError ||
    /unexpected token|json|fetch failed|network|<!doctype|<html/i.test(msg);
  if (looksLikeUpstream) {
    return {
      code: "BAD_GATEWAY",
      message:
        "O provedor de dados respondeu de forma inesperada agora (instabilidade momentânea). Isso é temporário e não afeta a sua conta nem os seus créditos. Tente novamente em instantes.",
    };
  }
  return {
    code: "INTERNAL_SERVER_ERROR",
    message: "Erro inesperado ao consultar a inteligência de concorrentes.",
  };
}

/** Map a competitor-data failure to a friendly tRPC error (throws). */
function toTRPC(err: unknown): never {
  const { code, message } = classifyCompetitorError(err);
  throw new TRPCError({ code, message });
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

  // ---- Background-sweep schedule (Heartbeat cron) ------------------------
  // Keeps the Radar resilient to server restarts: a recurring job hits
  // /api/scheduled/radarSweep on the DEPLOYED site and fails any collection
  // orphaned by an instance recycle. The platform can only reach the published
  // domain, so this must be enabled AFTER deploy (dev sandboxes are unreachable).

  /** Current state of the background-sweep cron. */
  getSweepSchedule: protectedProcedure.query(async () => {
    const config = await getAppConfig();
    return {
      enabled: Boolean(config?.radarSweepCronTaskUid),
      taskUid: config?.radarSweepCronTaskUid ?? null,
    };
  }),

  /** Enable/disable the recurring background-sweep cron. */
  setSweepSchedule: protectedProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        // Every 2 minutes UTC — frequent enough to clear stuck searches fast.
        cron: z.string().default("0 */2 * * * *"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sessionToken =
        parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      const config = await getAppConfig();
      const existingUid = config?.radarSweepCronTaskUid ?? null;

      if (input.enabled) {
        if (existingUid) {
          await updateHeartbeatJob(
            existingUid,
            { cron: input.cron, enable: true },
            sessionToken,
          );
          return { enabled: true, taskUid: existingUid };
        }
        const job = await createHeartbeatJob(
          {
            name: "radar-sweep",
            cron: input.cron,
            path: "/api/scheduled/radarSweep",
            description:
              "Recupera buscas de concorrentes interrompidas por reinício do servidor",
          },
          sessionToken,
        );
        await upsertAppConfig({ radarSweepCronTaskUid: job.taskUid });
        return { enabled: true, taskUid: job.taskUid };
      } else {
        if (existingUid) {
          await deleteHeartbeatJob(existingUid, sessionToken);
          await upsertAppConfig({ radarSweepCronTaskUid: null });
        }
        return { enabled: false, taskUid: null };
      }
    }),
});
