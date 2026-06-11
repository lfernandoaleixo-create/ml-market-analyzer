import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { ensureUserAccessToken, forceRefreshUserAccessToken } from "../ml/oauthMl";
import { AccountProvider } from "../ml/accountProvider";
import { getCredentials, upsertCredentials } from "../dbMl";
import { resolveMlUserId } from "../ml/resolveMlUserId";

/**
 * Account ("Central de Gestão") router — real data from the connected seller
 * account using the owner OAuth token. Every procedure is protected: it needs a
 * logged-in Manus user whose ML OAuth connection is active.
 */

/** Resolve a ready AccountProvider (token + ML user id) or throw a friendly error. */
async function resolveAccount(manusUserId: number): Promise<AccountProvider> {
  const token = await ensureUserAccessToken(manusUserId);
  if (!token) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Conta do Mercado Livre não conectada. Vá em Configurações e conecte sua conta para ver os dados reais.",
    });
  }
  // Resolve the ML seller id. Source of truth, in order:
  //  1) the persisted `mlUserId` column (written by the OAuth token exchange)
  //  2) /users/me with the fresh token (authoritative)
  //  3) the numeric suffix of the access token (APP_USR-...-<userId>) as a
  //     last-resort heuristic
  // We DO NOT trust the local app user id — using it makes ML reply
  // "Searching another user items is restricted" and the dashboard shows zeros.
  const creds = await getCredentials(manusUserId);
  const { mlUserId, source } = await resolveMlUserId(token, creds?.mlUserId ?? null);
  if (!mlUserId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Não foi possível identificar a conta do Mercado Livre. Reconecte em Configurações.",
    });
  }
  // Backfill the column when it was resolved from /users/me or the token suffix
  // so subsequent requests use the fast, reliable persisted value.
  if (source !== "db" && creds && creds.mlUserId !== mlUserId) {
    await upsertCredentials(manusUserId, { mlUserId }).catch(() => {});
  }
  return new AccountProvider(token, mlUserId, "BRL", (staleToken) =>
    forceRefreshUserAccessToken(manusUserId, staleToken),
  );
}

const periodInput = z
  .object({
    /** Number of days to look back (default 180 — comfortably covers the
     *  account's whole life so early orders are never dropped). */
    days: z.number().int().min(1).max(365).optional(),
  })
  .optional();

function periodBounds(days = 180) {
  const to = Date.now();
  const from = to - days * 24 * 60 * 60 * 1000;
  return { fromMs: from, toMs: to };
}

export const accountRouter = router({
  /** Connection probe — is the ML account linked and the token valid? */
  connection: protectedProcedure.query(async ({ ctx }) => {
    const token = await ensureUserAccessToken(ctx.user.id);
    if (!token) return { connected: false as const };
    try {
      const account = await resolveAccount(ctx.user.id);
      const probe = await account.probe();
      return { connected: probe.ok, nickname: probe.nickname };
    } catch {
      return { connected: false as const };
    }
  }),

  /** Reputation + account health. */
  reputation: protectedProcedure.query(async ({ ctx }) => {
    const account = await resolveAccount(ctx.user.id);
    const rep = await account.getReputation();
    if (!rep) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Não foi possível carregar a reputação." });
    }
    return rep;
  }),

  /** Sales dashboard for a period (revenue, orders, ticket, daily, top products). */
  salesDashboard: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const account = await resolveAccount(ctx.user.id);
    const { fromMs, toMs } = periodBounds(input?.days ?? 180);
    return account.getSalesDashboard({ fromMs, toMs });
  }),

  /**
   * Sales dashboard for an EXPLICIT date range [fromMs,toMs]. Used by the month
   * selector, the custom range picker and the single-day card. When `fill` is
   * true the daily series includes every day in the range (zeros for no-sale
   * days) so the bar chart can render the whole month.
   */
  salesRange: protectedProcedure
    .input(
      z.object({
        fromMs: z.number().int().nonnegative(),
        toMs: z.number().int().positive(),
        fill: z.boolean().optional(),
        /** Max ranked products to return. 0 = full ranking (every product). */
        topLimit: z.number().int().min(0).max(2000).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.toMs < input.fromMs) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Intervalo de datas inválido." });
      }
      const account = await resolveAccount(ctx.user.id);
      return account.getSalesDashboard({
        fromMs: input.fromMs,
        toMs: input.toMs,
        fill: input.fill ?? false,
        topLimit: input.topLimit,
      });
    }),

  /**
   * Month-over-month comparison: KPI summaries for an explicit list of periods
   * (e.g. current month + previous month). Reuses the cached paid orders so the
   * whole comparison costs a single orders fetch.
   */
  salesPeriods: protectedProcedure
    .input(
      z.object({
        periods: z
          .array(
            z.object({
              key: z.string().min(1).max(40),
              fromMs: z.number().int().nonnegative(),
              toMs: z.number().int().positive(),
            }),
          )
          .min(1)
          .max(6),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await resolveAccount(ctx.user.id);
      const out: Record<string, Awaited<ReturnType<typeof account.getPeriodSummary>>> = {};
      for (const p of input.periods) {
        out[p.key] = await account.getPeriodSummary({ fromMs: p.fromMs, toMs: p.toMs });
      }
      return out;
    }),

  /** Lifetime store stats: first sale, days in business, total revenue & orders. */
  storeLifetime: protectedProcedure.query(async ({ ctx }) => {
    const account = await resolveAccount(ctx.user.id);
    return account.getStoreLifetime();
  }),

  /** Products sold on a single BRT calendar day (yyyy-mm-dd). */
  productsByDay: protectedProcedure
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use yyyy-mm-dd).") }))
    .query(async ({ ctx, input }) => {
      const account = await resolveAccount(ctx.user.id);
      return account.getProductsByDay(input.date);
    }),

  /** Listings performance (visits, sales, conversion, stock, status). */
  listings: protectedProcedure
    .input(
      z
        .object({
          /** Visits window in days (real period visits via time_window). */
          lastDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const account = await resolveAccount(ctx.user.id);
      return account.getListings({ lastDays: input?.lastDays ?? 30 });
    }),

  /** Post-sale summary (claims, cancellations). */
  postSale: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const account = await resolveAccount(ctx.user.id);
    const { fromMs } = periodBounds(input?.days ?? 180);
    return account.getPostSale({ fromMs });
  }),

  /**
   * Raio-X da Ficha Técnica — diagnose each listing's technical sheet
   * (complete vs incomplete, missing attributes, missing-required). Read-only.
   */
  technicalSpecs: protectedProcedure.query(async ({ ctx }) => {
    const account = await resolveAccount(ctx.user.id);
    return account.getTechnicalSpecs();
  }),
});
