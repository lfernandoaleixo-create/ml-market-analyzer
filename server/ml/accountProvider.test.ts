import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AccountProvider, brtDateKey } from "./accountProvider";
import { __clearVisitsStore } from "./visitsStore";
import { __clearVisitsDailyStore } from "./visitsDailyStore";

/** Wait for the detached background visits collector to settle. */
async function settle(ms = 30) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * In the progressive-collection model, getListings reads the per-item visits
 * SNAPSHOT (initially empty) and kicks a background collector. The visit total
 * therefore appears on the SECOND read, after the collector has resolved the
 * items. This helper performs that two-step: first call primes the collector,
 * then we settle and read again to get the populated snapshot.
 */
async function getListingsCollected(
  provider: AccountProvider,
  opts: { lastDays?: 7 | 30 | 90; includeVisitsSeries?: boolean } = {},
) {
  await provider.getListings(opts);
  await settle();
  return provider.getListings(opts);
}

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
  beforeEach(() => {
    vi.restoreAllMocks();
    __clearVisitsStore();
  });
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
    const res = await getListingsCollected(provider, { lastDays: 30 });

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
    const res = await getListingsCollected(provider, { lastDays: 90 });
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
    // No real visit data arrived: must be flagged unavailable + pending (NOT a real 0).
    expect(mlb9.visitsAvailable).toBe(false);
    expect(res.summary.visitsPending).toBe(true);
    expect(res.summary.visitsResolved).toBe(0);
    expect(res.summary.visitsAttempted).toBe(1);
  });

  it("marks visitsAvailable=true and NOT pending when ML returns a genuine 0", async () => {
    const idsPage = { paging: { total: 1 }, results: ["MLB7"] };
    const itemsBody = [
      {
        code: 200,
        body: {
          id: "MLB7",
          title: "Item com zero visitas reais",
          price: 15,
          currency_id: "BRL",
          available_quantity: 4,
          sold_quantity: 0,
          status: "active",
          listing_type_id: "gold_special",
        },
      },
    ];
    global.fetch = makeFetchRouter([
      { match: /\/users\/\d+\/items\/search/, body: idsPage },
      // ML explicitly answers 0 visits — this IS a real zero, not a miss.
      { match: /\/visits\/time_window/, body: { total_visits: 0 } },
      { match: /api\.mercadolibre\.com\/items\?ids=/, body: itemsBody },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const res = await getListingsCollected(provider, { lastDays: 30 });
    const mlb7 = res.items.find((i) => i.itemId === "MLB7")!;
    expect(mlb7.visits).toBe(0);
    expect(mlb7.visitsAvailable).toBe(true); // real 0, available
    expect(res.summary.visitsPending).toBe(false);
    expect(res.summary.visitsResolved).toBe(1);
  });

  it("is NOT pending when at least one item resolves (partial data)", async () => {
    const idsPage = { paging: { total: 2 }, results: ["MLB1", "MLB2"] };
    const itemsBody = [
      {
        code: 200,
        body: {
          id: "MLB1",
          title: "Resolveu",
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
          title: "Não resolveu",
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
      { match: /\/items\/MLB1\/visits\/time_window/, body: { total_visits: 100 } },
      { match: /\/items\/MLB2\/visits\/time_window/, body: {} }, // miss
      { match: /api\.mercadolibre\.com\/items\?ids=/, body: itemsBody },
    ]) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const res = await getListingsCollected(provider, { lastDays: 30 });
    expect(res.summary.visitsPending).toBe(false); // partial still renders
    expect(res.summary.visitsResolved).toBe(1);
    expect(res.summary.visitsAttempted).toBe(2);
    expect(res.items.find((i) => i.itemId === "MLB1")!.visitsAvailable).toBe(true);
    expect(res.items.find((i) => i.itemId === "MLB2")!.visitsAvailable).toBe(false);
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
    const res = await provider.getListings({ lastDays: 30, includeVisitsSeries: true });

    expect(Array.isArray(res.visitsSeries)).toBe(true);
    expect(res.visitsSeries.length).toBe(30); // zero-filled to a full 30-day window
    const map = Object.fromEntries(res.visitsSeries.map((p) => [p.date, p.visits]));
    // Only the ACTIVE listing (MLB1) contributes; paused MLB2 is excluded.
    expect(map[day1]).toBe(10);
    expect(map[day2]).toBe(20);
  });

  it("anchors the series to TODAY (Brazil time) as the last point, in real time", async () => {
    const idsPage = { results: ["MLB1"], paging: { total: 1, offset: 0, limit: 50 } };
    const itemsBody = [
      {
        code: 200,
        body: {
          id: "MLB1",
          title: "Active",
          price: 100,
          currency_id: "BRL",
          available_quantity: 5,
          sold_quantity: 1,
          status: "active",
          listing_type_id: "gold_pro",
        },
      },
    ];
    // The axis is anchored to the current BRAZIL (UTC-3) calendar day.
    const todayKey = brtDateKey(Date.now());
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      let body: any = {};
      if (/\/users\/\d+\/items\/search/.test(u)) body = idsPage;
      else if (/api\.mercadolibre\.com\/items\?ids=/.test(u)) body = itemsBody;
      else if (/\/items\/MLB1\/visits\/time_window/.test(u))
        body = {
          total_visits: 7,
          // ML returns dates in Brazil's offset; the series keys by that day.
          results: [{ date: `${todayKey}T00:00:00.000-03:00`, total: 7 }],
        };
      return { ok: true, json: async () => body } as any;
    }) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const res = await provider.getListings({ lastDays: 30, includeVisitsSeries: true });
    const last = res.visitsSeries[res.visitsSeries.length - 1];
    expect(last.date).toBe(todayKey);
    expect(last.visits).toBe(7);
  });

  it("on a Sunday EVENING in Brazil, the last point is still Sunday (not a future Monday)", async () => {
    // Freeze time at Sunday 2026-06-14 21:00 BRT, which is Monday 2026-06-15
    // 00:00 UTC. The buggy UTC anchor produced a spurious Monday point; the BRT
    // anchor must keep the last point on Sunday (today, still partial).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00.000Z")); // = 2026-06-14 21:00 BRT
    try {
      const idsPageS = { results: ["MLB1"], paging: { total: 1, offset: 0, limit: 50 } };
      const itemsBodyS = [
        { code: 200, body: { id: "MLB1", title: "Active", price: 100, currency_id: "BRL", available_quantity: 5, sold_quantity: 1, status: "active", listing_type_id: "gold_pro" } },
      ];
      global.fetch = vi.fn(async (url: any) => {
        const u = String(url);
        let body: any = {};
        if (/\/users\/\d+\/items\/search/.test(u)) body = idsPageS;
        else if (/api\.mercadolibre\.com\/items\?ids=/.test(u)) body = itemsBodyS;
        else if (/\/items\/MLB1\/visits\/time_window/.test(u))
          body = { total_visits: 5, results: [{ date: "2026-06-14T00:00:00.000-03:00", total: 5 }] };
        return { ok: true, json: async () => body } as any;
      }) as unknown as typeof fetch;

      const provider = new AccountProvider("token", USER_ID);
      const res = await provider.getListings({ lastDays: 30, includeVisitsSeries: true });
      const last = res.visitsSeries[res.visitsSeries.length - 1];
      expect(last.date).toBe("2026-06-14"); // Sunday (BRT), NOT Monday 06-15
      expect(last.visits).toBe(5);
      // And there is NO future day beyond today in the series.
      expect(res.visitsSeries.some((p) => p.date > "2026-06-14")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flags visitsSeriesPending when EVERY active item's time_window fails (429) — never a fake 'sem visitas'", async () => {
    const idsPage = { results: ["MLB1", "MLB2"], paging: { total: 2, offset: 0, limit: 50 } };
    const itemsBody = [
      { code: 200, body: { id: "MLB1", title: "Ativo A", price: 50, currency_id: "BRL", available_quantity: 10, sold_quantity: 5, status: "active", listing_type_id: "gold_special" } },
      { code: 200, body: { id: "MLB2", title: "Ativo B", price: 20, currency_id: "BRL", available_quantity: 8, sold_quantity: 2, status: "active", listing_type_id: "gold_special" } },
    ];
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      // The per-item daily visits endpoint is throttled for ALL items.
      if (/\/items\/MLB\d\/visits\/time_window/.test(u)) {
        return { ok: false, status: 429, json: async () => ({ message: "too many requests" }) } as any;
      }
      let body: any = {};
      if (/\/users\/\d+\/items\/search/.test(u)) body = idsPage;
      else if (/api\.mercadolibre\.com\/items\?ids=/.test(u)) body = itemsBody;
      // The window map (KPI visits) also fails, but that path is independent.
      return { ok: true, json: async () => body } as any;
    }) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const res = await provider.getListings({ lastDays: 30, includeVisitsSeries: true });

    // Series is zero-filled (axis intact) but flagged pending so the UI shows
    // "carregando" instead of falsely claiming the account has no visits.
    expect(res.visitsSeries.length).toBe(30);
    expect(res.visitsSeries.every((p) => p.visits === 0)).toBe(true);
    expect(res.visitsSeriesPending).toBe(true);
  });

  it("recovers a TRANSIENT network failure on the first visits call (retry), so the chart is NOT stuck pending", async () => {
    // Reproduces the production bug: the ML egress drops the FIRST connection
    // (fetch throws — NOT an HTTP status), which used to return null and zero the
    // item. With the network retry, the 2nd attempt succeeds and the series fills.
    const idsPage = { results: ["MLB1"], paging: { total: 1, offset: 0, limit: 50 } };
    const itemsBody = [
      { code: 200, body: { id: "MLB1", title: "Ativo A", price: 50, currency_id: "BRL", available_quantity: 10, sold_quantity: 5, status: "active", listing_type_id: "gold_special" } },
    ];
    const day1 = "2026-06-01";
    let visitCalls = 0;
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/items\/MLB1\/visits\/time_window/.test(u)) {
        visitCalls += 1;
        // First attempt: simulate a dropped socket / timeout (fetch rejects).
        if (visitCalls === 1) throw new TypeError("fetch failed");
        // Retry: succeeds.
        return { ok: true, json: async () => ({ total_visits: 8, results: [{ date: `${day1}T00:00:00.000-03:00`, total: 8 }] }) } as any;
      }
      let body: any = {};
      if (/\/users\/\d+\/items\/search/.test(u)) body = idsPage;
      else if (/api\.mercadolibre\.com\/items\?ids=/.test(u)) body = itemsBody;
      return { ok: true, json: async () => body } as any;
    }) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const res = await provider.getListings({ lastDays: 30, includeVisitsSeries: true });
    const map = Object.fromEntries(res.visitsSeries.map((p) => [p.date, p.visits]));
    expect(visitCalls).toBeGreaterThanOrEqual(2); // it retried
    expect(map[day1]).toBe(8); // data recovered after the transient failure
    expect(res.visitsSeriesPending).toBe(false);
  });

  it("counts an item that ML answered with ZERO visits as resolved (not a fake pending)", async () => {
    // A small store can legitimately have items with 0 visits in the window. ML
    // still ANSWERS (valid time_window shape, empty/zero results). That must count
    // as resolved so the chart renders an honest zero instead of "Carregando".
    const idsPage = { results: ["MLB1"], paging: { total: 1, offset: 0, limit: 50 } };
    const itemsBody = [
      { code: 200, body: { id: "MLB1", title: "Ativo A", price: 50, currency_id: "BRL", available_quantity: 10, sold_quantity: 0, status: "active", listing_type_id: "gold_special" } },
    ];
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/items\/MLB1\/visits\/time_window/.test(u)) {
        // Valid answer, but no visits in the window.
        return { ok: true, json: async () => ({ item_id: "MLB1", total_visits: 0, results: [] }) } as any;
      }
      let body: any = {};
      if (/\/users\/\d+\/items\/search/.test(u)) body = idsPage;
      else if (/api\.mercadolibre\.com\/items\?ids=/.test(u)) body = itemsBody;
      return { ok: true, json: async () => body } as any;
    }) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const res = await provider.getListings({ lastDays: 30, includeVisitsSeries: true });
    expect(res.visitsSeries.length).toBe(30);
    expect(res.visitsSeries.every((p) => p.visits === 0)).toBe(true);
    // The item ANSWERED (zero) — so NOT pending. This is the key distinction.
    expect(res.visitsSeriesPending).toBe(false);
  });

  it("keeps the visits collected from healthy items when ONE item fails (no whole-series wipe, not pending)", async () => {
    const idsPage = { results: ["MLB1", "MLB2"], paging: { total: 2, offset: 0, limit: 50 } };
    const itemsBody = [
      { code: 200, body: { id: "MLB1", title: "Ativo A", price: 50, currency_id: "BRL", available_quantity: 10, sold_quantity: 5, status: "active", listing_type_id: "gold_special" } },
      { code: 200, body: { id: "MLB2", title: "Ativo B", price: 20, currency_id: "BRL", available_quantity: 8, sold_quantity: 2, status: "active", listing_type_id: "gold_special" } },
    ];
    const day1 = "2026-06-01";
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      // MLB2 is throttled, but MLB1 answers normally — its visits MUST survive.
      if (/\/items\/MLB2\/visits\/time_window/.test(u)) {
        return { ok: false, status: 429, json: async () => ({ message: "too many requests" }) } as any;
      }
      let body: any = {};
      if (/\/users\/\d+\/items\/search/.test(u)) body = idsPage;
      else if (/api\.mercadolibre\.com\/items\?ids=/.test(u)) body = itemsBody;
      else if (/\/items\/MLB1\/visits\/time_window/.test(u))
        body = { total_visits: 12, results: [{ date: `${day1}T00:00:00.000-04:00`, total: 12 }] };
      return { ok: true, json: async () => body } as any;
    }) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const res = await provider.getListings({ lastDays: 30, includeVisitsSeries: true });

    const map = Object.fromEntries(res.visitsSeries.map((p) => [p.date, p.visits]));
    expect(map[day1]).toBe(12); // MLB1's data preserved despite MLB2 failing
    expect(res.visitsSeriesPending).toBe(false); // at least one item resolved
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


describe("AccountProvider retry-on-401 (token refresh resilience)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  function resWithStatus(status: number, body: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  }

  it("refreshes the token and retries once when a request returns 401", async () => {
    let call = 0;
    const fetchSpy = vi.fn(async (input: string | URL, init?: RequestInit) => {
      call += 1;
      const auth = (init?.headers as Record<string, string> | undefined)?.["Authorization"];
      // First call uses the stale token and is rejected with 401.
      if (call === 1) {
        expect(auth).toBe("Bearer STALE");
        return resWithStatus(401, { message: "invalid token" });
      }
      // Retry uses the fresh token and succeeds.
      expect(auth).toBe("Bearer FRESH");
      return resWithStatus(200, { id: USER_ID, nickname: "LOJADOSRWU", seller_reputation: {} });
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const onUnauthorized = vi.fn(async (stale: string) => {
      expect(stale).toBe("STALE");
      return "FRESH";
    });

    const provider = new AccountProvider("STALE", USER_ID, "BRL", onUnauthorized);
    const rep = await provider.getReputation();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(rep?.nickname).toBe("LOJADOSRWU");
  });

  it("does not loop forever: a second 401 after refresh returns null", async () => {
    const fetchSpy = vi.fn(async () => resWithStatus(401, { message: "still bad" }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const onUnauthorized = vi.fn(async () => "FRESH");
    const provider = new AccountProvider("STALE", USER_ID, "BRL", onUnauthorized);
    const rep = await provider.getReputation();

    // Original request + exactly one retry = 2 fetches; no infinite loop.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(rep).toBeNull();
  });

  it("does not retry when no onUnauthorized callback is provided", async () => {
    const fetchSpy = vi.fn(async () => resWithStatus(401, { message: "bad" }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new AccountProvider("STALE", USER_ID);
    const rep = await provider.getReputation();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(rep).toBeNull();
  });
});


describe("AccountProvider rate-limit (429) resilience", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  function resWithHeaders(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
      json: async () => body,
    } as unknown as Response;
  }

  it("retries after a 429 and succeeds on the next attempt", async () => {
    let call = 0;
    const fetchSpy = vi.fn(async () => {
      call += 1;
      // First attempt is rate-limited with a tiny Retry-After, then succeeds.
      if (call === 1) return resWithHeaders(429, { message: "too many requests" }, { "retry-after": "0" });
      return resWithHeaders(200, { id: USER_ID, nickname: "LOJADOSRWU", seller_reputation: {} });
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const rep = await provider.getReputation();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(rep?.nickname).toBe("LOJADOSRWU");
  });

  it("gives up after MAX_RATE_LIMIT_RETRIES consecutive 429s and SIGNALS the rate limit (no fake empty)", async () => {
    const fetchSpy = vi.fn(async () => resWithHeaders(429, { message: "nope" }, { "retry-after": "0" }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const { MLRateLimitError } = await import("./accountProvider");
    const provider = new AccountProvider("token", USER_ID);

    // After exhausting retries we now THROW (so the UI shows an honest retry)
    // instead of returning null (which used to be masked as an empty dashboard).
    await expect(provider.getReputation()).rejects.toBeInstanceOf(MLRateLimitError);
    // Original attempt + MAX_RATE_LIMIT_RETRIES retries.
    expect(fetchSpy).toHaveBeenCalledTimes(AccountProvider.MAX_RATE_LIMIT_RETRIES + 1);
  });
});


describe("AccountProvider rate limit (429) handling", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  /** A 429 Response carrying a Retry-After header. */
  function rateLimited(retryAfterSec = 1): Response {
    return {
      ok: false,
      status: 429,
      headers: { get: (k: string) => (k.toLowerCase() === "retry-after" ? String(retryAfterSec) : null) },
      json: async () => ({}),
    } as unknown as Response;
  }

  it("throws MLRateLimitError (not a fake empty result) when ML keeps returning 429", async () => {
    // Always 429 — exhausts the internal retries, then must SIGNAL the rate limit
    // instead of masking it as null/zeros (which produced the fake R$ 0,00 demo).
    global.fetch = vi.fn(async () => rateLimited(1)) as unknown as typeof fetch;
    const { MLRateLimitError } = await import("./accountProvider");
    const provider = new AccountProvider("token", USER_ID);
    await expect(provider.getReputation()).rejects.toBeInstanceOf(MLRateLimitError);
  });

  it("recovers when ML returns 429 once then succeeds (server-side retry)", async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return rateLimited(0); // first hit throttled
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ id: USER_ID, nickname: "LOJADOSRWU", seller_reputation: {} }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const rep = await provider.getReputation();
    expect(rep).not.toBeNull();
    expect(rep!.nickname).toBe("LOJADOSRWU");
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});


describe("AccountProvider.getDailyVisitsBreakdown", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Limpa os dois stores progressivos entre os testes.
    __clearVisitsStore();
    __clearVisitsDailyStore();
  });
  afterEach(() => vi.restoreAllMocks());

  /**
   * Helper: prime o coletor (1ª leitura vem vazia), espera o background settle e
   * lê de novo — espelha o modelo progressivo do breakdown diário.
   */
  async function collectDaily(provider: AccountProvider, ids: string[], days: 4 | 7 = 4) {
    provider.getDailyVisitsBreakdown(ids, days);
    await settle();
    return provider.getDailyVisitsBreakdown(ids, days);
  }

  it("monta a série diária por item (hoje + 3 dias atrás), zero-preenchida e ancorada em BRT", async () => {
    // ML responde com 2 dos 4 dias preenchidos; os outros devem virar 0.
    const today = brtDateKey(Date.now());
    const DAY = 24 * 60 * 60 * 1000;
    const yest = brtDateKey(Date.now() - DAY);
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/items\/MLB1\/visits\/time_window/.test(u)) {
        return {
          ok: true,
          json: async () => ({
            item_id: "MLB1",
            total_visits: 30,
            results: [
              { date: `${yest}T00:00:00.000-03:00`, total: 10 },
              { date: `${today}T00:00:00.000-03:00`, total: 20 },
            ],
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    }) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const res = await collectDaily(provider, ["MLB1"], 4);
    const series = res.perItem.get("MLB1");
    expect(series).toBeDefined();
    expect(series!.length).toBe(4); // hoje + 3 dias atrás
    // Eixo do mais antigo -> hoje; último ponto é hoje.
    expect(series![3].date).toBe(today);
    expect(series![3].visits).toBe(20);
    expect(series![2].date).toBe(yest);
    expect(series![2].visits).toBe(10);
    // Os 2 dias mais antigos não vieram no payload -> 0.
    expect(series![0].visits).toBe(0);
    expect(series![1].visits).toBe(0);
    expect(res.resolved).toBe(1);
    expect(res.attempted).toBe(1);
  });

  it("conta item que o ML respondeu com ZERO visitas como resolvido (série toda 0, não pendente)", async () => {
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/items\/MLB9\/visits\/time_window/.test(u)) {
        return { ok: true, json: async () => ({ item_id: "MLB9", total_visits: 0, results: [] }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    }) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const res = await collectDaily(provider, ["MLB9"], 4);
    const series = res.perItem.get("MLB9");
    expect(series).toBeDefined();
    expect(series!.length).toBe(4);
    expect(series!.every((p) => p.visits === 0)).toBe(true);
    expect(res.resolved).toBe(1); // respondeu (zero) => resolvido
  });

  it("um item que falha (429) NÃO entra no resultado e mantém collecting=true (retry no próximo poll)", async () => {
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/items\/MLBFAIL\/visits\/time_window/.test(u)) {
        return { ok: false, status: 429, json: async () => ({ message: "too many requests" }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    }) as unknown as typeof fetch;

    const provider = new AccountProvider("token", USER_ID);
    const res = await collectDaily(provider, ["MLBFAIL"], 4);
    expect(res.perItem.has("MLBFAIL")).toBe(false); // não resolvido
    expect(res.resolved).toBe(0);
    expect(res.collecting).toBe(true); // segue coletando para tentar de novo
  });
});
