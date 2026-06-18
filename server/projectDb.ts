import { and, asc, eq, like } from "drizzle-orm";
import {
  InsertProjectComment,
  InsertProjectDocument,
  InsertProjectProduct,
  InsertProjectTodo,
  projectComments,
  projectDocuments,
  projectProducts,
  projectTimelineSteps,
  projectTodos,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";

// Ordem canônica das etapas do pipeline de importação.
export const PROJECT_STEP_ORDER = [
  "fornecedor",
  "amostra",
  "aprovacao",
  "embalagem",
  "pedido",
  "producao",
  "inspecao",
  "embarque",
  "chegada",
  "lancamento",
] as const;

export type ProjectStep = (typeof PROJECT_STEP_ORDER)[number];
export type ProjectStatus = "pendente" | "em_andamento" | "concluido";

// ─── Products ─────────────────────────────────────────────────────────────────

export async function getAllProjectProducts(filters?: {
  search?: string;
  priority?: string;
  currentStep?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.search) conditions.push(like(projectProducts.name, `%${filters.search}%`));
  if (filters?.priority && filters.priority !== "todos") {
    conditions.push(eq(projectProducts.priority, filters.priority as any));
  }
  if (filters?.currentStep && filters.currentStep !== "todos") {
    conditions.push(eq(projectProducts.currentStep, filters.currentStep as any));
  }

  const query =
    conditions.length > 0
      ? db.select().from(projectProducts).where(and(...conditions))
      : db.select().from(projectProducts);

  return query.orderBy(asc(projectProducts.name));
}

export async function getProjectProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projectProducts).where(eq(projectProducts.id, id)).limit(1);
  return result[0];
}

export async function createProjectProduct(data: InsertProjectProduct) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(projectProducts).values(data);
  return result;
}

export async function updateProjectProduct(
  id: number,
  data: Partial<InsertProjectProduct & { expectedArrival?: Date | null }>,
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(projectProducts).set(data).where(eq(projectProducts.id, id));
  return getProjectProductById(id);
}

export async function deleteProjectProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(projectProducts).where(eq(projectProducts.id, id));
}

// ─── Timeline overview / dashboard ──────────────────────────────────────────────

export async function getProjectProductsForTimeline() {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: projectProducts.id,
      name: projectProducts.name,
      priority: projectProducts.priority,
      currentStep: projectProducts.currentStep,
      expectedArrival: projectProducts.expectedArrival,
      supplier: projectProducts.supplier,
      description: projectProducts.description,
      updatedAt: projectProducts.updatedAt,
    })
    .from(projectProducts)
    .orderBy(projectProducts.expectedArrival);

  const allSteps = await db
    .select({
      productId: projectTimelineSteps.productId,
      step: projectTimelineSteps.step,
      status: projectTimelineSteps.status,
    })
    .from(projectTimelineSteps);

  const stepsByProduct = new Map<number, Record<string, string>>();
  for (const s of allSteps) {
    if (!stepsByProduct.has(s.productId)) stepsByProduct.set(s.productId, {});
    stepsByProduct.get(s.productId)![s.step] = s.status;
  }

  const enriched = rows.map((p) => {
    const stepMap = stepsByProduct.get(p.id) ?? {};
    const steps = PROJECT_STEP_ORDER.map((key) => ({
      key,
      status: (stepMap[key] ?? "pendente") as ProjectStatus,
    }));
    const completedCount = steps.filter((s) => s.status === "concluido").length;
    return { ...p, steps, completedCount };
  });

  const withDate = enriched.filter((r) => r.expectedArrival != null);
  const withoutDate = enriched.filter((r) => r.expectedArrival == null);
  return [...withDate, ...withoutDate];
}

export async function getProjectProductsForDashboard() {
  const db = await getDb();
  if (!db) return [];

  const allProducts = await db.select().from(projectProducts).orderBy(asc(projectProducts.name));
  const allSteps = await db.select().from(projectTimelineSteps);

  return allProducts.map((p) => {
    const pSteps = allSteps.filter((s) => s.productId === p.id);
    const completedCount = pSteps.filter((s) => s.status === "concluido").length;
    const inProgressStep = pSteps.find((s) => s.status === "em_andamento");
    return {
      ...p,
      completedCount,
      totalSteps: 10,
      progressPct: Math.round((completedCount / 10) * 100),
      currentStepLabel: p.currentStep,
      inProgressStepKey: inProgressStep?.step ?? null,
    };
  });
}

// ─── Timeline steps ─────────────────────────────────────────────────────────────

export async function getProjectTimelineByProduct(productId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(projectTimelineSteps)
    .where(eq(projectTimelineSteps.productId, productId));

  return PROJECT_STEP_ORDER.map((step) => {
    const found = rows.find((r) => r.step === step);
    return (
      found ?? {
        id: null,
        productId,
        step,
        status: "pendente" as const,
        notes: null,
        completedAt: null,
        targetDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );
  });
}

export async function upsertProjectTimelineStep(
  productId: number,
  step: ProjectStep,
  data: { status?: ProjectStatus; notes?: string | null; targetDate?: Date | null },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const existing = await db
    .select()
    .from(projectTimelineSteps)
    .where(and(eq(projectTimelineSteps.productId, productId), eq(projectTimelineSteps.step, step)))
    .limit(1);

  const completedAt =
    data.status === "concluido" ? new Date() : data.status === "pendente" ? null : undefined;

  if (existing.length > 0) {
    const updateData: any = { ...data };
    if (completedAt !== undefined) updateData.completedAt = completedAt;
    await db
      .update(projectTimelineSteps)
      .set(updateData)
      .where(eq(projectTimelineSteps.id, existing[0].id));
  } else {
    await db.insert(projectTimelineSteps).values({
      productId,
      step,
      status: data.status ?? "pendente",
      notes: data.notes,
      targetDate: data.targetDate ?? null,
      completedAt: completedAt ?? null,
    });
  }

  await syncProjectCurrentStep(productId);
}

async function syncProjectCurrentStep(productId: number) {
  const db = await getDb();
  if (!db) return;
  const steps = await db
    .select()
    .from(projectTimelineSteps)
    .where(eq(projectTimelineSteps.productId, productId));

  const stepMap = new Map(steps.map((s) => [s.step, s.status]));

  let currentStep: ProjectStep = "fornecedor";
  for (const step of PROJECT_STEP_ORDER) {
    const status = stepMap.get(step);
    if (status === "em_andamento") {
      currentStep = step;
      break;
    }
    if (status === "concluido") currentStep = step;
  }

  await db.update(projectProducts).set({ currentStep }).where(eq(projectProducts.id, productId));
}

// ─── Todos ───────────────────────────────────────────────────────────────────

export async function getProjectTodosByProduct(productId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(projectTodos)
    .where(eq(projectTodos.productId, productId))
    .orderBy(asc(projectTodos.createdAt));
}

export async function createProjectTodo(data: InsertProjectTodo) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(projectTodos).values(data);
}

export async function updateProjectTodo(id: number, data: Partial<InsertProjectTodo>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(projectTodos).set(data).where(eq(projectTodos.id, id));
}

export async function deleteProjectTodo(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(projectTodos).where(eq(projectTodos.id, id));
}

// ─── Documents ─────────────────────────────────────────────────────────────────

export async function getProjectDocumentsByProduct(productId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(projectDocuments)
    .where(eq(projectDocuments.productId, productId))
    .orderBy(asc(projectDocuments.createdAt));
}

export async function createProjectDocument(data: InsertProjectDocument) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(projectDocuments).values(data);
}

export async function deleteProjectDocument(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(projectDocuments).where(eq(projectDocuments.id, id));
}

// ─── Comments ──────────────────────────────────────────────────────────────────

export async function getProjectCommentsByProduct(productId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: projectComments.id,
      productId: projectComments.productId,
      userId: projectComments.userId,
      guestName: projectComments.guestName,
      content: projectComments.content,
      createdAt: projectComments.createdAt,
      authorName: users.name,
    })
    .from(projectComments)
    .leftJoin(users, eq(projectComments.userId, users.id))
    .where(eq(projectComments.productId, productId))
    .orderBy(asc(projectComments.createdAt));
  return rows.map((r) => ({
    ...r,
    authorName: r.authorName ?? r.guestName ?? "Visitante",
  }));
}

export async function createProjectComment(data: {
  productId: number;
  userId?: number | null;
  guestName?: string | null;
  content: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(projectComments).values(data as InsertProjectComment);
}

export async function deleteProjectComment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(projectComments).where(eq(projectComments.id, id));
}

export async function getProjectCommentById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(projectComments).where(eq(projectComments.id, id)).limit(1);
  return result[0] ?? null;
}
