import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Testes dos helpers da Planilha EMBALAGENS (embalagemSheetDb).
 * Mesmo padrão dos testes de kitSheetDb/skuSheetDb: store em memória.
 */

type ColRow = { id: number; name: string; position: number };
type SheetRow = { id: number; position: number; customValues: string | null; [k: string]: unknown };

let columns: ColRow[];
let rows: SheetRow[];
let colSeq: number;
let rowSeq: number;

vi.mock("../drizzle/schema", () => ({
  embalagemSheetCustomColumns: { __t: "columns" },
  embalagemSheetRows: { __t: "rows" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: { __c?: string }, value: unknown) => ({ kind: "eq", col: col?.__c, value }),
  and: (...conds: unknown[]) => ({ kind: "and", conds }),
  asc: (col: { __c?: string }) => ({ kind: "asc", col: col?.__c }),
  sql: (strings: TemplateStringsArray, ..._v: unknown[]) => ({ kind: "sql", raw: strings.join("?") }),
}));

function tableOf(t: unknown): string {
  return (t as { __t?: string })?.__t ?? "";
}

function dataFor(table: string): any[] {
  if (table === "columns") return columns;
  if (table === "rows") return rows;
  return [];
}

function matchRow(row: any, cond: any): boolean {
  if (!cond) return true;
  if (cond.kind === "and") return cond.conds.every((c: any) => matchRow(row, c));
  if (cond.kind === "eq" && cond.col === "id") return row.id === cond.value;
  return true;
}

function makeDb() {
  return {
    select: (proj?: any) => ({
      from: (t: unknown) => {
        const table = tableOf(t);
        const data = dataFor(table);
        const isMax = proj && typeof proj === "object" && "max" in proj;
        const builder: any = {
          _rows: [...data],
          where(cond: any) {
            this._rows = this._rows.filter((r: any) => matchRow(r, cond));
            return this;
          },
          orderBy(spec: any) {
            if (spec && spec.kind === "sql") {
              this._rows.sort((a: any, b: any) => b.id - a.id);
            } else {
              this._rows.sort(
                (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id,
              );
            }
            return this;
          },
          async limit(n: number) {
            return this._rows.slice(0, n);
          },
          then(resolve: (v: any) => void) {
            if (isMax) {
              const max = data.reduce((m: number, r: any) => Math.max(m, r.position ?? 0), 0);
              resolve([{ max }]);
            } else {
              resolve(this._rows);
            }
          },
        };
        return builder;
      },
    }),
    insert: (t: unknown) => ({
      values: async (vals: any) => {
        if (tableOf(t) === "columns") {
          columns.push({ id: colSeq++, name: vals.name, position: vals.position });
        } else if (tableOf(t) === "rows") {
          rows.push({ id: rowSeq++, position: vals.position, customValues: vals.customValues ?? null, ...vals });
        }
      },
    }),
    update: (t: unknown) => ({
      set: (patch: any) => ({
        where: async (cond: any) => {
          const arr = dataFor(tableOf(t));
          for (const r of arr) if (matchRow(r, cond)) Object.assign(r, patch);
        },
      }),
    }),
    delete: (t: unknown) => ({
      where: async (cond: any) => {
        if (tableOf(t) === "columns") columns = columns.filter((r) => !matchRow(r, cond));
        else if (tableOf(t) === "rows") rows = rows.filter((r) => !matchRow(r, cond));
      },
    }),
  };
}

vi.mock("./db", () => ({
  getDb: vi.fn(async () => makeDb()),
}));

import { embalagemSheetCustomColumns, embalagemSheetRows } from "../drizzle/schema";
(embalagemSheetCustomColumns as any).id = { __c: "id" };
(embalagemSheetCustomColumns as any).name = { __c: "name" };
(embalagemSheetCustomColumns as any).position = { __c: "position" };
(embalagemSheetRows as any).id = { __c: "id" };
(embalagemSheetRows as any).position = { __c: "position" };
(embalagemSheetRows as any).customValues = { __c: "customValues" };

import {
  listEmbalagemRows,
  createEmbalagemRow,
  updateEmbalagemRow,
  deleteEmbalagemRow,
  listEmbalagemCustomColumns,
  createEmbalagemCustomColumn,
  renameEmbalagemCustomColumn,
  deleteEmbalagemCustomColumn,
  setEmbalagemCustomValue,
} from "./embalagemSheetDb";

beforeEach(() => {
  columns = [
    { id: 1, name: "Fornecedor", position: 1 },
    { id: 2, name: "Observações", position: 2 },
  ];
  rows = [
    { id: 10, position: 1, customValues: JSON.stringify({ "1": "Acme", "2": "ok" }) },
    { id: 11, position: 2, customValues: JSON.stringify({ "2": "rever" }) },
    { id: 12, position: 3, customValues: null },
  ];
  colSeq = 3;
  rowSeq = 13;
});

describe("embalagemSheetDb — linhas", () => {
  it("lista linhas ordenadas por posição", async () => {
    const list = await listEmbalagemRows();
    expect(list.map((r) => r.id)).toEqual([10, 11, 12]);
  });

  it("cria linha com a próxima posição (max + 1)", async () => {
    const created = await createEmbalagemRow({ produto: "Caixa" } as any);
    expect(created.position).toBe(4);
    expect((created as any).produto).toBe("Caixa");
  });

  it("updateEmbalagemRow aplica o patch e ignora id/createdAt", async () => {
    const updated = await updateEmbalagemRow(10, { produto: "Novo", id: 999, createdAt: new Date() } as any);
    expect((updated as any)?.produto).toBe("Novo");
    expect(updated?.id).toBe(10);
  });

  it("deleteEmbalagemRow remove a linha", async () => {
    await deleteEmbalagemRow(11);
    expect(rows.find((r) => r.id === 11)).toBeUndefined();
    expect(rows).toHaveLength(2);
  });
});

describe("embalagemSheetDb — colunas personalizadas", () => {
  it("lista colunas ordenadas por posição", async () => {
    const list = await listEmbalagemCustomColumns();
    expect(list.map((c) => c.name)).toEqual(["Fornecedor", "Observações"]);
  });

  it("cria coluna com a próxima posição (max + 1)", async () => {
    const created = await createEmbalagemCustomColumn("Link");
    expect(created.name).toBe("Link");
    expect(created.position).toBe(3);
  });

  it("usa nome padrão quando vazio", async () => {
    const created = await createEmbalagemCustomColumn("   ");
    expect(created.name).toBe("Nova coluna");
  });

  it("renomeia a coluna", async () => {
    await renameEmbalagemCustomColumn(1, "Fabricante");
    expect(columns.find((c) => c.id === 1)?.name).toBe("Fabricante");
  });

  it("exclui a coluna e limpa a chave correspondente em todas as linhas", async () => {
    await deleteEmbalagemCustomColumn(2);
    expect(columns.find((c) => c.id === 2)).toBeUndefined();
    expect(JSON.parse(rows.find((r) => r.id === 10)!.customValues!)).toEqual({ "1": "Acme" });
    expect(JSON.parse(rows.find((r) => r.id === 11)!.customValues!)).toEqual({});
    expect(rows.find((r) => r.id === 12)!.customValues).toBeNull();
  });

  it("setEmbalagemCustomValue faz merge preservando os demais valores", async () => {
    await setEmbalagemCustomValue(10, 1, "Nova Acme");
    expect(JSON.parse(rows.find((r) => r.id === 10)!.customValues!)).toEqual({
      "1": "Nova Acme",
      "2": "ok",
    });
  });

  it("setEmbalagemCustomValue cria o JSON quando a linha não tinha valores", async () => {
    await setEmbalagemCustomValue(12, 2, "primeiro");
    expect(JSON.parse(rows.find((r) => r.id === 12)!.customValues!)).toEqual({ "2": "primeiro" });
  });

  it("setEmbalagemCustomValue retorna null para linha inexistente", async () => {
    const res = await setEmbalagemCustomValue(999, 1, "x");
    expect(res).toBeNull();
  });
});
