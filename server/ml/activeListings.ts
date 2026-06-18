/**
 * Serviço de "Anúncios ativos" (aba da Calculadora).
 *
 * Faz o I/O e a montagem das linhas:
 *   1) busca os anúncios do ML (via AccountProvider.getListings) e filtra SOMENTE
 *      os com status `active`;
 *   2) busca os custos (CMV) na BaseLinker e casa por SKU;
 *   3) calcula comissão / frete / lucro real atual e preços-alvo por margem,
 *      reaproveitando a lógica pura de shared/pricing.ts via shared/activeListings.ts.
 *
 * Tudo somente-leitura: nada é gravado de volta no ML ou na BaseLinker.
 */

import type { AccountProvider } from "./accountProvider";
import {
  getInventories,
  getProductCosts,
  normalizeSkuKey,
  normalizeNameKey,
  type BlProductCost,
} from "../baselinker/provider";
import { isBaselinkerConfigured } from "../baselinker/client";
import { getTaxConfigRow } from "../dbMl";
import {
  type ActiveListingRow,
  type ActiveListingsResult,
  type ListingCalcParams,
  computeListingProfit,
  computeTargetPrices,
  normalizeListingType,
  normalizeLogisticType,
  weightGramsToIndex,
  DEFAULT_MARGINS,
} from "../../shared/activeListings";

export interface BuildActiveListingsOptions {
  /** Janela de visitas (dias). Default 30. */
  lastDays?: number;
  /** As 3 margens (%) para os preços-alvo. Default [20,30,40]. */
  margins?: number[];
  /** Imposto agregado (%) sobre o preço. Quando ausente, deriva da TaxConfig. */
  taxPercent?: number;
  /** TACoS/ADS (%) — opcional. */
  tacosPercent?: number;
  /** Afiliados (%) — opcional. */
  affiliatePercent?: number;
}

/** Imposto agregado padrão = soma dos federais (PIS+COFINS+IRPJ+CSLL). */
function defaultTaxPercentFromConfig(stored: unknown): number {
  const s = (stored && typeof stored === "object" ? stored : {}) as Record<string, number>;
  const pis = typeof s.pis === "number" ? s.pis : 0.65;
  const cofins = typeof s.cofins === "number" ? s.cofins : 3.0;
  const irpj = typeof s.irpjEffective === "number" ? s.irpjEffective : 1.2;
  const csll = typeof s.csllEffective === "number" ? s.csllEffective : 1.08;
  return Math.round((pis + cofins + irpj + csll) * 100) / 100;
}

/** Resolve o inventoryId da BaseLinker (config do usuário ou o primeiro catálogo). */
async function resolveInventoryId(userId: number): Promise<number | null> {
  const row = await getTaxConfigRow(userId);
  if (row?.baselinkerInventoryId != null) return row.baselinkerInventoryId;
  const invs = await getInventories();
  return invs[0]?.inventoryId ?? null;
}

interface CostIndexes {
  bySku: Map<string, BlProductCost>;
  bySkuNorm: Map<string, BlProductCost>;
  byName: Map<string, BlProductCost>;
}

/**
 * Casa o custo (CMV) de um anúncio em cascata, do mais preciso ao mais tolerante:
 *   1) SKU exato (minúsculas)
 *   2) SKU normalizado (sem espaços/hífens) — ex.: "ESPETOB-G - 4x25-1K"
 *   3) nome do produto (fallback) — quando o anúncio não tem SKU
 * Retorna { cost, source }.
 */
function resolveCost(
  sku: string,
  title: string,
  idx: CostIndexes,
): { cost: number | null; source: "sku" | "sku_norm" | "name" | "none" } {
  if (sku) {
    const exact = idx.bySku.get(sku.toLowerCase());
    if (exact && exact.averageCost > 0) return { cost: exact.averageCost, source: "sku" };
    const norm = idx.bySkuNorm.get(normalizeSkuKey(sku));
    if (norm && norm.averageCost > 0) return { cost: norm.averageCost, source: "sku_norm" };
  }
  const byName = idx.byName.get(normalizeNameKey(title));
  if (byName && byName.averageCost > 0) return { cost: byName.averageCost, source: "name" };
  return { cost: null, source: "none" };
}

/**
 * Monta o resultado completo da aba "Anúncios ativos" para um usuário.
 *
 * @param userId   Manus user id (para resolver config + inventory).
 * @param account  AccountProvider já resolvido (token + ML user id).
 */
export async function buildActiveListings(
  userId: number,
  account: AccountProvider,
  opts: BuildActiveListingsOptions = {},
): Promise<ActiveListingsResult> {
  const lastDays = opts.lastDays ?? 30;
  const margins = (opts.margins ?? DEFAULT_MARGINS).slice(0, 3);

  // 1) Anúncios do ML — apenas os ATIVOS.
  const listings = await account.getListings({ lastDays, includeVisitsSeries: false });
  const activeRaw = listings.items.filter((i) => i.status === "active");

  // 2) Custos da BaseLinker (best-effort: se não configurado, segue sem custo).
  const blConfigured = isBaselinkerConfigured();
  const costIndex: CostIndexes = {
    bySku: new Map<string, BlProductCost>(),
    bySkuNorm: new Map<string, BlProductCost>(),
    byName: new Map<string, BlProductCost>(),
  };
  if (blConfigured) {
    try {
      const inventoryId = await resolveInventoryId(userId);
      if (inventoryId != null) {
        const costs = await getProductCosts(inventoryId);
        costIndex.bySku = costs.bySku;
        costIndex.bySkuNorm = costs.bySkuNorm;
        costIndex.byName = costs.byName;
      }
    } catch (err) {
      // Custo é um enriquecimento — uma falha aqui não pode derrubar a lista.
      console.warn("[activeListings] custo BaseLinker indisponível:", (err as Error)?.message ?? err);
    }
  }

  // 3) Parâmetros de cálculo (imposto agregado + ads/afiliados opcionais).
  const row = await getTaxConfigRow(userId).catch(() => null);
  const taxPercent = opts.taxPercent ?? defaultTaxPercentFromConfig(row?.config);
  const params: ListingCalcParams = {
    taxPercent,
    tacosPercent: opts.tacosPercent ?? 0,
    affiliatePercent: opts.affiliatePercent ?? 0,
    weightIndex: 0,
  };

  const items: ActiveListingRow[] = activeRaw.map((l) => {
    const sku = l.sku ?? "";
    const { cost, source: costSource } = resolveCost(sku, l.title, costIndex);
    const mlListingType = normalizeListingType(l.listingType);
    const mlLogisticType = normalizeLogisticType(l.logisticType);
    const commissionPercent = mlListingType === "premium" ? 17 : 12;
    // Peso REAL do anúncio (SELLER_PACKAGE_WEIGHT do ML) → faixa de peso da calculadora.
    const packageWeightGrams = l.packageWeightGrams ?? null;
    const weightIndex = weightGramsToIndex(packageWeightGrams);

    const calcInput = {
      price: l.price,
      cost,
      mlListingType,
      mlLogisticType,
      commissionPercent,
      weightIndex,
      // Frete grátis no anúncio costuma ser FGR quando o preço < R$79.
      freeShippingFast: (l.freeShipping ?? false) && l.price < 79,
      reputation: "verde" as const,
    };
    const profit = computeListingProfit(calcInput, params);
    const targetPrices = computeTargetPrices(calcInput, params, margins);

    return {
      itemId: l.itemId,
      title: l.title,
      sku,
      thumbnail: l.thumbnail,
      permalink: l.permalink,
      price: l.price,
      currency: l.currency,
      listingType: l.listingType,
      mlListingType,
      availableQuantity: l.availableQuantity,
      soldQuantity: l.soldQuantity,
      visits: l.visits,
      visitsAvailable: l.visitsAvailable,
      conversion: l.conversion,
      health: l.health,
      categoryId: l.categoryId,
      createdMs: l.createdMs,
      updatedMs: l.updatedMs,
      freeShipping: l.freeShipping ?? false,
      logisticType: l.logisticType,
      mlLogisticType,
      catalogListing: l.catalogListing ?? false,
      stockValue: l.stockValue,
      cost,
      costSource,
      commissionPercent,
      fixedFee: profit.fixedFee,
      shippingCost: profit.shippingCost,
      realProfit: profit.realProfit,
      realMarginPct: profit.realMarginPct,
      targetPrices,
      packageWeightGrams,
      weightIndex,
      taxPercent,
    };
  });

  const withCost = items.filter((i) => i.cost != null).length;
  const totalRealProfit = items.reduce((s, i) => s + (i.realProfit ?? 0), 0);
  const totalStockValue = items.reduce((s, i) => s + i.stockValue, 0);
  // Progresso de visitas: quantos ativos já têm visita REAL coletada do ML.
  // A coleta é item-a-item em background; enquanto não cobre todos, a aba mostra
  // "carregando" para os pendentes em vez de um 0 enganoso.
  const visitsResolved = items.filter((i) => i.visitsAvailable).length;
  const visitsAttempted = items.length;

  return {
    summary: {
      totalActive: items.length,
      withCost,
      withoutCost: items.length - withCost,
      totalRealProfit: Math.round(totalRealProfit * 100) / 100,
      totalStockValue: Math.round(totalStockValue * 100) / 100,
      windowDays: lastDays,
      baselinkerConfigured: blConfigured,
      lastSyncIso: null,
      visitsResolved,
      visitsAttempted,
    },
    items,
    margins,
  };
}
