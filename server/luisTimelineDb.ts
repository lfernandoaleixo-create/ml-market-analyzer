import { and, asc, eq } from "drizzle-orm";
import { luisProductStepProgress, luisTimelineStages, projectProducts } from "../drizzle/schema";
import { getDb } from "./db";

// ─── Stages (modelo único e editável de etapas do Luís) ──────────────────────
// Uma única lista de etapas (bolinhas) vale para TODOS os produtos. Cada produto
// tem sua própria linha do tempo horizontal: para cada etapa há um estado
// (concluído + observação) registrado em luis_product_step_progress.
// Observação: a coluna supplierId continua existindo no schema por compatibilidade,
// mas neste modelo o progresso é por produto e gravamos supplierId = NULL.

export async function getLuisStages() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(luisTimelineStages).orderBy(asc(luisTimelineStages.position));
}

export async function createLuisStage(label: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Nova etapa entra no fim da lista.
  const existing = await db
    .select({ position: luisTimelineStages.position })
    .from(luisTimelineStages)
    .orderBy(asc(luisTimelineStages.position));
  const nextPosition = existing.length === 0 ? 0 : Math.max(...existing.map((e) => e.position)) + 1;
  await db.insert(luisTimelineStages).values({ label: label.trim(), position: nextPosition });
  return getLuisStages();
}

export async function renameLuisStage(id: number, label: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(luisTimelineStages).set({ label: label.trim() }).where(eq(luisTimelineStages.id, id));
  return getLuisStages();
}

export async function deleteLuisStage(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Remove a etapa e o progresso associado a ela em todos os produtos.
  await db.delete(luisProductStepProgress).where(eq(luisProductStepProgress.stageId, id));
  await db.delete(luisTimelineStages).where(eq(luisTimelineStages.id, id));
  // Recompacta as posições para evitar buracos.
  await normalizeLuisStagePositions();
  return getLuisStages();
}

// Reordena recebendo a lista completa de ids na nova ordem.
export async function reorderLuisStages(orderedIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(luisTimelineStages)
      .set({ position: i })
      .where(eq(luisTimelineStages.id, orderedIds[i]));
  }
  return getLuisStages();
}

async function normalizeLuisStagePositions() {
  const db = await getDb();
  if (!db) return;
  const stages = await db.select().from(luisTimelineStages).orderBy(asc(luisTimelineStages.position));
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].position !== i) {
      await db.update(luisTimelineStages).set({ position: i }).where(eq(luisTimelineStages.id, stages[i].id));
    }
  }
}

// ─── Progress (por produto + etapa) ──────────────────────────────────────────

export async function setLuisStepDone(productId: number, stageId: number, done: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const existing = await db
    .select()
    .from(luisProductStepProgress)
    .where(
      and(
        eq(luisProductStepProgress.productId, productId),
        eq(luisProductStepProgress.stageId, stageId),
      ),
    )
    .limit(1);

  const completedAt = done ? new Date() : null;
  if (existing.length > 0) {
    await db
      .update(luisProductStepProgress)
      .set({ done, completedAt })
      .where(eq(luisProductStepProgress.id, existing[0].id));
  } else {
    await db
      .insert(luisProductStepProgress)
      .values({ productId, supplierId: null, stageId, done, completedAt });
  }
}

export async function setLuisStepNote(productId: number, stageId: number, note: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const existing = await db
    .select()
    .from(luisProductStepProgress)
    .where(
      and(
        eq(luisProductStepProgress.productId, productId),
        eq(luisProductStepProgress.stageId, stageId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(luisProductStepProgress)
      .set({ note })
      .where(eq(luisProductStepProgress.id, existing[0].id));
  } else {
    await db.insert(luisProductStepProgress).values({ productId, supplierId: null, stageId, note });
  }
}

// ─── Overview para o Cronograma do Luís ──────────────────────────────────────
// Mesma fonte de itens do Projeto (project_products). Cada produto tem sua
// própria linha do tempo horizontal: a lista de etapas com estado (done + note)
// e o progresso agregado (quantas etapas concluídas).

export async function getLuisTimelineOverview() {
  const db = await getDb();
  if (!db) return { stages: [], products: [] };

  const stages = await db
    .select()
    .from(luisTimelineStages)
    .orderBy(asc(luisTimelineStages.position));

  const products = await db
    .select({
      id: projectProducts.id,
      name: projectProducts.name,
      priority: projectProducts.priority,
      expectedArrival: projectProducts.expectedArrival,
      supplier: projectProducts.supplier,
      updatedAt: projectProducts.updatedAt,
    })
    .from(projectProducts)
    .orderBy(projectProducts.expectedArrival);

  const allProgress = await db.select().from(luisProductStepProgress);
  // Progresso indexado por (productId -> stageId). Consideramos o progresso do
  // produto (supplierId NULL) e também toleramos linhas legadas com supplierId.
  const progressByProduct = new Map<number, Map<number, { done: boolean; note: string | null }>>();
  for (const p of allProgress) {
    if (!progressByProduct.has(p.productId)) progressByProduct.set(p.productId, new Map());
    const map = progressByProduct.get(p.productId)!;
    const prev = map.get(p.stageId);
    // Se houver múltiplas linhas para a mesma etapa (legado por fornecedor),
    // a etapa conta como concluída se qualquer uma estiver concluída, e mantém
    // a primeira observação não vazia.
    map.set(p.stageId, {
      done: (prev?.done ?? false) || p.done,
      note: prev?.note ?? p.note,
    });
  }

  const enriched = products.map((prod) => {
    const map = progressByProduct.get(prod.id) ?? new Map();
    const steps = stages.map((s) => {
      const pr = map.get(s.id);
      return {
        stageId: s.id,
        label: s.label,
        done: pr?.done ?? false,
        note: pr?.note ?? null,
      };
    });
    const completedCount = steps.filter((s) => s.done).length;
    return {
      ...prod,
      steps,
      completedCount,
      totalSteps: stages.length,
    };
  });

  const withDate = enriched.filter((r) => r.expectedArrival != null);
  const withoutDate = enriched.filter((r) => r.expectedArrival == null);
  return { stages, products: [...withDate, ...withoutDate] };
}
