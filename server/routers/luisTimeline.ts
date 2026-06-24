import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  createLuisStage,
  deleteLuisStage,
  getLuisStages,
  getLuisTimelineOverview,
  renameLuisStage,
  reorderLuisStages,
  setLuisStepDone,
  setLuisStepNote,
} from "../luisTimelineDb";

export const luisTimelineRouter = router({
  // ─── Etapas (modelo único e editável) ──────────────────────────────────────
  stages: router({
    list: publicProcedure.query(() => getLuisStages()),

    create: publicProcedure
      .input(z.object({ label: z.string().min(1).max(255) }))
      .mutation(({ input }) => createLuisStage(input.label)),

    rename: publicProcedure
      .input(z.object({ id: z.number(), label: z.string().min(1).max(255) }))
      .mutation(({ input }) => renameLuisStage(input.id, input.label)),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteLuisStage(input.id)),

    reorder: publicProcedure
      .input(z.object({ orderedIds: z.array(z.number()) }))
      .mutation(({ input }) => reorderLuisStages(input.orderedIds)),
  }),

  // ─── Progresso por produto + etapa ───────────────────────────────────────────
  progress: router({
    setDone: publicProcedure
      .input(z.object({ productId: z.number(), stageId: z.number(), done: z.boolean() }))
      .mutation(async ({ input }) => {
        await setLuisStepDone(input.productId, input.stageId, input.done);
        return { ok: true };
      }),

    setNote: publicProcedure
      .input(
        z.object({
          productId: z.number(),
          stageId: z.number(),
          note: z.string().max(2000).nullable(),
        }),
      )
      .mutation(async ({ input }) => {
        await setLuisStepNote(input.productId, input.stageId, input.note);
        return { ok: true };
      }),
  }),

  // ─── Cronograma (overview com mesmos itens do Projeto) ──────────────────────
  overview: publicProcedure.query(() => getLuisTimelineOverview()),
});
