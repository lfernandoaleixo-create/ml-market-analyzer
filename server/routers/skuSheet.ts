import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  createSkuRow,
  deleteSkuRow,
  listSkuRows,
  updateSkuRow,
} from "../skuSheetDb";
import mlCategoriesJson from "../../shared/mlCategories.json";
import type { MlCategoryTree } from "../../shared/skuSheet";

const categoryTree = mlCategoriesJson as MlCategoryTree;

// Schema dos campos editáveis. Tudo opcional no update; strings aceitam vazio.
const rowFields = z.object({
  position: z.number().int().optional(),
  productNumber: z.number().int().nullable().optional(),
  variantNumber: z.number().int().nullable().optional(),
  cadastradoMl: z.string().max(16).optional(),
  tipoSku: z.string().max(4).optional(),
  categoryId: z.string().max(24).nullable().optional(),
  categoryName: z.string().max(160).nullable().optional(),
  subCategoryId: z.string().max(24).nullable().optional(),
  subCategoryName: z.string().max(160).nullable().optional(),
  produto: z.string().max(300).optional(),
  variante: z.string().max(300).optional(),
  sku: z.string().max(120).optional(),
  gerarSkuKit: z.boolean().optional(),
  skuKit: z.string().max(120).optional(),
  eanGtin: z.string().max(60).optional(),
  ncm: z.string().max(20).optional(),
  gpc: z.string().max(30).optional(),
  cest: z.string().max(20).optional(),
  precoClassico: z.string().max(40).optional(),
  precoPremium: z.string().max(40).optional(),
  precoAtacado: z.string().max(40).optional(),
  embProfundidade: z.string().max(40).optional(),
  embLargura: z.string().max(40).optional(),
  embAltura: z.string().max(40).optional(),
  embPeso: z.string().max(40).optional(),
  caracteristicas: z.string().nullable().optional(),
  rowColor: z.string().max(20).optional(),
});

export const skuSheetRouter = router({
  /** Lista todas as linhas da planilha. */
  list: publicProcedure.query(() => listSkuRows()),

  /** Árvore completa de categorias do Mercado Livre (para seletores em cascata). */
  categories: publicProcedure.query(() => categoryTree.categories),

  /** Cria uma nova linha (em branco por padrão). */
  create: publicProcedure
    .input(rowFields.optional())
    .mutation(({ input }) => createSkuRow(input ?? {})),

  /** Atualiza uma linha existente. */
  update: publicProcedure
    .input(z.object({ id: z.number().int() }).and(rowFields))
    .mutation(({ input }) => {
      const { id, ...patch } = input;
      return updateSkuRow(id, patch);
    }),

  /** Exclui uma linha. */
  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteSkuRow(input.id);
      return { ok: true };
    }),
});
