import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import {
  createSkuRow,
  deleteSkuRow,
  listSkuRows,
  updateSkuRow,
  listCustomColumns,
  createCustomColumn,
  renameCustomColumn,
  deleteCustomColumn,
  setCustomValue,
  repairVariantNumbers,
  getVariations,
  upsertVariation,
} from "../skuSheetDb";
import { validateSkuPassword, logSkuChange, listSkuChangeLog } from "../skuProtection";
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
  customValues: z.string().nullable().optional(),
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

  // --- Colunas personalizadas ---

  /** Lista as colunas personalizadas. */
  listCustomColumns: publicProcedure.query(() => listCustomColumns()),

  /** Cria uma coluna personalizada. */
  createCustomColumn: publicProcedure
    .input(z.object({ name: z.string().max(120).optional() }))
    .mutation(({ input }) => createCustomColumn(input.name ?? "")),

  /** Renomeia uma coluna personalizada. */
  renameCustomColumn: publicProcedure
    .input(z.object({ id: z.number().int(), name: z.string().max(120) }))
    .mutation(({ input }) => renameCustomColumn(input.id, input.name)),

  /** Exclui uma coluna personalizada (e limpa seus valores). */
  deleteCustomColumn: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteCustomColumn(input.id);
      return { ok: true };
    }),

  /** Define o valor de uma coluna personalizada em uma linha. */
  setCustomValue: publicProcedure
    .input(
      z.object({
        rowId: z.number().int(),
        columnId: z.number().int(),
        value: z.string().max(2000),
      }),
    )
    .mutation(({ input }) => setCustomValue(input.rowId, input.columnId, input.value)),

  /**
   * Reparo de SKUs duplicados: recalcula as variantes para garantir unicidade
   * por grupo (tipo+categoria+Nº produto). `dryRun` (padrão) apenas retorna as
   * mudanças (antes/depois); com `apply=true` persiste as correções.
   */
  repairVariants: publicProcedure
    .input(z.object({ apply: z.boolean().optional() }).optional())
    .mutation(({ input }) => repairVariantNumbers(!(input?.apply ?? false))),

  // --- Variações SKU (10 sub-variações por linha) ---

  /** Retorna as 10 variações de uma linha SKU. */
  getVariations: publicProcedure
    .input(z.object({ skuRowId: z.number().int(), baseSku: z.string() }))
    .query(({ input }) => getVariations(input.skuRowId, input.baseSku)),

  /** Insere ou atualiza uma variação específica. */
  upsertVariation: publicProcedure
    .input(
      z.object({
        skuRowId: z.number().int(),
        variationIndex: z.number().int().min(1).max(10),
        baseSku: z.string(),
        ean: z.string().max(60).optional(),
        mlb: z.string().max(60).optional(),
        done: z.boolean().optional(),
      }),
    )
    .mutation(({ input }) =>
      upsertVariation(input.skuRowId, input.variationIndex, input.baseSku, {
        ean: input.ean,
        mlb: input.mlb,
        done: input.done,
      }),
    ),

  // --- Proteção de SKU (senha + histórico) ---

  /** Valida a senha de autorização para alterações em SKU. */
  validateSkuAuth: publicProcedure
    .input(z.object({ password: z.string().min(1) }))
    .mutation(({ input }) => {
      const authorizer = validateSkuPassword(input.password);
      if (!authorizer) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta. Use o nome de um dos autorizadores." });
      }
      return { valid: true, authorizer } as const;
    }),

  /** Registra uma alteração de SKU no histórico após autorização. */
  logSkuChange: publicProcedure
    .input(
      z.object({
        password: z.string().min(1),
        action: z.string().max(100),
        description: z.string().max(2000),
        affectedRowIds: z.array(z.number().int()),
        oldValues: z.any().optional(),
        newValues: z.any().optional(),
        affectedCount: z.number().int(),
      }),
    )
    .mutation(async ({ input }) => {
      const authorizer = validateSkuPassword(input.password);
      if (!authorizer) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta." });
      }
      await logSkuChange({
        action: input.action,
        authorizedBy: authorizer,
        description: input.description,
        affectedRowIds: input.affectedRowIds,
        oldValues: input.oldValues,
        newValues: input.newValues,
        affectedCount: input.affectedCount,
      });
      return { ok: true, authorizer } as const;
    }),

  /** Lista o histórico de alterações de SKU. */
  skuChangeHistory: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
    .query(({ input }) => listSkuChangeLog(input?.limit ?? 50)),
});
