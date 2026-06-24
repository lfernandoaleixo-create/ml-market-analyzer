import { and, asc, eq, like } from "drizzle-orm";
import {
  InsertPedroComment,
  InsertPedroDocument,
  InsertPedroProduct,
  InsertPedroTodo,
  pedroComments,
  pedroDocuments,
  pedroProducts,
  pedroTimelineSteps,
  pedroTodos,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";

// Ordem canônica das etapas do pipeline de importação do Pedro.
export const PEDRO_STEP_ORDER = [
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

export type PedroStep = (typeof PEDRO_STEP_ORDER)[number];
export type PedroStatus = "pendente" | "em_andamento" | "concluido";

// ─── Products ─────────────────────────────────────────────────────────────────

export async function getAllPedroProducts(filters?: {
  search?: string;
  priority?: string;
  currentStep?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.search) conditions.push(like(pedroProducts.name, `%${filters.search}%`));
  if (filters?.priority && filters.priority !== "todos") {
    conditions.push(eq(pedroProducts.priority, filters.priority as any));
  }
  if (filters?.currentStep && filters.currentStep !== "todos") {
    conditions.push(eq(pedroProducts.currentStep, filters.currentStep as any));
  }

  const query =
    conditions.length > 0
      ? db.select().from(pedroProducts).where(and(...conditions))
      : db.select().from(pedroProducts);

  const products = await query.orderBy(asc(pedroProducts.name));
  if (products.length === 0) return [];

  const allSteps = await db
    .select({
      productId: pedroTimelineSteps.productId,
      status: pedroTimelineSteps.status,
    })
    .from(pedroTimelineSteps);

  const completedByProduct = new Map<number, number>();
  for (const s of allSteps) {
    if (s.status === "concluido") {
      completedByProduct.set(s.productId, (completedByProduct.get(s.productId) ?? 0) + 1);
    }
  }

  return products.map((p) => {
    const completedCount = completedByProduct.get(p.id) ?? 0;
    return {
      ...p,
      completedCount,
      totalSteps: PEDRO_STEP_ORDER.length,
      progressPct: Math.round((completedCount / PEDRO_STEP_ORDER.length) * 100),
    };
  });
}

export async function getPedroProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(pedroProducts).where(eq(pedroProducts.id, id)).limit(1);
  return result[0];
}

export async function createPedroProduct(data: InsertPedroProduct) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(pedroProducts).values(data);
  return result;
}

export async function updatePedroProduct(
  id: number,
  data: Partial<InsertPedroProduct & { expectedArrival?: Date | null }>,
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(pedroProducts).set(data).where(eq(pedroProducts.id, id));
  return getPedroProductById(id);
}

export async function deletePedroProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(pedroProducts).where(eq(pedroProducts.id, id));
}

// ─── Timeline overview / dashboard ──────────────────────────────────────────────

export async function getPedroProductsForTimeline() {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: pedroProducts.id,
      name: pedroProducts.name,
      priority: pedroProducts.priority,
      currentStep: pedroProducts.currentStep,
      expectedArrival: pedroProducts.expectedArrival,
      supplier: pedroProducts.supplier,
      description: pedroProducts.description,
      updatedAt: pedroProducts.updatedAt,
    })
    .from(pedroProducts)
    .orderBy(pedroProducts.expectedArrival);

  const allSteps = await db
    .select({
      productId: pedroTimelineSteps.productId,
      step: pedroTimelineSteps.step,
      status: pedroTimelineSteps.status,
    })
    .from(pedroTimelineSteps);

  const stepsByProduct = new Map<number, Record<string, string>>();
  for (const s of allSteps) {
    if (!stepsByProduct.has(s.productId)) stepsByProduct.set(s.productId, {});
    stepsByProduct.get(s.productId)![s.step] = s.status;
  }

  const enriched = rows.map((p) => {
    const stepMap = stepsByProduct.get(p.id) ?? {};
    const steps = PEDRO_STEP_ORDER.map((key) => ({
      key,
      status: (stepMap[key] ?? "pendente") as PedroStatus,
    }));
    const completedCount = steps.filter((s) => s.status === "concluido").length;
    return { ...p, steps, completedCount };
  });

  const withDate = enriched.filter((r) => r.expectedArrival != null);
  const withoutDate = enriched.filter((r) => r.expectedArrival == null);
  return [...withDate, ...withoutDate];
}

export async function getPedroProductsForDashboard() {
  const db = await getDb();
  if (!db) return [];

  const allProducts = await db.select().from(pedroProducts).orderBy(asc(pedroProducts.name));
  const allSteps = await db.select().from(pedroTimelineSteps);

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

export async function getPedroTimelineByProduct(productId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(pedroTimelineSteps)
    .where(eq(pedroTimelineSteps.productId, productId));

  return PEDRO_STEP_ORDER.map((step) => {
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

export async function upsertPedroTimelineStep(
  productId: number,
  step: PedroStep,
  data: { status?: PedroStatus; notes?: string | null; targetDate?: Date | null },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const existing = await db
    .select()
    .from(pedroTimelineSteps)
    .where(and(eq(pedroTimelineSteps.productId, productId), eq(pedroTimelineSteps.step, step)))
    .limit(1);

  const completedAt =
    data.status === "concluido" ? new Date() : data.status === "pendente" ? null : undefined;

  if (existing.length > 0) {
    const updateData: any = { ...data };
    if (completedAt !== undefined) updateData.completedAt = completedAt;
    await db
      .update(pedroTimelineSteps)
      .set(updateData)
      .where(eq(pedroTimelineSteps.id, existing[0].id));
  } else {
    await db.insert(pedroTimelineSteps).values({
      productId,
      step,
      status: data.status ?? "pendente",
      notes: data.notes,
      targetDate: data.targetDate ?? null,
      completedAt: completedAt ?? null,
    });
  }

  await syncPedroCurrentStep(productId);
}

async function syncPedroCurrentStep(productId: number) {
  const db = await getDb();
  if (!db) return;
  const steps = await db
    .select()
    .from(pedroTimelineSteps)
    .where(eq(pedroTimelineSteps.productId, productId));

  const stepMap = new Map(steps.map((s) => [s.step, s.status]));

  let currentStep: PedroStep = "fornecedor";
  for (const step of PEDRO_STEP_ORDER) {
    const status = stepMap.get(step);
    if (status === "em_andamento") {
      currentStep = step;
      break;
    }
    if (status === "concluido") currentStep = step;
  }

  await db.update(pedroProducts).set({ currentStep }).where(eq(pedroProducts.id, productId));
}

// ─── Todos ───────────────────────────────────────────────────────────────────

export async function getPedroTodosByProduct(productId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pedroTodos)
    .where(eq(pedroTodos.productId, productId))
    .orderBy(asc(pedroTodos.createdAt));
}

export async function createPedroTodo(data: InsertPedroTodo) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(pedroTodos).values(data);
}

export async function updatePedroTodo(id: number, data: Partial<InsertPedroTodo>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(pedroTodos).set(data).where(eq(pedroTodos.id, id));
}

export async function deletePedroTodo(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(pedroTodos).where(eq(pedroTodos.id, id));
}

// ─── Documents ─────────────────────────────────────────────────────────────────

export async function getPedroDocumentsByProduct(productId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pedroDocuments)
    .where(eq(pedroDocuments.productId, productId))
    .orderBy(asc(pedroDocuments.createdAt));
}

export async function createPedroDocument(data: InsertPedroDocument) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(pedroDocuments).values(data);
}

export async function deletePedroDocument(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(pedroDocuments).where(eq(pedroDocuments.id, id));
}

// ─── Comments ──────────────────────────────────────────────────────────────────

export async function getPedroCommentsByProduct(productId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: pedroComments.id,
      productId: pedroComments.productId,
      userId: pedroComments.userId,
      guestName: pedroComments.guestName,
      content: pedroComments.content,
      createdAt: pedroComments.createdAt,
      authorName: users.name,
    })
    .from(pedroComments)
    .leftJoin(users, eq(pedroComments.userId, users.id))
    .where(eq(pedroComments.productId, productId))
    .orderBy(asc(pedroComments.createdAt));
  return rows.map((r) => ({
    ...r,
    authorName: r.authorName ?? r.guestName ?? "Visitante",
  }));
}

export async function createPedroComment(data: {
  productId: number;
  userId?: number | null;
  guestName?: string | null;
  content: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(pedroComments).values(data as InsertPedroComment);
}

export async function deletePedroComment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(pedroComments).where(eq(pedroComments.id, id));
}

export async function getPedroCommentById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(pedroComments).where(eq(pedroComments.id, id)).limit(1);
  return result[0] ?? null;
}
