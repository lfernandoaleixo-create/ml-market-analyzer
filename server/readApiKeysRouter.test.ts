import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), create: vi.fn(), list: vi.fn(), revoke: vi.fn() }));
vi.mock("./db", () => ({ getOwnerUser: mocks.owner }));
vi.mock("./readApi/keys", () => ({ createReadApiKey: mocks.create, listReadApiKeys: mocks.list, revokeReadApiKey: mocks.revoke }));
import { readApiKeysRouter } from "./routers/readApiKeys";
function caller(role: "admin" | "user" | null = "admin") { return readApiKeysRouter.createCaller({ user: role ? { id: 42, role } : null, req: { headers: {} }, res: {} } as never); }
beforeEach(() => { vi.clearAllMocks(); mocks.owner.mockResolvedValue({ id: 1 }); mocks.create.mockResolvedValue({ key: "ONCE_ONLY", metadata: { id: 3 } }); mocks.list.mockResolvedValue([]); mocks.revoke.mockResolvedValue(true); });
describe("Gestão de chaves — administraçao autenticada", () => {
  it.each(["user", null] as const)("%s não lista nem cria nem revoga", async role => {
    const user = caller(role); await expect(user.list()).rejects.toMatchObject({ code: "FORBIDDEN" }); await expect(user.create({ name: "IA", scopes: ["mercado:read"], expiresDays: 30 })).rejects.toMatchObject({ code: "FORBIDDEN" }); await expect(user.revoke({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.revoke).not.toHaveBeenCalled();
  });
  it("admin gera chave vinculada ao owner compartilhado, não a um ID do cliente", async () => {
    const result = await caller().create({ name: " IA teste ", scopes: ["sku:read", "sku:read"], expiresDays: 7 });
    expect(result.key).toBe("ONCE_ONLY"); expect(mocks.create).toHaveBeenCalledWith(1, 42, { name: "IA teste", scopes: ["sku:read"], expiresDays: 7 });
  });
  it.each([{ name: "", scopes: ["mercado:read"], expiresDays: 30 }, { name: "IA", scopes: [], expiresDays: 30 }, { name: "IA", scopes: ["sku:write"], expiresDays: 30 }, { name: "IA", scopes: ["sku:read"], expiresDays: 366 }, { name: "IA", scopes: ["sku:read"], expiresDays: 0 }, { name: "IA", scopes: ["sku:read"], expiresDays: 30, ownerUserId: 999 }])("rejeita payload indevido %j", async input => { await expect(caller().create(input as any)).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(mocks.create).not.toHaveBeenCalled(); });
  it("erro interno não expõe SQL ou credenciais", async () => { mocks.list.mockRejectedValue(new Error("MYSQL password supersecret")); await expect(caller().list()).rejects.toThrow("Não foi possível concluir"); });
  it("revogação usa owner fixo e não apaga registros", async () => { expect(await caller().revoke({ id: 7 })).toEqual({ success: true }); expect(mocks.revoke).toHaveBeenCalledWith(1, 7); });
  it("sem conta principal não cria chave", async () => { mocks.owner.mockResolvedValue(null); await expect(caller().create({ name: "IA", scopes: ["sku:read"], expiresDays: 30 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); expect(mocks.create).not.toHaveBeenCalled(); });
});
