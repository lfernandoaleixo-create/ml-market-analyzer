import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PublicSaleItem,
  PublicSalesHistoryRow,
  PublicSalesOrder,
  PublicSalesQuery,
  PublicSalesSnapshot,
} from "../../shared/publicSales";
import type { MarginSale } from "../../shared/salesMargin";
import type { MarginReportSnapshot } from "../salesMargin/db";
const state = vi.hoisted(() => ({
  snapshot: vi.fn(),
  reports: vi.fn(),
  projection: vi.fn(),
}));
vi.mock("./publicSalesProvider", () => ({
  getPublicSalesSnapshot: state.snapshot,
}));
vi.mock("../salesMargin/db", () => ({ listMarginReports: state.reports }));
vi.mock("./publicSalesSku", async original => ({
  ...(await original<typeof import("./publicSalesSku")>()),
  readPublicSkuProjection: state.projection,
}));
import { loadPublicSalesData, publicSalesPeriod } from "./publicSalesData";
import { ReadApiDataError } from "./data";
import { SalesMarginProviderError } from "../salesMargin/provider";
import { resolvePublicSalesBounds } from "./publicSalesQuery";

const query: PublicSalesQuery = {
  limit: 100,
  offset: 0,
  days: 30,
  from: "2024-02-01",
  to: "2024-02-29",
  groupBy: "none",
  granularity: "day",
  includeFinancial: true,
};
const item = (overrides: Partial<PublicSaleItem> = {}): PublicSaleItem => ({
  itemId: "MLB1",
  variationId: "101",
  sku: "SKU 01",
  skuSource: "mercado_livre",
  title: "Produto",
  quantity: 1,
  unitPrice: 10,
  listingType: "gold_special",
  ...overrides,
});
function order(overrides: Partial<PublicSalesOrder> = {}): PublicSalesOrder {
  const rawStatus = Object.prototype.hasOwnProperty.call(overrides, "rawStatus")
    ? overrides.rawStatus!
    : overrides.status === "cancelled"
      ? "cancelled"
      : overrides.status === null
        ? null
        : "paid";
  return {
    orderId: "O1",
    packId: "PACK",
    paymentIds: ["PAY1"],
    createdAt: "2024-02-12T15:30:00.000Z",
    saleDay: "2024-02-12",
    paidAt: "2024-02-12T15:31:00Z",
    status: "paid",
    rawStatus,
    financiallyComplete: true,
    financialStatus: "confirmed",
    items: [item()],
    shipping: { logisticType: "fulfillment", payer: "seller" },
    gross: 100,
    net: 80,
    deductions: 20,
    charges: [
      {
        key: "sale_fee",
        label: "Tarifa original",
        category: "sale",
        amount: 20,
      },
    ],
    saleFee: 20,
    processingFee: 0,
    shippingCost: 0,
    financingFee: 0,
    otherCharges: 0,
    taxesWithheld: 0,
    taxDetail: [{ type: "tax", amount: 0, description: "Retenção" }],
    taxesDisaggregated: null,
    chargesExplainDeductions: true,
    source: "automatic",
    asOf: "2024-02-20T15:00:00Z",
    pendingReason: null,
    ...overrides,
  };
}
function snapshot(
  orders: PublicSalesOrder[] = [order()],
  overrides: Partial<PublicSalesSnapshot> = {}
): PublicSalesSnapshot {
  return {
    ownerUserId: 77,
    sellerId: "3308178634",
    nickname: "DIAGNOSTIC ONLY",
    orders,
    asOf: Date.parse("2024-02-20T15:00:00Z"),
    stale: false,
    partial: false,
    capped: false,
    dataStart: null,
    coverageFrom: "2024-02-01",
    coverageTo: "2024-02-29",
    warnings: [],
    ...overrides,
  };
}
function sale(overrides: Partial<MarginSale> = {}): MarginSale {
  return {
    operationId: "O1",
    saleDate: "2024-02-12",
    items: [
      {
        itemId: "MLB1",
        sku: "SKU REPORT",
        title: "Produto relatório",
        quantity: 2,
      },
    ],
    gross: 200,
    net: 150,
    deductions: 50,
    financialStatus: "confirmed",
    source: "report",
    charges: [
      {
        key: "reported_net_deductions",
        label: "Descontos líquidos informados",
        category: "other",
        amount: 50,
      },
    ],
    taxesWithheld: null,
    released: null,
    ...overrides,
  };
}
const report = (
  id: number,
  operations: MarginSale[],
  date = "2024-02-20T18:00:00Z"
): MarginReportSnapshot => ({ id, createdAt: new Date(date), operations });
function given(
  orders: PublicSalesOrder[],
  overrides: Partial<PublicSalesSnapshot> = {}
) {
  state.snapshot.mockResolvedValue(snapshot(orders, overrides));
}
async function history(extra: Partial<PublicSalesQuery> = {}) {
  const result = await loadPublicSalesData("/sales/history", 7, {
    ...query,
    ...extra,
  });
  return { rows: result.data as PublicSalesHistoryRow[], meta: result.meta! };
}
async function orders(extra: Partial<PublicSalesQuery> = {}) {
  const result = await loadPublicSalesData("/sales/orders", 7, {
    ...query,
    ...extra,
  });
  return { rows: result.data as PublicSalesOrder[], meta: result.meta! };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.snapshot.mockResolvedValue(snapshot());
  state.reports.mockResolvedValue({ reports: [], partial: false, count: 0 });
  state.projection.mockResolvedValue([]);
});

describe("publicSalesPeriod / Brasília IANA", () => {
  it.each([
    ["2024-03-01T02:59:59.999Z", "day", "2024-02-29T03:00:00.000Z"],
    ["2024-03-01T03:00:00Z", "day", "2024-03-01T03:00:00.000Z"],
    ["2024-03-01T02:59:59Z", "month", "2024-02-01T03:00:00.000Z"],
    ["2024-03-01T03:00:00Z", "month", "2024-03-01T03:00:00.000Z"],
    ["2024-02-12T02:59:59Z", "week", "2024-02-05T03:00:00.000Z"],
    ["2024-02-12T03:00:00Z", "week", "2024-02-12T03:00:00.000Z"],
    ["2024-01-01T00:00:00Z", "week", "2023-12-25T03:00:00.000Z"],
    ["2024-02-29T13:39:44.345Z", "hour", "2024-02-29T13:00:00.000Z"],
    ["2018-12-01T02:30:00Z", "day", "2018-12-01T02:00:00.000Z"],
    ["2018-12-01T02:30:00Z", "month", "2018-12-01T02:00:00.000Z"],
    ["2018-11-04T03:30:00Z", "day", "2018-11-04T03:00:00.000Z"],
  ] as const)("%s %s -> %s", (instant, granularity, period) => {
    expect(publicSalesPeriod(Date.parse(instant), granularity)).toBe(period);
  });
  it("accepts leap calendar boundaries and rejects impossible/reversed/367-day bounds", () => {
    expect(resolvePublicSalesBounds(query)).toMatchObject({
      fromMs: Date.parse("2024-02-01T03:00:00Z"),
      toMs: Date.parse("2024-03-01T02:59:59.999Z"),
    });
    expect(() =>
      resolvePublicSalesBounds({ ...query, from: "2023-02-29" })
    ).toThrow();
    expect(() =>
      resolvePublicSalesBounds({ ...query, from: "2024-03-01" })
    ).toThrow();
    expect(() =>
      resolvePublicSalesBounds({
        ...query,
        from: "2024-01-01",
        to: "2025-01-01",
      })
    ).toThrow();
    expect(
      resolvePublicSalesBounds({
        ...query,
        from: "2024-01-01",
        to: "2024-12-31",
      })
    ).toMatchObject({ from: "2024-01-01", to: "2024-12-31" });
  });
});

describe("orders projection and imported photos", () => {
  it("uses provider bounds, owner and financial:true, and reads reports for the verified owner", async () => {
    const result = await orders();
    expect(state.snapshot).toHaveBeenCalledWith(
      7,
      resolvePublicSalesBounds(query),
      { financial: true }
    );
    expect(state.reports).toHaveBeenCalledWith(77, "3308178634");
    expect(result.rows[0].gross).toBe(100);
    expect(result.rows[0].saleDay).toBe("2024-02-12");
  });
  it("chooses latest financial photo and retains metadata actually verified on the same order", async () => {
    state.reports.mockResolvedValue({
      reports: [report(1, [sale({ net: 160 })]), report(2, [sale()])],
      count: 2,
      partial: false,
    });
    const { rows } = await orders();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orderId: "O1",
      source: "imported_report",
      net: 150,
      gross: 200,
      asOf: "2024-02-20T18:00:00.000Z",
      createdAt: "2024-02-12T15:30:00.000Z",
      saleDay: "2024-02-12",
      paidAt: "2024-02-12T15:31:00.000Z",
      status: "paid",
      rawStatus: "paid",
      packId: "PACK",
      paymentIds: ["PAY1"],
      saleFee: null,
      otherCharges: null,
      taxDetail: null,
    });
    expect(rows[0].shipping).toEqual({
      logisticType: "fulfillment",
      payer: "seller",
    });
    expect(rows[0].items[0]).toMatchObject({
      variationId: "101",
      unitPrice: 10,
      listingType: "gold_special",
      sku: "SKU 01",
    });
    expect(rows[0].charges).toEqual([]);
  });
  it("resolves latest precedence before bounds so older in-window reports cannot reappear", async () => {
    state.reports.mockResolvedValue({
      reports: [
        report(2, [sale({ saleDate: "2024-03-02" })]),
        report(1, [sale()]),
      ],
      count: 2,
      partial: false,
    });
    const matched = (await orders()).rows;
    expect(matched[0]).toMatchObject({
      createdAt: "2024-02-12T15:30:00.000Z",
      saleDay: "2024-02-12",
    });
    given([]);
    expect((await orders()).rows).toEqual([]);
  });
  it("supplements only missing SKU using unique exact MLB in the same operation", async () => {
    state.reports.mockResolvedValue({
      reports: [
        report(1, [
          sale({
            items: [
              { itemId: "MLB1", title: "Diferente", sku: null, quantity: 1 },
            ],
          }),
        ]),
      ],
      count: 1,
      partial: false,
    });
    expect((await orders()).rows[0].items[0].sku).toBe("SKU 01");
    given([
      order({ items: [item(), item({ variationId: "102", sku: "OUTRO" })] }),
    ]);
    expect((await orders()).rows[0].items.map(item => item.sku)).toEqual([
      "SKU 01",
      "OUTRO",
    ]);
  });
  it("normalizes imported timestamp to ISO and retains day-only date without fake midnight", async () => {
    state.reports.mockResolvedValue({
      reports: [report(1, [sale({ saleDate: "2024-02-12T23:30:00-03:00" })])],
      count: 1,
      partial: false,
    });
    expect((await orders()).rows[0]).toMatchObject({
      createdAt: "2024-02-12T15:30:00.000Z",
      saleDay: "2024-02-12",
    });
  });
  it.each(["pending", "refund_pending"] as const)(
    "%s finance stays null even with supplied fake amounts",
    async financialStatus => {
      given([order({ financialStatus })]);
      const row = (await orders()).rows[0];
      expect(row).toMatchObject({
        financiallyComplete: false,
        financialStatus,
        gross: 100,
        net: null,
        deductions: null,
        saleFee: null,
        taxesWithheld: null,
        taxDetail: null,
        chargesExplainDeductions: null,
      });
      expect(row.charges).toEqual([]);
      const h = await history();
      expect(h.rows[0].net).toBeNull();
      expect(h.meta.financePartial).toBe(true);
    }
  );
  it("recursively whitelists provider data and never returns diagnostic identity, raw objects or buyer", async () => {
    const secret = {
      buyer: { email: "SECRET" },
      accessToken: "SECRET",
      rawOrders: "SECRET",
    };
    given([
      {
        ...order(),
        ...secret,
        items: [{ ...item(), ...secret }],
        shipping: { ...order().shipping, ...secret },
        charges: [{ ...order().charges[0], ...secret }],
        taxDetail: [
          { type: "TAX", amount: 1, description: "Original", ...secret },
        ],
      } as PublicSalesOrder,
    ]);
    const result = await orders();
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(JSON.stringify(result)).not.toContain("DIAGNOSTIC ONLY");
    expect(Object.keys(result.rows[0].items[0])).toEqual([
      "itemId",
      "variationId",
      "sku",
      "skuSource",
      "title",
      "quantity",
      "unitPrice",
      "listingType",
    ]);
  });
  it("duplicate MLB projection preserves original exact SKU, ambiguity warning and partial", async () => {
    state.projection.mockResolvedValue([
      { identity: "row:1", sku: "A", itemId: "MLB1" },
      { identity: "variation:2", sku: "B", itemId: "MLB1" },
    ]);
    const result = await orders();
    expect(result.rows[0].items[0]).toMatchObject({
      sku: "SKU 01",
      skuSource: "ambiguous",
      variationId: "101",
    });
    expect(result.meta.partial).toBe(true);
    expect(result.meta.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("SKU_AMBIGUOUS")])
    );
  });
  it("exact reusable sheet SKU remains exact across products without pretending a unique identity", async () => {
    state.projection.mockResolvedValue([
      { identity: "row:1", sku: "SKU 01", itemId: "MLB1" },
      { identity: "row:2", sku: "SKU 01", itemId: "MLB2" },
    ]);
    const result = await orders();
    expect(result.rows[0].items[0]).toMatchObject({
      sku: "SKU 01",
      skuSource: "sheet",
    });
    expect(result.meta.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("SKU_REUSED_IN_SHEET")])
    );
  });
  it("unmatched imported SKU has unknown origin instead of fabricated Mercado Livre metadata", async () => {
    given([order({ items: [item({ sku: null, skuSource: null })] })]);
    state.reports.mockResolvedValue({
      reports: [report(1, [sale()])],
      count: 1,
      partial: false,
    });
    expect((await orders()).rows[0].items[0]).toMatchObject({
      sku: "SKU REPORT",
      skuSource: null,
    });
  });
  it.each(["CUSTOM-REF", "1234567890123456"])(
    "never treats uncorrelated imported reference %s as verified ML order",
    async reference => {
      given([]);
      state.reports.mockResolvedValue({
        reports: [report(1, [sale({ operationId: reference })])],
        count: 1,
        partial: false,
      });
      const detail = await orders();
      expect(detail.rows).toEqual([]);
      expect(detail.meta).toMatchObject({
        partial: true,
        unverifiedImportedReferences: 1,
      });
      const result = await history();
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        orders: null,
        cancelled: null,
        unitsSold: null,
        revenue: null,
        net: null,
        otherCharges: null,
      });
      expect(result.meta.financePartialKnown).toMatchObject({
        net: null,
        otherCharges: null,
      });
      expect(result.meta.financialAllocationReasons).toContain(
        "unverified_imported_order_identity"
      );
      expect(JSON.stringify(result.rows)).not.toContain(reference);
    }
  );
  it("a matching imported reference must actually equal a verified automatic order, not pack/payment ID", async () => {
    given([order({ orderId: "KNOWN", packId: "PACK", paymentIds: ["PAY"] })]);
    state.reports.mockResolvedValue({
      reports: [
        report(1, [
          sale({ operationId: "PACK" }),
          sale({ operationId: "PAY" }),
          sale({ operationId: "KNOWN" }),
        ]),
      ],
      count: 1,
      partial: false,
    });
    const result = await orders();
    expect(result.rows.map(row => row.orderId)).toEqual(["KNOWN"]);
    expect(result.rows[0]).toMatchObject({
      source: "imported_report",
      net: 150,
      packId: "PACK",
    });
    expect(result.meta.unverifiedImportedReferences).toBe(2);
  });
  it("itemId+sku must match the same item, preserves full order financial photo and filters before pagination", async () => {
    given([
      order({
        orderId: "O3",
        items: [item({ sku: "A" }), item({ itemId: "MLB2", sku: "B" })],
      }),
      order({ orderId: "O2", items: [item({ sku: "A" })] }),
      order({
        orderId: "O1",
        status: "cancelled",
        items: [item({ sku: "A" })],
      }),
    ]);
    expect((await orders({ itemId: "MLB1", sku: "B" })).rows).toEqual([]);
    const result = await orders({
      itemId: "MLB1",
      sku: "A",
      status: "paid",
      offset: 1,
      limit: 1,
    });
    expect(result.rows.map(row => row.orderId)).toEqual(["O2"]);
    expect(result.meta.hasMore).toBe(false);
    expect(
      (await orders({ sku: "A", status: "paid", limit: 1 })).meta.hasMore
    ).toBe(true);
  });
  it("uses verified paid status, but never invents that status for an unmatched report", async () => {
    state.reports.mockResolvedValue({
      reports: [report(1, [sale()])],
      count: 1,
      partial: false,
    });
    expect((await orders({ status: "paid" })).rows).toHaveLength(1);
    expect((await history()).rows[0]).toMatchObject({
      orders: 1,
      unitsSold: 1,
      revenue: 10,
      cancelled: 0,
      cancelledAmount: 0,
      net: 150,
    });
    given([]);
    expect((await orders({ status: "paid" })).rows).toEqual([]);
    expect((await history()).rows[0]).toMatchObject({
      orders: null,
      revenue: null,
      net: null,
    });
  });
});

describe("history distinct counts, units, item price revenue and no financial allocation", () => {
  it("counts each order once per item with multiple variation lines, sums valid units and never uses gross/freight", async () => {
    given([
      order({
        items: [
          item({ quantity: 2, unitPrice: 7 }),
          item({ variationId: "102", quantity: 3, unitPrice: 11 }),
        ],
      }),
      order({ orderId: "O2", items: [item({ quantity: 1, unitPrice: 9 })] }),
    ]);
    const { rows } = await history({ groupBy: "item" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orders: 2,
      unitsSold: 6,
      revenue: 56,
      cancelled: 0,
      cancelledAmount: 0,
      net: 160,
      saleFee: 40,
    });
  });
  it("deduplicates duplicate order photos from paged streams", async () => {
    given([order(), order()]);
    expect((await history()).rows[0]).toMatchObject({
      orders: 1,
      unitsSold: 1,
      revenue: 10,
      net: 80,
    });
  });
  it("multi-product order counts in each group but every settlement amount is null without rateio", async () => {
    given([
      order({
        items: [item(), item({ itemId: "MLB2", sku: "B", unitPrice: 20 })],
      }),
    ]);
    const result = await history({ groupBy: "item" });
    expect(
      result.rows.map(row => [
        row.itemId,
        row.orders,
        row.unitsSold,
        row.revenue,
        row.net,
      ])
    ).toEqual([
      ["MLB1", 1, 1, 10, null],
      ["MLB2", 1, 1, 20, null],
    ]);
    expect(result.meta.financialAllocationReasons).toContain(
      "multi_group_order"
    );
    expect(result.meta.financePartialKnown).toMatchObject({ net: null });
    expect((await history({ groupBy: "none" })).rows[0]).toMatchObject({
      orders: 1,
      unitsSold: 2,
      revenue: 30,
      net: 80,
    });
  });
  it("partial item filter suppresses all financial fields even groupBy none", async () => {
    given([order({ items: [item(), item({ itemId: "MLB2", sku: "B" })] })]);
    const result = await history({ itemId: "MLB1" });
    expect(result.rows[0]).toMatchObject({
      orders: 1,
      revenue: 10,
      net: null,
      saleFee: null,
      shippingCost: null,
    });
    expect(result.meta.financialAllocationReasons).toContain(
      "partial_item_filter"
    );
    expect((await orders({ itemId: "MLB1" })).rows[0]).toMatchObject({
      net: 80,
      items: expect.any(Array),
    });
    expect((await orders({ itemId: "MLB1" })).rows[0].items).toHaveLength(2);
  });
  it("groupBy sku deliberately groups reused SKU across MLB, no invented unique product/title", async () => {
    given([
      order({
        items: [
          item(),
          item({ itemId: "MLB2", title: "Outra", quantity: 2, unitPrice: 20 }),
        ],
      }),
    ]);
    const result = await history({ groupBy: "sku" });
    expect(result.rows[0]).toMatchObject({
      sku: "SKU 01",
      itemId: null,
      title: null,
      orders: 1,
      unitsSold: 3,
      revenue: 50,
      net: 80,
    });
    expect((await history({ groupBy: "item" })).rows).toHaveLength(2);
  });
  it("nulls unknown amount/quantity without wiping independent known order counts", async () => {
    given([
      order({ items: [item({ quantity: null })] }),
      order({ orderId: "O2", items: [item({ unitPrice: null })] }),
    ]);
    const row = (await history()).rows[0];
    expect(row).toMatchObject({
      orders: 2,
      unitsSold: null,
      revenue: null,
      cancelled: 0,
    });
    given([order({ items: [item({ unitPrice: null })] })]);
    expect((await history()).rows[0]).toMatchObject({
      orders: 1,
      unitsSold: 1,
      revenue: null,
    });
  });
  it("rejects NaN/negative quantity or price rather than coercing missing into zero", async () => {
    given([
      order({
        items: [
          item({ quantity: -1, unitPrice: -1 }),
          item({ variationId: "102", quantity: Number.NaN }),
        ],
      }),
    ]);
    expect((await orders()).rows[0].items[0]).toMatchObject({
      quantity: null,
      unitPrice: null,
    });
    expect((await history()).rows[0]).toMatchObject({
      unitsSold: null,
      revenue: null,
    });
  });
  it("cancelled distinct per group, item amount only, never cancellation gross", async () => {
    given([
      order({
        status: "cancelled",
        financialStatus: "refund_pending",
        items: [
          item({ quantity: 2, unitPrice: 3 }),
          item({ variationId: "102", quantity: 3, unitPrice: 4 }),
        ],
      }),
    ]);
    expect((await history({ groupBy: "item" })).rows[0]).toMatchObject({
      orders: 0,
      unitsSold: 0,
      revenue: 0,
      cancelled: 1,
      cancelledAmount: 18,
      net: null,
    });
    given([order({ status: "cancelled", items: [item({ unitPrice: null })] })]);
    expect((await history()).rows[0]).toMatchObject({
      cancelled: 1,
      cancelledAmount: null,
    });
  });
  it("unknown status causes null counts and sales totals instead of paid defaults", async () => {
    given([order({ status: null })]);
    expect((await history()).rows[0]).toMatchObject({
      orders: null,
      cancelled: null,
      unitsSold: null,
      revenue: null,
      cancelledAmount: null,
    });
  });
  it("tracks independently known finance without pretending it is a complete bucket total", async () => {
    given([
      order(),
      order({
        orderId: "O2",
        financiallyComplete: false,
        financialStatus: "pending",
        net: 900,
      }),
    ]);
    const result = await history();
    expect(result.rows[0].net).toBeNull();
    expect(result.meta.financePartialKnown).toMatchObject({
      net: 80,
      saleFee: 20,
    });
    expect(result.meta.financePartial).toBe(true);
  });
  it("missing category null is not zero and propagates independently of known net", async () => {
    given([order({ processingFee: null })]);
    expect((await history()).rows[0]).toMatchObject({
      net: 80,
      processingFee: null,
      saleFee: 20,
    });
  });
  it("unknown item quantity/price marks partial even when all financial categories are known", async () => {
    given([order({ items: [item({ quantity: null })] })]);
    const result = await history();
    expect(result.meta).toMatchObject({ partial: true, financePartial: false });
    expect(result.meta.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("HISTORY_QUANTITY_UNKNOWN"),
        expect.stringContaining("HISTORY_ITEM_AMOUNT_UNKNOWN"),
      ])
    );
  });
  it("unknown product/SKU group identity does not receive order finance even one group", async () => {
    given([order({ items: [item({ sku: null, itemId: null })] })]);
    const result = await history({ groupBy: "sku" });
    expect(result.rows[0]).toMatchObject({
      sku: null,
      itemId: null,
      orders: 1,
      unitsSold: 1,
      revenue: 10,
      net: null,
    });
    expect(result.meta.financialAllocationReasons).toContain(
      "missing_item_identity"
    );
    expect((await history({ groupBy: "none" })).rows[0].net).toBe(80);
  });
  it("empty item list does not invent units or revenue, groupBy none preserves known full-order net", async () => {
    given([order({ items: [] })]);
    expect((await history()).rows[0]).toMatchObject({
      orders: 1,
      unitsSold: null,
      revenue: null,
      net: 80,
    });
    expect((await history({ groupBy: "item" })).rows).toEqual([]);
    expect((await orders()).meta.partial).toBe(true);
  });
});

describe("history scope, window, sparse bins and evidence", () => {
  it("suppresses every financial field and known subtotal without trusted financial permission, including reports", async () => {
    state.reports.mockResolvedValue({
      reports: [report(1, [sale()])],
      count: 1,
      partial: false,
    });
    const result = await history({ includeFinancial: false });
    expect(state.snapshot).toHaveBeenCalledWith(7, expect.any(Object), {
      financial: false,
    });
    expect(result.rows[0]).toMatchObject({
      net: null,
      saleFee: null,
      processingFee: null,
      shippingCost: null,
      financingFee: null,
      otherCharges: null,
      taxesWithheld: null,
    });
    expect(result.meta).toMatchObject({
      financialScopeRequired: "vendas-detalhe:read",
      financialScopeMissing: true,
      financePartialKnown: { net: null, otherCharges: null },
    });
    state.snapshot.mockClear();
    await history({ includeFinancial: undefined });
    expect(state.snapshot).toHaveBeenCalledWith(7, expect.any(Object), {
      financial: false,
    });
  });
  it("31 calendar days enable financial reads, 32 days disable and null even known imported net", async () => {
    await history({ from: "2024-01-30", to: "2024-02-29" });
    expect(state.snapshot).toHaveBeenLastCalledWith(7, expect.any(Object), {
      financial: true,
    });
    state.reports.mockResolvedValue({
      reports: [report(1, [sale()])],
      count: 1,
      partial: false,
    });
    const result = await history({ from: "2024-01-29", to: "2024-02-29" });
    expect(state.snapshot).toHaveBeenLastCalledWith(7, expect.any(Object), {
      financial: false,
    });
    expect(result.rows[0].net).toBeNull();
    expect(result.meta.financePartialKnown).toMatchObject({ net: null });
    expect(result.meta.windowDays).toBe(32);
  });
  it("returns only observed leap-day bins and includes inclusive end instant, no filled zero periods", async () => {
    given([
      order({ orderId: "A", createdAt: "2024-02-01T02:59:59.999Z" }),
      order({ orderId: "B", createdAt: "2024-02-01T03:00:00Z" }),
      order({ orderId: "C", createdAt: "2024-03-01T02:59:59.999Z" }),
      order({ orderId: "D", createdAt: "2024-03-01T03:00:00Z" }),
    ]);
    const result = await history();
    expect(result.rows.map(row => row.period)).toEqual([
      "2024-02-01T03:00:00.000Z",
      "2024-02-29T03:00:00.000Z",
    ]);
    expect(result.meta.emptyPeriodsReason).toEqual(expect.any(String));
    expect(result.meta.ordersObserved).toBe(2);
  });
  it("unknown dates excluded, day-only reports excluded from hour bins but not daily, marks partial", async () => {
    given([order({ createdAt: null, saleDay: null })]);
    let result = await history();
    expect(result.rows).toEqual([]);
    expect(result.meta).toMatchObject({
      partial: true,
      excludedUnknownDates: 1,
    });
    state.reports.mockResolvedValue({
      reports: [report(1, [sale({ operationId: "R" })])],
      count: 1,
      partial: false,
    });
    result = await history({ granularity: "hour" });
    expect(result.rows).toEqual([]);
    expect(result.meta.excludedUnknownDates).toBe(2);
    expect((await history()).rows).toHaveLength(1);
  });
  it("recent photos do not fabricate 12 months, continuous coverage or account creation", async () => {
    given([], { coverageFrom: null, coverageTo: null, dataStart: null });
    state.reports.mockResolvedValue({
      reports: [report(1, [sale()])],
      count: 1,
      partial: false,
    });
    const result = await history({ from: "2023-03-01", to: "2024-02-29" });
    expect(result.rows).toHaveLength(1);
    expect(result.meta).toMatchObject({
      partial: true,
      dataStart: "2024-02-12",
      coverageFrom: null,
      coverageTo: null,
      coverage: { complete: false },
      availableHistory: {
        continuous: false,
        from: "2024-02-12",
        to: "2024-02-12",
      },
    });
  });
  it("incomplete/capped collection has unknown counts rather than lower-bound totals or empty zeros", async () => {
    given([order()], {
      partial: true,
      capped: true,
      stale: true,
      coverageFrom: null,
      coverageTo: null,
    });
    const result = await history();
    expect(result.rows[0]).toMatchObject({
      orders: null,
      unitsSold: null,
      revenue: null,
      cancelled: null,
      cancelledAmount: null,
      net: null,
    });
    expect(result.meta).toMatchObject({
      partial: true,
      capped: true,
      stale: true,
      asOf: Date.parse("2024-02-20T15:00:00Z"),
    });
    given([], { partial: true, capped: true });
    expect((await history()).rows).toEqual([]);
  });
  it("report read cap propagated and read error fails safely rather than hiding stored overrides", async () => {
    state.reports.mockResolvedValue({
      reports: [],
      count: 1000,
      partial: true,
    });
    const result = await orders();
    expect(result.meta).toMatchObject({
      partial: true,
      capped: true,
      reportLimit: 1000,
    });
    expect(result.meta.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("REPORTS_CAPPED")])
    );
    state.reports.mockRejectedValue(new Error("SQL SECRET"));
    await expect(orders()).rejects.toMatchObject({
      status: 503,
      code: "DATA_UNAVAILABLE",
    });
  });
  it("aggregates/filters before limit+offset and uses count > offset+limit", async () => {
    given([
      order({ orderId: "A", createdAt: "2024-02-03T15:00:00Z" }),
      order({ orderId: "B", createdAt: "2024-02-03T16:00:00Z" }),
      order({ orderId: "C", createdAt: "2024-02-15T15:00:00Z" }),
      order({
        orderId: "D",
        createdAt: "2024-02-18T15:00:00Z",
        items: [item({ itemId: "MLB2" })],
      }),
    ]);
    const result = await history({ itemId: "MLB1", offset: 1, limit: 1 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].period).toBe("2024-02-15T03:00:00.000Z");
    expect(result.meta.hasMore).toBe(false);
    expect(
      (await history({ itemId: "MLB1", offset: 0, limit: 1 })).meta.hasMore
    ).toBe(true);
    expect((await history({ offset: 999, limit: 1 })).rows).toEqual([]);
  });
  it("unavailable sheet preserves ML SKU with warning, never calls mutation helpers", async () => {
    state.projection.mockRejectedValue(new Error("SQL SECRET"));
    const result = await orders();
    expect(result.rows[0].items[0]).toMatchObject({
      sku: "SKU 01",
      skuSource: "mercado_livre",
    });
    expect(result.meta.partial).toBe(true);
    expect(JSON.stringify(result)).not.toContain("SQL SECRET");
  });
});

describe("sanitized failures", () => {
  it.each([
    ["FORBIDDEN", 403],
    ["BAD_GATEWAY", 502],
    ["BAD_REQUEST", 400],
    ["PRECONDITION_FAILED", 503],
  ] as const)(
    "maps provider %s to %d without returning raw cause",
    async (code, status) => {
      state.snapshot.mockRejectedValue(
        new SalesMarginProviderError(code, "SECRET raw response")
      );
      await expect(orders()).rejects.toMatchObject({ status, code });
      await expect(orders()).rejects.not.toThrow("SECRET");
    }
  );
  it("rejects unauthorized owner and invalid query before provider/report reads", async () => {
    await expect(
      loadPublicSalesData("/sales/orders", 0, query)
    ).rejects.toBeInstanceOf(ReadApiDataError);
    await expect(orders({ from: "2023-02-29" })).rejects.toMatchObject({
      status: 400,
    });
    expect(state.snapshot).not.toHaveBeenCalled();
    expect(state.reports).not.toHaveBeenCalled();
  });
});

describe("financial-detail safety without erasing verified sales", () => {
  it("partial refund does not turn an originally paid sale into zero units/revenue", async () => {
    given(
      [
        order({
          status: "partially_refunded",
          rawStatus: "paid",
          financialStatus: "refund_pending",
          financiallyComplete: false,
          net: null,
          items: [item({ quantity: 2, unitPrice: 100 })],
        }),
      ],
      { ordersPartial: false }
    );
    const withFinance = await history();
    expect(withFinance.rows[0]).toMatchObject({
      orders: 1,
      unitsSold: 2,
      revenue: 200,
      net: null,
    });
    const withoutFinance = await history({ includeFinancial: false });
    expect(withoutFinance.rows[0]).toMatchObject({
      orders: 1,
      unitsSold: 2,
      revenue: 200,
      net: null,
    });
  });
  it("missing payment details keep commercial coverage and known item totals", async () => {
    given(
      [
        order({
          financiallyComplete: false,
          financialStatus: "pending",
          net: null,
        }),
      ],
      { partial: true, ordersPartial: false }
    );
    const result = await history();
    expect(result.rows[0]).toMatchObject({
      orders: 1,
      unitsSold: 1,
      revenue: 10,
      net: null,
    });
    expect(result.meta).toMatchObject({
      partial: true,
      ordersPartial: false,
      coverage: { complete: true },
    });
  });
  it("a report preceding a later observed refund cannot confirm an old settlement", async () => {
    given([
      order({
        status: "partially_refunded",
        rawStatus: "paid",
        financialStatus: "refund_pending",
        financiallyComplete: false,
        asOf: "2024-02-21T15:00:00Z",
      }),
    ]);
    state.reports.mockResolvedValue({
      reports: [report(1, [sale()], "2024-02-20T18:00:00Z")],
      count: 1,
      partial: false,
    });
    const result = await orders();
    expect(result.rows[0]).toMatchObject({
      source: "imported_report",
      status: "partially_refunded",
      createdAt: "2024-02-12T15:30:00.000Z",
      net: null,
      deductions: null,
      financiallyComplete: false,
      financialStatus: "refund_pending",
    });
    expect(result.rows[0].pendingReason).toMatch(/anterior/);
    expect((await history()).rows[0]).toMatchObject({
      orders: 1,
      unitsSold: 1,
      revenue: 10,
      net: null,
    });
  });
  it("requests before the confirmed earliest available sale are explicitly partial", async () => {
    given([order()], {
      dataStart: "2024-02-12",
      dataStartConfirmed: true,
      ordersPartial: false,
    });
    const result = await history();
    expect(result.meta).toMatchObject({
      partial: true,
      beforeDataStart: true,
      dataStart: "2024-02-12",
      dataStartConfirmed: true,
      coverage: { complete: false },
    });
    expect(result.rows[0]).toMatchObject({ orders: 1, revenue: 10 });
  });
  it("an unconfirmed global probe never presents observed dataStart as globally confirmed", async () => {
    given([order()], { dataStartConfirmed: false, ordersPartial: false });
    const result = await history();
    expect(result.meta).toMatchObject({
      partial: true,
      dataStartConfirmed: false,
      ordersPartial: false,
    });
    expect(result.rows[0].orders).toBe(1);
  });
});
