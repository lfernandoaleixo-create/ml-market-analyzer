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

// Campos editáveis da aba KITS. Tudo opcional no update; strings aceitam vazio.
const rowFields = z.object({
  position: z.number().int().optional(),
  cadastradoMl: z.string().max(60).optional(),
  kit: z.string().max(400).optional(),
  eanGtin: z.string().max(60).optional(),
  sku: z.string().max(120).optional(),
  embalagem: z.string().max(200).optional(),
  ncm: z.string().max(20).optional(),
  precoClassico: z.string().max(40).optional(),
  precoPremium: z.string().max(40).optional(),
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
});
