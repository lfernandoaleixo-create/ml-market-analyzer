import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for luisTimelineDb — the editable "Linha do Tempo Luís" stage model and
 * per-product progress (horizontal timeline).
 *
 * The feature: a SINGLE editable list of stages (bolinhas) shared by every
 * product (add / rename / reorder / delete). Each product has its OWN horizontal
 * timeline where Luis can mark a stage done and write a free-text note he can
 * edit later. Progress rows are keyed by (productId, stageId) and stored with
 * supplierId = null.
 *
 * We back the drizzle handle with a tiny in-memory store so the helpers' real
 * control flow (position assignment, cascade delete, position normalization,
 * upsert-by-(productId,stageId), overview aggregation) is exercised end-to-end
 * without a database.
 */

type StageRow = { id: number; label: string; position: number };
type ProductRow = {
  id: number;
  name: string;
  priority: string;
  expectedArrival: Date | null;
  supplier: string | null;
  updatedAt: Date | null;
};
type ProgressRow = {
  id: number;
  productId: number;
  supplierId: number | null;
  stageId: number;
  done: boolean;
  note: string | null;
  completedAt: Date | null;
};

let stages: StageRow[];
let products: ProductRow[];
let progress: ProgressRow[];
let stageSeq: number;
let progressSeq: number;

vi.mock("../drizzle/schema", () => ({
  luisTimelineStages: { __t: "stages" },
  luisProductStepProgress: { __t: "progress" },
  projectProducts: { __t: "products" },
}));

// eq/and/asc helpers: we encode just enough to route queries in the fake db.
vi.mock("drizzle-orm", () => ({
  eq: (col: { __c?: string }, value: unknown) => ({ kind: "eq", col: col?.__c, value }),
  and: (...conds: unknown[]) => ({ kind: "and", conds }),
  asc: (col: { __c?: string }) => ({ kind: "asc", col: col?.__c }),
  isNull: (col: { __c?: string }) => ({ kind: "isNull", col: col?.__c }),
}));

function tableOf(t: unknown): string {
  return (t as { __t?: string })?.__t ?? "";
}

function matchRow(row: any, cond: any): boolean {
  if (!cond) return true;
  if (cond.kind === "and") return cond.conds.every((c: any) => matchRow(row, c));
  if (cond.kind === "eq") {
    if (cond.col === "productId") return row.productId === cond.value;
    if (cond.col === "stageId") return row.stageId === cond.value;
    if (cond.col === "id") return row.id === cond.value;
  }
  if (cond.kind === "isNull") {
    if (cond.col === "supplierId") return row.supplierId == null;
  }
  return true;
}

function dataFor(table: string): any[] {
  if (table === "stages") return stages;
  if (table === "products") return products;
  if (table === "progress") return progress;
  return [];
}

function makeDb() {
  return {
    select: (_proj?: any) => ({
      from: (t: unknown) => {
        const table = tableOf(t);
        const data = dataFor(table);
        const builder: any = {
          _rows: [...data],
          where(cond: any) {
            this._rows = this._rows.filter((r: any) => matchRow(r, cond));
            return this;
          },
          orderBy() {
            if (table === "stages") this._rows.sort((a: any, b: any) => a.position - b.position);
            return this._rows;
          },
          async limit(n: number) {
            return this._rows.slice(0, n);
          },
          then(resolve: (v: any) => void) {
            resolve(this._rows);
          },
        };
        return builder;
      },
    }),
    insert: (t: unknown) => ({
      values: async (vals: any) => {
        const table = tableOf(t);
        if (table === "stages") {
          stages.push({ id: stageSeq++, label: vals.label, position: vals.position });
        } else if (table === "progress") {
          progress.push({
            id: progressSeq++,
            productId: vals.productId,
            supplierId: vals.supplierId ?? null,
            stageId: vals.stageId,
            done: vals.done ?? false,
            note: vals.note ?? null,
            completedAt: vals.completedAt ?? null,
          });
        }
      },
    }),
    update: (t: unknown) => ({
      set: (patch: any) => ({
        where: async (cond: any) => {
          const table = tableOf(t);
          const arr = dataFor(table);
          for (const r of arr as any[]) {
            if (matchRow(r, cond)) Object.assign(r, patch);
          }
        },
      }),
    }),
    delete: (t: unknown) => ({
      where: async (cond: any) => {
        const table = tableOf(t);
        if (table === "stages") stages = stages.filter((r) => !matchRow(r, cond));
        else progress = progress.filter((r) => !matchRow(r, cond));
      },
    }),
  };
}

vi.mock("./db", () => ({
  getDb: vi.fn(async () => makeDb()),
}));

// Patch the mocked schema tables to carry column identities used by eq/asc.
import { luisTimelineStages, luisProductStepProgress, projectProducts } from "../drizzle/schema";
(luisTimelineStages as any).id = { __c: "id" };
(luisTimelineStages as any).position = { __c: "position" };
(luisTimelineStages as any).label = { __c: "label" };
(luisProductStepProgress as any).id = { __c: "id" };
(luisProductStepProgress as any).productId = { __c: "productId" };
(luisProductStepProgress as any).supplierId = { __c: "supplierId" };
(luisProductStepProgress as any).stageId = { __c: "stageId" };
(projectProducts as any).id = { __c: "id" };
(projectProducts as any).name = { __c: "name" };
(projectProducts as any).priority = { __c: "priority" };
(projectProducts as any).expectedArrival = { __c: "expectedArrival" };
(projectProducts as any).supplier = { __c: "supplier" };
(projectProducts as any).updatedAt = { __c: "updatedAt" };

import * as db from "./luisTimelineDb";

// Read helper used by tests: progress rows for a product (mirrors the
// (productId, stageId) upsert key the helpers use).
function progressForProduct(productId: number): ProgressRow[] {
  return progress.filter((p) => p.productId === productId);
}

beforeEach(() => {
  stages = [
    { id: 1, label: "Levantamento de fornecedor", position: 0 },
    { id: 2, label: "Cotação do Preço", position: 1 },
    { id: 3, label: "Solicitação de Amostra", position: 2 },
    { id: 4, label: "Negociação", position: 3 },
  ];
  products = [
    { id: 100, name: "Matador de Mosquito", priority: "baixa", expectedArrival: null, supplier: null, updatedAt: null },
    { id: 200, name: "Terrário", priority: "media", expectedArrival: new Date("2026-07-10"), supplier: null, updatedAt: null },
  ];
  progress = [];
  stageSeq = 5;
  progressSeq = 1;
});

describe("luisTimelineDb — stages CRUD", () => {
  it("lists stages ordered by position", async () => {
    const list = await db.getLuisStages();
    expect(list.map((s) => s.label)).toEqual([
      "Levantamento de fornecedor",
      "Cotação do Preço",
      "Solicitação de Amostra",
      "Negociação",
    ]);
  });

  it("creates a new stage at the end (next position)", async () => {
    const list = await db.createLuisStage("Pedido");
    expect(list[list.length - 1]).toMatchObject({ label: "Pedido", position: 4 });
  });

  it("renames a stage", async () => {
    const list = await db.renameLuisStage(2, "Cotação");
    expect(list.find((s) => s.id === 2)?.label).toBe("Cotação");
  });

  it("deletes a stage and recompacts positions", async () => {
    const list = await db.deleteLuisStage(2);
    expect(list.map((s) => s.label)).toEqual([
      "Levantamento de fornecedor",
      "Solicitação de Amostra",
      "Negociação",
    ]);
    expect(list.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it("reorders stages to match the provided id order", async () => {
    const list = await db.reorderLuisStages([4, 3, 2, 1]);
    expect(list.map((s) => s.id)).toEqual([4, 3, 2, 1]);
    expect(list.map((s) => s.position)).toEqual([0, 1, 2, 3]);
  });

  it("removes the associated progress when a stage is deleted", async () => {
    await db.setLuisStepDone(100, 2, true);
    expect(progressForProduct(100).filter((p) => p.stageId === 2).length).toBe(1);
    await db.deleteLuisStage(2);
    expect(progressForProduct(100).filter((p) => p.stageId === 2).length).toBe(0);
  });
});

describe("luisTimelineDb — per-product progress", () => {
  it("marks a stage done (sets completedAt) and toggles it back", async () => {
    await db.setLuisStepDone(100, 1, true);
    let rows = progressForProduct(100);
    expect(rows[0]).toMatchObject({ stageId: 1, done: true });
    expect(rows[0].completedAt).not.toBeNull();
    expect(rows[0].supplierId).toBeNull();

    await db.setLuisStepDone(100, 1, false);
    rows = progressForProduct(100);
    expect(rows[0]).toMatchObject({ stageId: 1, done: false });
    expect(rows[0].completedAt).toBeNull();
  });

  it("does not create duplicate rows for the same (productId, stageId)", async () => {
    await db.setLuisStepDone(100, 1, true);
    await db.setLuisStepDone(100, 1, false);
    await db.setLuisStepDone(100, 1, true);
    const rows = progressForProduct(100).filter((p) => p.stageId === 1);
    expect(rows).toHaveLength(1);
  });

  it("saves and updates a free-text note for a product+stage (no duplicate rows)", async () => {
    await db.setLuisStepNote(100, 3, "Amostra a caminho");
    let rows = progressForProduct(100);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stageId: 3, note: "Amostra a caminho" });

    await db.setLuisStepNote(100, 3, "Amostra recebida");
    rows = progressForProduct(100);
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe("Amostra recebida");
  });

  it("keeps done and note on the same row when both are set", async () => {
    await db.setLuisStepDone(100, 2, true);
    await db.setLuisStepNote(100, 2, "Negociando frete");
    const rows = progressForProduct(100);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stageId: 2, done: true, note: "Negociando frete" });
  });

  it("isolates progress between two different products", async () => {
    await db.setLuisStepDone(100, 1, true);
    expect(progressForProduct(100).length).toBe(1);
    expect(progressForProduct(200).length).toBe(0);
  });
});

describe("luisTimelineDb — overview", () => {
  it("returns each product with its full steps list and completed count", async () => {
    await db.setLuisStepDone(100, 1, true);
    await db.setLuisStepNote(100, 1, "ok");
    const overview = await db.getLuisTimelineOverview();

    expect(overview.stages).toHaveLength(4);
    const matador = overview.products.find((p: any) => p.id === 100) as any;
    expect(matador).toBeTruthy();
    expect(matador.steps).toHaveLength(4);
    expect(matador.totalSteps).toBe(4);
    expect(matador.completedCount).toBe(1);
    const firstStep = matador.steps.find((s: any) => s.stageId === 1);
    expect(firstStep).toMatchObject({ done: true, note: "ok" });
  });

  it("orders products with a date before products without a date", async () => {
    const overview = await db.getLuisTimelineOverview();
    const ids = overview.products.map((p: any) => p.id);
    // 200 has a date, 100 does not → 200 comes first.
    expect(ids).toEqual([200, 100]);
  });

  it("ignores legacy supplier-scoped rows (progress is per-product, supplierId NULL only)", async () => {
    // A legacy row with a supplierId set must NOT mark the product step as done,
    // so unchecking the product-level step is never "stuck" by old supplier data.
    progress.push({
      id: progressSeq++,
      productId: 100,
      supplierId: 999,
      stageId: 2,
      done: true,
      note: "legado",
      completedAt: new Date(),
    });
    const overview = await db.getLuisTimelineOverview();
    const matador = overview.products.find((p: any) => p.id === 100) as any;
    const step2 = matador.steps.find((s: any) => s.stageId === 2);
    expect(step2.done).toBe(false);
    expect(matador.completedCount).toBe(0);
  });
});
