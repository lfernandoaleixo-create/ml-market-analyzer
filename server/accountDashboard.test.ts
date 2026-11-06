import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({
  sellerId: 3308178634,
  listings: vi.fn(),
  visits: vi.fn(),
  specs: vi.fn(),
  upsertCredentials: vi.fn(),
}));

vi.mock("./ml/oauthMl", () => ({
  ensureUserAccessToken: vi.fn(async () => "TEST_TOKEN_NOT_REAL"),
  forceRefreshUserAccessToken: vi.fn(async () => "TEST_TOKEN_NOT_REAL"),
}));
vi.mock("./dbMl", () => ({
  resolveMlOwnerUserId: vi.fn(async (id: number) => id),
  getCredentials: vi.fn(async () => ({ mlUserId: state.sellerId, status: "connected" })),
  upsertCredentials: state.upsertCredentials,
}));
vi.mock("./ml/resolveMlUserId", () => ({
  resolveMlUserId: vi.fn(async () => ({ mlUserId: state.sellerId, source: "db" })),
}));
vi.mock("./ml/accountProvider", () => {
  class MLDataUnavailableError extends Error {}
  class MLRateLimitError extends Error {}
  class AccountProvider {
    readonly sellerId: number;
    constructor(_token: string, id: number) { this.sellerId = id; }
    getListings() { return state.listings(this.sellerId); }
    getVisitsSeriesOnly() { return state.visits(this.sellerId); }
    getTechnicalSpecs() { return state.specs(this.sellerId); }
  }
  return { AccountProvider, MLDataUnavailableError, MLRateLimitError };
});

import { accountRouter } from "./routers/account";
import { MLDataUnavailableError, MLRateLimitError } from "./ml/accountProvider";
import { __clearAccountCache } from "./ml/accountCache";

function caller(id = 42) {
  return accountRouter.createCaller({
    user: { id, openId: "unit-test", name: "Pessoa teste", email: null, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { headers: {}, protocol: "https" },
    res: {},
  } as TrpcContext);
}

beforeEach(() => {
  __clearAccountCache();
  vi.clearAllMocks();
  state.sellerId = 3308178634;
  state.listings.mockReset().mockResolvedValue({ items: [{ itemId: "MLB_TEST" }], summary: { total: 47, active: 47, capped: false } });
  state.visits.mockReset().mockResolvedValue({ series: [{ date: "2026-11-06", visits: 12 }], attempted: 47, resolved: 47 });
  state.specs.mockReset().mockResolvedValue({ items: [], summary: { total: 47 } });
});

describe("account dashboard — estados de dados", () => {
  it("retorna os anúncios confirmados, não uma lista fabricada vazia", async () => {
    const result = await caller().listings({ lastDays: 30 });
    expect(result.summary.total).toBe(47);
    expect(result.items).toHaveLength(1);
    expect(result.stale).toBe(false);
  });

  it("falha essencial sem snapshot é BAD_GATEWAY, não sucesso com zero anúncios", async () => {
    state.listings.mockRejectedValueOnce(new MLDataUnavailableError("API indisponível"));
    await expect(caller().listings()).rejects.toMatchObject({ code: "BAD_GATEWAY", message: "API indisponível" });
  });

  it("falha da série sem snapshot é erro explícito, não sem visitas", async () => {
    state.visits.mockRejectedValueOnce(new MLDataUnavailableError("Visitas indisponíveis"));
    await expect(caller().visitsSeries()).rejects.toMatchObject({ code: "BAD_GATEWAY" });
  });

  it("nenhum anúncio resolvido não pode promover série zerada ao cache", async () => {
    state.visits.mockResolvedValueOnce({ series: [{ date: "2026-11-06", visits: 0 }], attempted: 47, resolved: 0 });
    await expect(caller().visitsSeries()).rejects.toMatchObject({ code: "BAD_GATEWAY" });
  });

  it("zero visitas realmente confirmado permanece válido", async () => {
    state.visits.mockResolvedValueOnce({ series: [{ date: "2026-11-06", visits: 0 }], attempted: 47, resolved: 47 });
    const result = await caller().visitsSeries();
    expect(result.series[0].visits).toBe(0);
    expect(result.partial).toBe(false);
    expect(result.status).toBe("fresh");
  });

  it("contagem parcialmente resolvida é identificada como parcial", async () => {
    state.visits.mockResolvedValueOnce({ series: [{ date: "2026-11-06", visits: 8 }], attempted: 47, resolved: 30 });
    const result = await caller().visitsSeries();
    expect(result.partial).toBe(true);
    expect(result.status).toBe("partial");
    expect(result.resolved).toBe(30);
    expect(result.attempted).toBe(47);
  });

  it("429 preserva seu código de erro, sem virar uma série vazia", async () => {
    state.visits.mockRejectedValueOnce(new MLRateLimitError("ML 429"));
    await expect(caller().visitsSeries()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("uma reconexão não serve o snapshot da loja anterior", async () => {
    const first = await caller().listings();
    expect(first.summary.total).toBe(47);
    state.sellerId = 197259225;
    state.listings.mockResolvedValueOnce({ items: [], summary: { total: 0, active: 0, capped: false } });
    const second = await caller().listings();
    expect(second.summary.total).toBe(0);
    expect(state.listings).toHaveBeenCalledTimes(2);
  });

  it("o cache da ficha técnica também pertence ao vendedor ML correto", async () => {
    expect((await caller().technicalSpecs()).summary.total).toBe(47);
    state.sellerId = 197259225;
    state.specs.mockResolvedValueOnce({ items: [], summary: { total: 0 } });
    expect((await caller().technicalSpecs()).summary.total).toBe(0);
    expect(state.specs).toHaveBeenCalledTimes(2);
  });

  it("Atualizar agora busca nova informação dentro do TTL", async () => {
    const client = caller();
    await client.listings();
    state.listings.mockResolvedValueOnce({ items: [], summary: { total: 48, active: 48, capped: false } });
    await client.refreshDashboard();
    expect((await client.listings()).summary.total).toBe(48);
    expect(state.upsertCredentials).not.toHaveBeenCalled();
  });

  it("uma atualização com falha mantém os 47 anúncios confirmados e marca cache antigo", async () => {
    const client = caller();
    await client.listings();
    state.listings.mockRejectedValueOnce(new MLDataUnavailableError("API indisponível"));
    await client.refreshDashboard();
    const result = await client.listings();
    expect(result.summary.total).toBe(47);
    expect(result.stale).toBe(true);
  });

  it("usuário não autenticado não pode invalidar o cache do dashboard", async () => {
    const anonymous = accountRouter.createCaller({ user: null, req: { headers: {} }, res: {} } as TrpcContext);
    await expect(anonymous.refreshDashboard()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
