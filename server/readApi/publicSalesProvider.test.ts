import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicSalesBounds } from "../../shared/publicSales";
const mocks = vi.hoisted(() => ({
  credentials: vi.fn(),
  owner: vi.fn(),
  token: vi.fn(),
  forceRefresh: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("../dbMl", () => ({
  getCredentials: mocks.credentials,
  resolveMlOwnerUserId: mocks.owner,
}));
vi.mock("../ml/oauthMl", () => ({
  ensureUserAccessToken: mocks.token,
  forceRefreshUserAccessToken: mocks.forceRefresh,
}));
import {
  __clearPublicSalesCache,
  getPublicSalesSnapshot,
} from "./publicSalesProvider";
const SELLER = "3308178634";
const bounds: PublicSalesBounds = {
  from: "2026-11-12",
  to: "2026-11-12",
  fromMs: Date.parse("2026-11-12T03:00:00.000Z"),
  toMs: Date.parse("2026-11-13T02:59:59.999Z"),
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const order = (patch: Record<string, unknown> = {}) => ({
  id: 1001,
  seller: { id: Number(SELLER) },
  pack_id: 7001,
  currency_id: "BRL",
  status: "paid",
  date_created: "2026-11-12T12:00:00Z",
  total_amount: 200,
  order_items: [
    {
      item: {
        id: "MLB123",
        title: "Produto",
        seller_sku: "  Original-SKU  ",
        variation_id: 202,
        listing_type_id: "gold_pro",
      },
      quantity: 2,
      unit_price: 100,
      sale_fee: 99,
    },
  ],
  payments: [{ id: 9001, status: "approved" }],
  ...patch,
});
const payment = (patch: Record<string, unknown> = {}) => ({
  id: 9001,
  collector_id: Number(SELLER),
  order: { id: 1001 },
  currency_id: "BRL",
  status: "approved",
  transaction_amount: 111.93,
  transaction_amount_refunded: 0,
  date_approved: "2026-11-12T09:05:00-03:00",
  transaction_details: { net_received_amount: 79.91 },
  taxes_amount: 0,
  charges_details: [
    {
      id: 1,
      name: "shp_cross_docking",
      type: "shipping",
      accounts: { from: "collector" },
      amounts: { original: 19.15, refunded: 0 },
    },
    {
      id: 2,
      name: "mp_processing_fee",
      type: "fee",
      accounts: { from: "collector" },
      amounts: { original: 0.11, refunded: 0 },
    },
    {
      id: 3,
      name: "ml_sale_fee",
      type: "fee",
      accounts: { from: "collector" },
      amounts: { original: 12.76, refunded: 0 },
    },
  ],
  ...patch,
});
function network(
  defaultOrders = [order()],
  cancelledOrders: ReturnType<typeof order>[] = [],
  mp: unknown = payment(),
  mpStatus = 200
) {
  mocks.fetch.mockImplementation(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/users/me")
      return response({ id: Number(SELLER), nickname: "LOJA" });
    if (url.pathname === "/orders/search") {
      const entries =
        url.searchParams.get("order.status") === "cancelled"
          ? cancelledOrders
          : defaultOrders;
      const offset = Number(url.searchParams.get("offset")),
        limit = Number(url.searchParams.get("limit"));
      return response({
        results: entries.slice(offset, offset + limit),
        paging: { total: entries.length, offset },
      });
    }
    if (url.pathname.startsWith("/v1/payments/")) return response(mp, mpStatus);
    throw new Error(
      "Unconfigured endpoint contains private data NEVER publish this"
    );
  });
}
const searches = () =>
  mocks.fetch.mock.calls.filter(
    ([url]) =>
      String(url).includes("/orders/search") &&
      new URL(url).searchParams.has("order.date_created.from")
  );
const paymentCalls = () =>
  mocks.fetch.mock.calls.filter(([url]) =>
    String(url).includes("/v1/payments/")
  );
beforeEach(() => {
  vi.clearAllMocks();
  __clearPublicSalesCache();
  mocks.owner.mockResolvedValue(42);
  mocks.credentials.mockResolvedValue({ mlUserId: Number(SELLER) });
  mocks.token.mockResolvedValue("MOCK_ONLY");
  vi.stubGlobal("fetch", mocks.fetch);
  network();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("public sales automatic finance and safe projections", () => {
  it("uses existing authoritative MP gross/net, never double-subtracts and preserves order unit price/SKU", async () => {
    const result = await getPublicSalesSnapshot(7, bounds);
    expect(result.orders[0]).toMatchObject({
      orderId: "1001",
      packId: "7001",
      paymentIds: ["9001"],
      createdAt: "2026-11-12T12:00:00.000Z",
      paidAt: "2026-11-12T12:05:00.000Z",
      saleDay: "2026-11-12",
      gross: 111.93,
      net: 79.91,
      deductions: 32.02,
      financialStatus: "confirmed",
      financiallyComplete: true,
      chargesExplainDeductions: true,
      source: "automatic",
      saleFee: 12.76,
      processingFee: 0.11,
      shippingCost: 19.15,
      financingFee: null,
      otherCharges: null,
      taxesWithheld: 0,
    });
    expect(result.orders[0].items[0]).toEqual({
      itemId: "MLB123",
      variationId: "202",
      sku: "  Original-SKU  ",
      skuSource: "mercado_livre",
      title: "Produto",
      quantity: 2,
      unitPrice: 100,
      listingType: "gold_pro",
    });
    expect(result.orders[0].charges.map(charge => charge.label)).toEqual([
      "shp_cross_docking",
      "mp_processing_fee",
      "ml_sale_fee",
    ]);
    expect(result).toMatchObject({
      dataStart: "2026-11-12",
      dataStartConfirmed: true,
      ordersPartial: false,
      coverageFrom: bounds.from,
      coverageTo: bounds.to,
      partial: false,
      capped: false,
      stale: false,
    });
    expect(result.warnings.join(" ")).toMatch(/visible_seller_orders/);
    expect(mocks.forceRefresh).not.toHaveBeenCalled();
  });
  it("whitelists tax entries and never leaks nested buyer/payer/shipment metadata", async () => {
    const PII = "PRIVATE_BUYER_VALUE";
    network(
      [
        order({
          buyer: { nickname: PII, billing_info: { document: PII } },
          metadata: { email: PII },
        }),
      ],
      [],
      payment({
        payer: { email: PII, identification: { number: PII } },
        metadata: {
          TAX_DETAIL: [
            {
              type: "ICMS",
              description: "Retenção informada",
              amount: 1.2,
              buyer: { email: PII },
              document: PII,
            },
            { unknown: { type: PII, amount: 100 } },
          ],
          TAXES_DISAGGREGATED: { foreign: { type: PII, buyer: PII } },
          buyer: { email: PII },
        },
      })
    );
    const result = await getPublicSalesSnapshot(7, bounds);
    expect(result.orders[0].taxDetail).toEqual([
      { type: "ICMS", description: "Retenção informada", amount: 1.2 },
    ]);
    expect(result.orders[0].taxesDisaggregated).toBeNull();
    expect(JSON.stringify(result)).not.toContain(PII);
    expect(JSON.stringify(result)).not.toMatch(
      /billing_info|identification|TAX_DETAIL|payer.*email/
    );
  });
  it.each([undefined, {}, "opaque report text", { unknown: { amount: 9 } }])(
    "unknown tax metadata %j is null, never guessed",
    async value => {
      network(
        [order()],
        [],
        payment({
          taxes_amount: undefined,
          metadata: { TAX_DETAIL: value, TAXES_DISAGGREGATED: value },
        })
      );
      expect((await getPublicSalesSnapshot(7, bounds)).orders[0]).toMatchObject(
        { taxesWithheld: null, taxDetail: null, taxesDisaggregated: null }
      );
    }
  );
  it.each([
    undefined,
    [],
    [{ name: "unknown", amounts: { original: 1 } }],
    [
      {
        name: "fee",
        accounts: { from: "collector" },
        amounts: { original: "1" },
      },
    ],
  ])(
    "absent/incomplete charges %j cannot explain deductions",
    async charges => {
      network([order()], [], payment({ charges_details: charges }));
      const sale = (await getPublicSalesSnapshot(7, bounds)).orders[0];
      expect(sale.net).toBe(79.91);
      expect(sale.chargesExplainDeductions).toBeNull();
      expect(sale.saleFee).toBeNull();
      expect(sale.financingFee).toBeNull();
      expect(sale.otherCharges).toBeNull();
    }
  );
  it("known charges can disagree without changing authoritative net", async () => {
    network(
      [order()],
      [],
      payment({ transaction_details: { net_received_amount: 10 } })
    );
    expect((await getPublicSalesSnapshot(7, bounds)).orders[0]).toMatchObject({
      net: 10,
      deductions: 101.93,
      chargesExplainDeductions: false,
    });
  });
  it("accepts one cent tolerance and preserves explicit zero/negative authoritative net", async () => {
    network(
      [order()],
      [],
      payment({
        transaction_details: { net_received_amount: 79.9 },
        taxes_amount: 0,
      })
    );
    expect(
      (await getPublicSalesSnapshot(7, bounds)).orders[0]
        .chargesExplainDeductions
    ).toBe(true);
    __clearPublicSalesCache();
    network(
      [order()],
      [],
      payment({
        transaction_amount: 0,
        transaction_details: { net_received_amount: -5 },
        charges_details: [],
      })
    );
    expect((await getPublicSalesSnapshot(7, bounds)).orders[0]).toMatchObject({
      gross: 0,
      net: -5,
      deductions: 5,
      chargesExplainDeductions: null,
    });
  });
  it.each([
    { transaction_amount_refunded: 1, status: "approved" },
    { status: "partially_refunded" },
  ])(
    "partial refunds preserve typed status and do not promote net %j",
    async patch => {
      network([order()], [], payment(patch));
      expect((await getPublicSalesSnapshot(7, bounds)).orders[0]).toMatchObject(
        {
          status: "partially_refunded",
          financialStatus: "refund_pending",
          financiallyComplete: false,
          net: null,
          paidAt: null,
        }
      );
    }
  );
  it.each(["refunded", "in_mediation", "charged_back"])(
    "keeps %s order safely pending",
    async status => {
      network([order({ status })]);
      const sale = (await getPublicSalesSnapshot(7, bounds)).orders[0];
      expect(sale.financiallyComplete).toBe(false);
      expect(sale.net).toBeNull();
      expect(paymentCalls()).toHaveLength(0);
      expect(sale.status).toBe(
        status === "charged_back" ? "refund_pending" : status
      );
    }
  );
  it("does not fetch payments/shipments or infer finance in history-only mode", async () => {
    network([order({ shipping: { id: 333, logistic_type: "fulfillment" } })]);
    const sale = (await getPublicSalesSnapshot(7, bounds, { financial: false }))
      .orders[0];
    expect(sale).toMatchObject({
      gross: 200,
      net: null,
      financiallyComplete: false,
      paidAt: null,
      shipping: { logisticType: "fulfillment", payer: null },
    });
    expect(paymentCalls()).toHaveLength(0);
    expect(mocks.fetch).toHaveBeenCalledTimes(5);
  });
  it.each([undefined, [], [{ status: "approved" }]])(
    "payment IDs distinguish missing/malformed arrays from explicit [] %j",
    async payments => {
      network([order({ payments })]);
      expect(
        (await getPublicSalesSnapshot(7, bounds)).orders[0].paymentIds
      ).toEqual(Array.isArray(payments) && !payments.length ? [] : null);
    }
  );
  it("deduplicates actual payment IDs", async () => {
    network([
      order({
        payments: [
          { id: 9001, status: "approved" },
          { id: 9001, status: "approved" },
        ],
      }),
    ]);
    expect((await getPublicSalesSnapshot(7, bounds)).orders[0]).toMatchObject({
      paymentIds: ["9001"],
      gross: 111.93,
      net: 79.91,
    });
    expect(paymentCalls()).toHaveLength(1);
  });
  it.each([
    { collector_id: 123 },
    { order_id: 999 },
    { order: { id: 999 } },
    { id: 999 },
    { currency_id: "USD" },
    { transaction_details: {} },
  ])("foreign or malformed payment %j stays unknown", async patch => {
    network([order()], [], payment(patch));
    expect((await getPublicSalesSnapshot(7, bounds)).orders[0]).toMatchObject({
      net: null,
      deductions: null,
      financialStatus: "pending",
      financiallyComplete: false,
      taxDetail: null,
    });
  });
  it("payment 429 keeps the order, null finance and marks partial without leaking error payload", async () => {
    network([order()], [], { message: "PRIVATE_ERROR" }, 429);
    const result = await getPublicSalesSnapshot(7, bounds);
    expect(result).toMatchObject({
      partial: true,
      ordersPartial: false,
      coverageFrom: bounds.from,
      coverageTo: bounds.to,
    });
    expect(result.orders[0].net).toBeNull();
    expect(JSON.stringify(result)).not.toContain("PRIVATE_ERROR");
  });
  it("overlarge payment-reference arrays are bounded without a false net", async () => {
    network([
      order({
        payments: Array.from({ length: 21 }, (_, i) => ({
          id: 9001 + i,
          status: "approved",
        })),
      }),
    ]);
    expect((await getPublicSalesSnapshot(7, bounds)).orders[0]).toMatchObject({
      net: null,
      financialStatus: "pending",
    });
    expect(paymentCalls()).toHaveLength(0);
  });
  it("unknown item fields remain null rather than placeholders, inferred quantities/prices/SKUs", async () => {
    network([order({ order_items: [{ item: {} }], total_amount: undefined })]);
    expect(
      (await getPublicSalesSnapshot(7, bounds, { financial: false })).orders[0]
    ).toMatchObject({
      gross: null,
      items: [
        {
          itemId: null,
          variationId: null,
          sku: null,
          skuSource: null,
          title: null,
          quantity: null,
          unitPrice: null,
          listingType: null,
        },
      ],
    });
  });
  it("unknown status or malformed quantity stays null and marks collection partial", async () => {
    network([
      order({
        status: undefined,
        order_items: [
          { item: { id: "MLB123" }, quantity: "2", unit_price: "100" },
        ],
      }),
    ]);
    const result = await getPublicSalesSnapshot(7, bounds, {
      financial: false,
    });
    expect(result.partial).toBe(true);
    expect(result.orders[0]).toMatchObject({
      status: null,
      rawStatus: null,
      items: [{ quantity: null, unitPrice: null }],
    });
  });
  it("unknown charge account strings make reconciliation null, not a false known mismatch", async () => {
    network(
      [order()],
      [],
      payment({
        charges_details: [
          ...payment().charges_details,
          {
            name: "unknown_role",
            accounts: { from: "unrecognized" },
            amounts: { original: 5 },
          },
        ],
      })
    );
    expect((await getPublicSalesSnapshot(7, bounds)).orders[0]).toMatchObject({
      net: 79.91,
      chargesExplainDeductions: null,
    });
  });
  it("uses Brasília date around UTC midnight, normalizes ISO, does not invent missing paidAt", async () => {
    network(
      [order({ date_created: "2026-11-13T02:30:00Z" })],
      [],
      payment({ date_approved: "2026-02-30T09:00:00Z" })
    );
    expect((await getPublicSalesSnapshot(7, bounds)).orders[0]).toMatchObject({
      createdAt: "2026-11-13T02:30:00.000Z",
      saleDay: "2026-11-12",
      paidAt: null,
    });
  });
  it.each(["both", "seller", "buyer", null])(
    "payer %s is supported only by explicit shipping costs",
    async payer => {
      network([order({ shipping: { id: 333 } })]);
      const original = mocks.fetch.getMockImplementation()!;
      mocks.fetch.mockImplementation(
        async (url: string, init?: RequestInit) => {
          if (url.includes("/shipments/333/costs"))
            return response({
              senders: [
                {
                  user_id: Number(SELLER),
                  cost: payer === "both" || payer === "seller" ? 5 : 0,
                },
              ],
              receiver: { cost: payer === "both" || payer === "buyer" ? 7 : 0 },
              buyer: { email: "PRIVATE_SHIP" },
            });
          if (url.includes("/shipments/333"))
            return response({
              id: 333,
              sender_id: Number(SELLER),
              logistic_type: "cross_docking",
              receiver_address: { street_name: "PRIVATE_SHIP" },
            });
          return original(url, init);
        }
      );
      const result = await getPublicSalesSnapshot(7, bounds);
      expect(result.orders[0].shipping).toEqual({
        logisticType: "cross_docking",
        payer,
      });
      expect(JSON.stringify(result)).not.toContain("PRIVATE_SHIP");
    }
  );
  it("foreign shipment and unknown receiver costs never prove payer", async () => {
    network([order({ shipping: { id: 333 } })]);
    const original = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation(async (url: string) =>
      url.includes("/shipments/")
        ? response({
            id: 333,
            sender_id: 123,
            logistic_type: "fulfillment",
            senders: [{ user_id: Number(SELLER), cost: 9 }],
          })
        : original(url)
    );
    const result = await getPublicSalesSnapshot(7, bounds);
    expect(result.partial).toBe(true);
    expect(result.orders[0].shipping).toEqual({
      logisticType: null,
      payer: null,
    });
  });
});

describe("public sales search, identity, cache and budgets", () => {
  it("rejects personal seller before token loading or network reads", async () => {
    mocks.credentials.mockResolvedValue({ mlUserId: 123 });
    await expect(getPublicSalesSnapshot(7, bounds)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("verifies /users/me BEFORE cache hits and never falls back for a personal seller", async () => {
    await getPublicSalesSnapshot(7, bounds);
    mocks.fetch.mockImplementation(async () => response({ id: 123 }));
    await expect(getPublicSalesSnapshot(7, bounds)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(
      mocks.fetch.mock.calls.filter(([url]) => url.endsWith("/users/me"))
    ).toHaveLength(2);
  });
  it("shares owner scope but isolates other owners, bounds and financial mode", async () => {
    await getPublicSalesSnapshot(7, bounds);
    await getPublicSalesSnapshot(8, bounds);
    expect(searches()).toHaveLength(2);
    mocks.owner.mockResolvedValue(43);
    await getPublicSalesSnapshot(8, bounds);
    await getPublicSalesSnapshot(8, bounds, { financial: false });
    await getPublicSalesSnapshot(
      8,
      { ...bounds, fromMs: bounds.fromMs + 1 },
      { financial: false }
    );
    expect(searches()).toHaveLength(8);
    expect(mocks.token).toHaveBeenCalledWith(43);
  });
  it("cache snapshots are defensively copied before a caller can mutate financial fields", async () => {
    const first = await getPublicSalesSnapshot(7, bounds);
    first.orders[0].net = 999;
    first.orders[0].items[0].sku = "WRONG";
    first.warnings.push("EXTRA");
    const second = await getPublicSalesSnapshot(7, bounds);
    expect(second.orders[0].net).toBe(79.91);
    expect(second.orders[0].items[0].sku).toBe("  Original-SKU  ");
    expect(second.warnings).not.toContain("EXTRA");
  });
  it("deduplicates inflight searches after each caller independently verifies identity", async () => {
    const original = mocks.fetch.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    mocks.fetch.mockImplementation(async (url: string) => {
      if (
        url.includes("/orders/search") &&
        new URL(url).searchParams.has("order.date_created.from")
      )
        await gate;
      return original(url);
    });
    const first = getPublicSalesSnapshot(7, bounds),
      second = getPublicSalesSnapshot(8, bounds);
    await vi.waitFor(() => expect(searches()).toHaveLength(1));
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a.orders).toEqual(b.orders);
    expect(searches()).toHaveLength(2);
    expect(
      mocks.fetch.mock.calls.filter(([url]) => url.endsWith("/users/me"))
    ).toHaveLength(2);
  });
  it("bounds cache to 64 entries and evicts oldest completed range", async () => {
    network([]);
    for (let index = 0; index < 65; index++)
      await getPublicSalesSnapshot(
        7,
        { ...bounds, fromMs: bounds.fromMs + index },
        { financial: false }
      );
    await getPublicSalesSnapshot(7, bounds, { financial: false });
    expect(searches()).toHaveLength(132);
  });
  it("TTL is two minutes and stale fallback is bounded to six hours", async () => {
    vi.useFakeTimers();
    const time = Date.now();
    await getPublicSalesSnapshot(7, bounds);
    vi.setSystemTime(time + 119_999);
    await getPublicSalesSnapshot(7, bounds);
    expect(searches()).toHaveLength(2);
    mocks.fetch.mockImplementation(async (url: string) =>
      url.endsWith("/users/me")
        ? response({ id: Number(SELLER) })
        : response({ error: "PRIVATE_TOKEN_PAYLOAD" }, 429)
    );
    vi.setSystemTime(time + 120_001);
    const stale = await getPublicSalesSnapshot(7, bounds);
    expect(stale).toMatchObject({ stale: true, asOf: time });
    expect(stale.orders[0].net).toBe(79.91);
    expect(stale.warnings.join(" ")).toMatch(/stale/);
    expect(stale.warnings.length).toBeLessThanOrEqual(12);
    vi.setSystemTime(time + 6 * 60 * 60_000 + 1);
    await expect(getPublicSalesSnapshot(7, bounds)).rejects.toMatchObject({
      code: "BAD_GATEWAY",
    });
  });
  it("explicit cancelled search restores cancellations missing from default search and deduplicates repeats", async () => {
    const cancel = order({ id: 1002, status: "cancelled", payments: [] });
    network([order(), cancel], [cancel]);
    const result = await getPublicSalesSnapshot(7, bounds, {
      financial: false,
    });
    expect(result.orders).toHaveLength(2);
    expect(result.orders.find(order => order.orderId === "1002")?.status).toBe(
      "cancelled"
    );
    expect(
      searches().some(
        ([url]) => new URL(url).searchParams.get("order.status") === "cancelled"
      )
    ).toBe(true);
    __clearPublicSalesCache();
    network([order()], [cancel]);
    expect(
      (await getPublicSalesSnapshot(7, bounds, { financial: false })).orders
    ).toHaveLength(2);
  });
  it.each([
    { error: "blocked" },
    { results: [], paging: {} },
    { results: [null], paging: { total: 1 } },
    { results: [order(), null], paging: { total: 2 } },
    {
      results: [order({ date_created: "2026-02-30T09:00:00Z" })],
      paging: { total: 1 },
    },
    { results: [order({ id: undefined })], paging: { total: 1 } },
  ])(
    "malformed whole page %j never yields false empty or partially accepts its records",
    async page => {
      mocks.fetch.mockImplementation(async (url: string) =>
        url.endsWith("/users/me")
          ? response({ id: Number(SELLER) })
          : response(page)
      );
      await expect(
        getPublicSalesSnapshot(7, bounds, { financial: false })
      ).rejects.toMatchObject({ code: "BAD_GATEWAY" });
    }
  );
  it("foreign record invalidates the whole snapshot even after valid page and warm cache", async () => {
    vi.useFakeTimers();
    await getPublicSalesSnapshot(7, bounds, { financial: false });
    await vi.advanceTimersByTimeAsync(120_001);
    network([order(), order({ id: 1002, seller: { id: 123 } })]);
    await expect(
      getPublicSalesSnapshot(7, bounds, { financial: false })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("a valid zero-total in both searches is the only complete empty result", async () => {
    network([]);
    expect(
      await getPublicSalesSnapshot(7, bounds, { financial: false })
    ).toMatchObject({
      orders: [],
      partial: false,
      capped: false,
      dataStart: null,
    });
  });
  it("zero default search plus failed cancelled lookup is an error, not a false zero", async () => {
    network([]);
    const original = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation(async (url: string) =>
      new URL(url).searchParams.get("order.status") === "cancelled"
        ? response({ error: "PRIVATE_429" }, 429)
        : original(url)
    );
    await expect(
      getPublicSalesSnapshot(7, bounds, { financial: false })
    ).rejects.toMatchObject({ code: "BAD_GATEWAY" });
  });
  it("failed cancelled lookup marks coverage partial rather than silently losing cancellation totals", async () => {
    network();
    const original = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation(async (url: string) =>
      new URL(url).searchParams.get("order.status") === "cancelled"
        ? response({}, 429)
        : original(url)
    );
    const result = await getPublicSalesSnapshot(7, bounds, {
      financial: false,
    });
    expect(result.orders).toHaveLength(1);
    expect(result.partial).toBe(true);
    expect(result.coverageFrom).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/cancelados/);
  });
  it("later malformed page does not retain its valid first row and is explicitly partial", async () => {
    network(
      Array.from({ length: 51 }, (_, i) =>
        order({ id: 1001 + i, payments: [] })
      )
    );
    const original = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation(async (url: string) =>
      new URL(url).searchParams.get("offset") === "50"
        ? response({
            results: [order({ id: 1051 }), null],
            paging: { total: 52 },
          })
        : original(url)
    );
    const result = await getPublicSalesSnapshot(7, bounds, {
      financial: false,
    });
    expect(result.orders).toHaveLength(50);
    expect(result.partial).toBe(true);
  });
  it("out-of-window rows are not exposed and cannot turn an unconfirmed empty window into zero", async () => {
    network([order({ date_created: "2026-11-12T02:59:59Z" })]);
    await expect(
      getPublicSalesSnapshot(7, bounds, { financial: false })
    ).rejects.toMatchObject({ code: "BAD_GATEWAY" });
  });
  it.each([true, false])(
    "cap for financial=%s is 1000/10000, ISO queries inclusive and offset bounded",
    async financial => {
      network(
        Array.from({ length: financial ? 1001 : 10001 }, (_, i) =>
          order({ id: 1001 + i, payments: [] })
        )
      );
      const result = await getPublicSalesSnapshot(7, bounds, { financial });
      expect(result.orders).toHaveLength(financial ? 1000 : 10000);
      expect(result).toMatchObject({ partial: true, capped: true });
      expect(paymentCalls()).toHaveLength(0);
      for (const [url] of searches()) {
        const query = new URL(url).searchParams;
        expect(query.get("seller")).toBe(SELLER);
        expect(query.get("order.date_created.from")).toBe(
          new Date(bounds.fromMs).toISOString()
        );
        expect(query.get("order.date_created.to")).toBe(
          new Date(bounds.toMs).toISOString()
        );
        expect(Number(query.get("offset"))).toBeLessThan(10000);
      }
    }
  );
  it("all payment and shipment requests combined have max concurrency four and deadline80s", async () => {
    vi.useFakeTimers();
    let active = 0,
      peak = 0;
    network(
      Array.from({ length: 40 }, (_, i) =>
        order({ id: 1001 + i, shipping: { id: 333 + i } })
      )
    );
    const original = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/users/me") || url.includes("/orders/search"))
        return original(url);
      active++;
      peak = Math.max(peak, active);
      return new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () => {
          active--;
          reject(new Error("PRIVATE_TIMEOUT"));
        })
      );
    });
    const promise = getPublicSalesSnapshot(7, bounds);
    await vi.advanceTimersByTimeAsync(80_001);
    const result = await promise;
    expect(peak).toBe(4);
    expect(active).toBe(0);
    expect(result.orders).toHaveLength(40);
    expect(result.partial).toBe(true);
    expect(result.orders.every(order => order.net === null)).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/tempo/);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_TIMEOUT");
  });
  it("rejects malformed or >366-day bounds before credentials/network access", async () => {
    await expect(
      getPublicSalesSnapshot(7, { ...bounds, from: "2026-02-30" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      getPublicSalesSnapshot(7, {
        from: "2025-01-01",
        to: "2026-01-02",
        fromMs: Date.parse("2025-01-01T03:00:00Z"),
        toMs: Date.parse("2026-01-03T02:59:59Z"),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.credentials).not.toHaveBeenCalled();
  });
});

describe("incomplete category totals and calendar windows", () => {
  it("a missing charge amount never makes the known subtotal a total saleFee", async () => {
    network(
      [order()],
      [],
      payment({
        charges_details: [
          ...payment().charges_details,
          {
            name: "ml_sale_fee",
            type: "fee",
            accounts: { from: "collector" },
            amounts: { refunded: 0 },
          },
        ],
      })
    );
    const result = await getPublicSalesSnapshot(7, bounds);
    expect(result.orders[0]).toMatchObject({
      net: 79.91,
      financiallyComplete: true,
      saleFee: null,
      processingFee: null,
      chargesExplainDeductions: null,
    });
    expect(result.orders[0].charges).toHaveLength(3);
    expect(result).toMatchObject({
      partial: true,
      ordersPartial: false,
      coverageFrom: bounds.from,
    });
  });
  it("allows366 civil days spanning the end of historical Brazilian DST", async () => {
    network([]);
    const { resolvePublicSalesBounds } = await import("./publicSalesQuery");
    const dstBounds = resolvePublicSalesBounds({
      limit: 50,
      offset: 0,
      days: 30,
      from: "2018-02-17",
      to: "2019-02-17",
    });
    expect(dstBounds.toMs - dstBounds.fromMs).toBeGreaterThan(
      366 * 86_400_000 - 1
    );
    expect(
      await getPublicSalesSnapshot(7, dstBounds, { financial: false })
    ).toMatchObject({ orders: [], ordersPartial: false });
  });
});
