import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { marketRouter } from "./routers/market";
import { monitorRouter } from "./routers/monitor";
import { accountRouter } from "./routers/account";
import { competitorsRouter } from "./routers/competitors";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
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
});

export type AppRouter = typeof appRouter;
