import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AccountProvider, brtDateKey } from "./accountProvider";

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
    // Cancelled count is now derived from cancelled orders WITHIN the period.
    // One cancelled order inside the window, one far outside (must be ignored).
    const cancelledOrders = {
      paging: { total: 2 },
      results: [
        { date_created: d1, status: "cancelled", total_amount: 40 },
        { date_created: new Date(now - 300 * 86400000).toISOString(), status: "cancelled", total_amount: 99 },
      ],
    };

    global.fetch = makeFetchRouter([
      { match: /order\.status=paid/, body: paidOrders },
      { match: /order\.status=cancelled/, body: cancelledOrders },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const dash = await provider.getSalesDashboard({ fromMs: now - 200 * 86400000, toMs: now });

    expect(dash.kpis.revenue).toBe(130);
    expect(dash.kpis.orders).toBe(2);
    expect(dash.kpis.unitsSold).toBe(3);
    // Only the cancelled order inside the window counts (the 300-day-old one is ignored).
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
      // Visits now come from the dated per-item time_window endpoint.
      { match: /\/items\/MLB1\/visits\/time_window/, body: { total_visits: 100 } },
      { match: /\/items\/MLB2\/visits\/time_window/, body: { total_visits: 40 } },
      { match: /api\.mercadolibre\.com\/items\?ids=/, body: itemsBody },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const res = await provider.getListings({ lastDays: 30 });

    expect(res.summary.total).toBe(2);
    expect(res.summary.active).toBe(2);
    expect(res.summary.stagnant).toBe(1); // MLB2 has stock but no sales
    expect(res.summary.outOfStock).toBe(0);
    expect(res.summary.windowDays).toBe(30);
    expect(res.summary.totalSold).toBe(5);
    expect(res.summary.totalStockValue).toBe(50 * 10 + 20 * 8);
    const mlb1 = res.items.find((i) => i.itemId === "MLB1")!;
    expect(mlb1.visits).toBe(100);
    expect(mlb1.conversion).toBeCloseTo(5 / 100);
    expect(mlb1.stockValue).toBe(500);
  });

  it("reflects the selected window via the dated time_window endpoint", async () => {
    const idsPage = { paging: { total: 1 }, results: ["MLB9"] };
    const itemsBody = [
      {
        code: 200,
        body: {
          id: "MLB9",
          title: "Item janela 90d",
          price: 30,
          currency_id: "BRL",
          available_quantity: 3,
          sold_quantity: 2,
          status: "active",
          listing_type_id: "gold_pro",
        },
      },
    ];
    const seen: string[] = [];
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      seen.push(u);
      const route = /\/users\/\d+\/items\/search/.test(u)
        ? idsPage
        : /\/visits\/time_window/.test(u)
          ? { total_visits: 12 }
          : /api\.mercadolibre\.com\/items\?ids=/.test(u)
            ? itemsBody
            : {};
      return { ok: true, json: async () => route } as any;
    }) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const res = await provider.getListings({ lastDays: 90 });
    expect(res.summary.windowDays).toBe(90);
    const mlb9 = res.items.find((i) => i.itemId === "MLB9")!;
    expect(mlb9.visits).toBe(12);
    expect(mlb9.conversion).toBeCloseTo(2 / 12);
    // Confirms the dated endpoint was queried with the selected window.
    expect(seen.some((u) => /\/visits\/time_window\?last=90/.test(u))).toBe(true);
  });

  it("treats items with no dated visit data as zero (not faked)", async () => {
    const idsPage = { paging: { total: 1 }, results: ["MLB9"] };
    const itemsBody = [
      {
        code: 200,
        body: {
          id: "MLB9",
          title: "Item sem dados de visita",
          price: 10,
          currency_id: "BRL",
          available_quantity: 5,
          sold_quantity: 0,
          status: "active",
          listing_type_id: "gold_special",
        },
      },
    ];
    global.fetch = makeFetchRouter([
      { match: /\/users\/\d+\/items\/search/, body: idsPage },
      { match: /\/visits\/time_window/, body: {} }, // no total_visits field
      { match: /api\.mercadolibre\.com\/items\?ids=/, body: itemsBody },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const res = await provider.getListings({ lastDays: 30 });
    const mlb9 = res.items.find((i) => i.itemId === "MLB9")!;
    expect(mlb9.visits).toBe(0);
    expect(mlb9.conversion).toBeNull();
  });

  it("builds a 30-day active-visits evolution series (zero-filled, aggregated)", async () => {
    const idsPage = { paging: { total: 2 }, results: ["MLB1", "MLB2"] };
    const itemsBody = [
      {
        code: 200,
        body: {
          id: "MLB1",
          title: "Ativo A",
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
          title: "Pausado B",
          price: 20,
          currency_id: "BRL",
          available_quantity: 8,
          sold_quantity: 0,
          status: "paused",
          listing_type_id: "gold_special",
        },
      },
    ];
    // Two active-only days share a date so we can assert aggregation. MLB2 is
    // paused, so its series must be ignored entirely.
    const day1 = "2026-06-01";
    const day2 = "2026-06-02";
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      let body: any = {};
      if (/\/users\/\d+\/items\/search/.test(u)) body = idsPage;
      else if (/api\.mercadolibre\.com\/items\?ids=/.test(u)) body = itemsBody;
      else if (/\/items\/MLB1\/visits\/time_window/.test(u))
        body = {
          total_visits: 30,
          results: [
            { date: `${day1}T00:00:00.000-04:00`, total: 10 },
            { date: `${day2}T00:00:00.000-04:00`, total: 20 },
          ],
        };
      else if (/\/items\/MLB2\/visits\/time_window/.test(u))
        body = {
          total_visits: 99,
          results: [{ date: `${day1}T00:00:00.000-04:00`, total: 99 }],
        };
      return { ok: true, json: async () => body } as any;
    }) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const res = await provider.getListings({ lastDays: 30 });

    expect(Array.isArray(res.visitsSeries)).toBe(true);
    expect(res.visitsSeries.length).toBe(30); // zero-filled to a full 30-day window
    const map = Object.fromEntries(res.visitsSeries.map((p) => [p.date, p.visits]));
    // Only the ACTIVE listing (MLB1) contributes; paused MLB2 is excluded.
    expect(map[day1]).toBe(10);
    expect(map[day2]).toBe(20);
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


describe("AccountProvider.getPeriodSummary", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  function paidOrdersBody(now: number) {
    const d1 = new Date(now - 2 * 86400000).toISOString();
    const d2 = new Date(now - 1 * 86400000).toISOString();
    const old = new Date(now - 200 * 86400000).toISOString();
    return {
      paging: { total: 3 },
      results: [
        {
          date_created: d1,
          status: "paid",
          payments: [{ status: "approved", transaction_amount: 100 }],
          total_amount: 100,
          order_items: [{ quantity: 2, unit_price: 50, item: { id: "MLB1", title: "A" } }],
        },
        {
          date_created: d2,
          status: "paid",
          payments: [{ status: "approved", transaction_amount: 50 }],
          total_amount: 50,
          order_items: [{ quantity: 1, unit_price: 50, item: { id: "MLB2", title: "B" } }],
        },
        {
          date_created: old,
          status: "paid",
          payments: [{ status: "approved", transaction_amount: 999 }],
          total_amount: 999,
          order_items: [{ quantity: 9, unit_price: 111, item: { id: "MLB3", title: "Velho" } }],
        },
      ],
    };
  }

  it("summarizes KPIs for a window, ignoring orders outside it", async () => {
    const now = Date.now();
    global.fetch = makeFetchRouter([
      { match: /order\.status=paid/, body: paidOrdersBody(now) },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const summary = await provider.getPeriodSummary({ fromMs: now - 10 * 86400000, toMs: now });

    expect(summary.revenue).toBe(150); // only the two recent orders
    expect(summary.orders).toBe(2);
    expect(summary.unitsSold).toBe(3);
    expect(summary.avgTicket).toBe(75);
    expect(summary.from).toBe(now - 10 * 86400000);
    expect(summary.to).toBe(now);
  });

  it("reuses the cached paid orders across multiple period summaries (single fetch burst)", async () => {
    const now = Date.now();
    const fetchSpy = makeFetchRouter([
      { match: /order\.status=paid/, body: paidOrdersBody(now) },
    ]);
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    await provider.getPeriodSummary({ fromMs: now - 10 * 86400000, toMs: now });
    const callsAfterFirst = fetchSpy.mock.calls.length;
    await provider.getPeriodSummary({ fromMs: now - 300 * 86400000, toMs: now });
    // The second call must not trigger any additional orders fetch.
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe("AccountProvider.getSalesDashboard fill option", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns a dense daily series covering every day in the window when fill=true", async () => {
    const now = Date.now();
    const d = new Date(now - 1 * 86400000).toISOString();
    global.fetch = makeFetchRouter([
      {
        match: /order\.status=paid/,
        body: {
          paging: { total: 1 },
          results: [
            {
              date_created: d,
              status: "paid",
              payments: [{ status: "approved", transaction_amount: 80 }],
              total_amount: 80,
              order_items: [{ quantity: 1, unit_price: 80, item: { id: "MLB1", title: "A" } }],
            },
          ],
        },
      },
      { match: /order\.status=cancelled/, body: { paging: { total: 0 }, results: [] } },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const from = now - 6 * 86400000;
    const dash = await provider.getSalesDashboard({ fromMs: from, toMs: now, fill: true });
    // 7 calendar days inclusive (from..now), one of which has revenue.
    expect(dash.daily.length).toBe(7);
    const withRevenue = dash.daily.filter((p) => p.revenue > 0);
    expect(withRevenue.length).toBe(1);
    expect(withRevenue[0].revenue).toBe(80);
    // The series is sorted and contiguous (no gaps).
    const dates = dash.daily.map((p) => p.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});

describe("AccountProvider.getSalesDashboard cancelled-by-day", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("marks cancelled count and amount on the day a cancelled order was created", async () => {
    const now = Date.now();
    const paidDay = new Date(now - 1 * 86400000).toISOString();
    const cancelDay = new Date(now - 3 * 86400000).toISOString();
    global.fetch = makeFetchRouter([
      {
        match: /order\.status=paid/,
        body: {
          paging: { total: 1 },
          results: [
            {
              date_created: paidDay,
              status: "paid",
              payments: [{ status: "approved", transaction_amount: 50 }],
              total_amount: 50,
              order_items: [{ quantity: 1, unit_price: 50, item: { id: "MLB1", title: "A" } }],
            },
          ],
        },
      },
      // countOrdersByStatus uses limit=1 paging total; getCancelledOrders pulls results.
      {
        match: /order\.status=cancelled/,
        body: {
          paging: { total: 2 },
          results: [
            { date_created: cancelDay, status: "cancelled", total_amount: 30 },
            { date_created: cancelDay, status: "cancelled", total_amount: 20 },
          ],
        },
      },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const from = now - 6 * 86400000;
    const dash = await provider.getSalesDashboard({ fromMs: from, toMs: now, fill: true });

    const cancelKey = brtDateKey(new Date(cancelDay).getTime());
    const paidKey = brtDateKey(new Date(paidDay).getTime());
    const cancelPoint = dash.daily.find((p) => p.date === cancelKey)!;
    const paidPoint = dash.daily.find((p) => p.date === paidKey)!;

    expect(cancelPoint.cancelled).toBe(2);
    expect(cancelPoint.cancelledAmount).toBe(50);
    expect(cancelPoint.revenue).toBe(0);
    expect(paidPoint.cancelled).toBe(0);
    expect(paidPoint.revenue).toBe(50);
    // Every dense point exposes the cancelled fields (default 0).
    expect(dash.daily.every((p) => typeof p.cancelled === "number")).toBe(true);
  });
});

describe("brtDateKey", () => {
  it("buckets a late-night BRT sale into the correct local day (not the next UTC day)", () => {
    // 2026-06-03 23:30 BRT == 2026-06-04 02:30 UTC. Must bucket as 2026-06-03.
    const utcMs = Date.parse("2026-06-04T02:30:00.000Z");
    expect(brtDateKey(utcMs)).toBe("2026-06-03");
  });

  it("buckets an early-morning BRT sale correctly", () => {
    // 2026-06-03 00:30 BRT == 2026-06-03 03:30 UTC -> 2026-06-03.
    const utcMs = Date.parse("2026-06-03T03:30:00.000Z");
    expect(brtDateKey(utcMs)).toBe("2026-06-03");
  });
});

describe("AccountProvider.getStoreLifetime", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("derives first sale from the oldest paid order, total orders from paging, and total revenue from paid orders", async () => {
    const firstSaleIso = "2023-05-10T14:00:00.000Z";
    // date_asc&limit=1 returns the oldest order + the true total via paging.
    const oldestBody = {
      paging: { total: 412 },
      results: [{ date_created: firstSaleIso, status: "paid" }],
    };
    // date_desc (getPaidOrders cache) returns the orders used to sum revenue.
    // paging.total matches the number of results so the cache loop stops after
    // one page (the real total of orders is asserted from the date_asc body).
    const paidDescBody = {
      paging: { total: 2 },
      results: [
        {
          date_created: "2026-06-01T12:00:00.000Z",
          status: "paid",
          payments: [{ status: "approved", transaction_amount: 100 }],
          total_amount: 100,
          order_items: [{ quantity: 1, unit_price: 100, item: { id: "MLB1", title: "A" } }],
        },
        {
          date_created: "2026-06-02T12:00:00.000Z",
          status: "paid",
          payments: [{ status: "accredited", transaction_amount: 250 }],
          total_amount: 250,
          order_items: [{ quantity: 1, unit_price: 250, item: { id: "MLB2", title: "B" } }],
        },
      ],
    };

    // Lifetime cancelled: count via paging total + accumulated total_amount.
    const cancelledBody = {
      paging: { total: 5 },
      results: [
        { date_created: "2026-05-10T12:00:00.000Z", status: "cancelled", total_amount: 40 },
        { date_created: "2026-05-12T12:00:00.000Z", status: "cancelled", total_amount: 60 },
      ],
    };

    global.fetch = makeFetchRouter([
      { match: /sort=date_asc/, body: oldestBody },
      { match: /order\.status=cancelled/, body: cancelledBody },
      { match: /order\.status=paid/, body: paidDescBody },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const lifetime = await provider.getStoreLifetime();

    expect(lifetime.firstSaleMs).toBe(Date.parse(firstSaleIso));
    expect(lifetime.totalOrders).toBe(412);
    expect(lifetime.totalRevenue).toBe(350);
    // Count comes from the cancelled paging total (exact); value sums the cache.
    expect(lifetime.canceledOrders).toBe(5);
    expect(lifetime.canceledRevenue).toBe(100);
    expect(lifetime.currency).toBe("BRL");
  });

  it("returns null first sale and zero totals for a store with no paid orders", async () => {
    global.fetch = makeFetchRouter([
      { match: /sort=date_asc/, body: { paging: { total: 0 }, results: [] } },
      { match: /order\.status=cancelled/, body: { paging: { total: 0 }, results: [] } },
      { match: /order\.status=paid/, body: { paging: { total: 0 }, results: [] } },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const lifetime = await provider.getStoreLifetime();

    expect(lifetime.firstSaleMs).toBeNull();
    expect(lifetime.totalOrders).toBe(0);
    expect(lifetime.totalRevenue).toBe(0);
    expect(lifetime.canceledOrders).toBe(0);
    expect(lifetime.canceledRevenue).toBe(0);
  });
});


describe("AccountProvider.getProductsByDay", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("aggregates only the products sold on the requested BRT day", async () => {
    // Two paid orders on 2026-04-24 (BRT) and one on 2026-04-25.
    // 2026-04-24T10:00:00Z → BRT 07:00 same day.
    // 2026-04-25T01:00:00Z → BRT 22:00 of 2026-04-24 (boundary check).
    const paidBody = {
      paging: { total: 3 },
      results: [
        {
          id: "O1",
          date_created: "2026-04-24T10:00:00.000Z",
          payments: [{ status: "approved", transaction_amount: 100 }],
          order_items: [
            { quantity: 2, unit_price: 50, item: { id: "MLB1", title: "Camiseta" } },
          ],
        },
        {
          id: "O2",
          // BRT = 2026-04-24 22:00 (still day 24 in BRT, though 25 in UTC)
          date_created: "2026-04-25T01:00:00.000Z",
          payments: [{ status: "approved", transaction_amount: 30 }],
          order_items: [
            { quantity: 1, unit_price: 30, item: { id: "MLB2", title: "Caneca" } },
          ],
        },
        {
          id: "O3",
          // BRT = 2026-04-25 (different day, must be excluded)
          date_created: "2026-04-25T12:00:00.000Z",
          payments: [{ status: "approved", transaction_amount: 999 }],
          order_items: [
            { quantity: 5, unit_price: 199.8, item: { id: "MLB3", title: "Tênis" } },
          ],
        },
      ],
    };

    global.fetch = makeFetchRouter([
      { match: /order\.status=cancelled/, body: { paging: { total: 0 }, results: [] } },
      { match: /sort=date_desc/, body: paidBody },
      { match: /sort=date_asc/, body: { paging: { total: 3 }, results: [] } },
      // Multiget enrichment for missing thumbnails → return empty so it's a no-op.
      { match: /\/items\?ids=/, body: [] },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const day = await provider.getProductsByDay("2026-04-24");

    expect(day.date).toBe("2026-04-24");
    expect(day.orders).toBe(2);
    expect(day.revenue).toBe(130);
    expect(day.unitsSold).toBe(3);
    // MLB3 (day 25) must NOT appear.
    const ids = day.products.map((p) => p.itemId);
    expect(ids).toContain("MLB1");
    expect(ids).toContain("MLB2");
    expect(ids).not.toContain("MLB3");
    // Ranked by revenue desc: MLB1 (100) before MLB2 (30).
    expect(day.products[0].itemId).toBe("MLB1");
    expect(day.products[0].revenue).toBe(100);
  });

  it("returns an empty product list for a day with no sales", async () => {
    const paidBody = {
      paging: { total: 1 },
      results: [
        {
          id: "O1",
          date_created: "2026-04-24T10:00:00.000Z",
          payments: [{ status: "approved", transaction_amount: 100 }],
          order_items: [{ quantity: 1, unit_price: 100, item: { id: "MLB1", title: "X" } }],
        },
      ],
    };
    global.fetch = makeFetchRouter([
      { match: /order\.status=cancelled/, body: { paging: { total: 0 }, results: [] } },
      { match: /sort=date_desc/, body: paidBody },
      { match: /\/items\?ids=/, body: [] },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const day = await provider.getProductsByDay("2026-05-01");

    expect(day.date).toBe("2026-05-01");
    expect(day.orders).toBe(0);
    expect(day.revenue).toBe(0);
    expect(day.unitsSold).toBe(0);
    expect(day.products).toEqual([]);
  });

  it("aggregates cancelled products created on the requested BRT day", async () => {
    const paidBody = {
      paging: { total: 1 },
      results: [
        {
          id: "O1",
          date_created: "2026-04-24T10:00:00.000Z",
          payments: [{ status: "approved", transaction_amount: 100 }],
          order_items: [
            { quantity: 2, unit_price: 50, item: { id: "MLB1", title: "Camiseta" } },
          ],
        },
      ],
    };
    const cancelledBody = {
      paging: { total: 2 },
      results: [
        {
          id: "C1",
          date_created: "2026-04-24T11:00:00.000Z",
          status: "cancelled",
          total_amount: 80,
          order_items: [
            { quantity: 1, unit_price: 80, item: { id: "MLB9", title: "Mochila" } },
          ],
        },
        {
          id: "C2",
          // Different BRT day → must be excluded.
          date_created: "2026-04-26T12:00:00.000Z",
          status: "cancelled",
          total_amount: 999,
          order_items: [
            { quantity: 3, unit_price: 333, item: { id: "MLB7", title: "Fora do dia" } },
          ],
        },
      ],
    };
    global.fetch = makeFetchRouter([
      { match: /order\.status=cancelled/, body: cancelledBody },
      { match: /sort=date_desc/, body: paidBody },
      { match: /\/items\?ids=/, body: [] },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const day = await provider.getProductsByDay("2026-04-24");

    // Paid side intact.
    expect(day.orders).toBe(1);
    expect(day.products.map((p) => p.itemId)).toContain("MLB1");
    // Cancelled side: only the same-day order counts.
    expect(day.cancelledOrders).toBe(1);
    expect(day.cancelledRevenue).toBe(80);
    expect(day.cancelledUnits).toBe(1);
    const cancelledIds = day.cancelledProducts.map((p) => p.itemId);
    expect(cancelledIds).toContain("MLB9");
    expect(cancelledIds).not.toContain("MLB7");
    expect(day.cancelledProducts[0].revenue).toBe(80);
  });
});
