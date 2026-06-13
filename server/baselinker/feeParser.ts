/**
 * Mercado Livre fee parser for BaseLinker orders.
 *
 * In this account the ML sale fee and the seller-paid shipping subsidy are NOT
 * exposed as numeric fields by getOrders — instead BaseLinker writes them, as
 * free text, into the order's `admin_comments`, exactly as ML reports them:
 *
 *   "comissão sobre venda dos produtos: 29.10 drop_off comissão sobre venda
 *    dos produtos: 11.52 Frete pago pelo vendedor: -68.80
 *    Frete pago pelo comprador: 73.99 Método de envio: Normal - Standard"
 *
 * Rules we apply (verified against the live account):
 *  - There can be MULTIPLE "comissão sobre venda dos produtos: X" entries in one
 *    order (e.g. a base fee + a drop_off fee). We SUM all of them.
 *  - "Frete pago pelo vendedor: -X" is the subsidy the seller pays (a real cost).
 *    It is written as a negative number; we take its absolute value as a cost.
 *  - "Frete pago pelo comprador" is NOT a seller cost — we ignore it.
 */

/** Parse a pt-BR/!en money token like "29.10", "1.234,56", "-68.80". */
function parseMoney(raw: string): number {
  let s = raw.trim();
  const negative = s.startsWith("-");
  s = s.replace(/[^0-9.,]/g, "");
  if (s.includes(",")) {
    // pt-BR style: dot = thousands, comma = decimal.
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

export interface ParsedFees {
  /** Total ML sale commission (BRL, positive). */
  commission: number;
  /** Seller-paid shipping subsidy (BRL, positive cost). */
  sellerShipping: number;
  /** Whether any commission token was found (for diagnostics). */
  matched: boolean;
}

const COMMISSION_RE = /comiss[ãa]o\s+sobre\s+venda\s+dos\s+produtos:\s*(-?[\d.,]+)/gi;
const SELLER_SHIPPING_RE = /frete\s+pago\s+pelo\s+vendedor:\s*(-?[\d.,]+)/gi;

/** Extract commission + seller shipping from an order's admin_comments text. */
export function parseOrderFees(adminComments: unknown): ParsedFees {
  const text = typeof adminComments === "string" ? adminComments : "";
  let commission = 0;
  let matched = false;

  let m: RegExpExecArray | null;
  COMMISSION_RE.lastIndex = 0;
  while ((m = COMMISSION_RE.exec(text)) !== null) {
    const v = Math.abs(parseMoney(m[1]));
    if (v > 0) {
      commission += v;
      matched = true;
    }
  }

  let sellerShipping = 0;
  SELLER_SHIPPING_RE.lastIndex = 0;
  while ((m = SELLER_SHIPPING_RE.exec(text)) !== null) {
    // Seller shipping is reported negative; cost is the absolute value.
    sellerShipping += Math.abs(parseMoney(m[1]));
  }

  return {
    commission: Math.round(commission * 100) / 100,
    sellerShipping: Math.round(sellerShipping * 100) / 100,
    matched,
  };
}
