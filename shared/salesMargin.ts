export type MarginChargeCategory = "sale" | "processing" | "shipping" | "financing" | "tax" | "other";
export type MarginCharge = { key: string; label: string; category: MarginChargeCategory; amount: number };
export type MarginItem = { itemId: string | null; title: string; sku: string | null; quantity: number | null };
export type MarginSale = {
  operationId: string; saleDate: string; items: MarginItem[];
  gross: number | null; deductions: number | null; net: number | null;
  financialStatus: "confirmed" | "pending" | "refund_pending";
  source: "api" | "report"; charges: MarginCharge[]; taxesWithheld: number | null;
  released: boolean | null; pendingReason?: string;
};
export type MarginCost = { operationId: string; productCost: number | null; extraCosts: number | null; note: string; updatedAt?: number };
export type MarginRow = MarginSale & {
  netPercent: number | null; productCost: number | null; extraCosts: number | null;
  result: number | null; resultPercent: number | null; costNote: string;
  resultStatus: "confirmed" | "pending_financial" | "missing_sku" | "missing_cost";
};
export type MarginDashboard = {
  sellerId: string; nickname: string; asOf: number; stale: boolean; partial: boolean; capped: boolean;
  warning?: string; reportCount: number; rows: MarginRow[];
  summary: { operations: number; gross: number | null; net: number | null; netPercent: number | null;
    result: number | null; resultPercent: number | null; knownNet: number; knownResult: number;
    financialConfirmed: number; financialPending: number; resultConfirmed: number; costPending: number; skuPending: number; };
};
export type MarginReportPreview = {
  fileHash: string; fileName: string; format: "ml_sales" | "mp_account_money";
  rowCount: number; operations: MarginSale[]; fromDate: string; toDate: string; warnings: string[];
};
export const MARGIN_REPORT_SOURCES = {
  reconciliation: "https://vendedores.mercadolivre.com.br/aprender/nota/como-conciliar-usando-os-relatorios-de-venda-e-liberacao-de-dinheiro",
  generate: "https://vendedores.mercadolivre.com.br/aprender/nota/como-gerar-seus-relatorios-de-conciliacao",
  fields: "https://www.mercadopago.com.br/developers/pt/docs/reports/account-money/report-fields",
} as const;
export function calculateMarginRow(sale: MarginSale, cost?: MarginCost): MarginRow {
  if (cost?.operationId !== sale.operationId) cost = undefined;
  const valid = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) && value >= 0;
  const skuKnown = sale.items.length > 0 && sale.items.every(item => !!item.sku?.trim());
  const costKnown = valid(cost?.productCost) && valid(cost?.extraCosts);
  const financialKnown = sale.financialStatus === "confirmed" && sale.gross !== null && Number.isFinite(sale.gross) && sale.net !== null && Number.isFinite(sale.net);
  const resultStatus = !financialKnown ? "pending_financial" : !skuKnown ? "missing_sku" : !costKnown ? "missing_cost" : "confirmed";
  const result = resultStatus === "confirmed" ? Math.round((sale.net! - cost!.productCost! - cost!.extraCosts!) * 100) / 100 : null;
  return { ...sale, netPercent: financialKnown && sale.gross! > 0 ? sale.net! / sale.gross! * 100 : null,
    productCost: valid(cost?.productCost) ? cost!.productCost : null, extraCosts: valid(cost?.extraCosts) ? cost!.extraCosts : null,
    result, resultPercent: result !== null && sale.gross! > 0 ? result / sale.gross! * 100 : null,
    costNote: cost?.note ?? "", resultStatus };
}
export function summarizeMargins(rows: MarginRow[], collectionPartial = false): MarginDashboard["summary"] {
  const sum = (values: number[]) => Math.round(values.reduce((a,b) => a+b,0)*100)/100;
  const financial = rows.filter(row => row.financialStatus === "confirmed" && row.net !== null && row.gross !== null);
  const results = rows.filter(row => row.resultStatus === "confirmed" && row.result !== null);
  const gross = !collectionPartial && rows.every(row => row.gross !== null && Number.isFinite(row.gross)) ? sum(rows.map(row => row.gross!)) : null;
  const net = !collectionPartial && financial.length === rows.length ? sum(financial.map(row => row.net!)) : null;
  const result = !collectionPartial && results.length === rows.length ? sum(results.map(row => row.result!)) : null;
  return { operations: rows.length, gross, net, netPercent: net !== null && gross !== null && gross > 0 ? net/gross*100 : null,
    result, resultPercent: result !== null && gross !== null && gross > 0 ? result/gross*100 : null,
    knownNet: sum(financial.map(row => row.net!)), knownResult: sum(results.map(row => row.result!)),
    financialConfirmed: financial.length, financialPending: rows.length-financial.length,
    resultConfirmed: results.length, costPending: rows.filter(row => row.resultStatus === "missing_cost").length,
    skuPending: rows.filter(row => row.resultStatus === "missing_sku").length };
}
