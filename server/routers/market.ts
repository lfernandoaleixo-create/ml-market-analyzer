import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { compareProducts, rankByPotential } from "../ml/analysis";
import { DEMO_CATEGORIES } from "../ml/demoData";
import { getProvider } from "../ml/provider";
import { getCredentials } from "../dbMl";
import type { MlCategory } from "@shared/ml";

/**
 * Resolve the active provider for a given user, honoring DB-stored credentials.
 */
async function providerForUser(userId?: number) {
  if (userId) {
    const creds = await getCredentials(userId);
    if (creds && creds.appId && creds.clientSecret) {
      return getProvider({ appId: creds.appId, clientSecret: creds.clientSecret });
    }
  }
  return getProvider(null);
}

function categoryById(id?: string | null): MlCategory {
  if (!id) return DEMO_CATEGORIES[0];
  return DEMO_CATEGORIES.find((c) => c.id === id) ?? DEMO_CATEGORIES[0];
}

export const marketRouter = router({
  /** Provider mode + credential status, used to show the data-source banner. */
  status: publicProcedure.query(async ({ ctx }) => {
    const provider = await providerForUser(ctx.user?.id);
    return {
      mode: provider.mode,
      message:
        provider.mode === "demo"
          ? "Operando com dados de demonstração realistas. Conecte suas credenciais do Mercado Livre para dados ao vivo."
          : "Conectado à API oficial do Mercado Livre.",
    };
  }),

  /** All categories with demand index. */
  categories: publicProcedure.query(async ({ ctx }) => {
    const provider = await providerForUser(ctx.user?.id);
    return provider.getCategories();
  }),

  /** Product search by keyword and/or category. */
  search: publicProcedure
    .input(
      z.object({
        keyword: z.string().trim().optional(),
        categoryId: z.string().trim().optional(),
        limit: z.number().int().min(1).max(50).optional(),
        sortBy: z.enum(["relevance", "sales", "price_asc", "price_desc", "rating"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const provider = await providerForUser(ctx.user?.id);
      const result = await provider.search({
        keyword: input.keyword,
        categoryId: input.categoryId,
        limit: input.limit ?? 30,
      });
      const sorted = [...result.products];
      switch (input.sortBy) {
        case "sales":
          sorted.sort((a, b) => b.soldQuantity - a.soldQuantity);
          break;
        case "price_asc":
          sorted.sort((a, b) => a.price - b.price);
          break;
        case "price_desc":
          sorted.sort((a, b) => b.price - a.price);
          break;
        case "rating":
          sorted.sort((a, b) => b.rating - a.rating);
          break;
        default:
          break; // relevance = provider order
      }
      return { ...result, products: sorted };
    }),

  /** Best sellers ranking for a category, with server-side sorting. */
  bestSellers: publicProcedure
    .input(
      z.object({
        categoryId: z.string().trim().optional(),
        limit: z.number().int().min(1).max(50).optional(),
        sortBy: z.enum(["sales", "price_asc", "price_desc", "rating"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const provider = await providerForUser(ctx.user?.id);
      const result = await provider.search({
        categoryId: input.categoryId,
        limit: input.limit ?? 20,
      });
      const ranked = [...result.products];
      switch (input.sortBy) {
        case "price_asc":
          ranked.sort((a, b) => a.price - b.price);
          break;
        case "price_desc":
          ranked.sort((a, b) => b.price - a.price);
          break;
        case "rating":
          ranked.sort((a, b) => b.rating - a.rating);
          break;
        case "sales":
        default:
          ranked.sort((a, b) => b.soldQuantity - a.soldQuantity);
          break;
      }
      return { category: categoryById(input.categoryId), products: ranked };
    }),

  /** Trends/keywords for a category. */
  trends: publicProcedure
    .input(z.object({ categoryId: z.string().trim().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const provider = await providerForUser(ctx.user?.id);
      return provider.getTrends(input?.categoryId);
    }),

  /**
   * Opportunities: products ranked by short-term potential, with the full
   * factor breakdown so the UI can explain WHY each is an opportunity.
   */
  opportunities: publicProcedure
    .input(
      z.object({
        categoryId: z.string().trim().optional(),
        limit: z.number().int().min(1).max(30).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const provider = await providerForUser(ctx.user?.id);
      const category = categoryById(input.categoryId);
      const result = await provider.search({
        categoryId: input.categoryId,
        limit: 30,
      });
      const ranked = rankByPotential(result.products, category);
      return {
        category,
        analyses: ranked.slice(0, input.limit ?? 12),
      };
    }),

  /** Detailed potential analysis for one product (by id). */
  analyzeProduct: publicProcedure
    .input(z.object({ itemId: z.string(), categoryId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const provider = await providerForUser(ctx.user?.id);
      const product = await provider.getProduct(input.itemId);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado." });
      const category = categoryById(input.categoryId ?? product.categoryId);
      const result = await provider.search({ categoryId: category.id, limit: 30 });
      const ranked = rankByPotential([product, ...result.products], category);
      const found = ranked.find((a) => a.product.id === product.id) ?? ranked[0];
      return found;
    }),

  /** Side-by-side comparison of 2..4 products by id. */
  compare: publicProcedure
    .input(z.object({ itemIds: z.array(z.string()).min(2).max(4) }))
    .query(async ({ ctx, input }) => {
      const provider = await providerForUser(ctx.user?.id);
      const products = [];
      for (const id of input.itemIds) {
        const p = await provider.getProduct(id);
        if (p) products.push(p);
      }
      if (products.length < 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não foi possível resolver pelo menos 2 produtos para comparar.",
        });
      }
      return compareProducts(products);
    }),

  /**
   * Resolve a batch of products by ids (used by the comparison picker to show
   * chosen items). Returns whatever resolves.
   */
  productsByIds: publicProcedure
    .input(z.object({ itemIds: z.array(z.string()).min(1).max(8) }))
    .query(async ({ ctx, input }) => {
      const provider = await providerForUser(ctx.user?.id);
      const out = [];
      for (const id of input.itemIds) {
        const p = await provider.getProduct(id);
        if (p) out.push(p);
      }
      return out;
    }),
});
