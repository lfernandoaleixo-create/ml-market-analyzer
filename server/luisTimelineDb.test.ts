import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for luisTimelineDb — the editable "Linha do Tempo Luís" stage model and
 * per-product progress.
 *
 * The feature: a SINGLE editable list of stages (bolinhas) shared by every
 * product (add / rename / reorder / delete), plus per-product progress where
 * Luís can mark a stage done and write a free-text note he can edit later.
 *
 * We back the drizzle handle with a tiny in-memory store so the helpers'
 * real control flow (position assignment, cascade delete, position
 * normalization, upsert-by-(productId,stageId)) is exercised end-to-end without
 * a database. The fake parses the small set of where() comparators the helpers
 * actually build.
 */

type StageRow = { id: number; label: string; position: number };
type ProgressRow = {
  id: number;
  productId: number;
  stageId: number;
  done: boolean;
  note: string | null;
  completedAt: Date | null;
};

let stages: StageRow[];
let progress: ProgressRow[];
let stageSeq: number;
let progressSeq: number;

// Table identity markers (the helpers pass the imported table object to from()).
const STAGES = { __t: "stages" };
const PROGRESS = { __t: "progress" };

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
}));

// Give columns identity by re-declaring the table objects with tagged columns.
// The helpers reference luisTimelineStages.position / .id / luisProductStepProgress.productId etc.
// We patch them post-import below.

function tableOf(t: unknown): string {
  return (t as { __t?: string })?.__t ?? "";
}

function matchProgress(row: ProgressRow, cond: any): boolean {
  if (!cond) return true;
  if (cond.kind === "and") return cond.conds.every((c: any) => matchProgress(row, c));
  if (cond.kind === "eq") {
    if (cond.col === "productId") return row.productId === cond.value;
    if (cond.col === "stageId") return row.stageId === cond.value;
    if (cond.col === "id") return row.id === cond.value;
  }
  return true;
}

function makeDb() {
  return {
    select: () => ({
      from: (t: unknown) => {
        const table = tableOf(t);
        const data = table === "stages" ? stages : table === "progress" ? progress : [];
        const builder: any = {
          _rows: [...data],
          where(cond: any) {
            this._rows = this._rows.filter((r: any) =>
              table === "progress" ? matchProgress(r, cond) : matchProgress(r, cond),
            );
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
          const arr = table === "stages" ? stages : progress;
          for (const r of arr as any[]) {
            if (matchProgress(r, cond)) Object.assign(r, patch);
          }
        },
      }),
    }),
    delete: (t: unknown) => ({
      where: async (cond: any) => {
        const table = tableOf(t);
        if (table === "stages") stages = stages.filter((r) => !matchProgress(r as any, cond));
        else progress = progress.filter((r) => !matchProgress(r, cond));
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
(luisProductStepProgress as any).stageId = { __c: "stageId" };
(projectProducts as any).expectedArrival = { __c: "expectedArrival" };

import * as db from "./luisTimelineDb";

beforeEach(() => {
  stages = [
    { id: 1, label: "Levantamento de fornecedor", position: 0 },
    { id: 2, label: "Cotação do Preço", position: 1 },
    { id: 3, label: "Solicitação de Amostra", position: 2 },
    { id: 4, label: "Negociação", position: 3 },
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
    expect((await db.getLuisProgressByProduct(100)).length).toBe(1);
    await db.deleteLuisStage(2);
    expect((await db.getLuisProgressByProduct(100)).length).toBe(0);
  });
});

describe("luisTimelineDb — per-product progress", () => {
  it("marks a stage done (sets completedAt) and toggles it back", async () => {
    await db.setLuisStepDone(100, 1, true);
    let rows = await db.getLuisProgressByProduct(100);
    expect(rows[0]).toMatchObject({ stageId: 1, done: true });
    expect(rows[0].completedAt).not.toBeNull();

    await db.setLuisStepDone(100, 1, false);
    rows = await db.getLuisProgressByProduct(100);
    expect(rows[0]).toMatchObject({ stageId: 1, done: false });
    expect(rows[0].completedAt).toBeNull();
  });

  it("saves and updates a free-text note for a product+stage (no duplicate rows)", async () => {
    await db.setLuisStepNote(100, 3, "Amostra a caminho");
    let rows = await db.getLuisProgressByProduct(100);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stageId: 3, note: "Amostra a caminho" });

    await db.setLuisStepNote(100, 3, "Amostra recebida");
    rows = await db.getLuisProgressByProduct(100);
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe("Amostra recebida");
  });

  it("keeps done and note on the same row when both are set", async () => {
    await db.setLuisStepDone(100, 2, true);
    await db.setLuisStepNote(100, 2, "Negociando frete");
    const rows = await db.getLuisProgressByProduct(100);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stageId: 2, done: true, note: "Negociando frete" });
  });
});
