import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateMarginRow,
  summarizeMargins,
  type MarginDashboard,
  type MarginReportPreview,
  type MarginSale,
} from "../shared/salesMargin";

const services = vi.hoisted(() => ({ mutateAsync: vi.fn(), refetch: vi.fn() }));
vi.mock("@/lib/trpc", () => {
  const query = (data: unknown) => ({ data, isLoading: false, isFetching: false, refetch: services.refetch });
  const mutation = () => ({ mutateAsync: services.mutateAsync, isPending: false, reset: vi.fn() });
  const product = (index: number) => ({
    itemId: `test-${index}`, title: `Produto sintético ${index}`,
    unitsSold: 2, revenue: 200, permalink: "https://example.invalid/item",
  });
  return {
    trpc: {
      account: {
        connection: { useQuery: () => query({ connected: true }) },
        storeLifetime: { useQuery: () => query({ firstSaleMs: null }) },
        salesRange: { useQuery: () => query({
          kpis: { revenue: 200, orders: 1, avgTicket: 200, unitsSold: 2, cancelled: 1, cancelledAmount: 100 },
          daily: [{ date: "2026-11-10", revenue: 200, orders: 1, cancelled: 1, cancelledAmount: 100 }],
          topProducts: Array.from({ length: 12 }, (_, i) => product(i)),
        }) },
        productsByDay: { useQuery: () => query({
          products: Array.from({ length: 9 }, (_, i) => product(i)),
          cancelledProducts: [product(30)], revenue: 200, orders: 1, unitsSold: 2,
          cancelledUnits: 2, cancelledRevenue: 100,
        }) },
      },
      salesMargin: {
        dashboard: { useQuery: () => query(undefined) },
        refresh: { useMutation: mutation }, saveCost: { useMutation: mutation },
        previewReport: { useMutation: mutation }, importReport: { useMutation: mutation },
      },
    },
  };
});
vi.mock("wouter", () => ({ useLocation: () => ["/vendas", vi.fn()] }));
import Vendas from "../client/src/pages/Vendas";
import {
  MargemVendas,
  MarginDashboardView,
  MarginReportPreviewPanel,
  OrderCostForm,
} from "../client/src/components/sales/MargemVendas";

const sale: MarginSale = {
  operationId: "test-operation-0001", saleDate: "2026-11-10",
  items: [{ itemId: "test-item", title: "Produto sintético", sku: "0007-Az/ß GG", quantity: 2 }],
  gross: 200, deductions: 30, net: 170, financialStatus: "confirmed", source: "api",
  charges: [], taxesWithheld: null, released: true,
};
const row = calculateMarginRow(sale, { operationId: sale.operationId, productCost: 100, extraCosts: 5, note: "Teste" });
const data: MarginDashboard = {
  sellerId: "test-seller", nickname: "test-store", asOf: 1,
  stale: false, partial: false, capped: false, reportCount: 0,
  rows: [row], summary: summarizeMargins([row]),
};
const preview: MarginReportPreview = {
  fileHash: "test-hash", fileName: "teste.csv", format: "ml_sales",
  rowCount: 1, operations: [sale], fromDate: "2026-11-10", toDate: "2026-11-10", warnings: [],
};
const render = (element: React.ReactElement) => renderToStaticMarkup(element);
function button(html: string, label: string) {
  return (html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []).find(tag => tag.includes(label)) ?? "";
}
function scrollRegion(html: string, label: string) {
  return (html.match(/<div\b[^>]*role="region"[^>]*>/g) ?? []).find(tag => tag.includes(label)) ?? "";
}

beforeEach(() => { vi.stubGlobal("React", React); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

// SSR/classes prevent specific regressions; they do not measure real viewport geometry.
describe("Vendas — proteção responsiva local", () => {
  it("empilha KPIs no celular e mantém grades de tablet e desktop", () => {
    const html = render(<Vendas />);
    expect(html).toContain("grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4");
    expect(html).toContain("grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5");
    expect(html).toContain("grid h-auto w-full grid-cols-2 bg-primary/5 sm:inline-flex sm:w-fit");
    for (const label of ["Visão geral", "Margem por pedido"]) {
      expect(button(html, label)).toContain("min-h-11");
      expect(button(html, label)).toContain("whitespace-normal");
    }
  });

  it("mantém todas as colunas em tabelas com rolagem local acessível por teclado", () => {
    const html = render(<Vendas />);
    for (const label of ["Produtos vendidos no dia", "Produtos cancelados no dia", "Ranking completo"]) {
      const region = scrollRegion(html, label);
      expect(region).toContain("min-w-0 max-w-full overflow-x-auto");
      expect(region).toContain('tabindex="0"');
    }
    for (const width of [580, 440, 660]) expect(html).toContain(`min-w-[${width}px]`);
    for (const label of ["Preço unit.", "Qtd.", "Total", "Vendas", "Anúncio"]) expect(html).toContain(label);
    expect(html).not.toMatch(/<t[hd][^>]*class="[^"]*(?:hidden|truncate)/);
    expect(scrollRegion(html, "Gráfico diário")).toContain("overflow-x-auto");
  });

  it("deixa expansão e links disponíveis por toque e busca sem limite de 60vw", () => {
    const html = render(<Vendas />);
    for (const count of [9, 12]) {
      const expand = button(html, `Ver todos os ${count} produtos`);
      expect(expand).toContain("min-h-11");
      expect(expand).toContain("whitespace-normal");
    }
    expect(html).toContain('aria-label="Buscar produto por nome no ranking"');
    expect(html).toContain("relative w-full min-w-0 max-w-full sm:w-[240px]");
    expect(html).not.toContain("max-w-[60vw]");
    expect(html).toContain("inline-flex min-h-11 items-center gap-1 rounded-md px-2");
  });

  it("mantém todas as ações e o SKU exato na tabela de margem rolável", () => {
    const html = render(<MarginDashboardView data={data} canEdit onEditCost={vi.fn()} />);
    expect(scrollRegion(html, "Margem por operação")).toContain("min-w-0 max-w-full overflow-x-auto");
    expect(html).toContain("min-w-[1180px]");
    for (const label of ["Bruto", "Descontos ML", "Líquido", "CMV total", "Extras", "Resultado %", "Fonte / ações"]) expect(html).toContain(label);
    expect(html).toContain("0007-Az/ß GG");
    for (const label of ["Descontos / ajustes", "Informar custos totais"]) {
      const action = button(html, label);
      expect(action).toContain("min-h-11");
      expect(action).not.toContain("opacity-0");
      expect(action).not.toContain("hidden");
    }
    expect(services.mutateAsync).not.toHaveBeenCalled();
  });

  it("empilha as ações do formulário sem mudar permissões ou salvar custos", () => {
    const html = render(<OrderCostForm row={row} onSave={services.mutateAsync} onCancel={vi.fn()} />);
    expect(html).toContain("flex flex-col justify-end gap-2 sm:flex-row");
    for (const label of ["Cancelar", "Salvar custos totais"]) expect(button(html, label)).toContain("min-h-11 w-full");
    expect(html).toContain('inputMode="decimal"');
    expect(services.mutateAsync).not.toHaveBeenCalled();
  });

  it("limita a prévia rolável e mantém importação confirmada visível e bloqueada sem confirmação", () => {
    const html = render(<MarginReportPreviewPanel preview={preview} confirmed={false} onConfirmedChange={vi.fn()} onImport={services.mutateAsync} />);
    expect(scrollRegion(html, "Prévia financeira")).toContain("max-h-72 min-w-0 max-w-full overflow-auto overscroll-contain");
    expect(html).toContain("min-w-[600px]");
    expect(html).toContain("0007-Az/ß GG");
    const action = button(html, "Importar relatório confirmado");
    expect(action).toContain("min-h-11 w-full");
    expect(action).toContain("whitespace-normal");
    expect(action).toContain('disabled=""');
    expect(services.mutateAsync).not.toHaveBeenCalled();
  });

  it("empilha toolbar de margem e restringe o diálogo à altura dinâmica disponível", () => {
    const html = render(<MargemVendas fromMs={1} toMs={2} title="Teste" enabled />);
    expect(html).toContain("flex min-w-0 flex-col items-start");
    expect(html).toContain("lg:flex-row");
    expect(button(html, "Atualizar dados")).toContain("min-h-11 w-full");
    expect(html).toContain('type="file"');
    // Radix portals are not mounted by SSR; inspect only the local DialogContent contract.
    const source = readFileSync(new URL("../client/src/components/sales/MargemVendas.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/<DialogContent className="[^\"]*max-h-\[calc\(100dvh-2rem\)\][^\"]*overflow-y-auto[^\"]*overscroll-contain/);
    expect(services.mutateAsync).not.toHaveBeenCalled();
  });
});
