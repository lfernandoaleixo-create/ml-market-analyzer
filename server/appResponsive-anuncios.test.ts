// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ListingRow, TechSpecListing } from "../shared/account";

const fixtures = vi.hoisted(() => ({ listings: [] as ListingRow[], technical: [] as TechSpecListing[] }));
vi.mock("@/lib/trpc", () => {
  const query = (data: unknown) => ({ data, isLoading: false, isFetching: false, error: null, dataUpdatedAt: 1, refetch: vi.fn() });
  return { trpc: {
    useUtils: () => ({ account: { technicalSpecs: { invalidate: vi.fn() } } }),
    account: {
      connection: { useQuery: () => query({ connected: true, nickname: "CONTA_SIMULADA" }) },
      refreshDashboard: { useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) },
      listings: { useQuery: () => query({ items: fixtures.listings, stale: true, summary: { total: fixtures.listings.length, active: fixtures.listings.length, paused: 0, closed: 0 } }) },
      visitsSeries: { useQuery: () => query({ series: [], pending: true }) },
      visitsDaily: { useQuery: () => query({ items: {} }) },
      technicalSpecs: { useQuery: () => query({ items: fixtures.technical, summary: { total: fixtures.technical.length, complete: 0, incomplete: 1, withMissingRequired: 1, avgCompleteness: 0.5, totalMissing: 1, capped: false } }) },
    },
    ads: { ads: { useQuery: () => query([]) } },
  } };
});
vi.mock("@/lib/exportListingsPdf", () => ({ exportListingsPdf: vi.fn() }));
vi.mock("@/components/account/ActiveListingsCard", () => ({ ActiveListingsCard: () => null }));
vi.mock("@/components/charts/DayVisitsBreakdownDialog", () => ({ DayVisitsBreakdownDialog: () => null }));
// The chart engine is excluded: these tests verify surrounding layout, not SVG geometry.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => React.createElement("div", { "data-chart-mock": true }, children),
  ComposedChart: () => React.createElement("div", { "data-series-mock": true }),
  Area: () => null, Line: () => null, Legend: () => null, CartesianGrid: () => null,
  Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));
import Anuncios from "../client/src/pages/Anuncios";
import { TechSpecsCard } from "../client/src/components/account/TechSpecsCard";
import { VisitsEvolutionChart } from "../client/src/components/charts/VisitsEvolutionChart";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
beforeAll(() => {
  // The project uses JSX preserve; Vitest's default TSX transform may use classic React JSX.
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
  fixtures.listings = [{ itemId: "SIMULADO_1", title: "Título longo simulado para validar leitura sem omitir colunas", price: 1234.56, currency: "BRL", availableQuantity: 2, soldQuantity: 1, status: "active", listingType: "gold_special", visits: 20, visitsAvailable: true, conversion: 0.05, stockValue: 2469.12 }];
  fixtures.technical = [{ itemId: "SIMULADO_1", title: "Título longo da ficha simulada para leitura completa no celular", status: "active", permalink: "https://example.invalid/anuncio", totalAttributes: 2, filledAttributes: 1, missingAttributes: 1, missingRequired: 1, completeness: 0.5, complete: false, attributes: [
    { id: "EXAMPLE_REQUIRED", name: "Nome de atributo obrigatório longo para quebrar a linha sem cortar", valueType: "string", required: true, valueName: null, isMissing: true, hint: "Exemplo simulado longo que deve continuar legível ao lado da opção Não se aplica" },
    { id: "SELLER_SKU", name: "SKU", valueType: "string", required: false, valueName: "SKU-SIMULADO-IMUTAVEL-0001", isMissing: false },
  ] }];
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});
function render(element: React.ReactElement) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderToStaticMarkup(element);
  return wrapper;
}
function classes(element: Element | null) { return element?.getAttribute("class")?.split(/\s+/) ?? []; }
function buttonByText(wrapper: ParentNode, text: string) {
  return [...wrapper.querySelectorAll("button")].find(button => button.textContent?.includes(text));
}

describe("Responsividade focada de anúncios (DOM/SSR, sem teste visual)", () => {
  it("mantém todas as colunas em uma região de rolagem local e focalizável", () => {
    const wrapper = render(React.createElement(Anuncios));
    const region = wrapper.querySelector('[role="region"][aria-label^="Lista de anúncios"]');
    expect(classes(region)).toEqual(expect.arrayContaining(["w-full", "min-w-0", "max-w-full", "overflow-x-auto", "overscroll-x-contain"]));
    expect(region?.getAttribute("tabindex")).toBe("0");
    const table = region?.querySelector("table");
    expect(classes(table!)).toContain("min-w-[1040px]");
    expect(table?.querySelectorAll("thead th")).toHaveLength(8);
    expect(table?.querySelectorAll("tbody td")).toHaveLength(8);
    expect(table?.textContent).toContain(fixtures.listings[0].title);
    expect(table?.textContent).toContain("1.234,56");
    expect([...table!.querySelectorAll("th button")].every(button => classes(button).includes("min-h-10"))).toBe(true);
  });
  it("mantém atualização, PDF e aviso de cache disponíveis no mobile", () => {
    const wrapper = render(React.createElement(Anuncios));
    for (const text of ["Atualizar agora", "Baixar PDF"]) {
      expect(classes(buttonByText(wrapper, text)!)).toEqual(expect.arrayContaining(["h-10", "sm:h-9"]));
    }
    const cache = [...wrapper.querySelectorAll("span")].find(span => span.textContent?.startsWith("Dados em cache"));
    expect(classes(cache!)).not.toContain("hidden");
  });
  it("permite que os campos de preço e a busca ocupem a largura disponível", () => {
    const wrapper = render(React.createElement(Anuncios));
    for (const placeholder of ["mín", "máx"]) {
      expect(classes(wrapper.querySelector(`input[placeholder="${placeholder}"]`))).toEqual(expect.arrayContaining(["min-w-0", "flex-1", "sm:w-20"]));
    }
    const search = wrapper.querySelector('input[placeholder="Buscar por nome ou ID..."]');
    expect(classes(search?.parentElement!)).toEqual(expect.arrayContaining(["w-full", "min-w-0", "sm:w-44"]));
  });
  it("empilha KPIs estreitos e deixa o seletor de filtros da ficha quebrar linhas", () => {
    const wrapper = render(React.createElement(TechSpecsCard, { connected: true }));
    const kpiGrid = [...wrapper.querySelectorAll("div")].find(div => classes(div).includes("lg:grid-cols-4"));
    expect(classes(kpiGrid!)).toEqual(expect.arrayContaining(["grid-cols-1", "sm:grid-cols-2"]));
    const required = buttonByText(wrapper, "Faltam obrigatórios")!;
    expect(classes(required.parentElement!)).toContain("flex-wrap");
    expect(classes(required)).toContain("whitespace-normal");
  });
  it("exibe a completude e o título completo da ficha também abaixo de sm", () => {
    const wrapper = render(React.createElement(TechSpecsCard, { connected: true }));
    const listing = buttonByText(wrapper, fixtures.technical[0].title)!;
    expect(classes(listing)).toContain("grid-cols-[minmax(0,1fr)_auto]");
    const progress = [...listing.querySelectorAll("div")].find(div => classes(div).includes("sm:w-36"));
    expect(classes(progress!)).not.toContain("hidden");
    expect(progress?.textContent).toContain("50%");
    expect(listing.querySelector(".line-clamp-2")).toBeNull();
  });
  it("abre o drawer com rolagem vertical, ações empilhadas e SKU preenchido sem corte ou editor", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(React.createElement(TechSpecsCard, { connected: true })));
    await act(async () => buttonByText(container!, fixtures.technical[0].title)!.click());
    const drawer = document.querySelector('[data-slot="sheet-content"]');
    expect(classes(drawer)).toEqual(expect.arrayContaining(["h-dvh", "max-h-dvh", "overflow-y-auto", "w-full", "min-w-0"]));
    const copy = buttonByText(drawer!, "Copiar ficha completa")!;
    expect(classes(copy.parentElement!)).toEqual(expect.arrayContaining(["flex-col", "sm:flex-row"]));
    expect(copy.disabled).toBe(true);
    expect(buttonByText(drawer!, "Abrir no ML")).toBeUndefined();
    expect(drawer?.querySelector('a[href="https://example.invalid/anuncio"]')).not.toBeNull();
    const sku = [...drawer!.querySelectorAll("li")].find(li => li.textContent?.includes("SKU-SIMULADO-IMUTAVEL-0001"));
    expect(sku?.querySelector("input")).toBeNull();
    expect(classes(sku?.querySelector("span:last-child")!)).toContain("break-words");
    expect(sku?.querySelector(".truncate")).toBeNull();
    expect(drawer?.textContent).toContain(fixtures.technical[0].attributes[0].hint!);
  });
  it.each([
    { pending: true, text: "Carregando as visitas", action: "Atualizar agora" },
    { error: "Mensagem de erro simulada ".repeat(30), text: "Visitas indisponíveis", action: "Tentar novamente" },
    { partial: true, text: "Nenhuma visita na parcela consultada", action: "Atualizar visitas" },
  ])("deixa o estado do gráfico crescer sem altura rígida: $text", props => {
    const wrapper = render(React.createElement(VisitsEvolutionChart, { series: [], onRetry: vi.fn(), ...props }));
    expect(classes(wrapper.firstElementChild)).toContain("min-h-52");
    expect(classes(wrapper.firstElementChild)).not.toContain("h-52");
    expect(wrapper.textContent).toContain(props.text);
    expect(buttonByText(wrapper, props.action)).toBeDefined();
  });
  it("preserva os cinco resumos do gráfico com grade responsiva e largura mínima zero", () => {
    const wrapper = render(React.createElement(VisitsEvolutionChart, { series: [{ date: "2026-01-01", visits: 123456789 }], windowDays: 30 }));
    const grid = [...wrapper.querySelectorAll("div")].find(div => classes(div).includes("lg:grid-cols-5"))!;
    expect(classes(grid)).toEqual(expect.arrayContaining(["grid-cols-2", "sm:grid-cols-3"]));
    expect(grid.children).toHaveLength(5);
    for (const summary of [...grid.children]) expect(classes(summary)).toContain("min-w-0");
    expect(grid.textContent).toContain("123.456.789");
  });
});
