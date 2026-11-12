import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateMarginRow } from "../../shared/salesMargin";
const mocks = vi.hoisted(() => ({
  credentials: vi.fn(),
  owner: vi.fn(),
  token: vi.fn(),
  forbiddenRefresh: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("../dbMl", () => ({
  getCredentials: mocks.credentials,
  resolveMlOwnerUserId: mocks.owner,
}));
vi.mock("../ml/oauthMl", () => ({
  ensureUserAccessToken: mocks.token,
  forceRefreshUserAccessToken: mocks.forbiddenRefresh,
}));
import {
  __clearSalesMarginCache,
  getSalesMarginCollection,
  verifySalesMarginAccount,
} from "./provider";
const SELLER = "3308178634";
const bounds = {
  fromMs: Date.parse("2026-11-12T00:00:00Z"),
  toMs: Date.parse("2026-11-12T23:59:59.999Z"),
};
const order = (overrides: Record<string, unknown> = {}) => ({
  id: 1001,
  seller: { id: Number(SELLER) },
  currency_id: "BRL",
  status: "paid",
  date_created: "2026-11-12T12:00:00Z",
  total_amount: 200,
  order_items: [
    {
      item: { id: "MLB123", title: "Produto", seller_sku: "ORIGINAL-SKU" },
      quantity: 2,
      sale_fee: 12.87,
    },
  ],
  payments: [{ id: 9001, status: "approved" }],
  ...overrides,
});
const payment = (overrides: Record<string, unknown> = {}) => ({
  id: 9001,
  collector_id: Number(SELLER),
  order: { id: 1001 },
  currency_id: "BRL",
  status: "approved",
  transaction_amount: 111.93,
  transaction_amount_refunded: 0,
  transaction_details: { net_received_amount: 79.91 },
  taxes_amount: 0,
  money_release_status: "released",
  charges_details: [
    {
      id: 1,
      name: "shp_cross_docking",
      type: "shipping",
      accounts: { from: "collector", to: "marketplace" },
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
  ...overrides,
});
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function network(orders = [order()], mp: unknown = payment(), status = 200) {
  mocks.fetch.mockImplementation(async (input: string) => {
    if (input.endsWith("/users/me"))
      return response({ id: Number(SELLER), nickname: "LOJA" });
    if (input.includes("/orders/search"))
      return response({ results: orders, paging: { total: orders.length } });
    if (input.includes("api.mercadopago.com/v1/payments/"))
      return response(mp, status);
    throw new Error("Unexpected endpoint");
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  __clearSalesMarginCache();
  mocks.owner.mockResolvedValue(42);
  mocks.credentials.mockResolvedValue({
    mlUserId: Number(SELLER),
    accessToken: "MOCK_ONLY",
  });
  mocks.token.mockResolvedValue("MOCK_ONLY");
  vi.stubGlobal("fetch", mocks.fetch);
  network();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("salesMargin provider — authoritative financial values", () => {
  it("keeps actual MP gross 111.93/net 79.91 and charges without re-subtracting order sale_fee", async () => {
    const result = await getSalesMarginCollection(7, bounds);
    expect(result.operations[0]).toMatchObject({
      gross: 111.93,
      net: 79.91,
      deductions: 32.02,
      financialStatus: "confirmed",
      released: true,
    });
    expect(result.operations[0].charges.map(charge => charge.amount)).toEqual([
      19.15, 0.11, 12.76,
    ]);
    expect(result.operations[0].charges.map(charge => charge.category)).toEqual(
      ["shipping", "processing", "sale"]
    );
    expect(
      calculateMarginRow(result.operations[0], {
        operationId: "1001",
        productCost: 20,
        extraCosts: 0,
        note: "",
      }).result
    ).toBe(59.91);
    expect(mocks.forbiddenRefresh).not.toHaveBeenCalled();
  });
  it("não confirma um pedido parcialmente pago mesmo com uma parcela aprovada", async () => {
    network([order({ status: "partially_paid", payments: [{ id: 9001, status: "approved" }] })]);
    const result = await getSalesMarginCollection(7, bounds);
    expect(result.operations[0].financialStatus).toBe("pending");
    expect(result.operations[0].net).toBeNull();
    expect(calculateMarginRow(result.operations[0], { operationId: "1001", productCost: 20, extraCosts: 0, note: "" }).result).toBeNull();
  });
  it.each(["pending", "in_process", "authorized", "unknown", undefined])("não descarta referência não finalizada %s ao lado de pagamento aprovado", async status => {
    network([order({ payments: [{ id: 9001, status: "approved" }, { id: 9002, status }] })]);
    const result = await getSalesMarginCollection(7, bounds);
    expect(result.operations[0]).toMatchObject({ financialStatus: "pending", net: null, deductions: null });
    expect(mocks.fetch.mock.calls.some(call => String(call[0]).includes("/v1/payments/"))).toBe(false);
  });
  it.each(["rejected", "cancelled", "canceled"])("tentativa encerrada %s não impede o líquido do pagamento aprovado", async status => {
    network([order({ payments: [{ id: 9001, status: "approved" }, { id: 9002, status }] })]);
    expect((await getSalesMarginCollection(7, bounds)).operations[0]).toMatchObject({ financialStatus: "confirmed", net: 79.91 });
  });
  it("preserves explicit zero gross/net/taxes and a held release status", async () => {
    network(
      [order()],
      payment({
        transaction_amount: 0,
        transaction_details: { net_received_amount: 0 },
        taxes_amount: 0,
        money_release_status: "pending",
      })
    );
    expect(
      (await getSalesMarginCollection(7, bounds)).operations[0]
    ).toMatchObject({
      gross: 0,
      net: 0,
      taxesWithheld: 0,
      released: false,
      financialStatus: "confirmed",
    });
  });
  it("preserves an explicitly reported negative net as confirmed, without estimating it", async () => {
    network(
      [order()],
      payment({ transaction_details: { net_received_amount: -5.25 } })
    );
    expect(
      (await getSalesMarginCollection(7, bounds)).operations[0]
    ).toMatchObject({
      net: -5.25,
      deductions: 117.18,
      financialStatus: "confirmed",
    });
  });
  it("deduplicates approved payment IDs instead of doubling gross and net", async () => {
    network([
      order({
        payments: [
          { id: 9001, status: "approved" },
          { id: 9001, status: "approved" },
        ],
      }),
    ]);
    expect(
      (await getSalesMarginCollection(7, bounds)).operations[0]
    ).toMatchObject({ gross: 111.93, net: 79.91 });
    expect(
      mocks.fetch.mock.calls.filter(([url]) => url.includes("mercadopago"))
    ).toHaveLength(1);
  });
  it.each([
    { status: "refunded" },
    { status: "charged_back" },
    { transaction_amount_refunded: 1 },
  ])(
    "never uses an actual net for a refunded/charged-back payment %j",
    async patch => {
      network([order()], payment(patch));
      expect(
        (await getSalesMarginCollection(7, bounds)).operations[0]
      ).toMatchObject({
        financialStatus: "refund_pending",
        net: null,
        pendingReason: expect.stringMatching(/relatório/),
      });
    }
  );
  it("keeps order-level returns and refunds pending without fetching approved finance", async () => {
    network([order({ payments: [{ id: 9001, status: "refunded" }] })]);
    const sale = (await getSalesMarginCollection(7, bounds)).operations[0];
    expect(sale.financialStatus).toBe("refund_pending");
    expect(sale.net).toBeNull();
    expect(
      mocks.fetch.mock.calls.some(([url]) => url.includes("mercadopago"))
    ).toBe(false);
  });
  it.each([403, 500])(
    "retains the order as pending on payment HTTP %i",
    async status => {
      network([order()], { error: "denied" }, status);
      const result = await getSalesMarginCollection(7, bounds);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]).toMatchObject({
        financialStatus: "pending",
        net: null,
        deductions: null,
      });
    }
  );
  it.each([
    { transaction_details: {} },
    { collector_id: 123 },
    { currency_id: "USD" },
    { order: { id: 999 } },
    { order_id: 999 },
    { id: 888 },
    { status: "unknown" },
  ])("invalid or unconfirmed payment remains null %j", async patch => {
    network([order()], payment(patch));
    expect(
      (await getSalesMarginCollection(7, bounds)).operations[0]
    ).toMatchObject({ financialStatus: "pending", net: null });
  });
  it("uses only seller-account charges and original less refunded; buyer and unidentified charges are excluded", async () => {
    network(
      [order()],
      payment({
        charges_details: [
          {
            name: "shipping",
            accounts: { from: SELLER },
            amounts: { original: 20, refunded: 5 },
          },
          {
            name: "buyer_fee",
            accounts: { from: "payer" },
            amounts: { original: 100, refunded: 0 },
          },
          { name: "unidentified_fee", amounts: { original: 100, refunded: 0 } },
          {
            name: "foreign",
            accounts: { from: { type: "collector", id: 99 } },
            amounts: { original: 100 },
          },
        ],
      })
    );
    const sale = (await getSalesMarginCollection(7, bounds)).operations[0];
    expect(sale.net).toBe(79.91);
    expect(sale.charges).toEqual([
      { key: "shipping", label: "shipping", category: "shipping", amount: 15 },
    ]);
  });
  it("does not invent SKU; missing SKU blocks result even with cost/net", async () => {
    network([
      order({
        order_items: [
          { item: { id: "MLB123", title: "Produto" }, quantity: 1 },
        ],
      }),
    ]);
    const sale = (await getSalesMarginCollection(7, bounds)).operations[0];
    expect(sale.items[0].sku).toBeNull();
    expect(
      calculateMarginRow(sale, {
        operationId: "1001",
        productCost: 0,
        extraCosts: 0,
        note: "",
      })
    ).toMatchObject({ result: null, resultStatus: "missing_sku" });
  });
  it("preserves seller_custom_field and SKU attributes", async () => {
    network([
      order({
        order_items: [
          { item: { id: "MLB1", seller_custom_field: "FIELD" }, quantity: 1 },
          {
            item: {
              id: "MLB2",
              attributes: [{ id: "SELLER_SKU", value_name: "ATTR" }],
            },
            quantity: 1,
          },
        ],
      }),
    ]);
    expect(
      (await getSalesMarginCollection(7, bounds)).operations[0].items.map(
        item => item.sku
      )
    ).toEqual(["FIELD", "ATTR"]);
  });
  it("approved split payments aggregate their actual gross/net rather than any rate", async () => {
    const first = payment({
      transaction_amount: 60,
      transaction_details: { net_received_amount: 40 },
    });
    const second = payment({
      id: 9002,
      transaction_amount: 51.93,
      transaction_details: { net_received_amount: 39.91 },
    });
    network([
      order({
        payments: [
          { id: 9001, status: "approved" },
          { id: 9002, status: "approved" },
        ],
      }),
    ]);
    mocks.fetch.mockImplementation(async (url: string) =>
      url.endsWith("/users/me")
        ? response({ id: Number(SELLER) })
        : url.includes("/orders/search")
          ? response({
              results: [
                order({
                  payments: [
                    { id: 9001, status: "approved" },
                    { id: 9002, status: "approved" },
                  ],
                }),
              ],
              paging: { total: 1 },
            })
          : response(url.endsWith("9002") ? second : first)
    );
    expect(
      (await getSalesMarginCollection(7, bounds)).operations[0]
    ).toMatchObject({ gross: 111.93, net: 79.91 });
  });
});
describe("salesMargin provider — scope, pagination and cache", () => {
  it("rejects persisted personal seller before routine token loading", async () => {
    mocks.credentials.mockResolvedValue({ mlUserId: 123 });
    await expect(verifySalesMarginAccount(7)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("verifies /users/me again before a cache hit and never serves another seller", async () => {
    await getSalesMarginCollection(7, bounds);
    mocks.fetch.mockImplementation(async () => response({ id: 123 }));
    await expect(getSalesMarginCollection(7, bounds)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
  });
  it("shares cache through owner scope but verifies identity on every query", async () => {
    await getSalesMarginCollection(7, bounds);
    await getSalesMarginCollection(8, bounds);
    expect(
      mocks.fetch.mock.calls.filter(([url]) => url.endsWith("/users/me"))
    ).toHaveLength(2);
    expect(
      mocks.fetch.mock.calls.filter(([url]) => url.includes("/orders/search"))
    ).toHaveLength(1);
    expect(mocks.token).toHaveBeenCalledWith(42);
  });
  it("bounds cache to 64 ranges and evicts the oldest completed snapshot", async () => {
    network([]);
    for (let index = 0; index < 65; index++)
      await getSalesMarginCollection(7, {
        fromMs: bounds.fromMs + index,
        toMs: bounds.toMs,
      });
    await getSalesMarginCollection(7, bounds);
    expect(
      mocks.fetch.mock.calls.filter(([url]) => url.includes("/orders/search"))
    ).toHaveLength(66);
  });
  it("force refresh bypasses TTL and stale fallback is visibly labeled", async () => {
    await getSalesMarginCollection(7, bounds);
    mocks.fetch.mockImplementation(async (url: string) =>
      url.endsWith("/users/me")
        ? response({ id: Number(SELLER) })
        : response({}, 500)
    );
    const fallback = await getSalesMarginCollection(7, bounds, true);
    expect(fallback).toMatchObject({
      stale: true,
      warning: expect.stringMatching(/desatualizada/),
    });
    expect(fallback.operations[0].net).toBe(79.91);
  });
  it.each([
    { error: "blocked" },
    { results: [], paging: {} },
    { results: [null], paging: { total: 1 } },
  ])(
    "malformed cold order response throws, never fake empty %j",
    async page => {
      mocks.fetch.mockImplementation(async (url: string) =>
        url.endsWith("/users/me")
          ? response({ id: Number(SELLER) })
          : response(page)
      );
      await expect(getSalesMarginCollection(7, bounds)).rejects.toMatchObject({
        code: "BAD_GATEWAY",
      });
    }
  );
  it("rejects orders for another seller even if /users/me matched", async () => {
    network([order({ seller: { id: 123 } })]);
    await expect(getSalesMarginCollection(7, bounds)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("a valid zero-total page is the only empty complete collection", async () => {
    network([]);
    expect(await getSalesMarginCollection(7, bounds)).toMatchObject({
      operations: [],
      partial: false,
      capped: false,
    });
  });
  it("uses inclusive ISO bounds and reports 300-order cap rather than pretending complete", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/users/me")) return response({ id: Number(SELLER) });
      if (url.includes("/orders/search")) {
        const query = new URL(url).searchParams;
        expect(query.get("seller")).toBe(SELLER);
        expect(query.get("sort")).toBe("date_desc");
        expect(query.get("limit")).toBe("50");
        expect(query.get("order.date_created.from")).toBe(
          new Date(bounds.fromMs).toISOString()
        );
        expect(query.get("order.date_created.to")).toBe(
          new Date(bounds.toMs).toISOString()
        );
        const offset = Number(query.get("offset"));
        return response({
          results: Array.from({ length: 50 }, (_, i) =>
            order({ id: 1001 + offset + i, payments: [] })
          ),
          paging: { total: 301 },
        });
      }
      throw new Error("Unexpected payment");
    });
    const result = await getSalesMarginCollection(7, bounds);
    expect(result).toMatchObject({ partial: true, capped: true });
    expect(result.operations).toHaveLength(300);
    expect(result.operations.every(sale => sale.net === null)).toBe(true);
  });
  it("a later page HTTP failure preserves collected orders and marks partial explicitly", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/users/me")) return response({ id: Number(SELLER) });
      const offset = Number(new URL(url).searchParams.get("offset"));
      return offset
        ? response({}, 500)
        : response({
            results: Array.from({ length: 50 }, (_, i) =>
              order({ id: 1001 + i, payments: [] })
            ),
            paging: { total: 51 },
          });
    });
    const result = await getSalesMarginCollection(7, bounds);
    expect(result.operations).toHaveLength(50);
    expect(result.partial).toBe(true);
    expect(result.warning).toMatch(/página/);
  });
  it("enforces 12-second request timeout, concurrency 4 and 80-second budget without dropping orders", async () => {
    vi.useFakeTimers();
    let active = 0,
      maxActive = 0;
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/users/me")) return response({ id: Number(SELLER) });
      if (url.includes("/orders/search"))
        return response({
          results: Array.from({ length: 40 }, (_, i) =>
            order({ id: 1001 + i })
          ),
          paging: { total: 40 },
        });
      active++;
      maxActive = Math.max(maxActive, active);
      return new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () => {
          active--;
          reject(new Error("aborted"));
        })
      );
    });
    const resultPromise = getSalesMarginCollection(7, bounds);
    await vi.advanceTimersByTimeAsync(80_001);
    const result = await resultPromise;
    expect(maxActive).toBe(4);
    expect(result.operations).toHaveLength(40);
    expect(result.partial).toBe(true);
    expect(result.operations.every(sale => sale.net === null)).toBe(true);
    expect(result.warning).toMatch(/tempo/);
  });
});
