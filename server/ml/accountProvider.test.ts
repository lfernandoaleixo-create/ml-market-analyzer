import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AccountProvider } from "./accountProvider";

/**
 * Tests for AccountProvider — the owner-token data layer.
 * We stub global.fetch and assert the aggregation logic (revenue, daily,
 * top products, listing summary, post-sale) rather than the network itself.
 */

const USER_ID = 123456;

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

/** Route a fetch URL to a canned response based on path matching. */
function makeFetchRouter(routes: Array<{ match: RegExp; body: unknown; ok?: boolean }>) {
  return vi.fn(async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const r of routes) {
      if (r.match.test(url)) return jsonResponse(r.body, r.ok ?? true);
    }
    // Default: not found -> null path
    return jsonResponse(null, false);
  });
}

describe("AccountProvider.getReputation", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("maps the /users/me reputation payload into ReputationInfo", async () => {
    global.fetch = makeFetchRouter([
      {
        match: /\/users\/me$/,
        body: {
          id: USER_ID,
          nickname: "LOJADOSRWU",
          points: 100,
          seller_reputation: {
            level_id: "5_green",
            power_seller_status: null,
            transactions: {
              total: 52,
              completed: 38,
              canceled: 14,
              ratings: { positive: 30, neutral: 1, negative: 0 },
            },
            metrics: {
              claims: { rate: 0.01 },
              delayed_handling_time: { rate: 0.02 },
              cancellations: { rate: 0.03 },
            },
          },
        },
      },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const rep = await provider.getReputation();

    expect(rep).not.toBeNull();
    expect(rep!.nickname).toBe("LOJADOSRWU");
    expect(rep!.levelId).toBe("5_green");
    expect(rep!.transactionsCompleted).toBe(38);
    expect(rep!.transactionsCanceled).toBe(14);
    expect(rep!.ratingsPositive).toBe(30);
    expect(rep!.metrics.claimsRate).toBe(0.01);
  });

  it("returns null when /users/me fails", async () => {
    global.fetch = makeFetchRouter([]) as unknown as typeof fetch;
    const provider = new AccountProvider("token", USER_ID);
    expect(await provider.getReputation()).toBeNull();
  });
});

describe("AccountProvider.getSalesDashboard", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("aggregates revenue, units, daily points and top products from PAID orders (official filter)", async () => {
    const now = Date.now();
    const d1 = new Date(now - 2 * 86400000).toISOString();
    const d2 = new Date(now - 1 * 86400000).toISOString();

    // Paid orders come from the order.status=paid query.
    const paidOrders = {
      paging: { total: 2 },
      results: [
        {
          date_created: d1,
          status: "paid",
          payments: [{ status: "approved", transaction_amount: 100 }],
          total_amount: 100,
          order_items: [{ quantity: 2, unit_price: 50, item: { id: "MLB1", title: "Produto A" } }],
        },
        {
          date_created: d2,
          status: "paid",
          payments: [{ status: "approved", transaction_amount: 30 }],
          total_amount: 30,
          order_items: [{ quantity: 1, unit_price: 30, item: { id: "MLB2", title: "Produto B" } }],
        },
      ],
    };
    // Cancelled count comes from the order.status=cancelled query (paging.total).
    const cancelledCount = { paging: { total: 1 }, results: [] };

    global.fetch = makeFetchRouter([
      { match: /order\.status=paid/, body: paidOrders },
      { match: /order\.status=cancelled/, body: cancelledCount },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const dash = await provider.getSalesDashboard({ fromMs: now - 200 * 86400000, toMs: now });

    expect(dash.kpis.revenue).toBe(130);
    expect(dash.kpis.orders).toBe(2);
    expect(dash.kpis.unitsSold).toBe(3);
    expect(dash.kpis.cancelled).toBe(1);
    expect(dash.kpis.avgTicket).toBe(65);
    expect(dash.daily.length).toBe(2);
    // Top product by revenue is Produto A (100)
    expect(dash.topProducts[0].itemId).toBe("MLB1");
    expect(dash.topProducts[0].revenue).toBe(100);
  });

  it("ignores paid orders outside the requested period", async () => {
    const now = Date.now();
    const old = new Date(now - 200 * 86400000).toISOString();
    global.fetch = makeFetchRouter([
      {
        match: /order\.status=paid/,
        body: {
          paging: { total: 1 },
          results: [
            {
              date_created: old,
              status: "paid",
              payments: [{ status: "approved", transaction_amount: 100 }],
              total_amount: 100,
              order_items: [{ quantity: 1, unit_price: 100, item: { id: "X", title: "Velho" } }],
            },
          ],
        },
      },
      { match: /order\.status=cancelled/, body: { paging: { total: 0 }, results: [] } },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const dash = await provider.getSalesDashboard({ fromMs: now - 60 * 86400000, toMs: now });
    expect(dash.kpis.revenue).toBe(0);
    expect(dash.kpis.orders).toBe(0);
  });
});

describe("AccountProvider.getListings", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("computes summary (active, stagnant, out of stock) and conversion", async () => {
    const idsPage = { paging: { total: 2 }, results: ["MLB1", "MLB2"] };
    const itemsBody = [
      {
        code: 200,
        body: {
          id: "MLB1",
          title: "Ativo com venda",
          price: 50,
          currency_id: "BRL",
          available_quantity: 10,
          sold_quantity: 5,
          status: "active",
          listing_type_id: "gold_special",
        },
      },
      {
        code: 200,
        body: {
          id: "MLB2",
          title: "Parado sem venda",
          price: 20,
          currency_id: "BRL",
          available_quantity: 8,
          sold_quantity: 0,
          status: "active",
          listing_type_id: "gold_special",
        },
      },
    ];

    global.fetch = makeFetchRouter([
      { match: /\/users\/\d+\/items\/search/, body: idsPage },
      { match: /\/items\?ids=/, body: itemsBody },
      { match: /\/visits\/time_window/, body: { total_visits: 100 } },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const res = await provider.getListings({ lastDays: 30 });

    expect(res.summary.total).toBe(2);
    expect(res.summary.active).toBe(2);
    expect(res.summary.stagnant).toBe(1); // MLB2 has stock but no sales
    expect(res.summary.outOfStock).toBe(0);
    const mlb1 = res.items.find((i) => i.itemId === "MLB1")!;
    expect(mlb1.visits).toBe(100);
    expect(mlb1.conversion).toBeCloseTo(5 / 100);
  });
});

describe("AccountProvider.probe", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns ok with nickname when token works", async () => {
    global.fetch = makeFetchRouter([
      { match: /\/users\/me$/, body: { id: USER_ID, nickname: "LOJADOSRWU" } },
    ]) as unknown as typeof fetch;
    const provider = new AccountProvider("token", USER_ID);
    expect(await provider.probe()).toEqual({ ok: true, nickname: "LOJADOSRWU" });
  });

  it("returns ok:false when token fails", async () => {
    global.fetch = makeFetchRouter([]) as unknown as typeof fetch;
    const provider = new AccountProvider("token", USER_ID);
    expect(await provider.probe()).toEqual({ ok: false });
  });
});
