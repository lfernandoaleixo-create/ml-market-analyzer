import type { TrpcContext } from "../_core/context";
import { protectedProcedure, router } from "../_core/trpc";
import { alphaOwnerId } from "./actor";
import { catalogRouter } from "./catalogRouter";
import { categorySuggestionInputSchema, getCategoryStatus, suggestCategory } from "./categoryService";
import { documentsRouter } from "./documentsRouter";

const requestIp = (req: TrpcContext["req"]): string =>
  req.ip?.trim() || req.socket?.remoteAddress?.trim() || "unknown";

/** Uses the existing session; shared-password users share the store ownerId. */
export const alphaRouter = router({
  catalog: catalogRouter,
  pricing: router({
    suggestCategory: protectedProcedure.input(categorySuggestionInputSchema).mutation(({ ctx, input }) => {
      alphaOwnerId(ctx.user);
      return suggestCategory(input, requestIp(ctx.req));
    }),
    status: protectedProcedure.query(({ ctx }) => {
      alphaOwnerId(ctx.user);
      return getCategoryStatus();
    }),
  }),
  documents: documentsRouter,
});

export type AlphaRouter = typeof alphaRouter;
