// @vitest-environment jsdom
// Autoria: Manus e Fernando. Classes/DOM não substituem teste visual real.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Painel from "../client/src/pages/Painel";

const state = vi.hoisted(() => ({ loading: false, profitLoading: false, configured: true, stale: false }));
vi.mock("../client/src/lib/trpc", () => {
  const query = (data: unknown) => ({ data, isLoading: false, isFetching: false, refetch: vi.fn() });
  const product = (i: number) => ({ itemId: `TEST-${i}`, title: `Produto de teste ${i} com descrição comprida para leitura completa em celular`, thumbnail: null, permalink: undefined, unitsSold: 2, revenue: 246.9 });
  const totals = { revenue: 1234567890.12, commission: 12345678.9, shipping: 100, cmv: 200, tax: 300, ads: 50, netProfit: 1234567.89 };
  return {
    trpc: {
      monitor: { getCredentials: { useQuery: () => query({ tokenExpired: true }) } },
      account: {
        connection: { useQuery: () => ({ ...query({ connected: true, nickname: "Conta de teste" }), isLoading: state.loading, data: state.loading ? undefined : { connected: true, nickname: "Conta de teste" } }) },
        refreshDashboard: { useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) },
        storeLifetime: { useQuery: () => query({ firstSaleMs: 1735689600000, totalRevenue: totals.revenue, totalOrders: 99999, canceledOrders: 10, canceledRevenue: totals.commission }) },
        salesRange: { useQuery: () => query({ kpis: { revenue: totals.revenue, orders: 12 }, daily: [{ date: "2026-11-13", revenue: totals.revenue, orders: 12, cancelled: 1, cancelledAmount: 123.45 }], topProducts: [product(0)] }) },
        listings: { useQuery: () => query({ stale: state.stale, summary: { active: 100, total: 120 } }) },
        visitsSeries: { useQuery: () => query({ series: [], pending: false }) },
        reputation: { useQuery: () => query({ levelId: "5_green", ratingsPositive: 98, ratingsNegative: 2 }) },
        productsByDay: { useQuery: () => query({ revenue: 246.9, orders: 8, unitsSold: 16, products: Array.from({ length: 8 }, (_, i) => product(i)), cancelledProducts: [product(99)], cancelledOrders: 1, cancelledRevenue: 123.45, cancelledUnits: 2 }) },
      },
      finance: {
        status: { useQuery: () => query({ baselinkerConfigured: state.configured }) },
        profitability: { useQuery: () => ({ ...query({ totals }), isLoading: state.profitLoading }) },
      },
    },
  };
});
vi.mock("../client/src/hooks/usePeriod", () => ({ usePeriod: () => ({ key: "current", days: 13, title: "Novembro de 2026", range: { fromMs: 1793491200000, toMs: 1794614400000 }, fromIso: "2026-11-01", toIso: "2026-11-13", setKey: vi.fn(), setFromIso: vi.fn(), setToIso: vi.fn() }) }));
vi.mock("../client/src/components/PeriodSelector", () => ({ PeriodSelector: () => null }));
vi.mock("../client/src/components/charts/VisitsEvolutionChart", () => ({ VisitsEvolutionChart: () => null }));
vi.mock("../client/src/components/charts/DayVisitsBreakdownDialog", () => ({ DayVisitsBreakdownDialog: () => null }));
vi.mock("recharts", async importOriginal => ({ ...(await importOriginal<typeof import("recharts")>()), ResponsiveContainer: () => null }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a>, useLocation: () => ["/painel", vi.fn()] }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.assign(state, { loading: false, profitLoading: false, configured: true, stale: false });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function renderPainel() { act(() => root.render(<Painel />)); }
function clickButton(text: string, scope: ParentNode = container) {
  const button = Array.from(scope.querySelectorAll("button")).find(node => node.textContent?.trim() === text);
  expect(button, `botão ${text}`).toBeDefined();
  act(() => button!.click());
}
function cardByTitle(title: string) {
  const heading = Array.from(container.querySelectorAll("p")).find(node => node.textContent === title);
  expect(heading).toBeDefined();
  return heading!.closest('[data-slot="card"]')!;
}
// Avalia somente o contrato das classes Tailwind nos breakpoints padrão, não medidas do navegador.
function columnsAt(element: Element, width: number) {
  const breakpoints: Record<string, number> = { sm: 640, lg: 1024, xl: 1280 };
  return element.className.split(" ").flatMap(token => {
    const match = token.match(/^(?:(sm|lg|xl):)?grid-cols-(\d+)$/);
    if (!match) return [];
    const min = match[1] ? breakpoints[match[1]] : 0;
    return width >= min ? [{ min, count: Number(match[2]) }] : [];
  }).sort((a, b) => b.min - a.min)[0]?.count;
}

describe("Painel — contratos responsivos de classes/DOM com dados simulados", () => {
  it.each([
    [360, 1, 1, 1], [390, 1, 1, 1], [768, 3, 3, 3], [1024, 3, 3, 4], [1440, 6, 7, 8],
  ])("resumos têm colunas planejadas em %ipx, sem truncar rótulos", (width, lifetime, historic, period) => {
    renderPainel();
    const cards = [cardByTitle("Histórico acumulado"), ...Array.from(container.querySelectorAll('[data-slot="card"]')).filter(card => Array.from(card.querySelectorAll("p")).some(p => p.textContent === "Da receita ao resultado"))];
    const counts = [lifetime, historic, period];
    expect(cards).toHaveLength(3);
    cards.forEach((card, i) => {
      const grid = card.querySelector(".grid")!;
      expect(columnsAt(grid, width)).toBe(counts[i]);
      expect(card.classList.contains("min-w-0")).toBe(true);
      expect(card.querySelector(".truncate")).toBeNull();
      const values = card.querySelectorAll("p.tabular-nums");
      expect(values.length).toBeGreaterThan(0);
      values.forEach(value => expect(value.classList.contains("[overflow-wrap:anywhere]")).toBe(true));
    });
  });

  it("seletor diário ocupa largura disponível e ações seguem visíveis e tocáveis", () => {
    renderPainel();
    const day = container.querySelector("#produtos-por-dia")!;
    const trigger = day.querySelector('[role="combobox"]')!;
    expect(trigger.classList.contains("w-full")).toBe(true);
    expect(trigger.classList.contains("min-w-0")).toBe(true);
    expect(trigger.classList.contains("sm:w-[230px]")).toBe(true);
    expect(trigger.classList.contains("w-[230px]")).toBe(false);
    expect(trigger.parentElement!.classList.contains("flex-col")).toBe(true);
    for (const label of ["Atualizar agora", "Conexão expirada — reconectar", "Ver Top 10 produtos do período", "Ver produtos vendidos por dia"]) {
      const action = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.trim() === label)!;
      expect(action.classList.contains("min-h-11"), label).toBe(true);
      expect(action.classList.contains("hidden"), label).toBe(false);
    }
  });

  it("expandir por clique mantém três tabelas completas em scroll local e permite ver todos", () => {
    renderPainel();
    clickButton("Ver Top 10 produtos do período");
    clickButton("Ver produtos vendidos por dia");
    const tables = Array.from(container.querySelectorAll("table"));
    expect(tables).toHaveLength(3);
    expect(tables.map(table => table.className)).toEqual(expect.arrayContaining([
      expect.stringContaining("min-w-[600px]"), expect.stringContaining("min-w-[560px]"), expect.stringContaining("min-w-[480px]"),
    ]));
    tables.forEach(table => {
      const scroll = table.parentElement!;
      for (const token of ["min-w-0", "max-w-full", "overflow-x-auto", "overscroll-x-contain"]) expect(scroll.classList.contains(token)).toBe(true);
      expect(scroll.tabIndex).toBe(0);
      expect(scroll.getAttribute("aria-label")).toBeTruthy();
      const title = table.querySelector("span.max-w-\\[260px\\], span.max-w-\\[280px\\]")!;
      expect(title.classList.contains("line-clamp-2")).toBe(false);
      expect(title.classList.contains("sm:line-clamp-2")).toBe(true);
    });
    const day = container.querySelector("#produtos-por-dia")!;
    expect(day.querySelectorAll("table")[0].querySelectorAll("tbody tr")).toHaveLength(6);
    clickButton("Ver todos os 8 produtos", day);
    expect(day.querySelectorAll("table")[0].querySelectorAll("tbody tr")).toHaveLength(8);
    expect(day.textContent).toContain("Produtos cancelados neste dia");
    expect(tables.find(table => table.classList.contains("min-w-[600px]"))!.querySelectorAll("th")).toHaveLength(5);
    expect(tables.find(table => table.classList.contains("min-w-[560px]"))!.querySelectorAll("th")).toHaveLength(4);
    expect(tables.find(table => table.classList.contains("min-w-[480px]"))!.querySelectorAll("th")).toHaveLength(3);
  });

  it("estado de carregamento não força largura e grade histórica usa a mesma base mobile", () => {
    state.loading = true;
    renderPainel();
    expect(container.querySelector(".w-72")!.classList.contains("max-w-full")).toBe(true);
    state.loading = false;
    state.profitLoading = true;
    renderPainel();
    const grids = container.querySelectorAll(".grid");
    expect(Array.from(grids).some(grid => grid.classList.contains("xl:grid-cols-7") && columnsAt(grid, 360) === 1)).toBe(true);
  });

  it("configuração indisponível e atualização de anúncios permanecem acessíveis", () => {
    state.configured = false;
    state.stale = true;
    renderPainel();
    expect(container.textContent).toContain("Os custos e impostos ainda não estão configurados.");
    expect(container.textContent).toContain("configurar");
    const retry = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Atualizar anúncios")!;
    expect(retry.classList.contains("min-h-11")).toBe(true);
    expect(container.querySelector('[aria-label="Gráfico de faturamento e cancelamentos por dia, com rolagem horizontal"]')!.classList.contains("max-w-full")).toBe(true);
  });
});
