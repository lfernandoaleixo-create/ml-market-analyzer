import express from "express";
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./data", () => ({ loadReadApiData: vi.fn() }));
vi.mock("./keys", () => ({ authenticateReadApiKey: vi.fn() }));
import { createReadApiRouter, ReadApiRateLimiter, parseReadApiQuery, type ReadApiHttpDependencies } from "./http";
import { READ_API_ROUTES } from "../../shared/readApi";
const principal = { id: 17, ownerUserId: 1, scopes: ["mercado:read", "sku:read"] as any };
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0)) await close(); });
async function setup(deps: Partial<ReadApiHttpDependencies> = {}) {
  const authenticate = vi.fn(async () => principal);
  const load = vi.fn(async () => ({ data: [{ title: "Resultado confirmado" }], meta: { partial: false } }));
  const app = express();
  app.use("/api/public/v1", createReadApiRouter({ authenticate, load, ...deps }));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  cleanups.push(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  return { authenticate, load, request: (path: string, options: RequestInit = {}) => fetch(`http://127.0.0.1:${port}/api/public/v1${path}`, options) };
}
describe("API externa HTTP — somente leitura e autenticação isolada", () => {
  it("OpenAPI público não exige chave e não consulta dados", async () => {
    const api = await setup(); const response = await api.request("/openapi.json"); const schema = await response.json();
    expect(response.status).toBe(200); expect(schema.openapi).toBe("3.0.3");
    expect(schema.security).toEqual([{ ReadApiKey: [] }]); expect(api.authenticate).not.toHaveBeenCalled(); expect(api.load).not.toHaveBeenCalled();
    for (const path of Object.values(schema.paths) as any[]) expect(Object.keys(path)).toEqual(["get"]);
    for (const route of READ_API_ROUTES) expect(schema.paths[route.path]).toBeDefined();
  });
  it("OpenAPI descreve data por rota, metadados parciais e referências resolvíveis", async () => {
    const api = await setup(); const schema = await (await api.request("/openapi.json")).json();
    for (const route of READ_API_ROUTES) {
      const envelope = schema.paths[route.path].get.responses["200"].content["application/json"].schema;
      expect(envelope.properties.data.$ref || envelope.properties.data.type).toBeTruthy();
      expect(envelope.properties.meta.$ref).toBe("#/components/schemas/ReadApiMeta");
    }
    expect(schema.components.schemas.ReadApiMeta.properties.capped.type).toBe("boolean");
    const refs = JSON.stringify(schema).matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g);
    for (const ref of refs) expect(schema.components.schemas[ref[1]]).toBeDefined();
  });
  it("chave ausente ou inválida retorna 401 e não consulta negócios", async () => {
    const api = await setup({ authenticate: vi.fn(async () => null) });
    const response = await api.request("/listings", { headers: { Cookie: "session=nao-vale", Authorization: "Bearer invalida" } });
    expect(response.status).toBe(401); expect(response.headers.get("www-authenticate")).toBe("Bearer"); expect(api.load).not.toHaveBeenCalled();
  });
  it.each(["POST", "PUT", "PATCH", "DELETE", "HEAD"])("%s não acessa loader nem autenticação", async method => {
    const api = await setup(); const response = await api.request("/sku", { method });
    expect(response.status).toBe(405); expect(api.authenticate).not.toHaveBeenCalled(); expect(api.load).not.toHaveBeenCalled();
  });
  it("OPTIONS permite cabeçalho Bearer mas não cookies nem consultas", async () => {
    const api = await setup(); const response = await api.request("/sku", { method: "OPTIONS" });
    expect(response.status).toBe(204); expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull(); expect(api.load).not.toHaveBeenCalled();
  });
  it("permissão é verificada antes do loader", async () => {
    const api = await setup(); const response = await api.request("/sales");
    expect(response.status).toBe(403); expect(api.load).not.toHaveBeenCalled();
  });
  it("consulta usa apenas owner vinculado à chave e meta imutável", async () => {
    const api = await setup({ load: vi.fn(async () => ({ data: [], meta: { readOnly: false, partial: true, stale: true } })) });
    const response = await api.request("/listings?limit=5&offset=10&days=7"); const json = await response.json();
    expect(response.status).toBe(200); expect(json.meta).toMatchObject({ readOnly: true, partial: true, stale: true, version: "1" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("instante epoch do snapshot é entregue como data/hora ISO UTC", async () => {
    const api = await setup({ load: vi.fn(async () => ({ data: [], meta: { asOf: Date.UTC(2026, 10, 12, 11, 43) } })) });
    const json = await (await api.request("/listings")).json();
    expect(json.meta.asOf).toBe("2026-11-12T11:43:00.000Z");
  });
  it.each(["limit=0", "limit=101", "offset=-1", "offset=100001", "days=365", "limit=1.5", "limit=1&limit=2", "ownerUserId=999", "key=segredo", "api_key=segredo", "productId=0"])("rejeita query inválida %s", async query => {
    const api = await setup(); const response = await api.request(`/sku?${query}`);
    expect(response.status).toBe(400); expect(api.load).not.toHaveBeenCalled();
  });
  it("rotas arbitrárias e proxy da API ML não são expostos", async () => {
    const api = await setup(); expect((await api.request("/credentials")).status).toBe(404); expect((await api.request("/users/me")).status).toBe(404); expect(api.load).not.toHaveBeenCalled();
  });
  it("índice retorna somente recursos permitidos, sem chaves nem owner", async () => {
    const api = await setup(); const json = await (await api.request("/")).json();
    expect(json.data.resources.map((r: any) => r.path)).not.toContain("/sales"); expect(JSON.stringify(json)).not.toContain("ownerUserId"); expect(api.load).not.toHaveBeenCalled();
  });
  it("erro bruto de SQL ou token nunca é refletido", async () => {
    const api = await setup({ load: vi.fn(async () => { throw new Error("SELECT credential=TOKEN_SUPER_SECRETO"); }) });
    const response = await api.request("/sku"); const text = await response.text();
    expect(response.status).toBe(503); expect(text).not.toContain("SELECT"); expect(text).not.toContain("TOKEN_SUPER_SECRETO"); expect(JSON.parse(text).error.requestId).toBeTruthy();
  });
  it("indisponibilidade da fonte não é sucesso zero", async () => {
    const api = await setup({ load: vi.fn(async () => { throw Object.assign(new Error("payload upstream"), { status: 502 }); }) });
    const response = await api.request("/listings"); const json = await response.json();
    expect(response.status).toBe(502); expect(json.data).toBeUndefined(); expect(json.error.message).toContain("não significa zero");
  });
  it("limita 60 consultas por chave, incluindo chamadas ao índice", async () => {
    const api = await setup();
    for (let i = 0; i < 60; i++) expect((await api.request("/")).status).toBe(200);
    const response = await api.request("/"); expect(response.status).toBe(429); expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });
  it("bloqueia a terceira consulta concorrente e libera slots após conclusão", async () => {
    const releases: Array<() => void> = [];
    const load = vi.fn(async () => { await new Promise<void>(resolve => releases.push(resolve)); return { data: [] }; });
    const api = await setup({ load });
    const first = api.request("/sku"); const second = api.request("/sku");
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect((await api.request("/sku")).status).toBe(429);
    releases.splice(0).forEach(release => release()); await Promise.all([first, second]);
    const third = api.request("/sku"); await vi.waitFor(() => expect(releases).toHaveLength(1)); releases[0](); expect((await third).status).toBe(200);
  });
});
describe("Validação de paginação e limites bounded", () => {
  it("valores padrão e filtros válidos", () => { expect(parseReadApiQuery({})).toEqual({ limit: 50, offset: 0, days: 30 }); expect(parseReadApiQuery({ search: " colar ", rowId: "10" })).toMatchObject({ search: "colar", rowId: 10 }); });
  it("limiter expira a janela e é bounded", () => {
    let now = 0; const limiter = new ReadApiRateLimiter(() => now, 1);
    expect(limiter.take("a", 1)).toBe(0); expect(limiter.take("a", 1)).toBe(60); expect(limiter.take("b", 1)).toBe(60);
    now = 60000; expect(limiter.take("b", 1)).toBe(0);
  });
});
