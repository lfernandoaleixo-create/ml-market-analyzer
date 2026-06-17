/**
 * Tipos compartilhados da aba "Anúncios ativos" (dentro da Calculadora).
 *
 * Lista SOMENTE anúncios com status `active` do Mercado Livre, enriquecidos com:
 *  - custo do produto (CMV) vindo da BaseLinker, casado por SKU;
 *  - comissão / taxa fixa / frete reais por anúncio (regras oficiais do ML);
 *  - lucro real ATUAL (R$ e %) com base no preço de venda de hoje;
 *  - preços-alvo para margens escolhidas pelo usuário (3 simulações).
 *
 * Tudo aqui é só tipo (sem I/O), para ser compartilhado entre server e client.
 */

/** Uma linha da tabela de anúncios ativos. */
export interface ActiveListingRow {
  /** MLB do anúncio. */
  itemId: string;
  title: string;
  /** SKU do anúncio (seller_custom_field / seller_sku / SELLER_SKU). */
  sku: string;
  thumbnail?: string;
  permalink?: string;

  /** Preço de venda ATUAL (R$). */
  price: number;
  currency: string;

  /** Tipo de anúncio: "gold_pro" (Premium), "gold_special" (Clássico), etc. */
  listingType: string;
  /** Tipo de anúncio normalizado para a calculadora. */
  mlListingType: "classico" | "premium";

  availableQuantity: number;
  soldQuantity: number;
  /** Visitas na janela (ex.: 30 dias). */
  visits: number;
  visitsAvailable: boolean;
  /** Conversão = vendidos / visitas (0..1), null quando sem visitas. */
  conversion: number | null;
  /** Saúde do anúncio (0..1) quando fornecida pelo ML. */
  health?: number | null;
  categoryId?: string;
  createdMs?: number | null;
  updatedMs?: number | null;
  freeShipping: boolean;
  /** Modelo logístico bruto do ML (fulfillment, cross_docking, etc.). */
  logisticType?: string | null;
  /** Modelo logístico normalizado para a calculadora. */
  mlLogisticType: "padrao" | "full_super" | "cat_especial";
  catalogListing: boolean;
  /** Valor total em estoque (preço * quantidade disponível). */
  stockValue: number;

  /* ----------------------------- Custos / lucro ---------------------------- */

  /** Custo do produto (CMV) — null quando não encontrado na BaseLinker. */
  cost: number | null;
  /** Fonte do custo: "sku" (casou por SKU) ou "none". */
  costSource: "sku" | "sku_norm" | "name" | "none";

  /** Comissão (%) usada no cálculo (default por tipo de anúncio). */
  commissionPercent: number;
  /** Taxa fixa (R$) usada (ML embute no frete → normalmente 0). */
  fixedFee: number;
  /** Frete (R$) que o vendedor paga, conforme tipo/logística/peso/faixa. */
  shippingCost: number;

  /** Lucro real ATUAL em R$ (preço de hoje − custo − comissão − frete − impostos…).
   *  null quando o custo é desconhecido. */
  realProfit: number | null;
  /** Margem real ATUAL em % sobre o preço de hoje. null quando custo desconhecido. */
  realMarginPct: number | null;

  /** Preços-alvo por margem desejada (chave = margem em %, valor = preço R$).
   *  Ex.: { "20": 55.51, "30": 64.2, "40": 75.1 }. Vazio quando custo desconhecido. */
  targetPrices: Record<string, number | null>;
}

/** Resumo agregado dos anúncios ativos. */
export interface ActiveListingsSummary {
  /** Total de anúncios ativos. */
  totalActive: number;
  /** Quantos têm custo conhecido (casaram com a BaseLinker). */
  withCost: number;
  /** Quantos NÃO têm custo conhecido. */
  withoutCost: number;
  /** Soma do lucro real atual (apenas os com custo conhecido). */
  totalRealProfit: number;
  /** Valor total em estoque (preço * disponível) dos ativos. */
  totalStockValue: number;
  /** Janela de visitas (dias). */
  windowDays: number;
  /** True quando o BaseLinker NÃO está configurado (sem custos). */
  baselinkerConfigured: boolean;
  /** ISO da última sincronização (quando vier do snapshot diário). */
  lastSyncIso?: string | null;
}

export interface ActiveListingsResult {
  summary: ActiveListingsSummary;
  items: ActiveListingRow[];
  /** As 3 margens (%) usadas para calcular os preços-alvo desta resposta. */
  margins: number[];
}

/** Margens padrão das 3 colunas de simulação. */
export const DEFAULT_MARGINS = [20, 30, 40];

/** Opções de margem disponíveis nos seletores das 3 colunas. */
export const MARGIN_OPTIONS = [5, 10, 12, 15, 18, 20, 22, 25, 28, 30, 35, 40, 45, 50];

/** Definição de uma coluna da tabela (para o seletor de colunas). */
export interface ColumnDef {
  key: string;
  label: string;
  /** Visível por padrão. */
  defaultVisible: boolean;
  /** Coluna essencial que não pode ser ocultada (ex.: título). */
  locked?: boolean;
}

/** Todas as colunas possíveis da tabela de anúncios ativos. */
export const ACTIVE_LISTING_COLUMNS: ColumnDef[] = [
  { key: "thumbnail", label: "Foto", defaultVisible: true },
  { key: "title", label: "Anúncio", defaultVisible: true, locked: true },
  { key: "sku", label: "SKU", defaultVisible: true },
  { key: "itemId", label: "MLB", defaultVisible: false },
  { key: "mlListingType", label: "Tipo", defaultVisible: true },
  { key: "price", label: "Preço atual", defaultVisible: true },
  { key: "cost", label: "Custo", defaultVisible: true },
  { key: "realProfit", label: "Lucro real (R$)", defaultVisible: true },
  { key: "realMarginPct", label: "Margem real (%)", defaultVisible: true },
  { key: "commissionPercent", label: "Comissão", defaultVisible: false },
  { key: "shippingCost", label: "Frete", defaultVisible: false },
  { key: "availableQuantity", label: "Estoque", defaultVisible: true },
  { key: "soldQuantity", label: "Vendidos", defaultVisible: false },
  { key: "visits", label: "Visitas (30d)", defaultVisible: true },
  { key: "conversion", label: "Conversão", defaultVisible: false },
  { key: "health", label: "Saúde", defaultVisible: false },
  { key: "freeShipping", label: "Frete grátis", defaultVisible: false },
  { key: "mlLogisticType", label: "Logística", defaultVisible: false },
  { key: "catalogListing", label: "Catálogo", defaultVisible: false },
  { key: "stockValue", label: "Valor em estoque", defaultVisible: false },
  { key: "createdMs", label: "Criado em", defaultVisible: false },
  { key: "updatedMs", label: "Atualizado em", defaultVisible: false },
  { key: "permalink", label: "Link", defaultVisible: true },
];

/* ------------------------------------------------------------------------- *
 *  Lógica pura de cálculo (lucro real atual + preço-alvo por margem)
 * ------------------------------------------------------------------------- */

import {
  calculatePricing,
  type PricingInput,
  type MlListingType,
  type MlLogisticType,
} from "./pricing";

/** Parâmetros de cálculo que se repetem para cada anúncio. */
export interface ListingCalcParams {
  /** Impostos (%) sobre o preço. */
  taxPercent: number;
  /** TACoS / ADS (%) sobre o preço. */
  tacosPercent?: number;
  /** Afiliados (%) sobre o preço. */
  affiliatePercent?: number;
  /** Índice da faixa de peso (0..27). Default 0 (Até 300g). */
  weightIndex?: number;
}

/** Dados mínimos de um anúncio para o cálculo. */
export interface ListingCalcInput {
  price: number;
  cost: number | null;
  mlListingType: MlListingType;
  mlLogisticType: MlLogisticType;
  commissionPercent: number;
}

/** Resultado do cálculo de lucro/comissão/frete de um anúncio no preço atual. */
export interface ListingCalcResult {
  fixedFee: number;
  shippingCost: number;
  realProfit: number | null;
  realMarginPct: number | null;
}

/**
 * Monta a entrada base da calculadora para um anúncio (campos comuns).
 */
function baseInput(
  listing: ListingCalcInput,
  params: ListingCalcParams,
): Omit<PricingInput, "mode" | "desiredMargin" | "sellingPrice"> {
  return {
    marketplace: "mercado_livre",
    mlListingType: listing.mlListingType,
    productCost: listing.cost ?? 0,
    taxPercent: params.taxPercent ?? 0,
    tacosPercent: params.tacosPercent ?? 0,
    affiliatePercent: params.affiliatePercent ?? 0,
    otherCostKind: "reais",
    otherCostValue: 0,
    commissionPercent: listing.commissionPercent,
    fixedFee: 0,
    shippingCost: 0,
    autoFees: true,
    mlLogisticType: listing.mlLogisticType,
    weightIndex: params.weightIndex ?? 0,
    reputation: "verde",
  };
}

/**
 * Calcula comissão/frete/taxa e o LUCRO REAL ATUAL de um anúncio, usando o preço
 * de venda de hoje (modo preço→margem). Retorna lucro/margem null quando o custo
 * é desconhecido.
 */
export function computeListingProfit(
  listing: ListingCalcInput,
  params: ListingCalcParams,
): ListingCalcResult {
  const res = calculatePricing({
    ...baseInput(listing, params),
    mode: "preco_para_margem",
    desiredMargin: 0,
    sellingPrice: listing.price,
  });
  if (listing.cost == null || listing.cost <= 0) {
    return {
      fixedFee: res.fixedFeeUsed,
      shippingCost: res.shippingUsed,
      realProfit: null,
      realMarginPct: null,
    };
  }
  return {
    fixedFee: res.fixedFeeUsed,
    shippingCost: res.shippingUsed,
    realProfit: res.contributionMargin,
    realMarginPct: res.contributionMarginPct,
  };
}

/**
 * Calcula o PREÇO-ALVO para atingir uma margem desejada (%) em um anúncio,
 * no modo custo→preço. Retorna null quando o custo é desconhecido ou inválido.
 */
export function computeTargetPrice(
  listing: ListingCalcInput,
  params: ListingCalcParams,
  desiredMargin: number,
): number | null {
  if (listing.cost == null || listing.cost <= 0) return null;
  const res = calculatePricing({
    ...baseInput(listing, params),
    mode: "custo_para_preco",
    desiredMargin,
  });
  return res.valid ? res.price : null;
}

/** Calcula os preços-alvo para um conjunto de margens. */
export function computeTargetPrices(
  listing: ListingCalcInput,
  params: ListingCalcParams,
  margins: number[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const m of margins) out[String(m)] = computeTargetPrice(listing, params, m);
  return out;
}

/** Normaliza o listing_type_id do ML para o tipo da calculadora. */
export function normalizeListingType(listingTypeId: string | undefined | null): MlListingType {
  // gold_pro = Premium; gold_special / gold / outros = Clássico.
  return listingTypeId === "gold_pro" ? "premium" : "classico";
}

/** Normaliza o logistic_type do ML para o modelo logístico da calculadora. */
export function normalizeLogisticType(
  logisticType: string | undefined | null,
): MlLogisticType {
  if (logisticType === "fulfillment") return "full_super";
  // cross_docking / drop_off / self_service / xd_drop_off → Padrão (Clássico).
  return "padrao";
}
