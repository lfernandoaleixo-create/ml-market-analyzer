import type { MarginSale } from "../../shared/salesMargin";
import type { PublicSalesOrder } from "../../shared/publicSales";
import type { MarginReportSnapshot } from "../salesMargin/db";
import {
  publicSalesDate,
  publicSalesDayStart,
  validSalesDate,
} from "./publicSalesQuery";
const number = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
/** The report replaces finance only; metadata already verified in the ML order is retained.
 * Unmatched report references remain unverified and are handled by the caller.
 */
function importedOrder(
  sale: MarginSale,
  report: MarginReportSnapshot,
  automatic?: PublicSalesOrder
): PublicSalesOrder {
  const hasTime = !dateOnly.test(sale.saleDate);
  const ms = hasTime
    ? Date.parse(sale.saleDate)
    : validSalesDate(sale.saleDate)
      ? publicSalesDayStart(sale.saleDate)
      : NaN;
  const reportDate = Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  const reportAsOf = report.createdAt.toISOString();
  const subsequentRisk =
    !!automatic &&
    Date.parse(automatic.asOf) > report.createdAt.getTime() &&
    (automatic.financialStatus === "refund_pending" ||
      [
        "cancelled",
        "refunded",
        "partially_refunded",
        "in_mediation",
        "refund_pending",
      ].includes(automatic.status ?? ""));
  const gross = number(sale.gross),
    reportedNet = number(sale.net);
  const confirmed =
    !subsequentRisk &&
    sale.financialStatus === "confirmed" &&
    gross !== null &&
    reportedNet !== null;
  const charges = confirmed
    ? sale.charges.filter(charge => charge.key !== "reported_net_deductions")
    : [];
  const category = (name: string) => {
    const found = charges.filter(c => c.category === name);
    return found.length && found.every(c => number(c.amount) !== null)
      ? Math.round(found.reduce((s, c) => s + c.amount, 0) * 100) / 100
      : null;
  };
  const deductions = confirmed ? number(sale.deductions) : null;
  const reportItems = sale.items.map(item => ({
    itemId: text(item.itemId),
    variationId: null,
    sku: text(item.sku),
    skuSource: null,
    title: item.title === "Produto não informado" ? null : text(item.title),
    quantity: number(item.quantity),
    unitPrice: null,
    listingType: null,
  }));
  const items = automatic?.items.length
    ? automatic.items.map(item => {
        if (item.sku !== null || !item.itemId) return { ...item };
        const matches = reportItems.filter(
          other => other.itemId === item.itemId && other.sku !== null
        );
        return matches.length === 1 &&
          automatic.items.filter(other => other.itemId === item.itemId)
            .length === 1
          ? { ...item, sku: matches[0].sku }
          : { ...item };
      })
    : reportItems;
  return {
    orderId: sale.operationId,
    packId: automatic?.packId ?? null,
    paymentIds: automatic?.paymentIds ?? null,
    createdAt: automatic?.createdAt ?? (hasTime ? reportDate : null),
    saleDay: automatic?.saleDay ?? (reportDate ? publicSalesDate(ms) : null),
    paidAt: automatic?.paidAt ?? null,
    status: automatic?.status ?? null,
    rawStatus: automatic?.rawStatus ?? null,
    financiallyComplete: confirmed,
    financialStatus: confirmed
      ? "confirmed"
      : subsequentRisk || sale.financialStatus === "refund_pending"
        ? "refund_pending"
        : "pending",
    items,
    shipping: automatic
      ? { ...automatic.shipping }
      : { logisticType: null, payer: null },
    gross,
    net: confirmed ? reportedNet : null,
    deductions,
    charges,
    saleFee: category("sale"),
    processingFee: category("processing"),
    shippingCost: category("shipping"),
    financingFee: category("financing"),
    otherCharges: category("other"),
    taxesWithheld: confirmed ? number(sale.taxesWithheld) : null,
    taxDetail: null,
    taxesDisaggregated: null,
    chargesExplainDeductions:
      deductions !== null && charges.length > 0
        ? Math.abs(
            Math.round(charges.reduce((s, c) => s + c.amount, 0) * 100) / 100 -
              deductions
          ) <= 0.010000001
        : null,
    source: "imported_report",
    asOf: reportAsOf,
    pendingReason: subsequentRisk
      ? "Relatório anterior a estorno/cancelamento/disputa observados na API; líquido atual não confirmado."
      : text(sale.pendingReason),
  };
}
/** Latest imported finance wins, but only verified automatic metadata is retained. */
export function mergePublicSalesReports(
  automatic: PublicSalesOrder[],
  reports: MarginReportSnapshot[]
): PublicSalesOrder[] {
  const orders = new Map<string, PublicSalesOrder>();
  for (const order of automatic) {
    const previous = orders.get(order.orderId);
    if (!previous || Date.parse(order.asOf) > Date.parse(previous.asOf))
      orders.set(order.orderId, order);
  }
  const seen = new Set<string>();
  for (const report of [...reports].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id
  ))
    for (const sale of report.operations) {
      if (seen.has(sale.operationId)) continue;
      seen.add(sale.operationId);
      orders.set(
        sale.operationId,
        importedOrder(sale, report, orders.get(sale.operationId))
      );
    }
  return [...orders.values()];
}
