import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { buildTechSpecsResult, diagnoseListing } from "../shared/technicalSpecs";
const state = vi.hoisted(() => ({ connected: true, listingError: true, tech: undefined as any }));
const query = (data?: unknown, error?: unknown) => ({ data, error, isLoading: false, isFetching: false, dataUpdatedAt: 0, refetch: vi.fn() });
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ account: { technicalSpecs: { invalidate: vi.fn() } } }),
  account: {
    refreshDashboard: { useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) },
    connection: { useQuery: () => query({ connected: state.connected, nickname: "TOUJOURS" }) },
    listings: { useQuery: () => query(undefined, state.listingError ? new Error("Consulta indisponível") : undefined) },
    visitsSeries: { useQuery: () => query() },
    visitsDaily: { useQuery: () => query({ items: {} }) },
    technicalSpecs: { useQuery: () => query(state.tech) },
  },
  ads: { ads: { useQuery: () => query([]) } },
} }));
import Anuncios from "../client/src/pages/Anuncios";
beforeEach(() => {
  vi.stubGlobal("React", React);
  state.connected = true;
  state.listingError = true;
  state.tech = buildTechSpecsResult([diagnoseListing({ itemId: "MLBTEST", title: "Anúncio confirmado de teste", status: "active", categoryId: "MLBTEST", itemAttributes: [], categoryAttributes: [] })]);
});
afterEach(() => vi.unstubAllGlobals());
describe("Meus anúncios — Raio-X independente", () => {
  it("falha da listagem não esconde a ficha técnica consultada", () => {
    const html = renderToStaticMarkup(React.createElement(Anuncios));
    expect(html).toContain("Raio-X da Ficha Técnica");
    expect(html).toContain("Anúncio confirmado de teste");
    expect(html).toContain("Demais indicadores de anúncios");
    expect(html.indexOf("Raio-X da Ficha Técnica")).toBeLessThan(html.indexOf("Demais indicadores de anúncios"));
  });
  it("card permanece acessível mesmo quando a conexão ainda não está confirmada", () => {
    state.connected = false;
    state.tech = undefined;
    const html = renderToStaticMarkup(React.createElement(Anuncios));
    expect(html).toContain("Raio-X da Ficha Técnica");
    expect(html).toContain("Conta não conectada");
    expect(html).not.toContain("0 / 0");
  });
});
