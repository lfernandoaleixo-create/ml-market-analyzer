/**
 * BaseLinker provider — turns raw API responses into the normalized inputs the
 * profitability service needs: product costs (by product id and by SKU) and ML
 * orders with commission, shipping, destination UF and the auction_id linking
 * each line to a Mercado Livre listing (MLB...).
 *
 * Pure data shaping on top of the low-level client; no business/tax logic here.
 */

import { callBaselinker, type BlClientOptions } from "./client";
import { type UF } from "../../shared/finance";
import { parseOrderFees } from "./feeParser";
import {
  buildStatusMap,
  classifyStatusName,
  type OrderStatusClass,
  type StatusInfo,
} from "./orderStatus";

/** Numeric coercion tolerant to strings like "3.70". */
function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const VALID_UF = new Set<UF>([
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB",
  "PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
]);

/** Normalize a free-form state string to a UF code when possible. */
export function normalizeUF(raw: unknown): UF | null {
  const s = str(raw).toUpperCase();
  if (!s) return null;
  if (VALID_UF.has(s as UF)) return s as UF;
  // Map common full names.
  const byName: Record<string, UF> = {
    "SAO PAULO": "SP", "SÃO PAULO": "SP", "RIO DE JANEIRO": "RJ",
    "MINAS GERAIS": "MG", "BAHIA": "BA", "PARANA": "PR", "PARANÁ": "PR",
    "RIO GRANDE DO SUL": "RS", "SANTA CATARINA": "SC", "GOIAS": "GO",
    "GOIÁS": "GO", "PERNAMBUCO": "PE", "CEARA": "CE", "CEARÁ": "CE",
    "ESPIRITO SANTO": "ES", "ESPÍRITO SANTO": "ES", "DISTRITO FEDERAL": "DF",
    "PARA": "PA", "PARÁ": "PA", "MARANHAO": "MA", "MARANHÃO": "MA",
    "AMAZONAS": "AM", "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS",
    "PARAIBA": "PB", "PARAÍBA": "PB", "RIO GRANDE DO NORTE": "RN",
    "ALAGOAS": "AL", "PIAUI": "PI", "PIAUÍ": "PI", "SERGIPE": "SE",
    "RONDONIA": "RO", "RONDÔNIA": "RO", "TOCANTINS": "TO", "ACRE": "AC",
    "AMAPA": "AP", "AMAPÁ": "AP", "RORAIMA": "RR",
  };
  return byName[s] ?? null;
}

/**
 * Normalize a BaseLinker auction_id into the Mercado Livre item id (MLB...).
 * Examples: "MLB6728481906_194260273300" -> "MLB6728481906"; "MLB6711834666"
 * stays as is. Returns null when it doesn't look like an MLB id.
 */
export function normalizeAuctionId(raw: unknown): string | null {
  const s = str(raw).toUpperCase();
  const m = s.match(/MLB-?(\d+)/);
  if (!m) return null;
  return `MLB${m[1]}`;
}

export interface BlInventory {
  inventoryId: number;
  name: string;
}

/** Fetch the account's order status list, classified for profitability. */
export async function getOrderStatuses(
  opts: BlClientOptions = {},
): Promise<Map<number, StatusInfo>> {
  const res = await callBaselinker<{ statuses?: any[] }>("getOrderStatusList", {}, opts);
  const list = Array.isArray(res?.statuses) ? res.statuses : [];
  return buildStatusMap(
    list.map((s) => ({ id: num(s.id), name: str(s.name) })),
  );
}

/** List catalogs (inventories) available to the token. */
export async function getInventories(opts: BlClientOptions = {}): Promise<BlInventory[]> {
  const res = await callBaselinker<{ inventories?: any[] }>("getInventories", {}, opts);
  const list = Array.isArray(res?.inventories) ? res.inventories : [];
  return list.map((i) => ({
    inventoryId: num(i.inventory_id),
    name: str(i.name) || `Catálogo ${num(i.inventory_id)}`,
  }));
}

export interface BlProductCost {
  productId: string;
  sku: string;
  ean: string;
  name: string;
  /** Average cost (BRL) — the CMV input. */
  averageCost: number;
  /** Product VAT rate stored in BaseLinker (often 0 here). */
  taxRate: number;
}

/** List product ids for an inventory. */
async function getProductIds(inventoryId: number, opts: BlClientOptions): Promise<string[]> {
  const ids: string[] = [];
  let page = 1;
  // BaseLinker paginates getInventoryProductsList by `page` (1000 each).
  // Loop defensively up to a sane cap.
  for (let i = 0; i < 50; i++) {
    const res = await callBaselinker<{ products?: Record<string, any> }>(
      "getInventoryProductsList",
      { inventory_id: inventoryId, page },
      opts,
    );
    const obj = res?.products ?? {};
    const keys = Object.keys(obj);
    if (keys.length === 0) break;
    ids.push(...keys);
    if (keys.length < 1000) break;
    page += 1;
  }
  return ids;
}

/**
 * Fetch products' cost data for an inventory. Returns a map keyed by BOTH the
 * product id and the SKU (lowercased) so order lines can match by either.
 */
export async function getProductCosts(
  inventoryId: number,
  opts: BlClientOptions = {},
): Promise<{
  byId: Map<string, BlProductCost>;
  bySku: Map<string, BlProductCost>;
  bySkuNorm: Map<string, BlProductCost>;
  byName: Map<string, BlProductCost>;
}> {
  const ids = await getProductIds(inventoryId, opts);
  const byId = new Map<string, BlProductCost>();
  const bySku = new Map<string, BlProductCost>();
  const bySkuNorm = new Map<string, BlProductCost>();
  const byName = new Map<string, BlProductCost>();

  // getInventoryProductsData accepts up to 1000 ids per call.
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const res = await callBaselinker<{ products?: Record<string, any> }>(
      "getInventoryProductsData",
      { inventory_id: inventoryId, products: chunk },
      opts,
    );
    const obj = res?.products ?? {};
    for (const [pid, p] of Object.entries<any>(obj)) {
      const cost: BlProductCost = {
        productId: str(pid),
        sku: str(p.sku),
        ean: str(p.ean),
        name: str(p.text_fields?.name) || str(p.name) || str(pid),
        averageCost: num(p.average_cost) || num(p.average_landed_cost),
        taxRate: num(p.tax_rate),
      };
      byId.set(cost.productId, cost);
      if (cost.sku) {
        bySku.set(cost.sku.toLowerCase(), cost);
        const norm = normalizeSkuKey(cost.sku);
        if (norm) bySkuNorm.set(norm, cost);
      }
      const nameKey = normalizeNameKey(cost.name);
      if (nameKey) byName.set(nameKey, cost);
    }
  }
  return { byId, bySku, bySkuNorm, byName };
}

/** SKU sem espaços, hífens e em minúsculas (casa "ESPETOB-G - 4x25-1K" ≈ "ESPETOB-G-4x25-1K"). */
export function normalizeSkuKey(sku: string): string {
  return str(sku).toLowerCase().replace(/[\s_-]+/g, "");
}

/** Nome normalizado (minúsculas, sem acentos e espaços colapsados) para fallback. */
export function normalizeNameKey(name: string): string {
  return str(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface BlOrderLine {
  productId: string;
  sku: string;
  /** Normalized ML item id (MLB...), when present. */
  itemId: string | null;
  name: string;
  quantity: number;
  /** Unit gross price (BRL). */
  priceBrutto: number;
}

export interface BlOrder {
  orderId: number;
  /** Unix ms when the order was confirmed. */
  dateConfirmedMs: number;
  currency: string;
  /** Marketplace commission (gross, BRL) — the ML sale fee. */
  commission: number;
  /**
   * Seller-paid shipping cost (BRL). This is the seller's shipping subsidy
   * ("Frete pago pelo vendedor"), NOT the buyer-paid freight. It is the real
   * cost that hits the seller's margin.
   */
  deliveryPrice: number;
  /** True when commission/shipping were parsed from admin_comments text. */
  feesFromText: boolean;
  /** Destination state, normalized to UF when possible. */
  destinationUF: UF | null;
  /** Source label (e.g. "melibr"). */
  source: string;
  /** BaseLinker status id of the order. */
  statusId: number;
  /** Human-readable status name. */
  statusName: string;
  /** Classified status: effective sale vs cancelled/returned (excluded). */
  statusClass: OrderStatusClass;
  lines: BlOrderLine[];
}

export interface OrdersResult {
  /** Orders kept (effective sales only when filterEffective=true). */
  orders: BlOrder[];
  /** How many orders were excluded (cancelled/returned/etc.). */
  excludedCount: number;
  /** Total orders seen before filtering. */
  totalSeen: number;
  /** Breakdown of excluded orders by status name. */
  excludedByStatus: Record<string, number>;
}

/**
 * Fetch ML orders confirmed since `fromMs`. BaseLinker returns up to 100 orders
 * per call; we page forward using the last order's confirmation date + 1s.
 */
export async function getOrders(
  fromMs: number,
  opts: BlClientOptions & { filterEffective?: boolean; statusMap?: Map<number, StatusInfo> } = {},
): Promise<BlOrder[]> {
  const res = await getOrdersDetailed(fromMs, opts);
  return res.orders;
}

/**
 * Like getOrders but returns the effective/excluded breakdown too.
 * When `filterEffective` is true (default), cancelled/returned orders are
 * dropped from `orders` and counted in `excludedCount`/`excludedByStatus`.
 */
export async function getOrdersDetailed(
  fromMs: number,
  opts: BlClientOptions & { filterEffective?: boolean; statusMap?: Map<number, StatusInfo> } = {},
): Promise<OrdersResult> {
  const filterEffective = opts.filterEffective !== false; // default ON
  // Resolve status map once (so we can name/classify by id).
  let statusMap = opts.statusMap;
  if (!statusMap) {
    try {
      statusMap = await getOrderStatuses(opts);
    } catch {
      statusMap = new Map();
    }
  }

  const kept: BlOrder[] = [];
  let excludedCount = 0;
  let totalSeen = 0;
  const excludedByStatus: Record<string, number> = {};
  let cursor = Math.floor(fromMs / 1000); // BaseLinker uses unix seconds.
  const seen = new Set<number>();
  const out = kept;

  for (let i = 0; i < 60; i++) {
    const res = await callBaselinker<{ orders?: any[] }>(
      "getOrders",
      { date_confirmed_from: cursor, get_unconfirmed_orders: false, include_custom_extra_fields: true },
      opts,
    );
    const orders = Array.isArray(res?.orders) ? res.orders : [];
    if (orders.length === 0) break;

    let maxConfirmed = cursor;
    for (const o of orders) {
      const orderId = num(o.order_id);
      if (seen.has(orderId)) continue;
      seen.add(orderId);
      const confirmed = num(o.date_confirmed);
      if (confirmed > maxConfirmed) maxConfirmed = confirmed;

      // Primary source: ML fees written into admin_comments by BaseLinker.
      // Fallback: numeric commission field (absent in this account).
      const parsed = parseOrderFees(o.admin_comments);
      const commissionNumeric = num(o.commission?.gross) || num(o.commission) || 0;
      const commissionGross = parsed.matched ? parsed.commission : commissionNumeric;
      // Seller shipping cost from text; fall back to delivery_price only when
      // the text had no seller-shipping line at all.
      const sellerShipping = parsed.matched
        ? parsed.sellerShipping
        : num(o.delivery_price);

      totalSeen += 1;
      const statusId = num(o.order_status_id);
      const info = statusMap?.get(statusId);
      const statusName = info?.name ?? str(o.order_status) ?? "";
      const statusClass: OrderStatusClass =
        info?.klass ?? classifyStatusName(statusName);

      if (filterEffective && statusClass === "excluded") {
        excludedCount += 1;
        const key = statusName || `status ${statusId}`;
        excludedByStatus[key] = (excludedByStatus[key] ?? 0) + 1;
        continue; // drop non-sales from the calculation
      }

      const lines: BlOrderLine[] = Array.isArray(o.products)
        ? o.products.map((p: any) => ({
            productId: str(p.product_id) || str(p.storage_id),
            sku: str(p.sku),
            itemId: normalizeAuctionId(p.auction_id),
            name: str(p.name),
            quantity: num(p.quantity) || 1,
            priceBrutto: num(p.price_brutto),
          }))
        : [];

      out.push({
        orderId,
        dateConfirmedMs: confirmed * 1000,
        currency: str(o.currency) || "BRL",
        commission: commissionGross,
        deliveryPrice: sellerShipping,
        feesFromText: parsed.matched,
        destinationUF: normalizeUF(o.delivery_state),
        source: str(o.order_source) || str(o.order_source_id),
        statusId,
        statusName,
        statusClass,
        lines,
      });
    }

    // Advance cursor; stop when a page has < 100 (last page) or no progress.
    if (orders.length < 100) break;
    const next = maxConfirmed + 1;
    if (next <= cursor) break;
    cursor = next;
  }

  return { orders: kept, excludedCount, totalSeen, excludedByStatus };
}
