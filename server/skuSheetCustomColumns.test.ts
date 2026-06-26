import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Testes dos helpers de COLUNAS PERSONALIZADAS da Planilha SKU.
 *
 * Foco no comportamento de maior risco:
 *  - createCustomColumn atribui a próxima posição (max + 1)
 *  - renameCustomColumn altera o nome
 *  - deleteCustomColumn remove a coluna E limpa a chave correspondente
 *    do JSON `customValues` de TODAS as linhas (sem afetar as demais chaves)
 *  - setCustomValue faz MERGE no JSON (preserva os valores já existentes)
 *
 * Backamos o handle do drizzle com um store em memória, exercitando o fluxo
 * real dos helpers sem um banco de dados.
 */

type ColRow = { id: number; name: string; position: number };
type SheetRow = { id: number; customValues: string | null };

let columns: ColRow[];
let rows: SheetRow[];
let colSeq: number;

vi.mock("../drizzle/schema", () => ({
  skuSheetCustomColumns: { __t: "columns" },
  skuSheetRows: { __t: "rows" },
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
        // Detecta agregação MAX(position) usada por createCustomColumn.
        const isMax = proj && typeof proj === "object" && "max" in proj;
        const builder: any = {
          _rows: [...data],
          where(cond: any) {
            this._rows = this._rows.filter((r: any) => matchRow(r, cond));
            return this;
          },
          orderBy(spec: any) {
            // sql`... id DESC` -> ordena por id desc; asc(position) -> por posição.
            if (spec && spec.kind === "sql") {
              this._rows.sort((a: any, b: any) => b.id - a.id);
            } else {
              this._rows.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
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
        if (isMax) {
          // Retorna direto o agregado quando não houver where/orderBy encadeado.
          return builder;
        }
        return builder;
      },
    }),
    insert: (t: unknown) => ({
      values: async (vals: any) => {
        if (tableOf(t) === "columns") {
          columns.push({ id: colSeq++, name: vals.name, position: vals.position });
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
      },
    }),
  };
}

vi.mock("./db", () => ({
  getDb: vi.fn(async () => makeDb()),
}));

import { skuSheetCustomColumns, skuSheetRows } from "../drizzle/schema";
(skuSheetCustomColumns as any).id = { __c: "id" };
(skuSheetCustomColumns as any).name = { __c: "name" };
(skuSheetCustomColumns as any).position = { __c: "position" };
(skuSheetRows as any).id = { __c: "id" };
(skuSheetRows as any).customValues = { __c: "customValues" };

import {
  listCustomColumns,
  createCustomColumn,
  renameCustomColumn,
  deleteCustomColumn,
  setCustomValue,
} from "./skuSheetDb";

beforeEach(() => {
  columns = [
    { id: 1, name: "Fornecedor", position: 1 },
    { id: 2, name: "Observações", position: 2 },
  ];
  rows = [
    { id: 10, customValues: JSON.stringify({ "1": "Acme", "2": "ok" }) },
    { id: 11, customValues: JSON.stringify({ "2": "rever" }) },
    { id: 12, customValues: null },
  ];
  colSeq = 3;
});

describe("skuSheetDb — colunas personalizadas", () => {
  it("lista colunas ordenadas por posição", async () => {
    const list = await listCustomColumns();
    expect(list.map((c) => c.name)).toEqual(["Fornecedor", "Observações"]);
  });

  it("cria coluna com a próxima posição (max + 1)", async () => {
    const created = await createCustomColumn("Link");
    expect(created.name).toBe("Link");
    expect(created.position).toBe(3);
    expect(columns.find((c) => c.name === "Link")?.position).toBe(3);
  });

  it("usa nome padrão quando vazio", async () => {
    const created = await createCustomColumn("   ");
    expect(created.name).toBe("Nova coluna");
  });

  it("renomeia a coluna", async () => {
    await renameCustomColumn(1, "Fabricante");
    expect(columns.find((c) => c.id === 1)?.name).toBe("Fabricante");
  });

  it("exclui a coluna e limpa a chave correspondente em todas as linhas", async () => {
    await deleteCustomColumn(2);
    // Coluna removida
    expect(columns.find((c) => c.id === 2)).toBeUndefined();
    // Linha 10 mantém a chave "1", perde a "2"
    expect(JSON.parse(rows.find((r) => r.id === 10)!.customValues!)).toEqual({ "1": "Acme" });
    // Linha 11 fica com objeto vazio (perdeu a única chave "2")
    expect(JSON.parse(rows.find((r) => r.id === 11)!.customValues!)).toEqual({});
    // Linha 12 segue nula (sem valores)
    expect(rows.find((r) => r.id === 12)!.customValues).toBeNull();
  });

  it("setCustomValue faz merge preservando os demais valores", async () => {
    await setCustomValue(10, 1, "Nova Acme");
    expect(JSON.parse(rows.find((r) => r.id === 10)!.customValues!)).toEqual({
      "1": "Nova Acme",
      "2": "ok",
    });
  });

  it("setCustomValue cria o JSON quando a linha não tinha valores", async () => {
    await setCustomValue(12, 2, "primeiro");
    expect(JSON.parse(rows.find((r) => r.id === 12)!.customValues!)).toEqual({ "2": "primeiro" });
  });

  it("setCustomValue retorna null para linha inexistente", async () => {
    const res = await setCustomValue(999, 1, "x");
    expect(res).toBeNull();
  });
});
