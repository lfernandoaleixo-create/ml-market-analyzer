import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { ensureUserAccessToken } from "../ml/oauthMl";
import { AccountProvider } from "../ml/accountProvider";

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
  // The owner ML user id is the numeric suffix of the access token
  // (APP_USR-<appId>-<date>-<hash>-<userId>). Fallback to /users/me if needed.
  let mlUserId = 0;
  const parts = token.split("-");
  const tail = Number(parts[parts.length - 1]);
  if (Number.isFinite(tail) && tail > 0) {
    mlUserId = tail;
  }
  if (!mlUserId) {
    const res = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const me = await res.json().catch(() => null);
    mlUserId = me?.id ?? 0;
  }
  if (!mlUserId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Não foi possível identificar a conta do Mercado Livre. Reconecte em Configurações.",
    });
  }
  return new AccountProvider(token, mlUserId);
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

  /** Listings performance (visits, sales, conversion, stock, status). */
  listings: protectedProcedure
    .input(z.object({ lastDays: z.number().int().min(1).max(90).optional() }).optional())
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
});
