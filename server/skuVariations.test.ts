import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Testes dos helpers de variações SKU (getVariations / upsertVariation).
 * Usa store em memória com mocks de drizzle-orm e db.
 */

type VarRow = {
  id: number;
  skuRowId: number;
  variationIndex: number;
  variationSku: string;
  ean: string;
  mlb: string;
  done: boolean;
};

let variations: VarRow[];
let varSeq: number;

// Tabela de SKU sheet rows (simplificada para o teste)
type SkuRow = {
  id: number;
  position: number;
  tipoSku: string;
  categoryName: string | null;
  productNumber: number | null;
  variantNumber: number | null;
  sku: string;
  skuKit: string;
  gerarSkuKit: boolean;
  produto: string;
  variante: string;
  customValues: string | null;
  [k: string]: unknown;
};
let skuRows: SkuRow[];

vi.mock("../drizzle/schema", () => ({
  skuVariations: { __t: "variations" },
  skuSheetRows: { __t: "skuRows" },
  skuSheetCustomColumns: { __t: "columns" },
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
  if (table === "variations") return variations;
  if (table === "skuRows") return skuRows;
  return [];
}

function matchRow(row: any, cond: any): boolean {
  if (!cond) return true;
  if (cond.kind === "and") return cond.conds.every((c: any) => matchRow(row, c));
  if (cond.kind === "eq") {
    if (cond.col === "id") return row.id === cond.value;
    if (cond.col === "skuRowId") return row.skuRowId === cond.value;
    if (cond.col === "variationIndex") return row.variationIndex === cond.value;
  }
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
          orderBy(_spec: any) {
            if (table === "variations") {
              this._rows.sort((a: any, b: any) => a.variationIndex - b.variationIndex);
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
        if (tableOf(t) === "variations") {
          variations.push({
            id: varSeq++,
            skuRowId: vals.skuRowId,
            variationIndex: vals.variationIndex,
            variationSku: vals.variationSku ?? "",
            ean: vals.ean ?? "",
            mlb: vals.mlb ?? "",
            done: vals.done ?? false,
          });
        } else if (tableOf(t) === "skuRows") {
          skuRows.push({
            id: skuRows.length + 100,
            position: vals.position ?? 0,
            tipoSku: vals.tipoSku ?? "",
            categoryName: vals.categoryName ?? null,
            productNumber: vals.productNumber ?? null,
            variantNumber: vals.variantNumber ?? null,
            sku: vals.sku ?? "",
            skuKit: vals.skuKit ?? "",
            gerarSkuKit: vals.gerarSkuKit ?? false,
            produto: vals.produto ?? "",
            variante: vals.variante ?? "",
            customValues: vals.customValues ?? null,
          });
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
        if (tableOf(t) === "variations") {
          const idx = variations.findIndex((r) => matchRow(r, cond));
          if (idx >= 0) variations.splice(idx, 1);
        }
      },
    }),
  };
}

vi.mock("./db", () => ({
  getDb: vi.fn(async () => makeDb()),
}));

import { skuVariations, skuSheetRows, skuSheetCustomColumns } from "../drizzle/schema";
(skuVariations as any).id = { __c: "id" };
(skuVariations as any).skuRowId = { __c: "skuRowId" };
(skuVariations as any).variationIndex = { __c: "variationIndex" };
(skuVariations as any).variationSku = { __c: "variationSku" };
(skuVariations as any).ean = { __c: "ean" };
(skuVariations as any).mlb = { __c: "mlb" };
(skuVariations as any).done = { __c: "done" };

(skuSheetRows as any).id = { __c: "id" };
(skuSheetRows as any).position = { __c: "position" };
(skuSheetRows as any).customValues = { __c: "customValues" };

(skuSheetCustomColumns as any).id = { __c: "id" };
(skuSheetCustomColumns as any).position = { __c: "position" };

import { getVariations, upsertVariation } from "./skuSheetDb";

beforeEach(() => {
  variations = [];
  varSeq = 1;
  skuRows = [
    {
      id: 1,
      position: 1,
      tipoSku: "1",
      categoryName: "SERVICOS",
      productNumber: 10,
      variantNumber: 1,
      sku: "1-SERVICOS-10-1",
      skuKit: "",
      gerarSkuKit: false,
      produto: "Produto A",
      variante: "Variante X",
      customValues: null,
    },
  ];
});

describe("getVariations", () => {
  it("retorna 10 variações com SKUs derivados quando não há dados no banco", async () => {
    const result = await getVariations(1, "1-SERVICOS-10-1");
    expect(result).toHaveLength(10);
    expect(result[0].variationSku).toBe("1-SERVICOS-10-1-01");
    expect(result[9].variationSku).toBe("1-SERVICOS-10-1-10");
    expect(result[0].ean).toBe("");
    expect(result[0].mlb).toBe("");
    expect(result[0].done).toBe(false);
  });

  it("retorna dados existentes do banco mesclados com placeholders", async () => {
    variations = [
      { id: 1, skuRowId: 1, variationIndex: 3, variationSku: "1-SERVICOS-10-1-03", ean: "789123", mlb: "MLB001", done: true },
      { id: 2, skuRowId: 1, variationIndex: 7, variationSku: "1-SERVICOS-10-1-07", ean: "456789", mlb: "", done: false },
    ];
    const result = await getVariations(1, "1-SERVICOS-10-1");
    expect(result).toHaveLength(10);
    // Variação 3 com dados
    expect(result[2].variationIndex).toBe(3);
    expect(result[2].ean).toBe("789123");
    expect(result[2].mlb).toBe("MLB001");
    expect(result[2].done).toBe(true);
    // Variação 7 com dados parciais
    expect(result[6].variationIndex).toBe(7);
    expect(result[6].ean).toBe("456789");
    expect(result[6].mlb).toBe("");
    // Variação 1 sem dados
    expect(result[0].ean).toBe("");
    expect(result[0].done).toBe(false);
  });

  it("gera SKUs vazios quando baseSku é vazio", async () => {
    const result = await getVariations(1, "");
    expect(result[0].variationSku).toBe("");
    expect(result[9].variationSku).toBe("");
  });
});

describe("upsertVariation", () => {
  it("insere uma nova variação quando não existe", async () => {
    const result = await upsertVariation(1, 5, "1-SERVICOS-10-1", { ean: "111222", mlb: "MLB999", done: true });
    expect(result.variationIndex).toBe(5);
    expect(result.variationSku).toBe("1-SERVICOS-10-1-05");
    expect(result.ean).toBe("111222");
    expect(result.mlb).toBe("MLB999");
    expect(result.done).toBe(true);
    // Verifica que foi inserido no store
    expect(variations).toHaveLength(1);
    expect(variations[0].skuRowId).toBe(1);
    expect(variations[0].variationIndex).toBe(5);
  });

  it("atualiza uma variação existente", async () => {
    variations = [
      { id: 10, skuRowId: 1, variationIndex: 2, variationSku: "1-SERVICOS-10-1-02", ean: "old", mlb: "oldmlb", done: false },
    ];
    const result = await upsertVariation(1, 2, "1-SERVICOS-10-1", { ean: "new-ean" });
    expect(result.ean).toBe("new-ean");
    // mlb preservado do existente
    expect(result.mlb).toBe("oldmlb");
    // Verifica que o store foi atualizado (variationSku recalculado)
    expect(variations[0].variationSku).toBe("1-SERVICOS-10-1-02");
  });

  it("atualiza apenas o campo done sem alterar ean/mlb", async () => {
    variations = [
      { id: 20, skuRowId: 1, variationIndex: 1, variationSku: "1-SERVICOS-10-1-01", ean: "abc", mlb: "def", done: false },
    ];
    const result = await upsertVariation(1, 1, "1-SERVICOS-10-1", { done: true });
    expect(result.done).toBe(true);
    expect(result.ean).toBe("abc");
    expect(result.mlb).toBe("def");
  });

  it("gera variationSku correto com padding de dois dígitos", async () => {
    const result = await upsertVariation(1, 1, "2-BAMBU-5-3", { ean: "x" });
    expect(result.variationSku).toBe("2-BAMBU-5-3-01");
  });
});
