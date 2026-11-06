import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountProvider, MLDataUnavailableError, MLRateLimitError } from "./ml/accountProvider";
import { TechSpecsCard } from "../client/src/components/account/TechSpecsCard";
import { buildTechSpecsResult, diagnoseListing } from "../shared/technicalSpecs";

const query = vi.hoisted(() => ({ data: undefined as any, error: null as any, isLoading: false, isFetching: false }));
vi.mock("@/lib/trpc", () => ({ trpc: { account: { technicalSpecs: { useQuery: () => ({ ...query, refetch: vi.fn() }) } } } }));

beforeEach(() => {
  vi.stubGlobal("React", React);
  Object.assign(query, { data: undefined, error: null, isLoading: false, isFetching: false });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const detail = (id: string) => ({ id, title: "Anúncio de teste", status: "active", category_id: "MLBTEST", attributes: [] });
function provider(multiget: unknown, catalog: unknown = []) {
  const account = new AccountProvider("TEST_TOKEN", 3308178634);
  vi.spyOn(account as any, "get").mockImplementation(async (path: unknown) => {
    const url = String(path);
    if (url.startsWith("/users/")) return { paging: { total: 1 }, results: ["MLB10000000"] };
    if (url.startsWith("/items?")) return multiget;
    if (url.startsWith("/categories/")) return catalog;
    throw new Error("Unexpected mocked endpoint");
  });
  return account;
}

const valid = [{ code: 200, body: detail("MLB10000000") }];
describe("Raio-X — consultas essenciais não viram zero ou perfeição falsos", () => {
  it.each([
    ["null", null], ["objeto inválido", {}], ["array vazio", []],
    ["HTTP 500 individual", [{ code: 500 }]], ["HTTP 404 individual", [{ code: 404 }]],
    ["body ausente", [{ code: 200 }]],
    ["item de outro lote", [{ code: 200, body: detail("MLB99999999") }]],
    ["status ausente", [{ code: 200, body: { ...detail("MLB10000000"), status: null } }]],
    ["categoria ausente", [{ code: 200, body: { ...detail("MLB10000000"), category_id: null } }]],
    ["atributos ausentes", [{ code: 200, body: { ...detail("MLB10000000"), attributes: null } }]],
    ["atributo malformado", [{ code: 200, body: { ...detail("MLB10000000"), attributes: [{}] } }]],
  ])("rejeita multiget %s depois de uma busca não vazia", async (_label, payload) => {
    await expect(provider(payload).getTechnicalSpecs()).rejects.toBeInstanceOf(MLDataUnavailableError);
  });

  it("propaga rate limit individual em vez de ficha vazia", async () => {
    await expect(provider([{ code: 429 }]).getTechnicalSpecs()).rejects.toBeInstanceOf(MLRateLimitError);
  });

  it.each([null, {}, [{}]])("catálogo indisponível não vira ficha 100%% completa: %j", async (catalog) => {
    await expect(provider(valid, catalog).getTechnicalSpecs()).rejects.toBeInstanceOf(MLDataUnavailableError);
  });

  it("aceita catálogo vazio explicitamente confirmado pela API", async () => {
    const result = await provider(valid, []).getTechnicalSpecs();
    expect(result.summary.total).toBe(1);
    expect(result.summary.allComplete).toBe(true);
  });

  it("mantém zero confirmado quando a busca ativa retorna total zero", async () => {
    const account = new AccountProvider("TEST_TOKEN", 3308178634);
    const get = vi.spyOn(account as any, "get").mockResolvedValue({ paging: { total: 0 }, results: [] });
    const result = await account.getTechnicalSpecs();
    expect(result.summary.total).toBe(0);
    expect(result.summary.allComplete).toBe(false);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("carrega os 47 anúncios confirmados por uma API simulada em três lotes", async () => {
    const ids = Array.from({ length: 47 }, (_, i) => `MLB${10000000 + i}`);
    const account = new AccountProvider("TEST_TOKEN", 3308178634);
    vi.spyOn(account as any, "get").mockImplementation(async (path: unknown) => {
      const url = new URL(String(path), "https://mock.invalid");
      if (url.pathname.startsWith("/users/")) return { paging: { total: ids.length }, results: ids };
      if (url.pathname === "/items") return url.searchParams.get("ids")!.split(",").map(id => ({ code: 200, body: detail(id) }));
      if (url.pathname.startsWith("/categories/")) return [];
      throw new Error("Unexpected mocked endpoint");
    });
    const result = await account.getTechnicalSpecs();
    expect(result.items).toHaveLength(47);
    expect(result.summary.total).toBe(47);
  });

  it("não aceita respostas duplicadas como duas fichas válidas", async () => {
    const account = new AccountProvider("TEST_TOKEN", 3308178634);
    vi.spyOn(account as any, "get").mockImplementation(async (path: unknown) => String(path).startsWith("/users/")
      ? { paging: { total: 2 }, results: ["MLB10000000", "MLB10000001"] }
      : [valid[0], valid[0]]);
    await expect(account.getTechnicalSpecs()).rejects.toBeInstanceOf(MLDataUnavailableError);
  });
});

function render(connected = true) {
  return renderToStaticMarkup(React.createElement(TechSpecsCard, { connected }));
}
describe("Raio-X — UI diferencia consulta indisponível de zero real", () => {
  it("erro sem resultado mostra travessão, não 0/0 nem tudo certo", () => {
    query.error = new Error("Falha da API");
    const html = render();
    expect(html).toContain("Consulta não confirmada");
    expect(html).toContain("As fichas técnicas ainda não foram consultadas com sucesso.");
    expect(html).toContain("—");
    expect(html).not.toContain("0 / 0");
    expect(html).not.toContain("0% dos ativos");
    expect(html).not.toContain("tudo certo por aqui");
    expect(html).not.toContain("Tudo certo!");
  });

  it("conta desconectada não declara zero anúncios", () => {
    const html = render(false);
    expect(html).toContain("Conta não conectada");
    expect(html).not.toContain("0 / 0");
    expect(html).not.toContain("Nenhum anúncio ativo foi retornado");
  });

  it("busca confirmada vazia mostra zero sem declarar todas as fichas perfeitas", () => {
    query.data = buildTechSpecsResult([]);
    const html = render();
    expect(html).toContain("0 / 0");
    expect(html).toContain("Nenhum anúncio ativo foi retornado para a conta conectada nesta consulta.");
    expect(html).not.toContain("Tudo certo!");
    expect(html).not.toContain("tudo certo por aqui");
  });

  it("preserva o resultado anterior de 47 fichas com aviso de atualização não confirmada", () => {
    const items = Array.from({ length: 47 }, (_, i) => diagnoseListing({
      itemId: `MLB${10000000 + i}`, title: "Teste", status: "active", categoryId: "MLBTEST",
      categoryAttributes: [], itemAttributes: [],
    }));
    query.data = buildTechSpecsResult(items);
    query.error = new Error("Falha na atualização");
    const html = render();
    expect(html).toContain("Exibindo o resultado anterior.");
    expect(html).toContain("47 / 47");
    expect(html).not.toContain("0 / 0");
  });
});
