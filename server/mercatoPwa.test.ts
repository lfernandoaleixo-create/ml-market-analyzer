import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../client/public/", import.meta.url);
const source = readFileSync(new URL("mercato-sw.js", root), "utf8");
function worker() {
  const handlers = new Map<string, (event: any) => void>();
  const cache = { add: vi.fn(async (_request: Request) => {}), match: vi.fn(async (_url: string) => new Response("Aviso público offline")) };
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => ["mercato-offline-v0", "mercato-offline-v1", "outro-app", "dados-privados"]), delete: vi.fn(async () => true) };
  const fetch = vi.fn(async () => new Response("Resposta da rede"));
  const self = { location: { origin: "https://mercato.example" }, clients: { claim: vi.fn(async () => {}) }, addEventListener: (name: string, handler: any) => handlers.set(name, handler) };
  class BrowserRequest extends Request {
    constructor(input: string, init?: RequestInit) { super(new URL(input, self.location.origin), init); }
  }
  vm.runInNewContext(source, { self, caches, fetch, URL, Request: BrowserRequest, Response });
  return { handlers, cache, caches, fetch, self };
}

describe("Manifesto e segurança do Mercato instalável", () => {
  it("mantém app em janela própria, escopo de todas as rotas e ícones Toujours 192/512/maskable", () => {
    const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", root), "utf8"));
    expect(manifest.name).toBe("Mercato — Toujours");
    expect(manifest.display).toBe("standalone"); expect(manifest.start_url).toBe("/"); expect(manifest.scope).toBe("/");
    expect(manifest.orientation).toBe("any"); expect(manifest.prefer_related_applications).toBe(false);
    expect(manifest.icons.map((i: any) => i.sizes)).toContain("192x192");
    expect(manifest.icons.map((i: any) => i.sizes)).toContain("512x512");
    expect(manifest.icons.find((i: any) => i.purpose === "maskable").sizes).toBe("512x512");
    for (const icon of manifest.icons) expect(icon.src).toMatch(/^\/manus-storage\/toujours-app-/);
  });
  it("HTML inclui manifesto/ícone Apple e não bloqueia zoom de acessibilidade", () => {
    const html = readFileSync(new URL("../index.html", root), "utf8");
    expect(html).toContain('href="/manifest.webmanifest"'); expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain("viewport-fit=cover"); expect(html).not.toContain("maximum-scale=1");
  });
  it("instala só o aviso público e sem cookies; não busca páginas ou APIs para cache", async () => {
    const w = worker(); let pending: Promise<any> | undefined;
    w.handlers.get("install")!({ waitUntil: (p: Promise<any>) => { pending = p; } });
    await pending;
    const request = w.cache.add.mock.calls[0][0] as unknown as Request;
    expect(request.url).toContain("/mercato-offline.html"); expect(request.credentials).toBe("omit");
    expect(w.cache.add).toHaveBeenCalledTimes(1); expect(source).not.toContain("skipWaiting(");
  });
  it("ativação só limpa caches antigos deste módulo, sem apagar caches alheios", async () => {
    const w = worker(); let pending: Promise<any> | undefined;
    w.handlers.get("activate")!({ waitUntil: (p: Promise<any>) => { pending = p; } }); await pending;
    expect(w.caches.delete).toHaveBeenCalledTimes(1); expect(w.caches.delete).toHaveBeenCalledWith("mercato-offline-v0");
  });
  it.each([
    ["GET", "navigate", "https://mercato.example/api/trpc/skuSheet.list"],
    ["GET", "navigate", "https://mercato.example/api/oauth/callback?code=teste"],
    ["GET", "navigate", "https://mercato.example/manus-storage/documento.pdf"],
    ["POST", "navigate", "https://mercato.example/api/trpc/skuSheet.update"],
    ["GET", "cors", "https://mercato.example/api/public/v1/sales"],
    ["GET", "navigate", "https://outro.example/pagina"],
  ])("ignora %s %s %s", (method, mode, url) => {
    const w = worker(); const respondWith = vi.fn();
    w.handlers.get("fetch")!({ request: { method, mode, url }, respondWith });
    expect(respondWith).not.toHaveBeenCalled(); expect(w.fetch).not.toHaveBeenCalled();
  });
  it("navegação online usa rede e não grava o HTML autenticado", async () => {
    const w = worker(); let pending: Promise<Response> | undefined;
    w.handlers.get("fetch")!({ request: { method: "GET", mode: "navigate", url: "https://mercato.example/planilha-sku" }, respondWith: (p: Promise<Response>) => { pending = p; } });
    expect(await (await pending!).text()).toBe("Resposta da rede"); expect(w.cache.add).not.toHaveBeenCalled();
    expect(w.caches.open).not.toHaveBeenCalled();
  });
  it("offline devolve só o aviso estático, não um snapshot privado ou zeros", async () => {
    const w = worker(); w.fetch.mockRejectedValue(new Error("offline")); let pending: Promise<Response> | undefined;
    w.handlers.get("fetch")!({ request: { method: "GET", mode: "navigate", url: "https://mercato.example/vendas" }, respondWith: (p: Promise<Response>) => { pending = p; } });
    expect(await (await pending!).text()).toBe("Aviso público offline"); expect(w.cache.add).not.toHaveBeenCalled();
  });
});
