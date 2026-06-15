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
import { computeProfit, addProfit, emptyProfit, taxRevenue } from "./taxEngine";

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
  excludedCount?: number;
  totalOrdersSeen?: number;
  excludedByStatus?: Record<string, number>;
}): ProfitabilityResult {
  const { orders, costs, config, from, to } = params;
  const scenario: TaxScenario = config.ttsEnabled ? "com_tts" : "sem_tts";
  const adsByItem = params.adsByItem ?? new Map<string, number>();

  let totalsSem = emptyProfit();
  let totalsCom = emptyProfit();
  // Period tax detail under the SELECTED scenario (ICMS vs DIFAL vs FCP).
  const taxAcc = { federal: 0, icms: 0, difal: 0, fcp: 0 };
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

      const baseInput = {
        revenue: lineRevenue,
        commission,
        shipping,
        cmv,
        destinationUF: uf as UF | null,
      };

      // Ads is a per-LISTING spend already aggregated over the period by the Ads
      // API; it is NOT proportional to the number of order lines. So we exclude
      // it from the per-line math here and fold it in exactly once per item AFTER
      // the loop (see below) — both in the totals and in the per-listing profit.
      const pSem = computeProfit({ ...baseInput, ads: 0 }, "sem_tts", config);
      const pCom = computeProfit({ ...baseInput, ads: 0 }, "com_tts", config);
      totalsSem = addProfit(totalsSem, pSem);
      totalsCom = addProfit(totalsCom, pCom);

      // Accumulate the tax detail (federal / ICMS / DIFAL / FCP) for the
      // selected scenario so the UI and PDF can break it down clearly.
      const txb = taxRevenue(lineRevenue, uf as UF | null, scenario, config);
      taxAcc.federal += txb.federalTotal;
      taxAcc.icms += txb.icmsInterstateTotal;
      taxAcc.difal += txb.difalTotal;
      taxAcc.fcp += txb.fcpTotal;

      // Per-listing accumulation (scenario-selected; Ads added once, post-loop).
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
        const pSel = computeProfit({ ...baseInput, ads: 0 }, scenario, config);
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

  // Fold Ads spend in exactly ONCE per item. The Ads API already reports the
  // total spend for each listing over the period, so we must not multiply it by
  // the number of orders/lines. Ads is tax-free (no impost on ad spend), so it
  // simply reduces netProfit by the same amount in both scenarios.
  //
  // We only attribute spend for items that actually had sales in the window
  // (i.e. exist in `listings`), so the totals stay consistent with the per
  // listing rows. Ads for items without sales in the period is left out of the
  // sale-based P&L on purpose.
  let adsTotal = 0;
  for (const acc of Array.from(listings.values())) {
    const spend = adsByItem.get(acc.itemId) ?? 0;
    if (spend <= 0) continue;
    adsTotal += spend;
    const adsBreakdown: ProfitBreakdown = {
      revenue: 0,
      commission: 0,
      shipping: 0,
      cmv: 0,
      tax: 0,
      ads: spend,
      netProfit: -spend,
      margin: null,
    };
    acc.profit = addProfit(acc.profit, adsBreakdown);
  }
  if (adsTotal > 0) {
    const adsTotalBreakdown: ProfitBreakdown = {
      revenue: 0,
      commission: 0,
      shipping: 0,
      cmv: 0,
      tax: 0,
      ads: adsTotal,
      netProfit: -adsTotal,
      margin: null,
    };
    totalsSem = addProfit(totalsSem, adsTotalBreakdown);
    totalsCom = addProfit(totalsCom, adsTotalBreakdown);
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

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const taxDetail = {
    federal: round2(taxAcc.federal),
    icms: round2(taxAcc.icms),
    difal: round2(taxAcc.difal),
    fcp: round2(taxAcc.fcp),
    total: round2(taxAcc.federal + taxAcc.icms + taxAcc.difal + taxAcc.fcp),
  };

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
    taxDetail,
    listings: listingRows,
    byUF,
    config,
    productsMissingCost: missingCostProducts.size,
    excludedCount: params.excludedCount ?? 0,
    totalOrdersSeen: params.totalOrdersSeen ?? orders.length,
    excludedByStatus: params.excludedByStatus ?? {},
  };
}
