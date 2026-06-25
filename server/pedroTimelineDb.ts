import { and, asc, eq, isNull } from "drizzle-orm";
import {
  pedroProductStepProgress,
  pedroTimelineStages,
  pedroStageItems,
  pedroProductStageItems,
  pedroItemAnswers,
  projectProducts,
} from "../drizzle/schema";
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

// ─── Checklist / perguntas por etapa ────────────────────────────────────────
// Tipo lógico de um item efetivo (já resolvido entre padrão e override).
export type PedroEffectiveItem = {
  id: number;
  source: "default" | "product";
  type: "checkbox" | "text";
  label: string;
  position: number;
  groupName: string | null;
  groupColor: string | null;
  groupPosition: number;
};

// Itens-PADRÃO de uma etapa (valem para todos os produtos).
export async function getPedroStageItems(stageId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pedroStageItems)
    .where(eq(pedroStageItems.stageId, stageId))
    .orderBy(asc(pedroStageItems.position));
}

export async function createPedroStageItem(
  stageId: number,
  type: "checkbox" | "text",
  label: string,
  group?: { name?: string | null; color?: string | null; position?: number },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select({ position: pedroStageItems.position })
    .from(pedroStageItems)
    .where(eq(pedroStageItems.stageId, stageId));
  const nextPosition =
    existing.length === 0 ? 0 : Math.max(...existing.map((e) => e.position)) + 1;
  await db
    .insert(pedroStageItems)
    .values({
      stageId,
      type,
      label: label.trim(),
      position: nextPosition,
      groupName: group?.name ?? null,
      groupColor: group?.color ?? null,
      groupPosition: group?.position ?? 0,
    });
  return getPedroStageItems(stageId);
}

export async function updatePedroStageItem(
  id: number,
  fields: { type?: "checkbox" | "text"; label?: string },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const patch: Record<string, unknown> = {};
  if (fields.type !== undefined) patch.type = fields.type;
  if (fields.label !== undefined) patch.label = fields.label.trim();
  if (Object.keys(patch).length > 0) {
    await db.update(pedroStageItems).set(patch).where(eq(pedroStageItems.id, id));
  }
  const row = await db.select().from(pedroStageItems).where(eq(pedroStageItems.id, id)).limit(1);
  return row[0] ?? null;
}

export async function deletePedroStageItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const row = await db.select().from(pedroStageItems).where(eq(pedroStageItems.id, id)).limit(1);
  const stageId = row[0]?.stageId;
  // Remove respostas associadas a esse item-padrão (em todos os produtos).
  await db
    .delete(pedroItemAnswers)
    .where(and(eq(pedroItemAnswers.itemSource, "default"), eq(pedroItemAnswers.itemId, id)));
  await db.delete(pedroStageItems).where(eq(pedroStageItems.id, id));
  if (stageId != null) {
    const remaining = await getPedroStageItems(stageId);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].position !== i) {
        await db
          .update(pedroStageItems)
          .set({ position: i })
          .where(eq(pedroStageItems.id, remaining[i].id));
      }
    }
  }
  return stageId != null ? getPedroStageItems(stageId) : [];
}

// Override de itens por produto+etapa.
export async function getPedroProductStageItems(productId: number, stageId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pedroProductStageItems)
    .where(
      and(
        eq(pedroProductStageItems.productId, productId),
        eq(pedroProductStageItems.stageId, stageId),
      ),
    )
    .orderBy(asc(pedroProductStageItems.position));
}

// Itens EFETIVOS de um produto+etapa: se houver override, usa o override; senão,
// usa o padrão. (Override vazio explícito também é respeitado — ver hasOverride.)
export async function getEffectivePedroItems(
  productId: number,
  stageId: number,
): Promise<{ items: PedroEffectiveItem[]; hasOverride: boolean }> {
  const overrides = await getPedroProductStageItems(productId, stageId);
  if (overrides.length > 0) {
    return {
      hasOverride: true,
      items: overrides.map((o) => ({
        id: o.id,
        source: "product" as const,
        type: (o.type as "checkbox" | "text") ?? "checkbox",
        label: o.label,
        position: o.position,
        groupName: o.groupName ?? null,
        groupColor: o.groupColor ?? null,
        groupPosition: o.groupPosition ?? 0,
      })),
    };
  }
  const defaults = await getPedroStageItems(stageId);
  return {
    hasOverride: false,
    items: defaults.map((d) => ({
      id: d.id,
      source: "default" as const,
      type: (d.type as "checkbox" | "text") ?? "checkbox",
      label: d.label,
      position: d.position,
      groupName: d.groupName ?? null,
      groupColor: d.groupColor ?? null,
      groupPosition: d.groupPosition ?? 0,
    })),
  };
}

// Começa a personalizar uma etapa em um produto: copia os itens-padrão para o
// override (uma única vez). A partir daí o produto tem itens próprios.
export async function startPedroProductOverride(productId: number, stageId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await getPedroProductStageItems(productId, stageId);
  if (existing.length === 0) {
    const defaults = await getPedroStageItems(stageId);
    if (defaults.length > 0) {
      await db.insert(pedroProductStageItems).values(
        defaults.map((d) => ({
          productId,
          stageId,
          type: d.type,
          label: d.label,
          position: d.position,
          groupName: d.groupName ?? null,
          groupColor: d.groupColor ?? null,
          groupPosition: d.groupPosition ?? 0,
        })),
      );
    }
  }
  return getPedroProductStageItems(productId, stageId);
}

export async function createPedroProductStageItem(
  productId: number,
  stageId: number,
  type: "checkbox" | "text",
  label: string,
  group?: { name?: string | null; color?: string | null; position?: number },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  let existing = await getPedroProductStageItems(productId, stageId);
  // Se a etapa ainda NAO foi personalizada (sem override) mas possui itens-padrao,
  // copia os padroes primeiro para que o novo item COEXISTA com eles
  // (evita que adicionar 1 checkbox "esconda" as perguntas-padrao).
  if (existing.length === 0) {
    const defaults = await getPedroStageItems(stageId);
    if (defaults.length > 0) {
      await db.insert(pedroProductStageItems).values(
        defaults.map((d) => ({
          productId,
          stageId,
          type: d.type,
          label: d.label,
          position: d.position,
          groupName: d.groupName ?? null,
          groupColor: d.groupColor ?? null,
          groupPosition: d.groupPosition ?? 0,
        })),
      );
      existing = await getPedroProductStageItems(productId, stageId);
    }
  }
  const nextPosition =
    existing.length === 0 ? 0 : Math.max(...existing.map((e) => e.position)) + 1;
  // Novo item SEM grupo aparece em um bloco proprio no TOPO (antes dos cartoes de grupo):
  // groupName=null e groupPosition=-1 garantem que ele fique acima de todos os grupos.
  const resolvedGroup = {
    name: group?.name ?? null,
    color: group?.color ?? null,
    position: group?.position ?? (group?.name ? 0 : -1),
  };
  await db
    .insert(pedroProductStageItems)
    .values({
      productId,
      stageId,
      type,
      label: label.trim(),
      position: nextPosition,
      groupName: resolvedGroup.name,
      groupColor: resolvedGroup.color,
      groupPosition: resolvedGroup.position,
    });
  await recomputePedroStageDone(productId, stageId);
  return getPedroProductStageItems(productId, stageId);
}

// Reordena os itens de override de um produto+etapa conforme a lista de IDs.
export async function reorderPedroProductStageItems(
  productId: number,
  stageId: number,
  orderedIds: number[],
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // So reordena itens que sao override deste produto+etapa.
  const existing = await getPedroProductStageItems(productId, stageId);
  const validIds = new Set(existing.map((e) => e.id));
  let pos = 0;
  for (const id of orderedIds) {
    if (!validIds.has(id)) continue;
    await db
      .update(pedroProductStageItems)
      .set({ position: pos })
      .where(eq(pedroProductStageItems.id, id));
    pos++;
  }
  return getPedroProductStageItems(productId, stageId);
}

export async function updatePedroProductStageItem(
  id: number,
  fields: { type?: "checkbox" | "text"; label?: string },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const patch: Record<string, unknown> = {};
  if (fields.type !== undefined) patch.type = fields.type;
  if (fields.label !== undefined) patch.label = fields.label.trim();
  if (Object.keys(patch).length > 0) {
    await db.update(pedroProductStageItems).set(patch).where(eq(pedroProductStageItems.id, id));
  }
  const row = await db
    .select()
    .from(pedroProductStageItems)
    .where(eq(pedroProductStageItems.id, id))
    .limit(1);
  if (row[0]) await recomputePedroStageDone(row[0].productId, row[0].stageId);
  return row[0] ?? null;
}

export async function deletePedroProductStageItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const row = await db
    .select()
    .from(pedroProductStageItems)
    .where(eq(pedroProductStageItems.id, id))
    .limit(1);
  const target = row[0];
  await db
    .delete(pedroItemAnswers)
    .where(and(eq(pedroItemAnswers.itemSource, "product"), eq(pedroItemAnswers.itemId, id)));
  await db.delete(pedroProductStageItems).where(eq(pedroProductStageItems.id, id));
  if (target) {
    const remaining = await getPedroProductStageItems(target.productId, target.stageId);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].position !== i) {
        await db
          .update(pedroProductStageItems)
          .set({ position: i })
          .where(eq(pedroProductStageItems.id, remaining[i].id));
      }
    }
    await recomputePedroStageDone(target.productId, target.stageId);
  }
  return target ? getPedroProductStageItems(target.productId, target.stageId) : [];
}

// Remove o override por completo: a etapa volta a herdar os itens-padrão.
export async function resetPedroProductOverride(productId: number, stageId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const overrides = await getPedroProductStageItems(productId, stageId);
  for (const o of overrides) {
    await db
      .delete(pedroItemAnswers)
      .where(and(eq(pedroItemAnswers.itemSource, "product"), eq(pedroItemAnswers.itemId, o.id)));
  }
  await db
    .delete(pedroProductStageItems)
    .where(
      and(
        eq(pedroProductStageItems.productId, productId),
        eq(pedroProductStageItems.stageId, stageId),
      ),
    );
  await recomputePedroStageDone(productId, stageId);
  return getEffectivePedroItems(productId, stageId);
}

// ─── Respostas por produto + auto-conclusão ──────────────────────────────────

async function getPedroAnswers(productId: number, stageId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pedroItemAnswers)
    .where(
      and(
        eq(pedroItemAnswers.productId, productId),
        eq(pedroItemAnswers.stageId, stageId),
      ),
    );
}

// Decide se um item está "respondido": checkbox => checked; text => texto não-vazio.
function isItemAnswered(
  item: PedroEffectiveItem,
  ans: { checked: boolean; textValue: string | null } | undefined,
): boolean {
  if (!ans) return false;
  if (item.type === "text") return (ans.textValue ?? "").trim().length > 0;
  return ans.checked === true;
}

// Recalcula a conclusão (bolinha) da etapa para um produto com base nos itens
// efetivos e respostas. Regra (opção B, independente): se há >=1 item e TODOS
// estão respondidos => done=true; caso contrário => done=false. Se a etapa NÃO
// tem itens (0 itens), a etapa fica pendente (Regra A).
export async function recomputePedroStageDone(productId: number, stageId: number) {
  const { items } = await getEffectivePedroItems(productId, stageId);
  if (items.length === 0) {
    // Regra A: etapa sem nenhum item de checklist fica pendente.
    await setPedroStepDone(productId, stageId, false);
    return;
  }
  const answers = await getPedroAnswers(productId, stageId);
  const ansByKey = new Map<string, { checked: boolean; textValue: string | null }>();
  for (const a of answers) {
    ansByKey.set(`${a.itemSource}:${a.itemId}`, { checked: a.checked, textValue: a.textValue });
  }
  const allAnswered = items.every((it) =>
    isItemAnswered(it, ansByKey.get(`${it.source}:${it.id}`)),
  );
  await setPedroStepDone(productId, stageId, allAnswered);
}

export async function setPedroItemAnswer(
  productId: number,
  stageId: number,
  itemSource: "default" | "product",
  itemId: number,
  fields: { checked?: boolean; textValue?: string | null },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select()
    .from(pedroItemAnswers)
    .where(
      and(
        eq(pedroItemAnswers.productId, productId),
        eq(pedroItemAnswers.stageId, stageId),
        eq(pedroItemAnswers.itemSource, itemSource),
        eq(pedroItemAnswers.itemId, itemId),
      ),
    )
    .limit(1);
  const patch: Record<string, unknown> = {};
  if (fields.checked !== undefined) patch.checked = fields.checked;
  if (fields.textValue !== undefined) patch.textValue = fields.textValue;
  if (existing.length > 0) {
    await db.update(pedroItemAnswers).set(patch).where(eq(pedroItemAnswers.id, existing[0].id));
  } else {
    await db.insert(pedroItemAnswers).values({
      productId,
      stageId,
      itemSource,
      itemId,
      checked: fields.checked ?? false,
      textValue: fields.textValue ?? null,
    });
  }
  await recomputePedroStageDone(productId, stageId);
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

  // Carrega itens-padrão, overrides e respostas de uma vez (consultas em lote).
  const allDefaultItems = await db
    .select()
    .from(pedroStageItems)
    .orderBy(asc(pedroStageItems.position));
  const defaultsByStage = new Map<number, typeof allDefaultItems>();
  for (const it of allDefaultItems) {
    if (!defaultsByStage.has(it.stageId)) defaultsByStage.set(it.stageId, []);
    defaultsByStage.get(it.stageId)!.push(it);
  }

  const allOverrides = await db
    .select()
    .from(pedroProductStageItems)
    .orderBy(asc(pedroProductStageItems.position));
  const overridesByKey = new Map<string, typeof allOverrides>();
  for (const it of allOverrides) {
    const k = `${it.productId}:${it.stageId}`;
    if (!overridesByKey.has(k)) overridesByKey.set(k, []);
    overridesByKey.get(k)!.push(it);
  }

  const allAnswers = await db.select().from(pedroItemAnswers);
  const answersByKey = new Map<string, { checked: boolean; textValue: string | null }>();
  for (const a of allAnswers) {
    answersByKey.set(
      `${a.productId}:${a.stageId}:${a.itemSource}:${a.itemId}`,
      { checked: a.checked, textValue: a.textValue },
    );
  }

  const enriched = products.map((prod) => {
    const map = progressByProduct.get(prod.id) ?? new Map();
    const steps = stages.map((s) => {
      const pr = map.get(s.id);
      const ov = overridesByKey.get(`${prod.id}:${s.id}`) ?? [];
      const hasOverride = ov.length > 0;
      const rawItems = hasOverride ? ov : (defaultsByStage.get(s.id) ?? []);
      const items = rawItems.map((it) => {
        const source: "default" | "product" = hasOverride ? "product" : "default";
        const ans = answersByKey.get(`${prod.id}:${s.id}:${source}:${it.id}`);
        return {
          id: it.id,
          source,
          type: (it.type as "checkbox" | "text") ?? "checkbox",
          label: it.label,
          position: it.position,
          checked: ans?.checked ?? false,
          textValue: ans?.textValue ?? null,
          groupName: it.groupName ?? null,
          groupColor: it.groupColor ?? null,
          groupPosition: it.groupPosition ?? 0,
        };
      });
      const answeredCount = items.filter((it) =>
        it.type === "text" ? (it.textValue ?? "").trim().length > 0 : it.checked,
      ).length;
      return {
        stageId: s.id,
        label: s.label,
        category: s.category ?? null,
        details: s.details ?? null,
        done: pr?.done ?? false,
        note: pr?.note ?? null,
        items,
        hasOverride,
        itemCount: items.length,
        answeredCount,
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
