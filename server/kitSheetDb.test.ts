import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Testes dos helpers da Planilha KITS (kitSheetDb).
 *
 * Focam o comportamento de maior risco:
 *  - listKitRows ordena por posição
 *  - createKitRow atribui a próxima posição (max + 1)
 *  - updateKitRow ignora id/createdAt e aplica o patch
 *  - deleteKitRow remove a linha
 *  - createKitCustomColumn atribui posição (max + 1) e usa nome padrão se vazio
 *  - renameKitCustomColumn altera o nome
 *  - deleteKitCustomColumn remove a coluna E limpa a chave do customValues de todas as linhas
 *  - setKitCustomValue faz MERGE no JSON (preserva os demais valores) e retorna null se a linha não existe
 *
 * Backamos o handle do drizzle com um store em memória (sem banco real).
 */

type ColRow = { id: number; name: string; position: number };
type SheetRow = { id: number; position: number; customValues: string | null; [k: string]: unknown };

let columns: ColRow[];
let rows: SheetRow[];
let colSeq: number;
let rowSeq: number;

vi.mock("../drizzle/schema", () => ({
  kitSheetCustomColumns: { __t: "columns" },
  kitSheetRows: { __t: "rows" },
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

import { kitSheetCustomColumns, kitSheetRows } from "../drizzle/schema";
(kitSheetCustomColumns as any).id = { __c: "id" };
(kitSheetCustomColumns as any).name = { __c: "name" };
(kitSheetCustomColumns as any).position = { __c: "position" };
(kitSheetRows as any).id = { __c: "id" };
(kitSheetRows as any).position = { __c: "position" };
(kitSheetRows as any).customValues = { __c: "customValues" };

import {
  listKitRows,
  createKitRow,
  updateKitRow,
  deleteKitRow,
  listKitCustomColumns,
  createKitCustomColumn,
  renameKitCustomColumn,
  deleteKitCustomColumn,
  setKitCustomValue,
} from "./kitSheetDb";

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

describe("kitSheetDb — linhas", () => {
  it("lista linhas ordenadas por posição", async () => {
    const list = await listKitRows();
    expect(list.map((r) => r.id)).toEqual([10, 11, 12]);
  });

  it("cria linha com a próxima posição (max + 1)", async () => {
    const created = await createKitRow({ kit: "Kit Teste" } as any);
    expect(created.position).toBe(4);
    expect((created as any).kit).toBe("Kit Teste");
  });

  it("updateKitRow aplica o patch e ignora id/createdAt", async () => {
    const updated = await updateKitRow(10, { kit: "Novo nome", id: 999, createdAt: new Date() } as any);
    expect((updated as any)?.kit).toBe("Novo nome");
    expect(updated?.id).toBe(10);
  });

  it("deleteKitRow remove a linha", async () => {
    await deleteKitRow(11);
    expect(rows.find((r) => r.id === 11)).toBeUndefined();
    expect(rows).toHaveLength(2);
  });
});

describe("kitSheetDb — colunas personalizadas", () => {
  it("lista colunas ordenadas por posição", async () => {
    const list = await listKitCustomColumns();
    expect(list.map((c) => c.name)).toEqual(["Fornecedor", "Observações"]);
  });

  it("cria coluna com a próxima posição (max + 1)", async () => {
    const created = await createKitCustomColumn("Link");
    expect(created.name).toBe("Link");
    expect(created.position).toBe(3);
  });

  it("usa nome padrão quando vazio", async () => {
    const created = await createKitCustomColumn("   ");
    expect(created.name).toBe("Nova coluna");
  });

  it("renomeia a coluna", async () => {
    await renameKitCustomColumn(1, "Fabricante");
    expect(columns.find((c) => c.id === 1)?.name).toBe("Fabricante");
  });

  it("exclui a coluna e limpa a chave correspondente em todas as linhas", async () => {
    await deleteKitCustomColumn(2);
    expect(columns.find((c) => c.id === 2)).toBeUndefined();
    expect(JSON.parse(rows.find((r) => r.id === 10)!.customValues!)).toEqual({ "1": "Acme" });
    expect(JSON.parse(rows.find((r) => r.id === 11)!.customValues!)).toEqual({});
    expect(rows.find((r) => r.id === 12)!.customValues).toBeNull();
  });

  it("setKitCustomValue faz merge preservando os demais valores", async () => {
    await setKitCustomValue(10, 1, "Nova Acme");
    expect(JSON.parse(rows.find((r) => r.id === 10)!.customValues!)).toEqual({
      "1": "Nova Acme",
      "2": "ok",
    });
  });

  it("setKitCustomValue cria o JSON quando a linha não tinha valores", async () => {
    await setKitCustomValue(12, 2, "primeiro");
    expect(JSON.parse(rows.find((r) => r.id === 12)!.customValues!)).toEqual({ "2": "primeiro" });
  });

  it("setKitCustomValue retorna null para linha inexistente", async () => {
    const res = await setKitCustomValue(999, 1, "x");
    expect(res).toBeNull();
  });
});
