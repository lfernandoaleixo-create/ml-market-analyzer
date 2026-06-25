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
} from "../pedroTimelineDb";

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

  // ─── Cronograma (overview independente) ──────────────────────────────────────
  overview: publicProcedure.query(() => getPedroTimelineOverview()),
});
