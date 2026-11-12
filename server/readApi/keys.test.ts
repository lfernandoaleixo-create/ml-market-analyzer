import { beforeEach, describe, expect, it, vi } from "vitest";
const dbState = vi.hoisted(() => ({ rows: [] as any[], inserts: [] as any[], patches: [] as any[], unavailable: false }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => dbState.unavailable ? null : {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => dbState.rows, orderBy: async () => dbState.rows }) }) }),
  insert: () => ({ values: async (value: unknown) => { dbState.inserts.push(value); } }),
  update: () => ({ set: (patch: unknown) => ({ where: async () => { dbState.patches.push(patch); } }) }),
}) }));
import { activeReadApiKey, authenticateReadApiKey, createReadApiKey, generateReadApiKey, hashReadApiKey, listReadApiKeys, parseReadApiScopes, revokeReadApiKey } from "./keys";
function row(patch = {}) { return { id: 7, ownerUserId: 1, createdBy: 1, name: "IA autorizada", prefix: "mrc_read_prefix", keyHash: "HASH_NAO_PUBLICO", scopes: ["mercado:read"], createdAt: new Date(0), expiresAt: new Date(Date.now() + 60000), revokedAt: null, ...patch }; }
beforeEach(() => Object.assign(dbState, { rows: [], inserts: [], patches: [], unavailable: false }));
describe("Chaves de leitura — segurança e metadados", () => {
  it("gera 256 bits aleatórios e não repete chaves", () => {
    const first = generateReadApiKey(); const second = generateReadApiKey();
    expect(first.key).toMatch(/^mrc_read_[A-Za-z0-9_-]{43}$/); expect(first.key).not.toEqual(second.key);
    expect(first.keyHash).toBe(hashReadApiKey(first.key)); expect(first.keyHash).toHaveLength(64); expect(first.prefix.length).toBeLessThan(first.key.length);
  });
  it.each([[], ["write"], ["mercado:read", "sku:write"], "INVALID", null])("permissões inválidas falham fechado: %j", scopes => { expect(parseReadApiScopes(scopes)).toBeNull(); expect(activeReadApiKey(row({ scopes }) as any)).toBeNull(); });
  it("JSON válido é aceito e elimina duplicatas", () => { expect(parseReadApiScopes('["sku:read","sku:read"]')).toEqual(["sku:read"]); });
  it.each([{ revokedAt: new Date() }, { expiresAt: new Date(0) }, { expiresAt: new Date("invalid") }, { ownerUserId: -1 }])("expirada/revogada/corrompida nunca autoriza: %j", patch => { expect(activeReadApiKey(row(patch) as any)).toBeNull(); });
  it("chave válida retorna apenas principal mínimo", () => { expect(activeReadApiKey(row() as any)).toEqual({ id: 7, ownerUserId: 1, scopes: ["mercado:read"] }); });
  it.each([undefined, "", "password", "Bearer pessoal", "mrc_read_" + "a".repeat(43), "Bearer " + "a".repeat(43)])("não aceita senha/session/token genérico %s", async header => { expect(await authenticateReadApiKey(header)).toBeNull(); });
  it("faz lookup somente pelo hash da chave e reavalia revogação", async () => {
    const token = generateReadApiKey().key; dbState.rows = [row()]; expect(await authenticateReadApiKey(`Bearer ${token}`)).toMatchObject({ id: 7 });
    dbState.rows = [row({ revokedAt: new Date() })]; expect(await authenticateReadApiKey(`Bearer ${token}`)).toBeNull();
  });
  it("lista não retorna hash nem identidade de criador", async () => { dbState.rows = [row()]; const result = await listReadApiKeys(1); expect(result[0]).not.toHaveProperty("keyHash"); expect(result[0]).not.toHaveProperty("createdBy"); expect(result[0]).not.toHaveProperty("ownerUserId"); });
  it("chave antiga ativa permanece listada após cem criações posteriores", async () => {
    dbState.rows = Array.from({ length: 102 }, (_, i) => row({ id: i + 1, revokedAt: i === 101 ? null : new Date() }));
    const result = await listReadApiKeys(1);
    expect(result).toHaveLength(102); expect(result.find(key => key.id === 102)?.revokedAt).toBeNull();
  });
  it("criação grava apenas hash e mostra plaintext somente no retorno", async () => {
    dbState.rows = [row()]; const result = await createReadApiKey(1, 1, { name: "IA", scopes: ["mercado:read"], expiresDays: 30 });
    expect(result.key).toMatch(/^mrc_read_/); expect(dbState.inserts[0].keyHash).toBe(hashReadApiKey(result.key)); expect(JSON.stringify(dbState.inserts)).not.toContain(result.key); expect(result.metadata).not.toHaveProperty("keyHash");
  });
  it("revoga sem apagar registros; chave inexistente não atualiza", async () => {
    expect(await revokeReadApiKey(1, 7)).toBe(false); expect(dbState.patches).toHaveLength(0);
    dbState.rows = [{ id: 7 }]; expect(await revokeReadApiKey(1, 7)).toBe(true); expect(dbState.patches[0].revokedAt).toBeInstanceOf(Date);
  });
  it("banco indisponível não permite autenticação", async () => { dbState.unavailable = true; await expect(authenticateReadApiKey(`Bearer ${generateReadApiKey().key}`)).rejects.toThrow("READ_API_DATABASE_UNAVAILABLE"); });
});
