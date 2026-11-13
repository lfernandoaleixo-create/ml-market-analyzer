// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Ads from "../client/src/pages/Ads";
import type { AdsAdRow, AdsCampaign, AdsMetrics } from "../shared/ads";

const mocks = vi.hoisted(() => ({ refetch: vi.fn() }));

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    account: { storeLifetime: { useQuery: () => ({ data: { firstSaleMs: null } }) } },
    ads: {
      access: { useQuery: () => ({ data: { connected: true, hasAds: true } }) },
      dashboard: { useQuery: () => query({
        summary: {
          metrics,
          derived: { roas: 5, acos: 20, conversionRate: 2, totalBudget: 100, organicShare: 10 },
        },
        topCampaigns: [campaign], topAds: [ad],
      }) },
      campaigns: { useQuery: () => query([campaign]) },
      ads: { useQuery: () => query([ad, { ...ad, itemId: "synthetic-zero", title: "Anúncio sintético sem gasto", metrics: { ...metrics, cost: 0 } }]) },
      categories: { useQuery: () => query({
        computedAt: 0,
        categories: [{
          key: "outros", label: "Categoria sintética com título longo", adCount: 1, activeAdCount: 1,
          metrics, derived: { acos: 20, conversionRate: 2 }, sampleAds: [ad],
        }],
      }) },
      insights: { useQuery: () => query([{
        id: "synthetic-insight", severity: "warning", scope: "campaign", title: "Título de inteligência sintético extenso para testar quebra",
        detail: "Detalhe sintético para teste sem serviços externos.", metric: { label: "Gasto", value: "R$ 100,00" },
      }]) },
      audit: { useQuery: () => query({
        daysTracked: 2, trackingSince: null, snapshotDays: 2,
        summary: { totalChanges: 1, coherent: 0, questionable: 1 },
        changes: [{
          id: 1, campaignName: campaign.name, detectedDay: "2026-01-02", verdict: "questionable", field: "strategy",
          oldValue: "ESTRATEGIA_SINTETICA_ANTIGA_MUITO_EXTENSA", newValue: "ESTRATEGIA_SINTETICA_NOVA_MUITO_EXTENSA",
          assessment: "Avaliação sintética", recommendation: "Recomendação sintética",
        }],
        managedCampaigns: [{ ...campaign, campaignId: 1, managedByMamba: true, ourVerdict: "questionable", ourComment: "Comentário sintético" }],
      }) },
    },
  },
}));
vi.mock("../client/src/hooks/usePeriod", () => ({
  usePeriod: () => ({
    key: "current", title: "Período sintético", days: 7, setKey: vi.fn(),
    fromIso: "2026-01-01", toIso: "2026-01-07", setFromIso: vi.fn(), setToIso: vi.fn(),
  }),
}));
vi.mock("../client/src/components/PeriodSelector", () => ({ PeriodSelector: () => null }));

const metrics: AdsMetrics = {
  clicks: 50, prints: 1000, cost: 100, cpc: 2, ctr: 5, acos: 20, sov: 0,
  directAmount: 400, indirectAmount: 100, totalAmount: 500,
  directUnits: 1, indirectUnits: 0, units: 1, organicUnits: 1, organicItems: 1,
};
const campaign: AdsCampaign = {
  id: 1, name: "Campanha sintética com nome extenso para testar a apresentação completa", status: "active",
  strategy: "PROFITABILITY", acosTarget: 20, roasTarget: null, budget: 100,
  automaticBudget: false, channel: "test", dateCreated: null, lastUpdated: null, metrics,
};
const ad: AdsAdRow = {
  itemId: "synthetic-ad", campaignId: 1, title: "Anúncio sintético com título completo e longo para testar a quebra sem truncamento",
  price: 500, status: "active", thumbnail: null, permalink: "https://example.invalid/ads-synthetic",
  listingTypeId: null, logisticType: null, buyBoxWinner: true, catalogListing: false,
  brand: null, imageQuality: null, hasDiscount: false, metrics,
};
function query(data: unknown) {
  return { data, isLoading: false, isError: false, isFetching: false, refetch: mocks.refetch };
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.refetch.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Ads />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const result = [...container.querySelectorAll<HTMLButtonElement>("button")].find(el => el.textContent?.trim() === label);
  expect(result).toBeDefined();
  return result!;
}
function selectTab(label: string) {
  act(() => {
    const tab = button(label);
    // Radix Tabs activates on primary-button mouse down; no application/network calls.
    tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  });
}
function click(el: HTMLElement) {
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}
function expectClasses(el: Element, classes: string[]) {
  for (const name of classes) expect(el.classList.contains(name), name).toBe(true);
}
function tableRegion(label: string, minWidth: string) {
  const region = container.querySelector<HTMLElement>(`[role="region"][aria-label^="${label}"]`)!;
  expect(region).not.toBeNull();
  expectClasses(region, ["min-w-0", "max-w-full", "overflow-x-auto"]);
  expect(region.tabIndex).toBe(0);
  expectClasses(region.querySelector("table")!, ["w-full", minWidth]);
  return region;
}

// jsdom does not perform layout or apply Tailwind breakpoints. These tests cover
// rendered class contracts and interactions, not visual validation at any width.
describe("Publicidade — contratos responsivos e controles preservados", () => {
  it("mantém as seis abas em grade móvel/tablet e restaura a linha desktop", () => {
    const list = container.querySelector('[role="tablist"]')!;
    expectClasses(list, ["grid", "h-auto", "min-w-0", "w-full", "grid-cols-2", "sm:grid-cols-3", "xl:flex"]);
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    expect(tabs.map(tab => tab.textContent?.trim())).toEqual(["Resumo", "Campanhas", "Anúncios", "Categorias", "Auditoria Mamba", "Inteligência"]);
    for (const tab of tabs) {
      expectClasses(tab, ["min-h-11", "min-w-0", "whitespace-normal", "xl:whitespace-nowrap"]);
      expect(tab.className).not.toMatch(/(?:^|\s)(?:hidden|sm:hidden)(?:\s|$)/);
    }
  });

  it("empilha KPIs no celular e mantém as duas/quatro colunas maiores e o botão atualizar", () => {
    const grids = [...container.querySelectorAll("div.grid")].filter(el => el.classList.contains("lg:grid-cols-4"));
    expect(grids).toHaveLength(2);
    for (const grid of grids) expectClasses(grid, ["grid-cols-1", "sm:grid-cols-2", "lg:grid-cols-4", "min-w-0"]);
    const refresh = button("Atualizar resumo");
    expectClasses(refresh, ["min-h-11", "w-full", "sm:w-auto"]);
    click(refresh);
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("mantém todas as colunas de campanhas na rolagem local", () => {
    selectTab("Campanhas");
    const region = tableRegion("Tabela de campanhas", "min-w-[760px]");
    expect([...region.querySelectorAll("th")].map(el => el.textContent)).toEqual([
      "Campanha", "Estratégia", "Invest.", "Receita", "ACOS", "Alvo", "Cliques", "Unid.", "Orçam./dia",
    ]);
    const name = [...region.querySelectorAll("span")].find(el => el.textContent === campaign.name)!;
    expectClasses(name, ["break-words", "[overflow-wrap:anywhere]"]);
    expect(name.classList.contains("truncate")).toBe(false);
  });

  it("mantém títulos, preço, CTR, link tocável e filtro de anúncios sem alterar os dados", () => {
    selectTab("Anúncios");
    const region = tableRegion("Tabela de anúncios", "min-w-[700px]");
    expect(region.querySelectorAll("tbody tr")).toHaveLength(2);
    expect([...region.querySelectorAll("th")].map(el => el.textContent)).toEqual(["Anúncio", "Preço", "Invest.", "Cliques", "CTR", "ACOS", "Unid."]);
    const title = region.querySelector("td p")!;
    expect(title.textContent).toBe(ad.title);
    expectClasses(title, ["whitespace-normal", "break-words"]);
    expect(title.classList.contains("truncate")).toBe(false);
    const link = region.querySelector("a")!;
    expect(link.getAttribute("href")).toBe(ad.permalink);
    expect(link.getAttribute("target")).toBe("_blank");
    expectClasses(link, ["min-h-11", "min-w-11"]);
    click(button("Só com gasto"));
    expect(region.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(button("Mostrando com gasto")).toBeDefined();
    click(button("Mostrando com gasto"));
    expect(region.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("remove mínimo fixo do banner de categorias e permite abrir/fechar detalhes com títulos completos", () => {
    selectTab("Categorias");
    const bannerTitle = [...container.querySelectorAll("p")].find(el => el.textContent?.startsWith("Rastreio por categoria"))!;
    const banner = bannerTitle.parentElement!.parentElement!;
    expectClasses(banner, ["min-w-0", "flex-1"]);
    expect(banner.className).not.toContain("min-w-[260px]");
    const reveal = button("Ver anúncios");
    expectClasses(reveal, ["min-h-11"]);
    expectClasses(reveal.parentElement!, ["flex-wrap", "gap-2"]);
    click(reveal);
    const title = [...container.querySelectorAll("span")].find(el => el.textContent === ad.title)!;
    expect(title).toBeDefined();
    expectClasses(title, ["min-w-0", "break-words"]);
    expect(title.classList.contains("truncate")).toBe(false);
    click(button("Ocultar"));
    expect(container.textContent).not.toContain(ad.title);
    click(button("Atualizar"));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("quebra mudanças longas da auditoria sem ocultar os valores anterior/novo", () => {
    selectTab("Auditoria Mamba");
    const previous = [...container.querySelectorAll("span")].find(el => el.textContent === "ESTRATEGIA_SINTETICA_ANTIGA_MUITO_EXTENSA")!;
    expect(previous).toBeDefined();
    expectClasses(previous.parentElement!, ["flex-wrap", "gap-2"]);
    expectClasses(previous.parentElement!.parentElement!, ["min-w-0", "[overflow-wrap:anywhere]"]);
    expect(container.textContent).toContain("ESTRATEGIA_SINTETICA_NOVA_MUITO_EXTENSA");
    expect(container.textContent).toContain("Nossa avaliação da configuração atual");
    const grid = [...container.querySelectorAll("div.grid")].find(el => el.classList.contains("lg:grid-cols-4"))!;
    expectClasses(grid, ["grid-cols-1", "sm:grid-cols-2"]);
  });

  it("permite quebrar título e selo da inteligência mantendo detalhe e métrica", () => {
    selectTab("Inteligência");
    const title = container.querySelector("h3")!;
    expectClasses(title.parentElement!, ["flex-wrap", "gap-2"]);
    expect(container.textContent).toContain("Detalhe sintético para teste sem serviços externos.");
    expect(container.textContent).toContain("R$ 100,00");
  });
});
