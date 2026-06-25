import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  createPedroStage,
  deletePedroStage,
  getPedroStages,
  getPedroTimelineOverview,
  renamePedroStage,
  reorderPedroStages,
  updatePedroStageMeta,
  setPedroStepDone,
  setPedroStepDoneSequential,
  setPedroStepNote,
  getPedroStageItems,
  createPedroStageItem,
  updatePedroStageItem,
  deletePedroStageItem,
  getEffectivePedroItems,
  startPedroProductOverride,
  createPedroProductStageItem,
  updatePedroProductStageItem,
  deletePedroProductStageItem,
  resetPedroProductOverride,
  setPedroItemAnswer,
} from "../pedroTimelineDb";

const itemTypeSchema = z.enum(["checkbox", "text"]);

export const pedroTimelineRouter = router({
  // ─── Etapas (modelo único e editável) ──────────────────────────────────────
  stages: router({
    list: publicProcedure.query(() => getPedroStages()),

    create: publicProcedure
      .input(z.object({ label: z.string().min(1).max(255) }))
      .mutation(({ input }) => createPedroStage(input.label)),

    rename: publicProcedure
      .input(z.object({ id: z.number(), label: z.string().min(1).max(255) }))
      .mutation(({ input }) => renamePedroStage(input.id, input.label)),

    updateMeta: publicProcedure
      .input(
        z.object({
          id: z.number(),
          label: z.string().min(1).max(255).optional(),
          category: z.string().max(64).nullable().optional(),
          details: z.string().max(5000).nullable().optional(),
        }),
      )
      .mutation(({ input }) =>
        updatePedroStageMeta(input.id, {
          label: input.label,
          category: input.category,
          details: input.details,
        }),
      ),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deletePedroStage(input.id)),

    reorder: publicProcedure
      .input(z.object({ orderedIds: z.array(z.number()) }))
      .mutation(({ input }) => reorderPedroStages(input.orderedIds)),
  }),

  // ─── Progresso por produto + etapa ───────────────────────────────────────────
  progress: router({
    setDone: publicProcedure
      .input(z.object({ productId: z.number(), stageId: z.number(), done: z.boolean() }))
      .mutation(async ({ input }) => {
        await setPedroStepDone(input.productId, input.stageId, input.done);
        return { ok: true };
      }),

    setDoneSequential: publicProcedure
      .input(z.object({ productId: z.number(), stageId: z.number(), done: z.boolean() }))
      .mutation(({ input }) =>
        setPedroStepDoneSequential(input.productId, input.stageId, input.done),
      ),

    setNote: publicProcedure
      .input(
        z.object({
          productId: z.number(),
          stageId: z.number(),
          note: z.string().max(2000).nullable(),
        }),
      )
      .mutation(async ({ input }) => {
        await setPedroStepNote(input.productId, input.stageId, input.note);
        return { ok: true };
      }),
  }),

  // ─── Itens-PADRÃO de checklist/pergunta por etapa (Etapas do Pedro) ──────────
  items: router({
    listDefault: publicProcedure
      .input(z.object({ stageId: z.number() }))
      .query(({ input }) => getPedroStageItems(input.stageId)),

    createDefault: publicProcedure
      .input(
        z.object({
          stageId: z.number(),
          type: itemTypeSchema,
          label: z.string().min(1).max(500),
        }),
      )
      .mutation(({ input }) =>
        createPedroStageItem(input.stageId, input.type, input.label),
      ),

    updateDefault: publicProcedure
      .input(
        z.object({
          id: z.number(),
          type: itemTypeSchema.optional(),
          label: z.string().min(1).max(500).optional(),
        }),
      )
      .mutation(({ input }) =>
        updatePedroStageItem(input.id, { type: input.type, label: input.label }),
      ),

    deleteDefault: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deletePedroStageItem(input.id)),
  }),

  // ─── Override de itens por PRODUTO+etapa (lápis dentro do produto) ───────────
  productItems: router({
    effective: publicProcedure
      .input(z.object({ productId: z.number(), stageId: z.number() }))
      .query(({ input }) => getEffectivePedroItems(input.productId, input.stageId)),

    startOverride: publicProcedure
      .input(z.object({ productId: z.number(), stageId: z.number() }))
      .mutation(({ input }) => startPedroProductOverride(input.productId, input.stageId)),

    create: publicProcedure
      .input(
        z.object({
          productId: z.number(),
          stageId: z.number(),
          type: itemTypeSchema,
          label: z.string().min(1).max(500),
        }),
      )
      .mutation(({ input }) =>
        createPedroProductStageItem(input.productId, input.stageId, input.type, input.label),
      ),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          type: itemTypeSchema.optional(),
          label: z.string().min(1).max(500).optional(),
        }),
      )
      .mutation(({ input }) =>
        updatePedroProductStageItem(input.id, { type: input.type, label: input.label }),
      ),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deletePedroProductStageItem(input.id)),

    reset: publicProcedure
      .input(z.object({ productId: z.number(), stageId: z.number() }))
      .mutation(({ input }) => resetPedroProductOverride(input.productId, input.stageId)),
  }),

  // ─── Respostas por produto (auto-conclui a bolinha) ─────────────────────────
  answers: router({
    set: publicProcedure
      .input(
        z.object({
          productId: z.number(),
          stageId: z.number(),
          itemSource: z.enum(["default", "product"]),
          itemId: z.number(),
          checked: z.boolean().optional(),
          textValue: z.string().max(2000).nullable().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        await setPedroItemAnswer(input.productId, input.stageId, input.itemSource, input.itemId, {
          checked: input.checked,
          textValue: input.textValue,
        });
        return { ok: true };
      }),
  }),

  // ─── Cronograma (overview independente) ──────────────────────────────────────
  overview: publicProcedure.query(() => getPedroTimelineOverview()),
});
