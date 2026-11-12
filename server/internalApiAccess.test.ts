import express from "express";
import { createServer } from "node:http";
import { initTRPC } from "@trpc/server";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticate } }));
import { allowsAnonymousTrpcHttp, createContext, type TrpcContext } from "./_core/context";
const t = initTRPC.context<TrpcContext>().create();
const appRouter = t.router({
  auth: t.router({ me: t.procedure.query(({ ctx }) => ctx.user), gateInfo: t.procedure.query(() => ({ passwordGateEnabled: true })), passwordLogin: t.procedure.mutation(() => ({ success: true })) }),
  project: t.router({ products: t.router({ list: t.procedure.query(() => { mocks.read(); return [{ name: "Informação interna" }]; }), create: t.procedure.mutation(() => { mocks.write(); return { created: true }; }) }) }),
});
const cleanups: Array<() => Promise<void>> = [];
beforeEach(() => { vi.clearAllMocks(); mocks.authenticate.mockRejectedValue(new Error("Invalid session cookie")); });
afterEach(async () => { for (const close of cleanups.splice(0)) await close(); });
async function start() {
  const app = express(); app.use(express.json()); app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  const server = createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  cleanups.push(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  return (path: string, options: RequestInit = {}) => fetch(`http://127.0.0.1:${port}/api/trpc/${path}`, options);
}
describe("Atalhos legados — sessão obrigatória no HTTP interno", () => {
  it.each(["auth.me", "auth.gateInfo", "auth.passwordLogin", "auth.logout", "system.health", "auth.me,auth.gateInfo"])("permite somente controle público conhecido: %s", path => { expect(allowsAnonymousTrpcHttp(`/api/trpc/${path}?batch=1`)).toBe(true); });
  it.each(["project.products.list", "project.documents.byProduct", "kitSheet.list", "embalagemSheet.create", "readApiKeys.create", "auth.me,project.products.list", "auth.me,", "auth.verifyPassword", "%ZZ", ""])("nega procedimento sem sessão: %s", path => { expect(allowsAnonymousTrpcHttp(`/api/trpc/${path}`)).toBe(false); });
  it("path fora de /api/trpc não pode ser confundido com exceção pública", () => { expect(allowsAnonymousTrpcHttp("/outro/auth.me")).toBe(false); expect(allowsAnonymousTrpcHttp("/api/trpc/auth.me/../project.products.list")).toBe(false); });
  it("auth.me continua disponível para montar a tela de login", async () => { const request = await start(); const response = await request("auth.me"); expect(response.status).toBe(200); expect(mocks.read).not.toHaveBeenCalled(); });
  it("leitura legada publicProcedure sem cookie retorna 401 antes do helper", async () => { const request = await start(); const response = await request("project.products.list"); expect(response.status).toBe(401); expect(await response.text()).not.toContain("Informação interna"); expect(mocks.read).not.toHaveBeenCalled(); });
  it("mutation antiga sem sessão não consegue gravar", async () => { const request = await start(); const response = await request("project.products.create", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); expect(response.status).toBe(401); expect(mocks.write).not.toHaveBeenCalled(); });
  it("batch com auth.me não permite obter dados internos no mesmo request", async () => { const request = await start(); const response = await request("auth.me,project.products.list?batch=1&input=%7B%7D"); expect(response.status).toBe(401); expect(mocks.read).not.toHaveBeenCalled(); });
  it("Bearer da API externa não vira login do aplicativo", async () => { const request = await start(); const response = await request("project.products.list", { headers: { Authorization: "Bearer mrc_read_apenas_exemplo" } }); expect(response.status).toBe(401); expect(mocks.read).not.toHaveBeenCalled(); });
  it("usuário com sessão válida continua usando o Projeto sem mudar os dados", async () => { mocks.authenticate.mockResolvedValue({ id: 1, role: "user" }); const request = await start(); const response = await request("project.products.list"); expect(response.status).toBe(200); expect(mocks.read).toHaveBeenCalledTimes(1); expect(mocks.write).not.toHaveBeenCalled(); });
});
