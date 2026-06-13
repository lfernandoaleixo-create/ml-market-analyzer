/**
 * Profitability service — pure aggregation.
 *
 * Given normalized BaseLinker orders + a product-cost lookup + a tax config,
 * it builds the "Lucratividade Real" payload:
 *   - totals under the selected scenario;
 *   - a side-by-side comparison of both scenarios (sem/com TTS);
 *   - profit per listing (via the order line's MLB itemId);
 *   - sales distribution by destination UF.
 *
 * No I/O here — the router fetches the data and passes it in, which keeps this
 * fully unit-testable.
 */

import {
  type ListingProfitRow,
  type ProfitabilityResult,
  type ProfitBreakdown,
  type ScenarioComparison,
  type TaxConfig,
  type TaxScenario,
  type UF,
} from "../../shared/finance";
import { type BlOrder, type BlProductCost } from "../baselinker/provider";
import { computeProfit, addProfit, emptyProfit } from "./taxEngine";

export interface CostLookup {
  byId: Map<string, BlProductCost>;
  bySku: Map<string, BlProductCost>;
}

/** Resolve the unit cost (CMV) for an order line. Returns null when unknown. */
export function resolveUnitCost(
  line: { productId: string; sku: string },
  costs: CostLookup,
): number | null {
  if (line.productId && costs.byId.has(line.productId)) {
    const c = costs.byId.get(line.productId)!;
    if (c.averageCost > 0) return c.averageCost;
  }
  if (line.sku) {
    const c = costs.bySku.get(line.sku.toLowerCase());
    if (c && c.averageCost > 0) return c.averageCost;
  }
  return null;
}

/** Optional per-listing Ads spend (BRL) keyed by MLB item id. */
export type AdsByItem = Map<string, number>;

interface ListingAccumulator {
  itemId: string;
  title: string;
  unitsSold: number;
  orderIds: Set<number>;
  profit: ProfitBreakdown;
  totalCostUnits: number; // sum(unitCost*qty) to derive avg unit cost
  totalUnitsWithCost: number;
  missingCost: boolean;
}

/**
 * Build the full profitability result.
 *
 * Each order is taxed by its destination UF. Commission and shipping are at the
 * order level, so they are apportioned to lines by revenue share. CMV is the
 * product cost × quantity. Ads (optional) is apportioned per listing.
 */
export function buildProfitability(params: {
  orders: BlOrder[];
  costs: CostLookup;
  config: TaxConfig;
  from: number;
  to: number;
  adsByItem?: AdsByItem;
  currency?: string;
}): ProfitabilityResult {
  const { orders, costs, config, from, to } = params;
  const scenario: TaxScenario = config.ttsEnabled ? "com_tts" : "sem_tts";
  const adsByItem = params.adsByItem ?? new Map<string, number>();

  let totalsSem = emptyProfit();
  let totalsCom = emptyProfit();
  const listings = new Map<string, ListingAccumulator>();
  const ufAgg = new Map<string, { orders: number; revenue: number }>();
  const missingCostProducts = new Set<string>();

  for (const order of orders) {
    const orderRevenue = order.lines.reduce((s, l) => s + l.priceBrutto * l.quantity, 0);
    const uf = order.destinationUF;

    // UF distribution.
    const ufKey = uf ?? "??";
    const ua = ufAgg.get(ufKey) ?? { orders: 0, revenue: 0 };
    ua.orders += 1;
    ua.revenue += orderRevenue;
    ufAgg.set(ufKey, ua);

    for (const line of order.lines) {
      const lineRevenue = line.priceBrutto * line.quantity;
      const share = orderRevenue > 0 ? lineRevenue / orderRevenue : 0;
      const commission = order.commission * share;
      const shipping = order.deliveryPrice * share;

      const unitCost = resolveUnitCost(line, costs);
      if (unitCost == null && line.productId) missingCostProducts.add(line.productId);
      const cmv = (unitCost ?? 0) * line.quantity;

      const adsForItem = line.itemId ? (adsByItem.get(line.itemId) ?? 0) : 0;

      const baseInput = {
        revenue: lineRevenue,
        commission,
        shipping,
        cmv,
        destinationUF: uf as UF | null,
      };

      const pSem = computeProfit({ ...baseInput, ads: 0 }, "sem_tts", config);
      const pCom = computeProfit({ ...baseInput, ads: 0 }, "com_tts", config);
      totalsSem = addProfit(totalsSem, pSem);
      totalsCom = addProfit(totalsCom, pCom);

      // Per-listing accumulation (scenario-selected, includes Ads).
      const itemId = line.itemId;
      if (itemId) {
        const acc =
          listings.get(itemId) ??
          ({
            itemId,
            title: line.name || itemId,
            unitsSold: 0,
            orderIds: new Set<number>(),
            profit: emptyProfit(),
            totalCostUnits: 0,
            totalUnitsWithCost: 0,
            missingCost: false,
          } satisfies ListingAccumulator);
        acc.unitsSold += line.quantity;
        acc.orderIds.add(order.orderId);
        const pSel = computeProfit(
          { ...baseInput, ads: adsForItem },
          scenario,
          config,
        );
        acc.profit = addProfit(acc.profit, pSel);
        if (unitCost != null) {
          acc.totalCostUnits += unitCost * line.quantity;
          acc.totalUnitsWithCost += line.quantity;
        } else {
          acc.missingCost = true;
        }
        if (!acc.title && line.name) acc.title = line.name;
        listings.set(itemId, acc);
      }
    }
  }

  const listingRows: ListingProfitRow[] = Array.from(listings.values())
    .map((a) => ({
      itemId: a.itemId,
      title: a.title,
      unitsSold: a.unitsSold,
      orders: a.orderIds.size,
      current: a.profit,
      unitCost: a.totalUnitsWithCost > 0 ? a.totalCostUnits / a.totalUnitsWithCost : null,
      missingCost: a.missingCost,
    }))
    .sort((x, y) => y.current.netProfit - x.current.netProfit);

  const comparison: ScenarioComparison = {
    semTts: totalsSem,
    comTts: totalsCom,
    ttsGain: Math.round((totalsCom.netProfit - totalsSem.netProfit) * 100) / 100,
  };

  const totals = scenario === "com_tts" ? totalsCom : totalsSem;

  const byUF = Array.from(ufAgg.entries())
    .map(([uf, v]) => ({ uf: uf as UF | "??", orders: v.orders, revenue: Math.round(v.revenue * 100) / 100 }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    from,
    to,
    currency: params.currency ?? "BRL",
    scenario,
    orderCount: orders.length,
    totals,
    comparison,
    listings: listingRows,
    byUF,
    config,
    productsMissingCost: missingCostProducts.size,
  };
}
