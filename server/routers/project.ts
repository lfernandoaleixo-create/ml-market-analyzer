import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import {
  PROJECT_STEP_ORDER,
  createProjectComment,
  createProjectDocument,
  createProjectProduct,
  createProjectTodo,
  deleteProjectComment,
  deleteProjectDocument,
  deleteProjectProduct,
  deleteProjectTodo,
  getAllProjectProducts,
  getProjectCommentById,
  getProjectCommentsByProduct,
  getProjectDocumentsByProduct,
  getProjectProductById,
  getProjectProductsForDashboard,
  getProjectProductsForTimeline,
  getProjectTimelineByProduct,
  getProjectTodosByProduct,
  updateProjectProduct,
  updateProjectTodo,
  upsertProjectTimelineStep,
} from "../projectDb";

const STEP_VALUES = PROJECT_STEP_ORDER;
const PRIORITY_VALUES = ["alta", "media", "baixa"] as const;
const STATUS_VALUES = ["pendente", "em_andamento", "concluido"] as const;

export const projectRouter = router({
  // ─── Products ────────────────────────────────────────────────────────────
  products: router({
    list: publicProcedure
      .input(
        z
          .object({
            search: z.string().optional(),
            priority: z.string().optional(),
            currentStep: z.string().optional(),
          })
          .optional(),
      )
      .query(({ input }) => getAllProjectProducts(input)),

    byId: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getProjectProductById(input.id)),

    create: publicProcedure
      .input(
        z.object({
          name: z.string().min(1),
          priority: z.enum(PRIORITY_VALUES).default("media"),
          description: z.string().optional(),
          supplier: z.string().optional(),
          supplierContact: z.string().optional(),
          notes: z.string().optional(),
        }),
      )
      .mutation(({ input, ctx }) =>
        createProjectProduct({ ...input, createdBy: ctx.user?.id ?? null }),
      ),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          priority: z.enum(PRIORITY_VALUES).optional(),
          description: z.string().optional().nullable(),
          supplier: z.string().optional().nullable(),
          supplierContact: z.string().optional().nullable(),
          notes: z.string().optional().nullable(),
          imageUrl: z.string().optional().nullable(),
          expectedArrival: z.date().optional().nullable(),
        }),
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateProjectProduct(id, data);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteProjectProduct(input.id)),

    timelineOverview: publicProcedure.query(() => getProjectProductsForTimeline()),
    dashboardOverview: publicProcedure.query(() => getProjectProductsForDashboard()),
  }),

  // ─── Timeline ────────────────────────────────────────────────────────────
  timeline: router({
    byProduct: publicProcedure
      .input(z.object({ productId: z.number() }))
      .query(({ input }) => getProjectTimelineByProduct(input.productId)),

    update: publicProcedure
      .input(
        z.object({
          productId: z.number(),
          step: z.enum(STEP_VALUES),
          status: z.enum(STATUS_VALUES).optional(),
          notes: z.string().optional().nullable(),
          targetDate: z.date().optional().nullable(),
        }),
      )
      .mutation(({ input }) => {
        const { productId, step, ...data } = input;
        return upsertProjectTimelineStep(productId, step, data);
      }),
  }),

  // ─── Todos ─────────────────────────────────────────────────────────────────
  todos: router({
    byProduct: publicProcedure
      .input(z.object({ productId: z.number() }))
      .query(({ input }) => getProjectTodosByProduct(input.productId)),

    create: publicProcedure
      .input(
        z.object({
          productId: z.number(),
          title: z.string().min(1),
          description: z.string().optional(),
          assignedTo: z.number().optional().nullable(),
          dueDate: z.date().optional().nullable(),
        }),
      )
      .mutation(({ input, ctx }) =>
        createProjectTodo({ ...input, createdBy: ctx.user?.id ?? null }),
      ),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().min(1).optional(),
          description: z.string().optional().nullable(),
          completed: z.boolean().optional(),
          assignedTo: z.number().optional().nullable(),
          dueDate: z.date().optional().nullable(),
        }),
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateProjectTodo(id, data);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteProjectTodo(input.id)),
  }),

  // ─── Documents ───────────────────────────────────────────────────────────
  documents: router({
    byProduct: publicProcedure
      .input(z.object({ productId: z.number() }))
      .query(({ input }) => getProjectDocumentsByProduct(input.productId)),

    upload: publicProcedure
      .input(
        z.object({
          productId: z.number(),
          name: z.string(),
          base64: z.string(),
          mimeType: z.string(),
          type: z.enum(["documento", "foto"]),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.base64, "base64");
        const fileKey = `project/${input.productId}/${Date.now()}-${input.name}`;
        const { key, url } = await storagePut(fileKey, buffer, input.mimeType);
        await createProjectDocument({
          productId: input.productId,
          name: input.name,
          url,
          fileKey: key,
          type: input.type,
          uploadedBy: ctx.user?.id ?? null,
        });
        return { url, key };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteProjectDocument(input.id)),
  }),

  // ─── Comments ────────────────────────────────────────────────────────────
  comments: router({
    list: publicProcedure
      .input(z.object({ productId: z.number() }))
      .query(({ input }) => getProjectCommentsByProduct(input.productId)),

    create: publicProcedure
      .input(
        z.object({
          productId: z.number(),
          content: z.string().min(1).max(2000),
          guestName: z.string().min(1).max(100).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        await createProjectComment({
          productId: input.productId,
          userId: ctx.user?.id ?? null,
          guestName: ctx.user ? null : input.guestName ?? "Visitante",
          content: input.content.trim(),
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const comment = await getProjectCommentById(input.id);
        if (!comment) throw new TRPCError({ code: "NOT_FOUND", message: "Comentário não encontrado" });
        if (comment.userId !== ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você só pode excluir seus próprios comentários" });
        }
        await deleteProjectComment(input.id);
        return { success: true };
      }),
  }),
});
