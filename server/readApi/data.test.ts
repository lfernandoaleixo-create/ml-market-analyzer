import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { ReadApiQuery } from "../../shared/readApi";

const state = vi.hoisted(() => ({
  getDb: vi.fn(), credentials: vi.fn(), resolveOwner: vi.fn(), token: vi.fn(),
  fetch: vi.fn(), listings: vi.fn(), visits: vi.fn(), specs: vi.fn(), sales: vi.fn(),
  reputation: vi.fn(), ads: vi.fn(), accountConstructor: vi.fn(), adsConstructor: vi.fn(),
  accountTransportPath: undefined as string | string[] | undefined,
  adsTransportPath: undefined as string | undefined,
  forbiddenWrite: vi.fn(() => { throw new Error("Mutation forbidden"); }),
}));
vi.mock("../db", () => ({ getDb: state.getDb }));
vi.mock("../dbMl", () => ({ getCredentials: state.credentials, resolveMlOwnerUserId: state.resolveOwner, upsertCredentials: state.forbiddenWrite }));
vi.mock("../ml/oauthMl", () => ({ ensureUserAccessToken: state.token, forceRefreshUserAccessToken: state.forbiddenWrite }));
vi.mock("../ml/accountProvider", () => {
  class AccountProvider {
    constructor(...args: unknown[]) { state.accountConstructor(...args); }
    private get(_path: string): Promise<unknown> { throw new Error("Unsafe provider transport was not replaced"); }
    private async transport() {
      const paths = Array.isArray(state.accountTransportPath) ? state.accountTransportPath : state.accountTransportPath ? [state.accountTransportPath] : [];
      for (const path of paths) await this.get(path);
    }
    async getListings(options: unknown) { await this.transport(); return state.listings(options); }
    async getVisitsSeriesOnly(days: number) { await this.transport(); return state.visits(days); }
    async getTechnicalSpecs(options: unknown) { await this.transport(); return state.specs(options); }
    async getSalesDashboard(options: unknown) { await this.transport(); return state.sales(options); }
    async getReputation() { await this.transport(); return state.reputation(); }
  }
  return { AccountProvider };
});
vi.mock("../ml/adsProvider", () => {
  class AdsProvider {
    constructor(...args: unknown[]) { state.adsConstructor(...args); }
    private get(_path: string): Promise<unknown> { throw new Error("Unsafe provider transport was not replaced"); }
    async getDashboard(days: number) {
      if (state.adsTransportPath) await this.get(state.adsTransportPath);
      return state.ads(days);
    }
  }
  return { AdsProvider };
});

import { loadReadApiData, ReadApiDataError } from "./data";
import { __clearAccountCache, cachedAccountResilient } from "../ml/accountCache";

const dialect = new MySqlDialect();
const query: ReadApiQuery = { limit: 2, offset: 0, days: 30 };
const forbidden = { createdBy: 7, uploadedBy: 8, ownerId: 99, userId: 101, fileKey: "internal", key: "internal", accessToken: "SECRET", credentials: { token: "SECRET" }, lastError: "SECRET", leaseToken: "SECRET", snapshotPayload: "SECRET", statusMessage: "SECRET", buyer: { email: "private@example.test" }, rawOrders: [{ buyer: "PRIVATE" }] };
function response(value: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: vi.fn(async () => value) } as unknown as Response;
}
const activeCountPath = "https://api.mercadolibre.com/users/3308178634/items/search?status=active&limit=1&offset=0";
function activePage(total: number) {
  return { results: total > 0 ? ["MLB1"] : [], paging: { total, limit: 1, offset: 0 } };
}
function orderPage(total: number, offset = 0) {
  return { results: Array.from({ length: Math.min(50, Math.max(0, total - offset)) }, (_, i) => ({
    id: offset + i, date_created: "2026-11-12T10:00:00Z", total_amount: 10,
    order_items: [{ quantity: 1, unit_price: 10, item: { id: "MLB1" } }],
  })), paging: { total, offset, limit: 50 } };
}
interface SelectCall {
  fields: Record<string, unknown>; table?: string; where?: SQL; limit?: number; offset?: number;
  order: unknown[]; joins: { table: string; condition: SQL }[];
}
let calls: SelectCall[];
let rows: Record<string, unknown>[];
function database() {
  return {
    insert: state.forbiddenWrite, update: state.forbiddenWrite, delete: state.forbiddenWrite,
    execute: state.forbiddenWrite, transaction: state.forbiddenWrite,
    select: vi.fn((fields: Record<string, unknown>) => {
      if (!fields || Object.keys(fields).length === 0) throw new Error("SELECT * forbidden");
      const call: SelectCall = { fields, order: [], joins: [] };
      calls.push(call);
      const chain = {
        from(table: Parameters<typeof getTableName>[0]) { call.table = getTableName(table); return chain; },
        where(condition: SQL) { call.where = condition; return chain; },
        innerJoin(table: Parameters<typeof getTableName>[0], condition: SQL) { call.joins.push({ table: getTableName(table), condition }); return chain; },
        orderBy(...order: unknown[]) { call.order = order; return chain; },
        limit(limit: number) { call.limit = limit; return chain; },
        offset(offset: number) { call.offset = offset; return chain; },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          // Deliberately include unexpected keys: response shaping must also be safe.
          return Promise.resolve(rows.slice(0, call.limit)).then(resolve, reject);
        },
      };
      return chain;
    }),
  };
}
function predicate(call = calls[0]) {
  return call.where ? dialect.sqlToQuery(call.where) : { sql: "", params: [] };
}
function catalogPayload() {
  return JSON.stringify({ version: 1, records: [{
    id: "product-1", createdAt: "2026-01-01", updatedAt: "2026-01-02", goal: 20,
    mode: "target", status: "draft", resultPrice: null, userId: 999, credentials: "SECRET",
    input: { description: "Produto comercial", productSku: "SKU-01", productType: "single", cost: 12,
      createdBy: 888, credentials: "SECRET", kitItems: [{ id: "kit-1", quantity: 1, unitCost: 12, description: "Peça", sku: "P01", uploadedBy: 999, credentials: "SECRET" }] },
  }] });
}

beforeEach(() => {
  vi.resetAllMocks();
  __clearAccountCache();
  calls = [];
  rows = [];
  state.getDb.mockResolvedValue(database());
  state.resolveOwner.mockResolvedValue(42);
  state.credentials.mockResolvedValue({ mlUserId: 1234, status: "connected", siteId: "MLB", accessToken: "MOCK_TOKEN" });
  state.token.mockResolvedValue("MOCK_TOKEN");
  state.fetch.mockImplementation(async (url: string) => response(url === activeCountPath
    ? activePage(3) : { id: 3308178634, nickname: "TOUJOURS", email: "private@example.test" }));
  vi.stubGlobal("fetch", state.fetch);
  state.accountTransportPath = undefined;
  state.adsTransportPath = undefined;
  state.listings.mockResolvedValue({ summary: { total: 3, active: 3, visitsAttempted: 3, visitsResolved: 2, totalVisits: 9, visitsPending: false, visitsCollecting: true, capped: false, ...forbidden }, items: [
    { itemId: "MLB1", title: "Bambu", sku: "SKU1", visits: 9, visitsAvailable: true, conversion: 0.2, ...forbidden },
    { itemId: "MLB2", title: "Madeira", sku: "SKU2", visits: 0, visitsAvailable: false, conversion: 0, ...forbidden },
    { itemId: "MLB3", title: "Fibra", sku: "SKU3", visits: 0, visitsAvailable: true, conversion: null, ...forbidden },
  ] });
  state.visits.mockResolvedValue({ series: [{ date: "2026-11-10", visits: 9 }, { date: "2026-11-11", visits: 0 }, { date: "2026-11-12", visits: 2 }], attempted: 3, resolved: 2 });
  state.specs.mockResolvedValue({ summary: { total: 1, capped: false, ...forbidden }, items: [{ itemId: "MLB1", title: "Ficha", attributes: [{ id: "BRAND", name: "Marca", required: true, valueName: null, isMissing: true, ...forbidden }], ...forbidden }] });
  state.sales.mockResolvedValue({ kpis: { revenue: 120, orders: 3, unitsSold: 4, currency: "BRL", ...forbidden }, daily: [{ date: "2026-11-12", revenue: 120, orders: 3, ...forbidden }], topProducts: [{ itemId: "MLB1", title: "Produto", unitsSold: 4, revenue: 120, ...forbidden }], from: 1, to: 2, ...forbidden });
  state.reputation.mockResolvedValue({ nickname: "TOUJOURS", transactionsTotal: 3, metrics: { claimsRate: 0, ...forbidden }, ...forbidden });
  state.ads.mockResolvedValue({ connection: "connected", summary: { advertiserId: 333, campaignCount: 1, metrics: { clicks: 2, cost: 3, ...forbidden }, derived: { roas: 2, ...forbidden }, ...forbidden }, topCampaigns: [{ id: 10, name: "Campanha", metrics: { clicks: 2, ...forbidden }, ...forbidden }], topAds: [{ itemId: "MLB1", title: "Produto", metrics: { cost: 3, ...forbidden }, ...forbidden }], insightsCount: 1, ...forbidden });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const localRoutes = [
  ["/products", "project_products"], ["/sku", "sku_sheet_rows"], ["/sku/variations", "sku_variations"],
  ["/sku/columns", "sku_sheet_custom_columns"], ["/kits", "kit_sheet_rows"],
  ["/packaging", "embalagem_sheet_rows"], ["/documents", "project_documents"],
  ["/pricing/products", "alpha_catalog_products"], ["/pricing/pdfs", "alpha_pdf_exports"],
] as const;

describe("SELECT-only local resources", () => {
  it.each(localRoutes)("%s has explicit projection, limit+1 and stable ordering", async (path, table) => {
    rows = path === "/pricing/products" ? Array.from({ length: 3 }, () => ({ id: "product-1", recordPayload: catalogPayload(), version: 1, createdAt: 1, updatedAt: 2, ...forbidden })) : Array.from({ length: 3 }, (_, id) => ({ id, name: "Nome", produto: "Produto", url: "https://example.test/file", status: "ready", ...forbidden }));
    const result = await loadReadApiData(path, 42, { ...query, offset: 5 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table, limit: 3, offset: 5 });
    expect(calls[0].order.length).toBeGreaterThan(0);
    for (const key of Object.keys(forbidden)) expect(Object.keys(calls[0].fields)).not.toContain(key);
    expect(result.meta).toEqual({ limit: 2, offset: 5, hasMore: true });
    expect(result.data).toHaveLength(2);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|private@example|rawOrders|createdBy|uploadedBy|fileKey|leaseToken|ownerId|userId/);
    expect(state.forbiddenWrite).not.toHaveBeenCalled();
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.token).not.toHaveBeenCalled();
  });
  it("clamps oversized limits, negative offsets and handles the final page", async () => {
    rows = [{ id: 1 }];
    const result = await loadReadApiData("/products", 42, { limit: 10000, offset: -20, days: 30 });
    expect(calls[0]).toMatchObject({ limit: 101, offset: 0 });
    expect(result.meta).toEqual({ limit: 100, offset: 0, hasMore: false });
  });
  it("escapes LIKE wildcards and binds hostile strings as parameters", async () => {
    await loadReadApiData("/products", 42, { ...query, search: "50%_!\\' OR 1=1 --" });
    const compiled = predicate();
    expect(compiled.sql).toContain("ESCAPE '!'");
    expect(compiled.sql).not.toContain("OR 1=1");
    expect(compiled.params).toContain("%50!%!_!!!\\' OR 1=1 --%");
  });
  it("global products use productId, never invented creator ownership", async () => {
    await loadReadApiData("/products", 999, { ...query, productId: 17 });
    expect(predicate().sql).toContain("`project_products`.`id` = ?");
    expect(predicate().params).toEqual([17]);
    expect(predicate().sql).not.toMatch(/createdBy|ownerId|userId/);
  });
  it("SKU excludes tombstones and filters commercial productNumber and rowId", async () => {
    await loadReadApiData("/sku", 42, { ...query, productId: 17, rowId: 3 });
    expect(predicate().sql).toContain("`sku_sheet_rows`.`isDeleted` = ?");
    expect(predicate().sql).toContain("`sku_sheet_rows`.`productNumber` = ?");
    expect(predicate().params).toEqual([false, 3, 17]);
  });
  it("variation parent inner join excludes orphaned/deleted parent rows and own tombstones", async () => {
    await loadReadApiData("/sku/variations", 42, { ...query, productId: 17, rowId: 3 });
    expect(calls[0].joins).toHaveLength(1);
    expect(calls[0].joins[0].table).toBe("sku_sheet_rows");
    expect(dialect.sqlToQuery(calls[0].joins[0].condition).sql).toContain("`sku_variations`.`skuRowId` = `sku_sheet_rows`.`id`");
    expect(predicate().sql).toContain("`sku_variations`.`isDeleted` = ?");
    expect(predicate().sql).toContain("`sku_sheet_rows`.`isDeleted` = ?");
    expect(predicate().params).toEqual([false, false, 3, 17]);
  });
  it("documents expose metadata and URL without internal storage/upload identity", async () => {
    rows = [{ id: 1, productId: 7, name: "PDF", type: "documento", url: "https://example.test/pdf", ...forbidden }];
    const result = await loadReadApiData("/documents", 42, { ...query, productId: 7, rowId: 1 });
    expect(predicate().params).toEqual([7, 1]);
    expect(result.data).toEqual([{ id: 1, productId: 7, name: "PDF", type: "documento", url: "https://example.test/pdf" }]);
  });
  it("calculator catalog uses the key owner, safe nested projection and SQL JSON search", async () => {
    rows = [{ id: "product-1", recordPayload: catalogPayload(), version: 3, createdAt: 1, updatedAt: 2 }];
    const result = await loadReadApiData("/pricing/products", 777, { ...query, search: "Peça%", productId: 12 });
    expect(predicate().sql).toContain("`alpha_catalog_products`.`ownerId` = ?");
    expect(predicate().params).toContain(777);
    expect(predicate().params).toContain("12");
    expect(predicate().sql).toContain("JSON_EXTRACT");
    expect(predicate().params).toContain("%Peça!%%");
    expect(state.resolveOwner).not.toHaveBeenCalled();
    expect((result.data as any[])[0].input).toMatchObject({ cost: 12, productSku: "SKU-01" });
    expect(JSON.stringify(result)).not.toMatch(/SECRET|ownerId|userId|createdBy|recordPayload/);
  });
  it("PDF query is owner-isolated and completed/ready only", async () => {
    await loadReadApiData("/pricing/pdfs", 777, { ...query, productId: 12, rowId: 9 });
    expect(predicate().sql).toContain("`alpha_pdf_exports`.`ownerId` = ?");
    expect(predicate().sql).toContain("`alpha_pdf_exports`.`status` = ?");
    expect(predicate().params).toEqual([777, "ready", 12, 9]);
    expect(state.resolveOwner).not.toHaveBeenCalled();
  });
  it("unavailable DB and corrupt catalog are safe failures, not empty arrays", async () => {
    state.getDb.mockResolvedValueOnce(null);
    await expect(loadReadApiData("/products", 42, query)).rejects.toMatchObject({ status: 503, code: "DATA_UNAVAILABLE" });
    rows = [{ id: "product-1", recordPayload: "CORRUPT SECRET" }];
    await expect(loadReadApiData("/pricing/products", 42, query)).rejects.toMatchObject({ status: 503, code: "DATA_UNAVAILABLE" });
  });
  it("unknown resource and invalid key owner fail before any I/O", async () => {
    await expect(loadReadApiData("/users", 42, query)).rejects.toMatchObject({ status: 404 });
    await expect(loadReadApiData("/sku", 0, query)).rejects.toMatchObject({ status: 403 });
    expect(state.getDb).not.toHaveBeenCalled();
    expect(state.fetch).not.toHaveBeenCalled();
  });
});

describe("verified ML identity and bounded external cache", () => {
  it.each(["/store", "/listings", "/visits", "/technical-specs", "/sales", "/ads"])("%s verifies users/me before even a fresh cache hit", async path => {
    await loadReadApiData(path, 777, query);
    state.fetch.mockResolvedValueOnce(response({ id: 9999, nickname: "TOUJOURS" }));
    await expect(loadReadApiData(path, 777, query)).rejects.toMatchObject({ status: 403, code: "ML_SELLER_MISMATCH" });
    expect(state.fetch).toHaveBeenCalledTimes(path === "/visits" ? 3 : 2);
    expect(state.fetch.mock.calls.filter(([url]) => url.endsWith("/users/me"))).toHaveLength(2);
    expect(state.resolveOwner).toHaveBeenCalledWith(777);
    expect(state.credentials).toHaveBeenCalledWith(42);
    expect(state.token).toHaveBeenCalledWith(42);
    expect(state.forbiddenWrite).not.toHaveBeenCalled();
  });
  it("seller id is authoritative; a different nickname is diagnostic, persisted id is ignored", async () => {
    state.fetch.mockResolvedValue(response({ id: "3308178634", nickname: "NEW_NICKNAME" }));
    const result = await loadReadApiData("/store", 777, query);
    expect(result.meta?.sellerId).toBe(3308178634);
    expect(state.accountConstructor).toHaveBeenCalledWith("MOCK_TOKEN", 3308178634, "BRL");
    expect(state.forbiddenWrite).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500, 503])("users/me HTTP %s cannot serve even a fresh snapshot", async status => {
    await loadReadApiData("/listings", 42, query);
    const failed = response({ id: 3308178634, message: "SECRET upstream failure" }, status);
    state.fetch.mockResolvedValueOnce(failed);
    await expect(loadReadApiData("/listings", 42, query)).rejects.toMatchObject({ status: status === 429 ? 429 : 502 });
    expect(failed.json).not.toHaveBeenCalled();
    expect(state.listings).toHaveBeenCalledTimes(1);
  });
  it("invalid identity, body parse and network failures are sanitized", async () => {
    state.fetch.mockResolvedValueOnce(response({ nickname: "TOUJOURS" }));
    await expect(loadReadApiData("/store", 42, query)).rejects.toMatchObject({ code: "ML_UNAVAILABLE" });
    state.fetch.mockRejectedValueOnce(new Error("SECRET network credentials"));
    await expect(loadReadApiData("/store", 42, query)).rejects.toMatchObject({ message: "Não foi possível confirmar os dados no Mercado Livre. Tente novamente em instantes." });
    state.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error("SECRET invalid JSON"); } });
    await expect(loadReadApiData("/store", 42, query)).rejects.toBeInstanceOf(ReadApiDataError);
    expect(state.accountConstructor).not.toHaveBeenCalled();
  });
  it("identity deadline covers a fetch that ignores cancellation", async () => {
    vi.useFakeTimers();
    state.fetch.mockImplementationOnce(() => new Promise(() => {}));
    const load = loadReadApiData("/store", 42, query);
    const rejected = expect(load).rejects.toMatchObject({ code: "ML_UNAVAILABLE", status: 502 });
    await vi.advanceTimersByTimeAsync(12_001);
    await rejected;
    const options = state.fetch.mock.calls[0][1];
    expect(options.signal.aborted).toBe(true);
    expect(options.method).toBe("GET");
  });
  it("missing OAuth never calls users/me, provider or manual refresh", async () => {
    state.token.mockResolvedValueOnce(null);
    await expect(loadReadApiData("/ads", 42, query)).rejects.toMatchObject({ code: "ML_NOT_CONNECTED" });
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.ads).not.toHaveBeenCalled();
    expect(state.forbiddenWrite).not.toHaveBeenCalled();
  });
  it("pagination and literal search occur after bounded aggregate cache", async () => {
    const first = await loadReadApiData("/listings", 42, query);
    const second = await loadReadApiData("/listings", 42, { ...query, offset: 2 });
    const search = await loadReadApiData("/listings", 42, { ...query, search: "Madeira" });
    expect((first.data as any).items).toHaveLength(2);
    expect(first.meta).toMatchObject({ limit: 2, offset: 0, hasMore: true, partial: true });
    expect((second.data as any).items[0].itemId).toBe("MLB3");
    expect(second.meta?.hasMore).toBe(false);
    expect((search.data as any).items[0].itemId).toBe("MLB2");
    expect(state.listings).toHaveBeenCalledTimes(1);
    expect(state.fetch).toHaveBeenCalledTimes(3);
  });
  it("days parameter defaults/clamps and namespaces each supported window", async () => {
    await loadReadApiData("/visits", 42, { ...query, days: 365 });
    await loadReadApiData("/visits", 42, { ...query, days: 30 });
    await loadReadApiData("/visits", 42, { ...query, days: 7 });
    expect(state.visits).toHaveBeenCalledTimes(2);
    expect(state.visits).toHaveBeenNthCalledWith(1, 30);
    expect(state.visits).toHaveBeenNthCalledWith(2, 7);
  });
  it("uses five-minute TTL and preserves stale/asOf on upstream failure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
    const first = await loadReadApiData("/listings", 42, query);
    await vi.advanceTimersByTimeAsync(299_000);
    await loadReadApiData("/listings", 42, query);
    expect(state.listings).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    state.listings.mockRejectedValueOnce(new Error("SECRET upstream"));
    const stale = await loadReadApiData("/listings", 42, query);
    expect(stale.meta?.stale).toBe(true);
    expect(stale.meta?.asOf).toBe(first.meta?.asOf);
    expect(stale.data).toEqual(first.data);
    state.fetch.mockResolvedValueOnce(response({ id: 999, nickname: "TOUJOURS" }));
    await expect(loadReadApiData("/listings", 42, query)).rejects.toMatchObject({ code: "ML_SELLER_MISMATCH" });
  });
  it("rejects a cached envelope belonging to a different identity", async () => {
    await cachedAccountResilient(3308178634, "public-read-api:v1:3308178634:/listings:30", async () => ({ sellerId: 999, result: { data: { summary: {}, items: [] } } }));
    await expect(loadReadApiData("/listings", 42, query)).rejects.toMatchObject({ code: "ML_SELLER_MISMATCH" });
    expect(state.listings).not.toHaveBeenCalled();
  });
});

describe("provider projection, partial data and strict read transport", () => {
  it("listings pending values are null; real resolved zero remains zero", async () => {
    const result = await loadReadApiData("/listings", 42, query);
    expect((result.data as any).items[0]).toMatchObject({ visits: 9, pending: false });
    expect((result.data as any).items[1]).toMatchObject({ visits: null, conversion: null, visitsAvailable: false, pending: true });
    const last = await loadReadApiData("/listings", 42, { ...query, offset: 2 });
    expect((last.data as any).items[0]).toMatchObject({ visits: 0, visitsAvailable: true, pending: false });
    expect(result.meta?.partial).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|credentials|buyer|rawOrders|userId/);
  });
  it("store transport rejects missing reputation instead of defaulting to zero", async () => {
    state.accountTransportPath = "/users/me";
    await expect(loadReadApiData("/store", 42, query)).rejects.toMatchObject({ code: "ML_UNAVAILABLE", status: 502 });
    expect(state.reputation).not.toHaveBeenCalled();
  });
  it("store transport accepts confirmed numeric reputation only", async () => {
    state.accountTransportPath = "/users/me";
    const me = { id: 3308178634, points: 0, seller_reputation: { transactions: { total: 0, completed: 0, canceled: 0, ratings: { positive: 0, neutral: 0, negative: 0 } } } };
    state.fetch.mockResolvedValueOnce(response({ id: 3308178634 })).mockResolvedValueOnce(response(me));
    await loadReadApiData("/store", 42, query);
    expect(state.reputation).toHaveBeenCalledTimes(1);
  });
  it("unresolved visits cannot cache an all-zero series", async () => {
    state.visits.mockResolvedValueOnce({ attempted: 47, resolved: 0, series: [{ date: "2026-11-12", visits: 0 }] });
    await expect(loadReadApiData("/visits", 42, query)).rejects.toMatchObject({ status: 502, code: "ML_UNAVAILABLE" });
    const next = await loadReadApiData("/visits", 42, query);
    expect((next.data as any).items[0].visits).toBe(9);
    expect(state.visits).toHaveBeenCalledTimes(2);
  });
  it("visits exposes attempted/resolved and paginated summary/items with partial", async () => {
    const result = await loadReadApiData("/visits", 42, { ...query, offset: 1 });
    expect(result.meta).toMatchObject({ attempted: 3, resolved: 2, capped: false, partial: true, limit: 2, offset: 1, hasMore: false });
    expect((result.data as any).summary).toEqual({ days: 30, totalActive: 3, attempted: 3, resolved: 2 });
    expect((result.data as any).items).toEqual([{ date: "2026-11-11", visits: 0 }, { date: "2026-11-12", visits: 2 }]);
  });
  it("visits marks 200 resolved of 250 active as capped and partial even on cache hits", async () => {
    state.fetch.mockImplementation(async (url: string) => response(url === activeCountPath ? activePage(250) : { id: 3308178634 }));
    state.visits.mockResolvedValueOnce({ attempted: 200, resolved: 200, series: [{ date: "2026-11-12", visits: 800 }] });
    const first = await loadReadApiData("/visits", 42, query);
    expect((first.data as any).summary).toEqual({ days: 30, totalActive: 250, attempted: 200, resolved: 200 });
    expect(first.meta).toMatchObject({ capped: true, partial: true, attempted: 200, resolved: 200, hasMore: false, stale: false });
    expect(state.fetch).toHaveBeenNthCalledWith(1, "https://api.mercadolibre.com/users/me", expect.objectContaining({ method: "GET" }));
    expect(state.fetch).toHaveBeenNthCalledWith(2, activeCountPath, expect.objectContaining({ method: "GET", headers: expect.objectContaining({ Authorization: "Bearer MOCK_TOKEN" }) }));
    const cached = await loadReadApiData("/visits", 42, { ...query, search: "2026" });
    expect(cached.meta).toMatchObject({ capped: true, partial: true });
    expect((cached.data as any).summary).toEqual((first.data as any).summary);
    expect(state.fetch).toHaveBeenCalledTimes(3);
    expect(state.visits).toHaveBeenCalledTimes(1);
    expect(state.visits).toHaveBeenCalledWith(30);
    expect(state.forbiddenWrite).not.toHaveBeenCalled();
  });
  it("visits at the exact 200-active boundary stays complete when all are resolved", async () => {
    state.fetch.mockResolvedValueOnce(response({ id: 3308178634 })).mockResolvedValueOnce(response(activePage(200)));
    state.visits.mockResolvedValueOnce({ attempted: 200, resolved: 200, series: [{ date: "2026-11-12", visits: 0 }] });
    const result = await loadReadApiData("/visits", 42, query);
    expect((result.data as any).summary).toMatchObject({ totalActive: 200, attempted: 200, resolved: 200 });
    expect(result.meta).toMatchObject({ capped: false, partial: false });
  });
  it.each([{}, { results: [] }, { results: [], paging: { total: 250 } },
    { results: ["MLB1"], paging: { total: "250" } }, { results: ["MLB1"], paging: { total: -1 } },
    { results: [{}], paging: { total: 250 } }, { results: [" "], paging: { total: 250 } },
  ])("visits count rejects unconfirmed paging/results %j before collecting", async value => {
    state.fetch.mockResolvedValueOnce(response({ id: 3308178634 })).mockResolvedValueOnce(response(value));
    await expect(loadReadApiData("/visits", 42, query)).rejects.toMatchObject({ status: 502, code: "ML_UNAVAILABLE" });
    expect(state.visits).not.toHaveBeenCalled();
    const next = await loadReadApiData("/visits", 42, query);
    expect((next.data as any).summary.totalActive).toBe(3);
    expect(next.meta?.stale).toBe(false);
  });
  it("confirmed no-active-listings visits is a genuine empty result", async () => {
    state.fetch.mockResolvedValueOnce(response({ id: 3308178634 })).mockResolvedValueOnce(response(activePage(0)));
    state.visits.mockResolvedValueOnce({ attempted: 0, resolved: 0, series: [] });
    const result = await loadReadApiData("/visits", 42, query);
    expect((result.data as any).items).toEqual([]);
    expect((result.data as any).summary).toEqual({ days: 30, totalActive: 0, attempted: 0, resolved: 0 });
    expect(result.meta).toMatchObject({ capped: false, partial: false });
  });
  it("technical specs safe nested attributes and paginated items", async () => {
    const result = await loadReadApiData("/technical-specs", 42, query);
    expect((result.data as any).items[0].attributes).toEqual([{ id: "BRAND", name: "Marca", required: true, valueName: null, isMissing: true }]);
    expect(result.meta).toMatchObject({ limit: 2, offset: 0, hasMore: false });
    expect(state.specs).toHaveBeenCalledWith({ maxItems: 600 });
    expect(JSON.stringify(result)).not.toMatch(/SECRET|credentials|buyer|rawOrders|userId/);
  });
  it("sales returns only summary/daily/topProducts and never PII/raw orders", async () => {
    const result = await loadReadApiData("/sales", 42, query);
    expect(Object.keys(result.data as object).sort()).toEqual(["daily", "summary", "topProducts"]);
    expect((result.data as any).summary.revenue).toBe(120);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|credentials|buyer|rawOrders|userId|email/);
    expect(state.sales).toHaveBeenCalledWith(expect.objectContaining({ fill: true, topLimit: 100 }));
    expect(state.accountConstructor.mock.calls[0]).toHaveLength(3);
    expect(result.meta).toMatchObject({ partial: false, capped: false, topProductsCapped: false });
  });
  it.each(["paid", "cancelled"])("sales flags >1000 %s orders without requesting beyond the per-status cap", async status => {
    state.accountTransportPath = Array.from({ length: 20 }, (_, page) => `/orders/search?seller=3308178634&sort=date_desc&limit=50&offset=${page * 50}&order.status=${status}`);
    state.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/users/me")) return response({ id: 3308178634 });
      const params = new URL(url).searchParams;
      return response(orderPage(1250, Number(params.get("offset"))));
    });
    const result = await loadReadApiData("/sales", 42, query);
    expect(result.meta).toMatchObject({ partial: true, capped: true, topProductsCapped: false });
    expect((result.data as any).summary.revenue).toBe(120);
    expect(state.fetch).toHaveBeenCalledTimes(21);
    const pages = state.fetch.mock.calls.slice(1);
    expect(pages.map(([url]) => Number(new URL(url).searchParams.get("offset")))).toEqual(Array.from({ length: 20 }, (_, page) => page * 50));
    for (const [url, options] of pages) {
      expect(new URL(url).searchParams.get("order.status")).toBe(status);
      expect(new URL(url).searchParams.get("limit")).toBe("50");
      expect(options.method).toBe("GET");
    }
    const cached = await loadReadApiData("/sales", 42, query);
    expect(cached.meta).toMatchObject({ partial: true, capped: true });
    expect(state.sales).toHaveBeenCalledTimes(1);
    expect(state.fetch).toHaveBeenCalledTimes(22);
    expect(state.forbiddenWrite).not.toHaveBeenCalled();
  });
  it("sales keeps the cap signal when a later status page is complete", async () => {
    state.accountTransportPath = ["/orders/search?order.status=paid&limit=50&offset=0", "/orders/search?order.status=cancelled&limit=50&offset=0"];
    state.fetch.mockResolvedValueOnce(response({ id: 3308178634 }))
      .mockResolvedValueOnce(response(orderPage(1001))).mockResolvedValueOnce(response(orderPage(0)));
    const result = await loadReadApiData("/sales", 42, query);
    expect(result.meta).toMatchObject({ partial: true, capped: true });
  });
  it.each([0, 999, 1000])("sales total %s does not exceed the per-status cap", async total => {
    state.accountTransportPath = "/orders/search?order.status=paid&limit=50&offset=0";
    state.fetch.mockResolvedValueOnce(response({ id: 3308178634 })).mockResolvedValueOnce(response(orderPage(total)));
    const result = await loadReadApiData("/sales", 42, query);
    expect(result.meta).toMatchObject({ partial: false, capped: false });
  });
  it("sales ranking reaching 100 is potentially capped, independently of aggregate completeness", async () => {
    state.sales.mockResolvedValueOnce({ kpis: { revenue: 1010, orders: 101, unitsSold: 101 }, daily: [],
      topProducts: Array.from({ length: 100 }, (_, i) => ({ itemId: `MLB${i}`, unitsSold: 1, revenue: 10 })), from: 1, to: 2 });
    const result = await loadReadApiData("/sales", 42, query);
    expect((result.data as any).topProducts).toHaveLength(100);
    expect((result.data as any).summary).toMatchObject({ revenue: 1010, orders: 101 });
    expect(result.meta).toMatchObject({ topProductsCapped: true, partial: false, capped: false });
    expect(state.sales).toHaveBeenCalledWith(expect.objectContaining({ topLimit: 100 }));
  });
  it("Ads reads getDashboard only, no unauthorized write hook, snapshot or audit", async () => {
    const result = await loadReadApiData("/ads", 42, { ...query, days: 7 });
    expect(state.ads).toHaveBeenCalledWith(7);
    expect(state.adsConstructor).toHaveBeenCalledWith("MOCK_TOKEN", "MLB");
    expect((result.data as any).summary.metrics.clicks).toBe(2);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|credentials|buyer|rawOrders|userId|email/);
    expect(state.forbiddenWrite).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])("sales provider HTTP %s fails instead of fabricating zero orders", async status => {
    state.accountTransportPath = "/orders/search?seller=3308178634&limit=50&offset=0";
    state.fetch.mockResolvedValueOnce(response({ id: 3308178634 })).mockResolvedValueOnce(response({ message: "SECRET" }, status));
    await expect(loadReadApiData("/sales", 42, query)).rejects.toMatchObject({ code: status === 429 ? "ML_RATE_LIMITED" : "ML_UNAVAILABLE" });
    expect(state.sales).not.toHaveBeenCalled();
    for (const [, options] of state.fetch.mock.calls) expect(options.method).toBe("GET");
  });
  it.each([null, {}, { results: [] }, { results: [], paging: { total: 3 } }])("malformed essential page %j is not a confirmed empty account", async value => {
    state.accountTransportPath = "/orders/search?seller=3308178634&limit=50&offset=0";
    state.fetch.mockResolvedValueOnce(response({ id: 3308178634 })).mockResolvedValueOnce(response(value));
    await expect(loadReadApiData("/sales", 42, query)).rejects.toMatchObject({ code: "ML_UNAVAILABLE" });
    expect(state.sales).not.toHaveBeenCalled();
  });
  it("orders without valid essential amounts/items cannot become zero revenue", async () => {
    state.accountTransportPath = "/orders/search?seller=3308178634&limit=50&offset=0";
    state.fetch.mockResolvedValueOnce(response({ id: 3308178634 })).mockResolvedValueOnce(response({ results: [{}], paging: { total: 1 } }));
    await expect(loadReadApiData("/sales", 42, query)).rejects.toMatchObject({ code: "ML_UNAVAILABLE" });
    expect(state.sales).not.toHaveBeenCalled();
  });
  it("Ads metrics must be confirmed, not defaulted from missing fields", async () => {
    state.adsTransportPath = "/marketplace/advertising/MLB/advertisers/333/product_ads/campaigns/search?limit=50&offset=0";
    state.fetch.mockResolvedValueOnce(response({ id: 3308178634 })).mockResolvedValueOnce(response({ results: [{ id: 1 }], paging: { total: 1 } }));
    await expect(loadReadApiData("/ads", 42, query)).rejects.toMatchObject({ code: "ML_UNAVAILABLE" });
    expect(state.ads).not.toHaveBeenCalled();
  });
  it("Ads failed advertiser discovery does not become no_ads_access", async () => {
    state.adsTransportPath = "/advertising/advertisers?product_id=PADS";
    state.fetch.mockResolvedValueOnce(response({ id: 3308178634 })).mockResolvedValueOnce(response({}, 503));
    await expect(loadReadApiData("/ads", 42, query)).rejects.toMatchObject({ code: "ML_UNAVAILABLE" });
    expect(state.ads).not.toHaveBeenCalled();
  });
  it("a confirmed empty essential page remains a valid provider input", async () => {
    state.accountTransportPath = "/orders/search?seller=3308178634&limit=50&offset=0";
    state.fetch.mockResolvedValueOnce(response({ id: 3308178634 })).mockResolvedValueOnce(response({ results: [], paging: { total: 0 } }));
    await loadReadApiData("/sales", 42, query);
    expect(state.sales).toHaveBeenCalledTimes(1);
  });
  it("cold provider failures reveal neither exceptions nor false-success arrays", async () => {
    state.sales.mockRejectedValueOnce(new Error("SECRET buyer and credentials"));
    await expect(loadReadApiData("/sales", 42, query)).rejects.toMatchObject({ code: "DATA_UNAVAILABLE", status: 503 });
  });
});
