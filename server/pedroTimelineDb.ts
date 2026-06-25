import { and, asc, eq, isNull } from "drizzle-orm";
import { pedroProductStepProgress, pedroTimelineStages, projectProducts } from "../drizzle/schema";
import { getDb } from "./db";
import { decideSequentialToggle } from "../shared/luisSequential";

// ─── Stages (modelo único e editável de etapas do Pedro) ─────────────────────
// Uma única lista de etapas (bolinhas) vale para TODOS os produtos do Pedro.
// Cada produto tem sua própria linha do tempo horizontal: para cada etapa há um
// estado (concluído + observação) em pedro_product_step_progress.

export async function getPedroStages() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pedroTimelineStages).orderBy(asc(pedroTimelineStages.position));
}

export async function createPedroStage(label: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select({ position: pedroTimelineStages.position })
    .from(pedroTimelineStages)
    .orderBy(asc(pedroTimelineStages.position));
  const nextPosition = existing.length === 0 ? 0 : Math.max(...existing.map((e) => e.position)) + 1;
  await db.insert(pedroTimelineStages).values({ label: label.trim(), position: nextPosition });
  return getPedroStages();
}

export async function renamePedroStage(id: number, label: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(pedroTimelineStages).set({ label: label.trim() }).where(eq(pedroTimelineStages.id, id));
  return getPedroStages();
}

export async function updatePedroStageMeta(
  id: number,
  fields: { label?: string; category?: string | null; details?: string | null },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const patch: Record<string, unknown> = {};
  if (fields.label !== undefined) patch.label = fields.label.trim();
  if (fields.category !== undefined) patch.category = fields.category;
  if (fields.details !== undefined) patch.details = fields.details;
  if (Object.keys(patch).length > 0) {
    await db.update(pedroTimelineStages).set(patch).where(eq(pedroTimelineStages.id, id));
  }
  return getPedroStages();
}

export async function deletePedroStage(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(pedroProductStepProgress).where(eq(pedroProductStepProgress.stageId, id));
  await db.delete(pedroTimelineStages).where(eq(pedroTimelineStages.id, id));
  await normalizePedroStagePositions();
  return getPedroStages();
}

export async function reorderPedroStages(orderedIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(pedroTimelineStages)
      .set({ position: i })
      .where(eq(pedroTimelineStages.id, orderedIds[i]));
  }
  return getPedroStages();
}

async function normalizePedroStagePositions() {
  const db = await getDb();
  if (!db) return;
  const stages = await db.select().from(pedroTimelineStages).orderBy(asc(pedroTimelineStages.position));
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].position !== i) {
      await db.update(pedroTimelineStages).set({ position: i }).where(eq(pedroTimelineStages.id, stages[i].id));
    }
  }
}

// ─── Progress (por produto + etapa) ──────────────────────────────────────────

export async function setPedroStepDone(productId: number, stageId: number, done: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const existing = await db
    .select()
    .from(pedroProductStepProgress)
    .where(
      and(
        eq(pedroProductStepProgress.productId, productId),
        eq(pedroProductStepProgress.stageId, stageId),
      ),
    )
    .limit(1);

  const completedAt = done ? new Date() : null;
  if (existing.length > 0) {
    await db
      .update(pedroProductStepProgress)
      .set({ done, completedAt })
      .where(eq(pedroProductStepProgress.id, existing[0].id));
  } else {
    await db
      .insert(pedroProductStepProgress)
      .values({ productId, supplierId: null, stageId, done, completedAt });
  }
}

/**
 * Marca/desmarca uma etapa RESPEITANDO a ordem sequencial das etapas do Pedro
 * (mesma regra do Luís): para concluir a etapa N todas as anteriores precisam
 * estar concluídas; ao desmarcar a etapa N todas as posteriores são desmarcadas
 * em cascata. Reaproveita a lógica pura testada `decideSequentialToggle`.
 */
export async function setPedroStepDoneSequential(
  productId: number,
  stageId: number,
  done: boolean,
): Promise<{ ok: boolean; blocked?: "previous"; cascaded: number[] }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const stages = await db
    .select()
    .from(pedroTimelineStages)
    .orderBy(asc(pedroTimelineStages.position));
  const targetIdx = stages.findIndex((s) => s.id === stageId);
  if (targetIdx === -1) throw new Error("Stage not found");

  const progress = await db
    .select()
    .from(pedroProductStepProgress)
    .where(
      and(
        eq(pedroProductStepProgress.productId, productId),
        isNull(pedroProductStepProgress.supplierId),
      ),
    );
  const doneByStage = new Map<number, boolean>();
  for (const p of progress) doneByStage.set(p.stageId, p.done);
  const doneFlags = stages.map((s) => doneByStage.get(s.id) === true);

  const decision = decideSequentialToggle(doneFlags, targetIdx, done);
  if (!decision.ok) {
    return { ok: false, blocked: decision.blocked, cascaded: [] };
  }

  await setPedroStepDone(productId, stageId, done);
  const cascaded: number[] = [];
  for (const idx of decision.cascadeIdx) {
    const s = stages[idx];
    await setPedroStepDone(productId, s.id, false);
    cascaded.push(s.id);
  }
  return { ok: true, cascaded };
}

export async function setPedroStepNote(productId: number, stageId: number, note: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const existing = await db
    .select()
    .from(pedroProductStepProgress)
    .where(
      and(
        eq(pedroProductStepProgress.productId, productId),
        eq(pedroProductStepProgress.stageId, stageId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pedroProductStepProgress)
      .set({ note })
      .where(eq(pedroProductStepProgress.id, existing[0].id));
  } else {
    await db.insert(pedroProductStepProgress).values({ productId, supplierId: null, stageId, note });
  }
}

// ─── Overview para o Cronograma do Pedro ─────────────────────────────────────

export async function getPedroTimelineOverview() {
  const db = await getDb();
  if (!db) return { stages: [], products: [] };

  const stages = await db
    .select()
    .from(pedroTimelineStages)
    .orderBy(asc(pedroTimelineStages.position));

  // Mesma fonte de itens do Projeto (project_products), como no Cronograma do Luís.
  // O progresso/observações de cada produto ficam isolados em pedro_product_step_progress.
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

  const allProgress = await db
    .select()
    .from(pedroProductStepProgress)
    .where(isNull(pedroProductStepProgress.supplierId));
  const progressByProduct = new Map<number, Map<number, { done: boolean; note: string | null }>>();
  for (const p of allProgress) {
    if (!progressByProduct.has(p.productId)) progressByProduct.set(p.productId, new Map());
    progressByProduct.get(p.productId)!.set(p.stageId, { done: p.done, note: p.note });
  }

  const enriched = products.map((prod) => {
    const map = progressByProduct.get(prod.id) ?? new Map();
    const steps = stages.map((s) => {
      const pr = map.get(s.id);
      return {
        stageId: s.id,
        label: s.label,
        category: s.category ?? null,
        details: s.details ?? null,
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
