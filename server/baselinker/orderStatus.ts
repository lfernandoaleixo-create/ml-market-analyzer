/**
 * Order status classification for profitability.
 *
 * Only EFFECTIVE sales should count toward revenue/profit. Cancelled and
 * returned orders must be excluded — and because BaseLinker keeps the order's
 * status in sync, if a sale is cancelled/returned later it automatically drops
 * out of the next calculation (its status_id changes at the source).
 *
 * Classification is based on the status NAME (resilient across accounts, since
 * status ids differ per account). We normalize the name and match keywords.
 */

export type OrderStatusClass = "effective" | "excluded" | "pending";

/** Keywords (normalized, no accents, lowercase) that mark a NON-sale. */
const EXCLUDED_KEYWORDS = [
  "cancel", // Cancelado / Cancelamento
  "devolu", // Devolução
  "estorn", // Estorno
  "reembols", // Reembolso
  "recus", // Recusado
  "fraud", // Fraude
  "nao pago", // Não pago
  "erro", // Erro NF / Erro Etiqueta (not a finalized sale state)
];

/** Strip accents and lowercase for resilient keyword matching. */
export function normalizeStatusName(name: unknown): string {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Classify a status name into effective / excluded / pending.
 * Default is "effective": once an order exists and is not cancelled/returned,
 * it represents a real sale (shipped, delivered, invoiced, packing, etc.).
 */
export function classifyStatusName(name: unknown): OrderStatusClass {
  const n = normalizeStatusName(name);
  if (!n) return "effective";
  for (const kw of EXCLUDED_KEYWORDS) {
    if (n.includes(kw)) return "excluded";
  }
  return "effective";
}

export interface StatusInfo {
  id: number;
  name: string;
  klass: OrderStatusClass;
}

/** Build a status-id -> info map from getOrderStatusList output. */
export function buildStatusMap(
  statuses: Array<{ id: number; name: string }>,
): Map<number, StatusInfo> {
  const map = new Map<number, StatusInfo>();
  for (const s of statuses) {
    map.set(s.id, { id: s.id, name: s.name, klass: classifyStatusName(s.name) });
  }
  return map;
}
