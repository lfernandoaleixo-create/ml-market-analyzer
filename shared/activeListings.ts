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

  /* ------------------------- Insumos da calculadora ------------------------ */

  /** Peso da embalagem do vendedor (gramas), conforme o ML. null = não declarado. */
  packageWeightGrams: number | null;
  /** Índice da faixa de peso (0..27) derivado do peso real do anúncio. */
  weightIndex: number;
  /** Imposto (%) usado no cálculo (default da config tributária). */
  taxPercent: number;
}

/**
 * Overrides editáveis do card "recalcular como na Calculadora". Todos opcionais:
 * quando ausentes, usa-se o valor real/derivado do anúncio. Aplicados tanto em
 * lote (a vários selecionados) quanto por anúncio (mais específico vence).
 */
export interface ListingOverrides {
  /** Custo do produto (R$) — sobrescreve o custo da BaseLinker. */
  cost?: number;
  /** Comissão (%) do marketplace. */
  commissionPercent?: number;
  /** Imposto (%) sobre o preço. */
  taxPercent?: number;
  /** TACoS / ADS (%). */
  tacosPercent?: number;
  /** Afiliados (%). */
  affiliatePercent?: number;
  /** Taxa fixa (R$). */
  fixedFee?: number;
  /** Frete manual (R$) — quando definido, ignora a tabela e usa este valor. */
  shippingCost?: number;
  /** Liga o frete manual (usa shippingCost em vez da tabela). */
  manualShipping?: boolean;
  /** Índice de faixa de peso (0..27) — sobrescreve o peso real. */
  weightIndex?: number;
  /** Tipo de anúncio. */
  mlListingType?: MlListingType;
  /** Modelo logístico. */
  mlLogisticType?: MlLogisticType;
  /** Frete Grátis Rápido (FGR). */
  freeShippingFast?: boolean;
  /** Campanha Destaque (+6 p.p. de comissão). */
  highlightCampaign?: boolean;
  /** Reputação (afeta Cat. Especiais). */
  reputation?: MlReputation;
  /** Outros custos (R$). */
  otherCostValue?: number;
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
  /** Quantos anúncios já têm visitas REAIS coletadas do ML (progresso). */
  visitsResolved?: number;
  /** Total de anúncios para os quais buscamos visitas. */
  visitsAttempted?: number;
}

export interface ActiveListingsResult {
  summary: ActiveListingsSummary;
  items: ActiveListingRow[];
  /** As 3 margens (%) usadas para calcular os preços-alvo desta resposta. */
  margins: number[];
}

/** Margens padrão das 3 colunas de simulação. */
export const DEFAULT_MARGINS = [20, 30, 40];

/**
 * Converte um peso em GRAMAS no índice de faixa de peso da calculadora (0..27),
 * escolhendo a MENOR faixa cujo limite em kg seja >= ao peso. Retorna 0 (Até 300g)
 * quando o peso é desconhecido ou inválido.
 */
export function weightGramsToIndex(grams: number | null | undefined): number {
  if (grams == null || !Number.isFinite(grams) || grams <= 0) return 0;
  const kg = grams / 1000;
  for (let i = 0; i < ML_WEIGHT_KG.length; i++) {
    if (kg <= ML_WEIGHT_KG[i]) return i;
  }
  return ML_WEIGHT_KG.length - 1;
}

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
  { key: "sku", label: "SKU", defaultVisible: false },
  { key: "itemId", label: "MLB", defaultVisible: false },
  { key: "mlListingType", label: "Tipo", defaultVisible: true },
  { key: "price", label: "Preço atual", defaultVisible: true },
  { key: "cost", label: "Custo", defaultVisible: true },
  { key: "realProfit", label: "Lucro real (R$)", defaultVisible: true },
  { key: "realMarginPct", label: "Margem real (%)", defaultVisible: true },
  { key: "commissionPercent", label: "Comissão", defaultVisible: true },
  { key: "shippingCost", label: "Frete", defaultVisible: true },
  { key: "availableQuantity", label: "Estoque", defaultVisible: false },
  { key: "soldQuantity", label: "Vendidos", defaultVisible: true },
  { key: "visits", label: "Visitas (30d)", defaultVisible: true },
  { key: "conversion", label: "Conversão", defaultVisible: false },
  { key: "health", label: "Saúde", defaultVisible: false },
  { key: "freeShipping", label: "Frete grátis", defaultVisible: true },
  { key: "mlLogisticType", label: "Logística", defaultVisible: false },
  { key: "catalogListing", label: "Catálogo", defaultVisible: true },
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
  ML_WEIGHT_KG,
  type PricingInput,
  type MlListingType,
  type MlLogisticType,
  type MlReputation,
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
  /** Índice de faixa de peso real do anúncio (0..27). Default 0. */
  weightIndex?: number;
  /** Frete Grátis Rápido (FGR) ligado no anúncio. */
  freeShippingFast?: boolean;
  /** Reputação do vendedor. */
  reputation?: MlReputation;
}

/**
 * Aplica os overrides (lote/por anúncio) sobre os dados reais do anúncio,
 * devolvendo os insumos efetivos para o cálculo. "undefined" em um override
 * significa "usar o valor real do anúncio".
 */
export function applyOverrides(
  listing: ListingCalcInput,
  params: ListingCalcParams,
  ov: ListingOverrides = {},
): {
  cost: number | null;
  mlListingType: MlListingType;
  mlLogisticType: MlLogisticType;
  commissionPercent: number;
  taxPercent: number;
  tacosPercent: number;
  affiliatePercent: number;
  fixedFee: number;
  weightIndex: number;
  freeShippingFast: boolean;
  highlightCampaign: boolean;
  reputation: MlReputation;
  manualShipping: boolean;
  shippingCost: number;
  otherCostValue: number;
} {
  const mlListingType = ov.mlListingType ?? listing.mlListingType;
  // Comissão: override explícito vence; senão mantém a do anúncio. Se o tipo mudou
  // por override e a comissão não foi informada, segue o default do novo tipo.
  let commissionPercent = ov.commissionPercent;
  if (commissionPercent == null) {
    commissionPercent =
      ov.mlListingType && ov.mlListingType !== listing.mlListingType
        ? mlListingType === "premium"
          ? 17
          : 12
        : listing.commissionPercent;
  }
  return {
    cost: ov.cost != null ? ov.cost : listing.cost,
    mlListingType,
    mlLogisticType: ov.mlLogisticType ?? listing.mlLogisticType,
    commissionPercent,
    taxPercent: ov.taxPercent ?? params.taxPercent ?? 0,
    tacosPercent: ov.tacosPercent ?? params.tacosPercent ?? 0,
    affiliatePercent: ov.affiliatePercent ?? params.affiliatePercent ?? 0,
    fixedFee: ov.fixedFee ?? 0,
    weightIndex: ov.weightIndex ?? listing.weightIndex ?? params.weightIndex ?? 0,
    freeShippingFast: ov.freeShippingFast ?? listing.freeShippingFast ?? false,
    highlightCampaign: ov.highlightCampaign ?? false,
    reputation: ov.reputation ?? listing.reputation ?? "verde",
    manualShipping: ov.manualShipping ?? false,
    shippingCost: ov.shippingCost ?? 0,
    otherCostValue: ov.otherCostValue ?? 0,
  };
}

/** Resultado do cálculo de lucro/comissão/frete de um anúncio no preço atual. */
export interface ListingCalcResult {
  fixedFee: number;
  shippingCost: number;
  realProfit: number | null;
  realMarginPct: number | null;
}

/**
 * Monta a entrada base da calculadora para um anúncio (campos comuns), aplicando
 * os overrides (lote/por anúncio) sobre os valores reais do anúncio.
 */
function baseInput(
  listing: ListingCalcInput,
  params: ListingCalcParams,
  ov: ListingOverrides = {},
): Omit<PricingInput, "mode" | "desiredMargin" | "sellingPrice"> {
  const e = applyOverrides(listing, params, ov);
  return {
    marketplace: "mercado_livre",
    mlListingType: e.mlListingType,
    productCost: e.cost ?? 0,
    taxPercent: e.taxPercent,
    tacosPercent: e.tacosPercent,
    affiliatePercent: e.affiliatePercent,
    otherCostKind: "reais",
    otherCostValue: e.otherCostValue,
    commissionPercent: e.commissionPercent,
    fixedFee: e.fixedFee,
    shippingCost: e.shippingCost,
    autoFees: true,
    mlLogisticType: e.mlLogisticType,
    freeShippingFast: e.freeShippingFast,
    highlightCampaign: e.highlightCampaign,
    weightIndex: e.weightIndex,
    reputation: e.reputation,
    manualShipping: e.manualShipping,
  };
}

/**
 * Calcula comissão/frete/taxa e o LUCRO REAL ATUAL de um anúncio, usando o preço
 * de venda de hoje (modo preço→margem). Retorna lucro/margem null quando o custo
 * é desconhecido. Aceita overrides (card de recalibragem).
 */
export function computeListingProfit(
  listing: ListingCalcInput,
  params: ListingCalcParams,
  ov: ListingOverrides = {},
): ListingCalcResult {
  const effectiveCost = ov.cost != null ? ov.cost : listing.cost;
  const res = calculatePricing({
    ...baseInput(listing, params, ov),
    mode: "preco_para_margem",
    desiredMargin: 0,
    sellingPrice: listing.price,
  });
  if (effectiveCost == null || effectiveCost <= 0) {
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
  ov: ListingOverrides = {},
): number | null {
  const effectiveCost = ov.cost != null ? ov.cost : listing.cost;
  if (effectiveCost == null || effectiveCost <= 0) return null;
  const res = calculatePricing({
    ...baseInput(listing, params, ov),
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
  ov: ListingOverrides = {},
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const m of margins) out[String(m)] = computeTargetPrice(listing, params, m, ov);
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

/* ------------------------------------------------------------------------- *
 *  Rótulos do valor "automático" (real) por campo do card de recalibração
 * ------------------------------------------------------------------------- *
 * Quando um campo do card está em "automático", a UI mostra qual valor real
 * está sendo usado para o anúncio selecionado, para o usuário decidir se passa
 * para manual. Estes helpers são puros para serem testáveis e reutilizáveis. */

import { ML_WEIGHT_LABELS } from "./pricing";

/** Formata um número em R$ (pt-BR), 2 casas. Ex.: 12.9 → "R$ 12,90". */
function brl(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Formata uma porcentagem (pt-BR) com até 2 casas. Ex.: 5.93 → "5,93%". */
function pct(v: number): string {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** Rótulo legível do tipo de anúncio. */
export function listingTypeLabel(t: MlListingType): string {
  return t === "premium" ? "Premium" : "Clássico";
}

/** Rótulo legível do modelo logístico. */
export function logisticTypeLabel(t: MlLogisticType): string {
  if (t === "full_super") return "Full / Super";
  if (t === "cat_especial") return "Categorias especiais";
  return "Padrão (Clássico)";
}

/** Rótulo legível da faixa de peso (índice 0..27). */
export function weightLabel(index: number): string {
  return ML_WEIGHT_LABELS[index] ?? `Faixa ${index}`;
}

/**
 * Valores "automáticos" (reais) de UM anúncio selecionado, já formatados para a
 * UI mostrar abaixo de cada campo do card quando ele está em "automático".
 * Quando não há exatamente 1 anúncio selecionado, a UI não exibe (em lote cada
 * anúncio usa o próprio valor real, então não há um único número a mostrar).
 */
export interface AutoFieldValues {
  cost: string;
  taxPercent: string;
  commissionPercent: string;
  mlListingType: string;
  mlLogisticType: string;
  weight: string;
  shippingCost: string;
  fixedFee: string;
}

/** Deriva os rótulos "auto" a partir da linha real do anúncio. */
export function autoFieldValues(row: ActiveListingRow): AutoFieldValues {
  return {
    cost: row.cost != null ? brl(row.cost) : "sem custo",
    taxPercent: pct(row.taxPercent),
    commissionPercent: pct(row.commissionPercent),
    mlListingType: listingTypeLabel(row.mlListingType),
    mlLogisticType: logisticTypeLabel(row.mlLogisticType),
    weight:
      row.packageWeightGrams != null
        ? `${weightLabel(row.weightIndex)} (${row.packageWeightGrams} g)`
        : weightLabel(row.weightIndex),
    shippingCost: brl(row.shippingCost),
    fixedFee: brl(row.fixedFee),
  };
}
