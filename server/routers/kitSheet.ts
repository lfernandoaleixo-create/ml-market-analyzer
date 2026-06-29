import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  createKitRow,
  deleteKitRow,
  listKitRows,
  updateKitRow,
  listKitCustomColumns,
  createKitCustomColumn,
  renameKitCustomColumn,
  deleteKitCustomColumn,
  setKitCustomValue,
} from "../kitSheetDb";
import { migrateKitsToSku, listMigrationHistory } from "../migrationDb";

// Campos editáveis da aba KITS. Agora usa o MESMO formato da Planilha SKU.
// Os campos legados (kit, embalagem, etc.) continuam aceitos para preservar
// compatibilidade e não perder nada. Tudo opcional; strings aceitam vazio.
const rowFields = z.object({
  position: z.number().int().optional(),
  // --- Formato SKU ---
  productNumber: z.number().int().nullable().optional(),
  variantNumber: z.number().int().nullable().optional(),
  cadastradoMl: z.string().max(60).optional(),
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
  // --- Legado (preservado) ---
  kit: z.string().max(400).optional(),
  embalagem: z.string().max(200).optional(),
  profundidade: z.string().max(40).optional(),
  largura: z.string().max(40).optional(),
  alturaComprimento: z.string().max(40).optional(),
  kg: z.string().max(40).optional(),
  categoria: z.string().max(120).optional(),
  dimensoesGs1: z.string().max(12).optional(),
  baseAjustado: z.string().max(12).optional(),
  mlAjustado: z.string().max(12).optional(),
  formadoPor: z.string().max(300).optional(),
  observacao: z.string().nullable().optional(),
  rowColor: z.string().max(20).optional(),
  customValues: z.string().nullable().optional(),
});

export const kitSheetRouter = router({
  list: publicProcedure.query(() => listKitRows()),

  create: publicProcedure
    .input(rowFields.optional())
    .mutation(({ input }) => createKitRow(input ?? {})),

  update: publicProcedure
    .input(z.object({ id: z.number().int() }).and(rowFields))
    .mutation(({ input }) => {
      const { id, ...patch } = input;
      return updateKitRow(id, patch);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteKitRow(input.id);
      return { ok: true };
    }),

  // --- Colunas personalizadas ---

  listCustomColumns: publicProcedure.query(() => listKitCustomColumns()),

  createCustomColumn: publicProcedure
    .input(z.object({ name: z.string().max(120).optional() }))
    .mutation(({ input }) => createKitCustomColumn(input.name ?? "")),

  renameCustomColumn: publicProcedure
    .input(z.object({ id: z.number().int(), name: z.string().max(120) }))
    .mutation(({ input }) => renameKitCustomColumn(input.id, input.name)),

  deleteCustomColumn: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteKitCustomColumn(input.id);
      return { ok: true };
    }),

  setCustomValue: publicProcedure
    .input(
      z.object({
        rowId: z.number().int(),
        columnId: z.number().int(),
        value: z.string().max(2000),
      }),
    )
    .mutation(({ input }) => setKitCustomValue(input.rowId, input.columnId, input.value)),

  // --- Migração Kits -> Planilha SKU (MOVE) + Histórico ---

  /**
   * Move linhas de Kits para a Planilha SKU. Se `ids` vier vazio/omitido,
   * migra TODAS as linhas. Registra cada movimentação no histórico.
   */
  migrateToSku: publicProcedure
    .input(
      z
        .object({ ids: z.array(z.number().int()).optional() })
        .optional(),
    )
    .mutation(({ input, ctx }) =>
      migrateKitsToSku({
        ids: input?.ids,
        migratedByOpenId: ctx.user?.openId ?? null,
        migratedByName: ctx.user?.name ?? null,
      }),
    ),

  /** Lista o histórico de migração (o que saiu de Kits e foi para a SKU). */
  migrationHistory: publicProcedure.query(() => listMigrationHistory()),
});
