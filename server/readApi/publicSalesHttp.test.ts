import express from "express";
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./data", () => ({ loadReadApiData: vi.fn() }));
vi.mock("./keys", () => ({ authenticateReadApiKey: vi.fn() }));
import { createReadApiRouter, type ReadApiHttpDependencies } from "./http";
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
async function setup(
  scopes: string[] = ["vendas:read", "vendas-detalhe:read"],
  overrides: Partial<ReadApiHttpDependencies> = {}
) {
  const load = vi.fn(async () => ({
    data: [],
    meta: {
      asOf: Date.UTC(2026, 10, 15, 12),
      partial: false,
      stale: false,
      capped: false,
      hasMore: false,
    },
  }));
  const authenticate = vi.fn(async () => ({
    id: 52,
    ownerUserId: 1,
    scopes: scopes as any,
  }));
  const server = createServer(
    express().use(
      "/api/public/v1",
      createReadApiRouter({ load, authenticate, ...overrides })
    )
  );
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;
  cleanup.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close(e => (e ? reject(e) : resolve()));
        server.closeAllConnections();
      })
  );
  return {
    load,
    authenticate,
    request: (path: string, options: RequestInit = {}) =>
      fetch(`http://127.0.0.1:${port}/api/public/v1${path}`, options),
  };
}
describe("API financeira externa — escopo e compatibilidade", () => {
  it("chave anterior mantém /sales e /history mas não /orders", async () => {
    const api = await setup(["vendas:read"]);
    expect((await api.request("/sales")).status).toBe(200);
    expect((await api.request("/sales/history")).status).toBe(200);
    expect(api.load).toHaveBeenLastCalledWith(
      "/sales/history",
      1,
      expect.objectContaining({ includeFinancial: false })
    );
    expect((await api.request("/sales/orders")).status).toBe(403);
    const index = await (await api.request("/")).json();
    expect(index.data.resources.map((r: any) => r.path)).toContain(
      "/sales/history"
    );
    expect(index.data.resources.map((r: any) => r.path)).not.toContain(
      "/sales/orders"
    );
  });
  it("novo escopo não libera sozinho o histórico de vendas", async () => {
    const api = await setup(["vendas-detalhe:read"]);
    expect((await api.request("/sales/orders")).status).toBe(200);
    expect((await api.request("/sales/history")).status).toBe(403);
  });
  it("índice autorizado lista os nomes e os escopos novos", async () => {
    const api = await setup();
    const json = await (await api.request("/")).json();
    expect(json.data.resources).toContainEqual({
      path: "/sales/orders",
      scope: "vendas-detalhe:read",
      title: expect.any(String),
    });
    expect(json.data.resources).toContainEqual({
      path: "/sales/history",
      scope: "vendas:read",
      title: expect.any(String),
    });
  });
  it("from/to e filtros só são adicionados às novas rotas", async () => {
    const api = await setup();
    expect(
      (
        await api.request(
          "/sales/orders?from=2026-11-01&to=2026-11-15&limit=100&offset=100&itemId=MLB123&sku=001-A&status=paid"
        )
      ).status
    ).toBe(200);
    expect(api.load).toHaveBeenLastCalledWith(
      "/sales/orders",
      1,
      expect.objectContaining({
        from: "2026-11-01",
        to: "2026-11-15",
        limit: 100,
        offset: 100,
        sku: "001-A",
        includeFinancial: true,
      })
    );
    expect(
      (await api.request("/sales?from=2026-11-01&to=2026-11-15")).status
    ).toBe(400);
  });
  it("/sales preserva seu contrato e não recebe flags financeiras", async () => {
    const old = {
      summary: { revenue: 100, orders: 1 },
      daily: [],
      topProducts: [],
    };
    const api = await setup(["vendas:read"], {
      load: vi.fn(async () => ({ data: old, meta: { partial: false } })),
    });
    const json = await (await api.request("/sales?days=7")).json();
    expect(json.data).toEqual(old);
    expect(json.meta).toEqual({
      partial: false,
      version: "1",
      readOnly: true,
      generatedAt: expect.any(String),
    });
  });
  it("novas rotas entregam requestId igual ao cabeçalho e asOf ISO", async () => {
    const api = await setup();
    const response = await api.request("/sales/orders");
    const json = await response.json();
    expect(json.meta).toMatchObject({
      version: "1",
      readOnly: true,
      partial: false,
      stale: false,
      capped: false,
      asOf: "2026-11-15T12:00:00.000Z",
      requestId: response.headers.get("x-request-id"),
    });
  });
  it("metadados partial/stale/capped/hasMore não se perdem", async () => {
    const api = await setup(undefined, {
      load: vi.fn(async () => ({
        data: [],
        meta: {
          partial: true,
          stale: true,
          capped: true,
          hasMore: true,
          asOf: 123,
        },
      })),
    });
    const json = await (await api.request("/sales/history")).json();
    expect(json.meta).toMatchObject({
      partial: true,
      stale: true,
      capped: true,
      hasMore: true,
    });
  });
  it.each([
    "from=2026-11-01",
    "to=2026-11-01",
    "from=2026-02-30&to=2026-03-01",
    "from=2025-01-01&to=2026-01-02",
    "from=2099-01-01&to=2099-02-01",
    "limit=101",
    "offset=-1",
    "ownerUserId=999",
    "key=secreto",
    "includeFinancial=true",
    "itemId=javascript:alert(1)",
    "sku=a&sku=b",
  ])("não aceita parâmetros inválidos/escalada %s", async query => {
    const api = await setup();
    expect((await api.request(`/sales/orders?${query}`)).status).toBe(400);
    expect(api.load).not.toHaveBeenCalled();
  });
  it.each(["hour", "day", "week", "month"])(
    "aceita agregação %s",
    async granularity => {
      const api = await setup();
      expect(
        (
          await api.request(
            `/sales/history?granularity=${granularity}&groupBy=sku`
          )
        ).status
      ).toBe(200);
      expect(api.load).toHaveBeenLastCalledWith(
        "/sales/history",
        1,
        expect.objectContaining({ granularity, groupBy: "sku" })
      );
    }
  );
  it.each(["/sales/orders", "/sales/history"])(
    "sem chave retorna 401 %s",
    async path => {
      const api = await setup(undefined, {
        authenticate: vi.fn(async () => null),
      });
      expect((await api.request(path)).status).toBe(401);
      expect(api.load).not.toHaveBeenCalled();
    }
  );
  it.each(["POST", "PUT", "PATCH", "DELETE", "HEAD"])(
    "%s não grava nem chama o loader novo",
    async method => {
      const api = await setup();
      expect((await api.request("/sales/orders", { method })).status).toBe(405);
      expect(api.load).not.toHaveBeenCalled();
    }
  );
  it("OPTIONS não busca dados e aliases continuam404", async () => {
    const api = await setup();
    expect(
      (await api.request("/sales/orders", { method: "OPTIONS" })).status
    ).toBe(204);
    for (const path of ["/orders", "/margin", "/sales/margin"])
      expect((await api.request(path)).status).toBe(404);
    expect(api.load).not.toHaveBeenCalled();
  });
  it("rate limit continua60 compartilhado comrotas novas", async () => {
    const api = await setup();
    for (let i = 0; i < 60; i++)
      expect(
        (await api.request(i % 2 ? "/sales/orders" : "/sales/history")).status
      ).toBe(200);
    expect((await api.request("/sales")).status).toBe(429);
  });
  it("terceira consulta é bloqueada entre rotas antigas e novas", async () => {
    const releases: (() => void)[] = [];
    const api = await setup(undefined, {
      load: vi.fn(async () => {
        await new Promise<void>(resolve => releases.push(resolve));
        return { data: [] };
      }),
    });
    const first = api.request("/sales/orders"),
      second = api.request("/sales/history");
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect((await api.request("/sales")).status).toBe(429);
    releases.splice(0).forEach(r => r());
    await Promise.all([first, second]);
  });
});
