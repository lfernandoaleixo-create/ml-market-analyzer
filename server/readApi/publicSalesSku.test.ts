import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { PublicSaleItem } from "../../shared/publicSales";
import { skuSheetRows, skuVariations } from "../../drizzle/schema";
const state = vi.hoisted(() => ({
  getDb: vi.fn(),
  mutation: vi.fn(() => {
    throw new Error("Mutation forbidden");
  }),
}));
vi.mock("../db", () => ({ getDb: state.getDb }));
vi.mock("../skuSheetDb", () => ({
  listSkuRows: state.mutation,
  listSkuVariations: state.mutation,
  listAllSkuVariations: state.mutation,
  generateSku: state.mutation,
}));
import {
  readPublicSkuProjection,
  resolvePublicSaleSku,
  type PublicSkuCandidate,
} from "./publicSalesSku";

const item = (overrides: Partial<PublicSaleItem> = {}): PublicSaleItem => ({
  itemId: "MLB1",
  variationId: "500001",
  sku: " ORIGINAL ",
  skuSource: "mercado_livre",
  title: "Título igual não é identificação",
  quantity: 1,
  unitPrice: 10,
  listingType: null,
  ...overrides,
});
const candidate = (
  identity: string,
  sku: string,
  itemId: string | null = "MLB1"
): PublicSkuCandidate => ({ identity, sku, itemId });
beforeEach(() => {
  vi.clearAllMocks();
});

describe("conservative exact SKU resolver", () => {
  it("prefers exact ML SKU existing in sheet over another unique MLB mapping, preserves spaces and case", () => {
    const warnings = new Set<string>();
    const result = resolvePublicSaleSku(
      item(),
      [
        candidate("row:1", " ORIGINAL ", "MLB2"),
        candidate("row:2", "original", "MLB1"),
      ],
      warnings
    );
    expect(result).toMatchObject({ sku: " ORIGINAL ", skuSource: "sheet" });
    expect(warnings.size).toBe(0);
  });
  it("manual duplicate SKU is allowed, exact text preserved but not considered product identity", () => {
    const warnings = new Set<string>();
    const result = resolvePublicSaleSku(
      item(),
      [
        candidate("row:1", " ORIGINAL "),
        candidate("row:2", " ORIGINAL ", "MLB2"),
      ],
      warnings
    );
    expect(result).toMatchObject({ sku: " ORIGINAL ", skuSource: "sheet" });
    expect([...warnings]).toEqual([
      expect.stringContaining("SKU_REUSED_IN_SHEET"),
    ]);
  });
  it("maps a unique mainMlb or variation mlb when no exact SKU exists", () => {
    const warnings = new Set<string>();
    expect(
      resolvePublicSaleSku(
        item(),
        [candidate("variation:23", " VariAÇÃO ")],
        warnings
      )
    ).toMatchObject({
      sku: " VariAÇÃO ",
      skuSource: "sheet",
      variationId: "500001",
    });
    expect(
      resolvePublicSaleSku(
        item({ sku: null }),
        [candidate("row:9", " PRINCIPAL ")],
        warnings
      )
    ).toMatchObject({ sku: " PRINCIPAL ", skuSource: "sheet" });
  });
  it("multiple candidates on MLB are ambiguous even same SKU and ML variationId cannot be local variationIndex", () => {
    const warnings = new Set<string>();
    expect(
      resolvePublicSaleSku(
        item(),
        [candidate("variation:1", "DUP"), candidate("variation:2", "DUP")],
        warnings
      )
    ).toMatchObject({ sku: " ORIGINAL ", skuSource: "ambiguous" });
    expect([...warnings]).toEqual([expect.stringContaining("SKU_AMBIGUOUS")]);
    expect(
      resolvePublicSaleSku(
        item({ sku: null, variationId: "1" }),
        [candidate("variation:1", "ONE"), candidate("variation:2", "TWO")],
        warnings
      )
    ).toMatchObject({ sku: null, skuSource: "ambiguous" });
  });
  it("never matches title, trims SKU, compares case-insensitively or invents a fallback association", () => {
    const result = resolvePublicSaleSku(
      item({ itemId: "MLB9" }),
      [candidate("row:1", "ORIGINAL"), candidate("row:2", "original", null)],
      new Set()
    );
    expect(result).toMatchObject({
      sku: " ORIGINAL ",
      skuSource: "mercado_livre",
    });
    expect(
      resolvePublicSaleSku(
        item({ itemId: null, sku: null }),
        [candidate("row:1", "GUESS", null)],
        new Set()
      )
    ).toMatchObject({ sku: null, skuSource: null });
  });
  it("an imported unmatched SKU keeps unknown origin instead of being fabricated as Mercado Livre", () => {
    expect(
      resolvePublicSaleSku(item({ skuSource: null }), [], new Set()).skuSource
    ).toBeNull();
  });
});

describe("read-only direct SKU projection", () => {
  it("uses only whitelisted SELECT columns, soft-delete filters and parent join, no title/write/backfill helper", async () => {
    type Call = {
      fields: Record<string, unknown>;
      table?: string;
      filter?: SQL;
      join?: string;
    };
    const calls: Call[] = [];
    const db = {
      insert: state.mutation,
      update: state.mutation,
      delete: state.mutation,
      execute: state.mutation,
      transaction: state.mutation,
      select: (fields: Record<string, unknown>) => {
        const call: Call = { fields };
        calls.push(call);
        const chain = {
          from: (table: typeof skuSheetRows | typeof skuVariations) => {
            call.table = getTableName(table);
            return chain;
          },
          innerJoin: (table: typeof skuSheetRows, _where: SQL) => {
            call.join = getTableName(table);
            return chain;
          },
          where: async (filter: SQL) => {
            call.filter = filter;
            return call.table === "sku_sheet_rows"
              ? [
                  { id: 1, sku: " Exact MAIN ", mainMlb: "MLB1" },
                  { id: 2, sku: "", mainMlb: "MLB2" },
                ]
              : [
                  {
                    id: 3,
                    skuRowId: 1,
                    variationSku: " exact VAr ",
                    mlb: "MLB3",
                  },
                  { id: 4, skuRowId: 1, variationSku: "  ", mlb: "MLB4" },
                ];
          },
        };
        return chain;
      },
    };
    state.getDb.mockResolvedValue(db);
    expect(await readPublicSkuProjection()).toEqual([
      { identity: "row:1", sku: " Exact MAIN ", itemId: "MLB1" },
      { identity: "variation:3", sku: " exact VAr ", itemId: "MLB3" },
    ]);
    expect(calls).toHaveLength(2);
    expect(Object.keys(calls[0].fields)).toEqual(["id", "sku", "mainMlb"]);
    expect(Object.keys(calls[1].fields)).toEqual([
      "id",
      "skuRowId",
      "variationSku",
      "mlb",
    ]);
    expect(calls[1].join).toBe("sku_sheet_rows");
    const dialect = new MySqlDialect();
    expect(dialect.sqlToQuery(calls[0].filter!).sql).toContain(
      "`sku_sheet_rows`.`isDeleted`"
    );
    expect(dialect.sqlToQuery(calls[1].filter!).sql).toContain(
      "`sku_variations`.`isDeleted`"
    );
    expect(dialect.sqlToQuery(calls[1].filter!).sql).toContain(
      "`sku_sheet_rows`.`isDeleted`"
    );
    expect(state.mutation).not.toHaveBeenCalled();
  });
  it("does not fabricate an empty confirmed sheet when database is unavailable", async () => {
    state.getDb.mockResolvedValue(null);
    await expect(readPublicSkuProjection()).rejects.toThrow(
      "Projeção SKU indisponível"
    );
    expect(state.mutation).not.toHaveBeenCalled();
  });
});
