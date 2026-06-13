import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { ensureUserAccessToken, forceRefreshUserAccessToken } from "../ml/oauthMl";
import { AdsProvider, buildAdsInsights } from "../ml/adsProvider";
import { MLRateLimitError } from "../ml/accountProvider";
import { cachedAccount } from "../ml/accountCache";

/**
 * ADS ("Mercado Ads") router — REAL Product Ads data for the connected seller,
 * read via the owner OAuth token. Read-only by design: the current app scope
 * does not include advertising write (a PUT returns 401). When write is enabled
 * in the DevCenter and the account re-consents, mutating procedures can be added
 * here following the same resolve/runAds pattern.
 */

/** Translate an ML rate-limit signal into an honest, retryable tRPC error. */
async function runAds<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (err) {
    if (err instanceof MLRateLimitError) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: err.message });
    }
    throw err;
  }
}

/** Resolve a ready AdsProvider (token + refresh hook) or throw a friendly error. */
async function resolveAds(manusUserId: number): Promise<AdsProvider> {
  const token = await ensureUserAccessToken(manusUserId);
  if (!token) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Conta do Mercado Livre não conectada. Vá em Configurações e conecte sua conta para ver os dados de Ads.",
    });
  }
  return new AdsProvider(token, "MLB", (staleToken) =>
    forceRefreshUserAccessToken(manusUserId, staleToken),
  );
}

const periodInput = z
  .object({
    days: z.union([z.literal(7), z.literal(15), z.literal(30), z.literal(60), z.literal(90)]).optional(),
  })
  .optional();

/** Ads data changes slowly intraday; cache a bit longer than account data. */
const ADS_TTL_MS = 5 * 60 * 1000;

export const adsRouter = router({
  /** Quick connection/access probe for Ads (does the account have Product Ads?). */
  access: protectedProcedure.query(async ({ ctx }) => {
    const token = await ensureUserAccessToken(ctx.user.id);
    if (!token) return { connected: false as const, hasAds: false as const };
    try {
      const ads = await resolveAds(ctx.user.id);
      const advertiserId = await ads.getAdvertiserId();
      return {
        connected: true as const,
        hasAds: advertiserId != null,
        advertiserId: advertiserId ?? undefined,
      };
    } catch (err) {
      if (err instanceof MLRateLimitError) {
        return { connected: true as const, hasAds: true as const, rateLimited: true as const };
      }
      return { connected: false as const, hasAds: false as const };
    }
  }),

  /** Full dashboard payload (summary + top campaigns + top ads + insight count). */
  dashboard: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const days = input?.days ?? 30;
    return runAds(() =>
      cachedAccount(
        ctx.user.id,
        `ads:dashboard:${days}`,
        async () => {
          const ads = await resolveAds(ctx.user.id);
          return ads.getDashboard(Number(days));
        },
        ADS_TTL_MS,
      ),
    );
  }),

  /** All campaigns with metrics for the window. */
  campaigns: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const days = input?.days ?? 30;
    return runAds(() =>
      cachedAccount(
        ctx.user.id,
        `ads:campaigns:${days}`,
        async () => {
          const ads = await resolveAds(ctx.user.id);
          return ads.getCampaigns(Number(days));
        },
        ADS_TTL_MS,
      ),
    );
  }),

  /** Ads (item-level) with metrics, optionally filtered to a campaign. */
  ads: protectedProcedure
    .input(
      z.object({
        days: z.union([z.literal(7), z.literal(15), z.literal(30), z.literal(60), z.literal(90)]).optional(),
        campaignId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const days = input.days ?? 30;
      const key = `ads:ads:${days}:${input.campaignId ?? "all"}`;
      return runAds(() =>
        cachedAccount(
          ctx.user.id,
          key,
          async () => {
            const ads = await resolveAds(ctx.user.id);
            return ads.getAds(Number(days), input.campaignId);
          },
          ADS_TTL_MS,
        ),
      );
    }),

  /** Read-only intelligence: actionable insights computed from real metrics. */
  insights: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const days = input?.days ?? 30;
    return runAds(() =>
      cachedAccount(
        ctx.user.id,
        `ads:insights:${days}`,
        async () => {
          const ads = await resolveAds(ctx.user.id);
          const advertiserId = await ads.getAdvertiserId();
          if (!advertiserId) return [];
          const campaigns = await ads.getCampaigns(Number(days));
          const summary = ads.buildSummary(campaigns, advertiserId);
          const adRows = await ads.getAds(Number(days), undefined, 300);
          return buildAdsInsights(summary, campaigns, adRows);
        },
        ADS_TTL_MS,
      ),
    );
  }),
});
