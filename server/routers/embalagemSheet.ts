import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  createEmbalagemRow,
  deleteEmbalagemRow,
  listEmbalagemRows,
  updateEmbalagemRow,
  listEmbalagemCustomColumns,
  createEmbalagemCustomColumn,
  renameEmbalagemCustomColumn,
  deleteEmbalagemCustomColumn,
  setEmbalagemCustomValue,
} from "../embalagemSheetDb";

// Campos editáveis da aba EMBALAGENS.
const rowFields = z.object({
  position: z.number().int().optional(),
  produto: z.string().max(400).optional(),
  eanGtin: z.string().max(60).optional(),
  sku: z.string().max(120).optional(),
  embalagem: z.string().max(200).optional(),
  ncm: z.string().max(20).optional(),
  gpc: z.string().max(30).optional(),
  cest: z.string().max(20).optional(),
  precoClassico: z.string().max(40).optional(),
  precoPremium: z.string().max(40).optional(),
  altura: z.string().max(40).optional(),
  largura: z.string().max(40).optional(),
  comprimento: z.string().max(40).optional(),
  kg: z.string().max(40).optional(),
  categoria: z.string().max(120).optional(),
  observacao: z.string().nullable().optional(),
  rowColor: z.string().max(20).optional(),
  customValues: z.string().nullable().optional(),
});

export const embalagemSheetRouter = router({
  list: publicProcedure.query(() => listEmbalagemRows()),

  create: publicProcedure
    .input(rowFields.optional())
    .mutation(({ input }) => createEmbalagemRow(input ?? {})),

  update: publicProcedure
    .input(z.object({ id: z.number().int() }).and(rowFields))
    .mutation(({ input }) => {
      const { id, ...patch } = input;
      return updateEmbalagemRow(id, patch);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteEmbalagemRow(input.id);
      return { ok: true };
    }),

  // --- Colunas personalizadas ---

  listCustomColumns: publicProcedure.query(() => listEmbalagemCustomColumns()),

  createCustomColumn: publicProcedure
    .input(z.object({ name: z.string().max(120).optional() }))
    .mutation(({ input }) => createEmbalagemCustomColumn(input.name ?? "")),

  renameCustomColumn: publicProcedure
    .input(z.object({ id: z.number().int(), name: z.string().max(120) }))
    .mutation(({ input }) => renameEmbalagemCustomColumn(input.id, input.name)),

  deleteCustomColumn: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteEmbalagemCustomColumn(input.id);
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
    .mutation(({ input }) => setEmbalagemCustomValue(input.rowId, input.columnId, input.value)),
});
