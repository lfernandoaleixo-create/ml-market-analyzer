import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateMarginRow,
  summarizeMargins,
  MARGIN_REPORT_SOURCES,
  type MarginDashboard,
  type MarginRow,
  type MarginSale,
  type MarginReportPreview,
} from "../shared/salesMargin";

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  refresh: vi.fn(),
  saveCost: vi.fn(),
  previewReport: vi.fn(),
  importReport: vi.fn(),
  connected: true,
  connectionError: false,
  salesError: false,
}));
vi.mock("@/lib/trpc", () => {
  const query = (data?: unknown, error?: Error) => ({
    data,
    error,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  const mutation = () => ({
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isPending: false,
  });
  return {
    trpc: {
      salesMargin: {
        dashboard: { useQuery: mocks.dashboard },
        refresh: { useMutation: mocks.refresh },
        saveCost: { useMutation: mocks.saveCost },
        previewReport: { useMutation: mocks.previewReport },
        importReport: { useMutation: mocks.importReport },
      },
      account: {
        connection: {
          useQuery: () =>
            query(
              { connected: mocks.connected },
              mocks.connectionError
                ? new Error("Conexão indisponível")
                : undefined
            ),
        },
        storeLifetime: { useQuery: () => query({ firstSaleMs: null }) },
        salesRange: {
          useQuery: () =>
            query(
              undefined,
              mocks.salesError ? new Error("Vendas indisponíveis") : undefined
            ),
        },
        productsByDay: {
          useQuery: () =>
            query({
              products: [],
              cancelledProducts: [],
              revenue: 0,
              orders: 0,
              unitsSold: 0,
            }),
        },
      },
    },
  };
});
vi.mock("wouter", () => ({ useLocation: () => ["/vendas", vi.fn()] }));
import {
  MargemVendas,
  MarginDashboardView,
  MarginReportPreviewPanel,
  OrderCostForm,
  marginRefreshNotice,
  parseOrderCost,
  validateMarginReportFile,
} from "../client/src/components/sales/MargemVendas";
import Vendas from "../client/src/pages/Vendas";

const sale = (overrides: Partial<MarginSale> = {}): MarginSale => ({
  operationId: "0002000123456789",
  saleDate: "2026-11-10",
  items: [
    {
      itemId: "MLB123",
      title: "Produto exato – Azul / GG",
      sku: "0007-Az/ß GG",
      quantity: 2,
    },
  ],
  gross: 200,
  deductions: 30,
  net: 170,
  financialStatus: "confirmed",
  source: "api",
  charges: [
    { key: "sale", label: "Tarifa real", category: "sale", amount: 30 },
  ],
  taxesWithheld: null,
  released: true,
  ...overrides,
});
function knownRow(overrides: Partial<MarginSale> = {}): MarginRow {
  const operation = sale(overrides);
  return calculateMarginRow(operation, {
    operationId: operation.operationId,
    productCost: 100,
    extraCosts: 5,
    note: "CMV de duas unidades",
  });
}
function dashboard(
  rows: MarginRow[],
  flags: Partial<MarginDashboard> = {}
): MarginDashboard {
  const partial = !!(flags.partial || flags.capped);
  return {
    sellerId: "seller-test",
    nickname: "TOUJOURS",
    asOf: Date.parse("2026-11-11T12:00:00Z"),
    stale: false,
    partial: false,
    capped: false,
    reportCount: 0,
    rows,
    summary: summarizeMargins(rows, partial),
    ...flags,
  };
}
const render = (element: React.ReactElement) => renderToStaticMarkup(element);
const renderView = (data?: MarginDashboard, error?: string) =>
  render(<MarginDashboardView data={data} error={error} />);
function text(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}
function button(html: string, label: string) {
  const found = html.match(
    new RegExp(`<button\\b[^>]*>[\\s\\S]*?${label}</button>`, "g")
  );
  // Match each button separately to avoid accidentally including earlier buttons.
  return (
    (html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []).find(value =>
      value.includes(label)
    ) ??
    found?.[0] ??
    ""
  );
}
function preview(): MarginReportPreview {
  return {
    fileHash: "hash-test",
    fileName: "conciliação.csv",
    format: "ml_sales",
    rowCount: 3,
    operations: [sale({ source: "report" })],
    fromDate: "2026-11-01",
    toDate: "2026-11-10",
    warnings: ["Uma operação possui liberação pendente."],
  };
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  mocks.connected = true;
  mocks.connectionError = false;
  mocks.salesError = false;
  mocks.dashboard.mockReturnValue({
    data: undefined,
    error: null,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  for (const mock of [
    mocks.refresh,
    mocks.saveCost,
    mocks.previewReport,
    mocks.importReport,
  ])
    mock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Margem de vendas — KPIs e estados desconhecidos", () => {
  it("renderiza exatamente os quatro KPIs sem transformar ausência de dados em zero", () => {
    const html = renderView();
    for (const label of [
      "Valor das operações",
      "Líquido após descontos ML",
      "% que restou",
      "Resultado após custos",
    ])
      expect(html).toContain(label);
    expect(html).toContain("—");
    expect(html).not.toContain("R$ 0,00");
    expect(html).not.toContain("0%");
    expect(html).toContain("Dados financeiros ainda não confirmados");
  });

  it("custos ausentes permanecem desconhecidos, sem falso lucro de todo o líquido", () => {
    const row = calculateMarginRow(sale());
    const html = renderView(dashboard([row]));
    expect(html).toContain("Custos pendentes: 1");
    expect(html).toContain("Requer financeiro, SKU e custos conhecidos");
    expect(html).toContain("Faltam custos totais de pedidos");
    expect(html).not.toContain("Líquido − CMV total − despesas extras");
    expect(html).not.toContain("85%</td>");
    const form = render(<OrderCostForm row={row} onSave={vi.fn()} />);
    expect(form).toContain('value=""');
    expect(form).not.toContain('value="0.00"');
    expect(form).toContain("CMV total do pedido (R$)");
    expect(form).toContain("não é o custo por unidade");
  });

  it("um custo conhecido e outro ausente ainda não confirmam resultado", () => {
    const operation = sale();
    const row = calculateMarginRow(operation, {
      operationId: operation.operationId,
      productCost: 100,
      extraCosts: null,
      note: "",
    });
    const html = renderView(dashboard([row]));
    expect(html).toContain("Custos pendentes: 1");
    expect(html).toContain("Resultado após custos");
    expect(html).not.toContain("R$ 70,00");
    expect(html).not.toContain("Líquido − CMV total − despesas extras");
  });

  it("financeiro pendente mostra subtotal de N/M em vez de total do período", () => {
    const html = renderView(
      dashboard([
        knownRow(),
        knownRow({
          operationId: "pending-2",
          financialStatus: "pending",
          net: null,
        }),
      ])
    );
    expect(html).toContain("Subtotal confirmado de 1/2: R$ 170,00");
    expect(html).toContain("Subtotal confirmado de 1/2: R$ 65,00");
    expect(html).toContain("Financeiro pendente: 1");
    expect(html).toContain(
      "Líquido, percentual e resultado dessas operações não estão confirmados"
    );
    expect(html).not.toContain("85%</p>");
  });

  it("não converte nenhum líquido confirmado em subtotal artificial zero", () => {
    const html = renderView(
      dashboard([
        knownRow({ financialStatus: "pending", gross: null, net: null }),
      ])
    );
    expect(html).toContain("Aguardando confirmação financeira");
    expect(html).not.toContain("Subtotal confirmado");
    expect(html).not.toContain("R$ 0,00");
    expect(html).not.toContain("0%");
  });

  it("SKU ausente bloqueia resultado mesmo com CMV e despesas informados", () => {
    const row = knownRow({
      items: [
        { itemId: "MLB123", title: "Produto sem SKU", sku: null, quantity: 1 },
      ],
    });
    const html = renderView(dashboard([row]));
    expect(html).toContain("SKU ausente: 1");
    expect(html).toContain("SKU ausente — resultado não calculado");
    expect(html).toContain("Esta tela não cria, corrige nem altera SKUs");
    expect(html).not.toContain("R$ 65,00");
  });

  it("defende a exibição contra resultado indevido marcado como confirmado sem SKU", () => {
    const row = {
      ...knownRow({ items: [] }),
      resultStatus: "confirmed" as const,
      result: 65,
      resultPercent: 32.5,
    };
    const html = renderView(dashboard([row]));
    expect(html).not.toContain("R$ 65,00");
    expect(html).toContain("Produto / SKU ausente na fonte");
  });

  it("coleta parcial ou limitada deixa total desconhecido e identifica fotografia", () => {
    for (const flags of [{ partial: true }, { capped: true }]) {
      const html = renderView(dashboard([knownRow()], flags));
      expect(html).toContain("Coleta parcial");
      expect(html).toContain("não o período inteiro");
      expect(html).toContain("Subtotal confirmado de 1/1");
      expect(html).toContain("Fotografia em");
      expect(html).toContain("horário de Brasília");
      expect(html).toContain("Total do período não confirmado");
    }
  });

  it("fotografia desatualizada e erro de atualização preservam dados com aviso", () => {
    const html = renderView(
      dashboard([knownRow()], {
        stale: true,
        warning: "API financeira limitada",
      }),
      "Falha simulada"
    );
    expect(html).toContain("Fotografia desatualizada");
    expect(html).toContain("Exibindo a fotografia anterior");
    expect(html).toContain("API financeira limitada");
    expect(html).toContain("R$ 65,00");
  });

  it("preserva data, título, número da operação e SKU exatamente como recebidos", () => {
    const html = renderView(dashboard([knownRow()]));
    expect(html).toContain("10/11/2026");
    expect(html).toContain("0002000123456789");
    expect(html).toContain("Produto exato – Azul / GG");
    expect(html).toContain("0007-Az/ß GG");
    expect(html).not.toContain("0007-AZ");
  });

  it("identifica corretamente fontes API e Relatório", () => {
    const html = renderView(
      dashboard([
        knownRow(),
        knownRow({ operationId: "report-2", source: "report" }),
      ])
    );
    expect(html).toMatch(/>API<\/span>/);
    expect(html).toMatch(/>Relatório<\/span>/);
    expect(html).toContain("Descontos / ajustes");
    expect(html).toContain("Informar custos totais");
  });

  it("custos explicitamente zero podem ser reais, mas exigem confirmação no formulário", () => {
    const operation = sale();
    const row = calculateMarginRow(operation, {
      operationId: operation.operationId,
      productCost: 0,
      extraCosts: 0,
      note: "zero verificado",
    });
    const html = render(<OrderCostForm row={row} onSave={vi.fn()} />);
    expect(html).toContain('value="0.00"');
    expect(html).toContain("custo realmente zero");
    expect(button(html, "Salvar custos totais")).toContain('disabled=""');
    expect(renderView(dashboard([row]))).toContain(
      "Líquido − CMV total − despesas extras"
    );
  });

  it("mostra perda confirmada sem limitar o resultado a zero", () => {
    const row = {
      ...knownRow(),
      productCost: 190,
      result: -25,
      resultPercent: -12.5,
    };
    const html = renderView(dashboard([row]));
    expect(html).toContain("-R$ 25,00");
    expect(html).toContain("-12,5%");
  });

  it("estorno pendente não vira resultado positivo ou zero", () => {
    const html = renderView(
      dashboard([
        knownRow({
          financialStatus: "refund_pending",
          net: 170,
          pendingReason: "Devolução em análise",
        }),
      ])
    );
    expect(html).toContain("Estorno em apuração");
    expect(html).toContain("Devolução em análise");
    expect(html).not.toContain("R$ 65,00");
  });
});

describe("Margem de vendas — importação e privacidade", () => {
  it("API indisponível mantém upload oficial acessível, sem alegar lucro contábil", () => {
    mocks.dashboard.mockReturnValue({
      data: undefined,
      error: new Error("Falha financeira simulada"),
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    const html = render(
      <MargemVendas fromMs={1} toMs={2} title="Novembro" enabled />
    );
    expect(html).toContain("Consulta financeira não confirmada");
    expect(html).toContain("Importar relatório oficial");
    expect(html).toContain('type="file"');
    expect(html).toContain("não lucro líquido contábil");
    expect(html).toContain("Não estimamos tarifas, impostos ou alíquotas");
    for (const url of Object.values(MARGIN_REPORT_SOURCES))
      expect(html).toContain(url);
    expect(text(html)).toContain("Faturamento → Conciliação → Por venda");
    expect(html).toContain("até 31 dias");
  });

  it("prévia exibe formato, janela, linhas, operações e avisos sem dados originais de compradores", () => {
    const parsed = {
      ...preview(),
      rawRows: [
        {
          buyerEmail: "sigiloso@example.invalid",
          buyerName: "COMPRADOR_PRIVADO",
        },
      ],
      buyerData: "CPF_PRIVADO",
    };
    const html = render(
      <MarginReportPreviewPanel
        preview={parsed}
        confirmed={false}
        onConfirmedChange={vi.fn()}
        onImport={vi.fn()}
      />
    );
    expect(html).toContain("Mercado Livre — conciliação por venda");
    expect(html).toContain("01/11/2026 a 10/11/2026");
    expect(html).toContain("1 operações agrupadas · 3 linhas interpretadas");
    expect(html).toContain("Uma operação possui liberação pendente");
    expect(html).toContain("0002000123456789");
    expect(html).not.toContain("sigiloso@example.invalid");
    expect(html).not.toContain("COMPRADOR_PRIVADO");
    expect(html).not.toContain("CPF_PRIVADO");
    expect(html).toContain("substitui a anterior");
    expect(html).toContain("Não somamos relatórios sobrepostos");
  });

  it("importação fica desabilitada antes da confirmação explícita da loja", () => {
    const html = render(
      <MarginReportPreviewPanel
        preview={preview()}
        confirmed={false}
        onConfirmedChange={vi.fn()}
        onImport={vi.fn()}
      />
    );
    expect(html).toContain(
      "Confirmo que este relatório é da loja Toujours e foi baixado no Mercado Livre/Mercado Pago"
    );
    expect(button(html, "Importar relatório confirmado")).toContain(
      'disabled=""'
    );
    const confirmed = render(
      <MarginReportPreviewPanel
        preview={preview()}
        confirmed
        onConfirmedChange={vi.fn()}
        onImport={vi.fn()}
      />
    );
    expect(button(confirmed, "Importar relatório confirmado")).not.toContain(
      'disabled=""'
    );
  });

  it("prévia vazia, processamento e falta de conexão também bloqueiam importação", () => {
    for (const props of [
      { preview: { ...preview(), operations: [] } },
      { importing: true },
      { enabled: false },
    ]) {
      const html = render(
        <MarginReportPreviewPanel
          preview={preview()}
          confirmed
          onConfirmedChange={vi.fn()}
          onImport={vi.fn()}
          {...props}
        />
      );
      expect(html).toMatch(
        /<button[^>]*disabled[^>]*>[\s\S]*?(Importar relatório confirmado|Importando…)<\/button>/
      );
    }
  });

  it("reconhece formato Mercado Pago sem rotulá-lo como API ou lucro líquido", () => {
    const html = render(
      <MarginReportPreviewPanel
        preview={{ ...preview(), format: "mp_account_money" }}
        confirmed={false}
        onConfirmedChange={vi.fn()}
        onImport={vi.fn()}
      />
    );
    expect(html).toContain("Mercado Pago — dinheiro em conta");
    expect(html).not.toContain("lucro líquido");
  });

  it("rejeita formato não suportado, arquivo vazio e arquivos maiores que 2 MB", () => {
    expect(
      validateMarginReportFile({ name: "relatorio.pdf", size: 100 })
    ).toContain("Formato não suportado");
    expect(
      validateMarginReportFile({ name: "relatorio.xls", size: 100 })
    ).toContain("não são aceitos");
    expect(
      validateMarginReportFile({ name: "relatorio.csv", size: 0 })
    ).toContain("vazio");
    expect(
      validateMarginReportFile({
        name: "relatorio.xlsx",
        size: 2 * 1024 * 1024 + 1,
      })
    ).toContain("limite de 2 MB");
    expect(
      validateMarginReportFile({ name: "relatorio.CSV", size: 2 * 1024 * 1024 })
    ).toBeNull();
    expect(
      validateMarginReportFile({ name: "relatorio.xlsx", size: 100 })
    ).toBeNull();
  });
});

describe("Margem de vendas — custos e integração mínima", () => {
  it("nova consulta não declara atualização aprovada se a fotografia continua parcial ou desatualizada", () => {
    expect(
      marginRefreshNotice(dashboard([knownRow()], { stale: true }))
    ).toContain("continua desatualizada");
    expect(
      marginRefreshNotice(dashboard([knownRow()], { partial: true }))
    ).toContain("totais do período não estão confirmados");
    expect(
      marginRefreshNotice(dashboard([calculateMarginRow(sale())]))
    ).toContain("ainda há avisos ou pendências");
    expect(marginRefreshNotice(dashboard([knownRow()]))).not.toContain(
      "Atualização concluída"
    );
  });

  it("campo em branco continua null; zero é distinto; não aplica taxa automática", () => {
    expect(parseOrderCost("")).toBeNull();
    expect(parseOrderCost("  ")).toBeNull();
    expect(parseOrderCost("0")).toBe(0);
    expect(parseOrderCost("12,34")).toBe(12.34);
    expect(parseOrderCost("17.50")).toBe(17.5);
    for (const invalid of [
      "-1",
      "NaN",
      "Infinity",
      "1e3",
      "12%",
      "1.234,56",
      "1.234",
      "abc",
    ])
      expect(() => parseOrderCost(invalid)).toThrow();
  });

  it("hook recebe o período compartilhado e respeita enabled sem polling", () => {
    render(
      <MargemVendas
        fromMs={123}
        toMs={456}
        title="Período selecionado"
        enabled={false}
      />
    );
    expect(mocks.dashboard).toHaveBeenCalledWith(
      { fromMs: 123, toMs: 456 },
      { enabled: false, retry: false, refetchOnWindowFocus: false }
    );
    const html = render(
      <MargemVendas
        fromMs={123}
        toMs={456}
        title="Período selecionado"
        enabled={false}
      />
    );
    expect(html).toContain("Período selecionado");
    expect(html).toContain("A conta precisa estar conectada");
    expect(html).toMatch(/<input[^>]*type="file"[^>]*disabled/);
  });

  it("Vendas abre na visão geral e não monta nem consulta margem em segundo plano", () => {
    const html = render(<Vendas />);
    expect(html).toContain("Visão geral");
    expect(html).toContain("Margem por pedido");
    expect(html).toContain("Faturamento e cancelamentos por dia");
    expect(html).toContain("Ranking de produtos vendidos");
    expect(html).not.toContain("Importar relatório oficial");
    expect(mocks.dashboard).not.toHaveBeenCalled();
    expect(mocks.previewReport).not.toHaveBeenCalled();
  });

  it("falha de salesRange não bloqueia o shell e o botão da nova aba", () => {
    mocks.salesError = true;
    const html = render(<Vendas />);
    expect(html).toContain("Margem por pedido");
    expect(html).toContain("Visão geral");
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });

  it("mantém o NotConnected original sem ativar margem nem upload", () => {
    mocks.connected = false;
    const html = render(<Vendas />);
    expect(html).toContain("Conecte sua conta do Mercado Livre");
    expect(html).not.toContain("Importar relatório oficial");
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });
});
