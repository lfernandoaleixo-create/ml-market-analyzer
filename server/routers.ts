import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import { getOwnerUser } from "./db";
import { marketRouter } from "./routers/market";
import { monitorRouter } from "./routers/monitor";
import { accountRouter } from "./routers/account";
import { competitorsRouter } from "./routers/competitors";
import { adsRouter } from "./routers/ads";
import { financeRouter } from "./routers/finance";
import { projectRouter } from "./routers/project";
import { luisTimelineRouter } from "./routers/luisTimeline";
import { pedroRouter } from "./routers/pedro";
import { pedroTimelineRouter } from "./routers/pedroTimeline";
import { pricingRouter } from "./routers/pricing";
import { skuSheetRouter } from "./routers/skuSheet";
import { kitSheetRouter } from "./routers/kitSheet";
import { embalagemSheetRouter } from "./routers/embalagemSheet";

// Constant-time-ish string comparison to avoid trivially leaking length/early
// mismatch timing. Not security-critical here (single shared password), but
// cheap to do correctly.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    // Tells the frontend whether the shared-password gate is enabled, so it can
    // decide whether to render the password screen or the Mercado Livre login.
    gateInfo: publicProcedure.query(() => ({
      passwordGateEnabled: ENV.accessPassword.length > 0,
    })),

    // Shared access password login. Anyone with the link can type the password
    // to enter; on success we issue a session for the OWNER user, so every
    // protected procedure keeps working and shows the connected store's data.
    passwordLogin: publicProcedure
      .input(z.object({ password: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const expected = ENV.accessPassword;
        if (!expected) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "O acesso por senha não está configurado.",
          });
        }

        if (!safeEqual(input.password, expected)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Senha incorreta.",
          });
        }

        // Resolve the owner user (the account that has the store connected).
        // getOwnerUser falls back to the first admin / first user when the
        // OWNER_OPEN_ID env var is missing or out of sync, so shared-password
        // login keeps working in every deployment.
        const owner = await getOwnerUser();
        if (!owner) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Conta principal não encontrada. Faça login uma vez com a conta dona para inicializar.",
          });
        }

        const token = await sdk.createSessionToken(owner.openId, {
          name: owner.name ?? "Loja",
          expiresInMs: ONE_YEAR_MS,
        });

        ctx.res.cookie(COOKIE_NAME, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: ONE_YEAR_MS,
        });

        return { success: true } as const;
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  market: marketRouter,
  monitor: monitorRouter,
  account: accountRouter,
  competitors: competitorsRouter,
  ads: adsRouter,
  finance: financeRouter,
  project: projectRouter,
  luisTimeline: luisTimelineRouter,
  pedro: pedroRouter,
  pedroTimeline: pedroTimelineRouter,
  pricing: pricingRouter,
  skuSheet: skuSheetRouter,
  kitSheet: kitSheetRouter,
  embalagemSheet: embalagemSheetRouter,
});

export type AppRouter = typeof appRouter;
