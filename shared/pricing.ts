/**
 * Lógica pura da Calculadora de Precificação (réplica fiel da Mamba Nexus).
 *
 * Método de MARKUP DIVISOR:
 *
 *   Preço = (CustosFixos R$) / (1 − CustosVariáveis%)
 *
 * Onde os "custos fixos" são valores em REAIS por unidade (custo do produto,
 * frete, taxa fixa, outros em R$) e os "custos variáveis" são percentuais
 * aplicados sobre o PREÇO de venda (margem desejada, comissão, impostos,
 * TACoS/ADS, afiliados, outros em %).
 *
 * Para o Mercado Livre, o FRETE e (quando aplicável) a TAXA FIXA são
 * AUTO-ALIMENTADOS a partir das tabelas reais do ML, conforme:
 *  - tipo de anúncio (Clássico/Premium),
 *  - modelo logístico (Padrão/Full Super/Cat. Especiais),
 *  - Frete Grátis Rápido (FGR),
 *  - faixa de peso do produto embalado,
 *  - faixa de PREÇO do produto.
 *
 * Como o frete depende do próprio preço (que ainda não se conhece), usa-se um
 * solver ITERATIVO (até 10 passos, tolerância R$ 0,01), exatamente como a Mamba.
 *
 * Tudo aqui é puro (sem I/O) para ser facilmente testável com Vitest.
 */

import {
  ML_SHIPPING_PADRAO,
  ML_SHIPPING_ESPECIAL_AMARELA,
  ML_SHIPPING_ESPECIAL_VERDE,
  ML_SHIPPING_FULL,
  ML_SHIPPING_FLAT,
  type ShippingRowTiered,
  type ShippingRowFlat,
} from "./ml-shipping-tables";

/** Canais de venda suportados. */
export type Marketplace = "mercado_livre" | "shopee" | "outro";

/** Tipo de anúncio do Mercado Livre. */
export type MlListingType = "classico" | "premium";

/** Modelo logístico do Mercado Livre. */
export type MlLogisticType = "padrao" | "full_super" | "cat_especial";

/** Reputação do vendedor (afeta tabela de Cat. Especiais). */
export type MlReputation = "verde" | "amarela";

/** Modo de cálculo da calculadora. */
export type PricingMode = "custo_para_preco" | "preco_para_margem";

/** Como o campo "Outros custos" é interpretado. */
export type OtherCostKind = "reais" | "percent";

/** Comissão padrão (campo editável) do Mercado Livre por tipo de anúncio (%). */
export const ML_DEFAULT_COMMISSION: Record<MlListingType, number> = {
  classico: 12,
  premium: 17,
};

/** Comissão padrão aproximada da Shopee, em %. */
export const SHOPEE_DEFAULT_COMMISSION = 20;
/** Taxa fixa padrão da Shopee, em R$ (cAe.shopee.defaultTaxaFixa). */
export const SHOPEE_DEFAULT_FIXED_FEE = 6.25;
/** Comissão e taxa fixa padrão de "Outro marketplace". */
export const OUTRO_DEFAULT_COMMISSION = 14;
export const OUTRO_DEFAULT_FIXED_FEE = 4;

/** Frete padrão exibido como fallback (R$). */
export const DEFAULT_SHIPPING = 7.75;

/** Acréscimo de comissão das Campanhas Destaque (ky), em pontos percentuais. */
const CAMPAIGN_COMMISSION_EXTRA = 6;
/** Nº máximo de iterações do solver. */
const MAX_ITER = 10;
/** Tolerância de convergência (R$). */
const TOLERANCE = 0.01;
/**
 * Teto de deduções percentuais (margem + comissão + impostos + TACoS +
 * afiliados) acima do qual o preço pelo markup divisor é considerado inviável.
 * A 95% o multiplicador já é 20x (1/0,05) e cresce sem limite até 100%, gerando
 * preços irreais; por isso travamos em 95%.
 */
const MAX_DEDUCTION_PCT = 95;

/**
 * Mapa índice de peso → kg (RR da Mamba). 28 faixas (0..27).
 */
export const ML_WEIGHT_KG: number[] = [
  0.3, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13, 15, 17, 20, 25, 30, 40, 50, 60,
  70, 80, 90, 100, 125, 150, 200,
];

/** Rótulos das faixas de peso (combobox da Mamba). */
export const ML_WEIGHT_LABELS: string[] = [
  "Até 300g",
  "300g a 500g",
  "500g a 1kg",
  "1kg a 2kg",
  "2kg a 3kg",
  "3kg a 4kg",
  "4kg a 5kg",
  "5kg a 6kg",
  "6kg a 7kg",
  "7kg a 8kg",
  "8kg a 9kg",
  "9kg a 11kg",
  "11kg a 13kg",
  "13kg a 15kg",
  "15kg a 17kg",
  "17kg a 20kg",
  "20kg a 25kg",
  "25kg a 30kg",
  "30kg a 40kg",
  "40kg a 50kg",
  "50kg a 60kg",
  "60kg a 70kg",
  "70kg a 80kg",
  "80kg a 90kg",
  "90kg a 100kg",
  "100kg a 125kg",
  "125kg a 150kg",
  "Mais de 150kg",
];

/* ----------------------------- Faixas de preço ---------------------------- */

/** Faixa de preço para tabelas Padrão/Especiais (ELt/DLt) — 8 faixas. */
function priceTier8(price: number): string {
  if (price <= 18.99) return "0-18.99";
  if (price <= 48.99) return "19-48.99";
  if (price <= 78.99) return "49-78.99";
  if (price <= 99.99) return "79-99.99";
  if (price <= 119.99) return "100-119.99";
  if (price <= 149.99) return "120-149.99";
  if (price <= 199.99) return "150-199.99";
  return "200+";
}

/** Faixa de preço para tabela Full Super (TLt) — 7 faixas. */
function priceTier7(price: number): string {
  if (price <= 18.99) return "0-18.99";
  if (price <= 28.99) return "19-28.99";
  if (price <= 48.99) return "29-48.99";
  if (price <= 78.99) return "49-78.99";
  if (price <= 98.99) return "79-98.99";
  if (price <= 198.99) return "99-198.99";
  return "199+";
}

function findTiered(rows: ShippingRowTiered[], kg: number): ShippingRowTiered {
  return rows.find((r) => kg <= r.maxWeight) ?? rows[rows.length - 1];
}
function findFlat(rows: ShippingRowFlat[], kg: number): ShippingRowFlat {
  return rows.find((r) => kg <= r.maxWeight) ?? rows[rows.length - 1];
}

/**
 * Frete do ML (fue da Mamba). Retorna o custo de frete (R$) para o vendedor,
 * conforme o modelo logístico e a faixa de preço/peso.
 */
export function mlShipping(
  weightIndex: number,
  price: number,
  logistic: MlLogisticType,
  reputation: MlReputation = "verde",
): number {
  const kg = ML_WEIGHT_KG[Math.max(0, Math.min(weightIndex, ML_WEIGHT_KG.length - 1))];

  if (logistic === "full_super") {
    const row = findTiered(ML_SHIPPING_FULL, kg);
    let cost = row.costs[priceTier7(price)];
    if (price < 29) cost = Math.min(cost, price * 0.25);
    return cost;
  }
  if (logistic === "cat_especial") {
    const rows = reputation === "amarela" ? ML_SHIPPING_ESPECIAL_AMARELA : ML_SHIPPING_ESPECIAL_VERDE;
    const row = findTiered(rows, kg);
    return row.costs[priceTier8(price)];
  }
  // Padrão (Clássico) → qL
  const row = findTiered(ML_SHIPPING_PADRAO, kg);
  let cost = row.costs[priceTier8(price)];
  if (price < 19) cost = Math.min(cost, price * 0.5);
  return cost;
}

/** Frete custo-fixo por peso (due/WL): usado p/ FGR quando preço < R$ 79. */
export function mlFlatShipping(weightIndex: number, price: number): number {
  const kg = ML_WEIGHT_KG[Math.max(0, Math.min(weightIndex, ML_WEIGHT_KG.length - 1))];
  let cost = findFlat(ML_SHIPPING_FLAT, kg).cost;
  if (price < 19) cost = Math.min(cost, price * 0.5);
  return cost;
}

/* --------------------------------- Tipos ---------------------------------- */

/** Entrada da Calculadora de Precificação. */
export interface PricingInput {
  /** Identificação (apenas informativo, não afeta o cálculo). */
  name?: string;
  sku?: string;

  /** Modo de cálculo. */
  mode: PricingMode;

  /** Marketplace selecionado. */
  marketplace: Marketplace;
  /** Tipo de anúncio do ML (quando marketplace = mercado_livre). */
  mlListingType?: MlListingType;

  /** Margem de lucro desejada (%) — usada no modo custo→preço. 0..100. */
  desiredMargin: number;

  /** Custo do produto (R$). */
  productCost: number;

  /** Impostos (%) sobre o preço. */
  taxPercent: number;
  /** TACoS / investimento em ADS (%) sobre o preço. */
  tacosPercent: number;
  /** Afiliados (%) sobre o preço. */
  affiliatePercent: number;

  /** Outros custos: pode ser em R$ (fixo) ou em % (variável). */
  otherCostKind: OtherCostKind;
  otherCostValue: number;

  /** Comissão do marketplace (%). Editável. */
  commissionPercent: number;
  /** Taxa fixa do marketplace (R$). Auto quando autoFees. */
  fixedFee: number;
  /** Custo de frete (R$) pago pelo vendedor. Auto quando !manualShipping. */
  shippingCost: number;

  /* ----- Campos de auto-alimentação (Mercado Livre / Shopee) ----- */

  /** Quando true, frete e taxa fixa são calculados automaticamente. */
  autoFees?: boolean;
  /** Modelo logístico do ML. */
  mlLogisticType?: MlLogisticType;
  /** Frete Grátis Rápido (FGR) ligado. */
  freeShippingFast?: boolean;
  /** Campanhas Destaque (soma 6 p.p. na comissão). */
  highlightCampaign?: boolean;
  /** Índice da faixa de peso (0..27). */
  weightIndex?: number;
  /** Reputação (afeta Cat. Especiais). */
  reputation?: MlReputation;
  /** Frete manual: quando true, usa `shippingCost` e não recalcula. */
  manualShipping?: boolean;

  /**
   * Preço de venda informado (R$) — usado APENAS no modo preço→margem.
   */
  sellingPrice?: number;

  /** Desconto promocional (%) aplicado sobre o preço base. 0..100. */
  promoPercent?: number;
}

/** Uma linha do detalhamento do cálculo (fixo em R$ ou variável em %). */
export interface BreakdownItem {
  key: string;
  label: string;
  percent?: number;
  amount: number;
}

/** Resultado da Calculadora de Precificação. */
export interface PricingResult {
  price: number;
  promoPrice: number;
  contributionMargin: number;
  contributionMarginPct: number;
  breakEven: number;
  fixedTotal: number;
  variableCostPct: number;
  fixedItems: BreakdownItem[];
  variableItems: BreakdownItem[];
  revenueShare: { key: string; label: string; percent: number; amount: number }[];
  valid: boolean;
  error?: string;
  /** Frete usado no cálculo (R$) — útil para refletir o auto-frete na UI. */
  shippingUsed: number;
  /** Taxa fixa usada no cálculo (R$). */
  fixedFeeUsed: number;
  /** Comissão efetiva usada (%) — inclui acréscimo de campanha quando ligado. */
  commissionUsed: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const clamp0 = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);

/* ----------------------- Cálculo de custos auxiliares --------------------- */

/** Comissão efetiva (inclui +6 p.p. de Campanhas Destaque). */
function effectiveCommission(input: PricingInput): number {
  const base = clamp0(input.commissionPercent);
  return input.highlightCampaign ? base + CAMPAIGN_COMMISSION_EXTRA : base;
}

/** Custos fixos em R$ (produto + frete + taxa fixa + outros em R$). */
function buildFixedItems(
  input: PricingInput,
  shipping: number,
  fixedFee: number,
): { total: number; items: BreakdownItem[] } {
  const items: BreakdownItem[] = [
    { key: "product", label: "Custo do produto", amount: clamp0(input.productCost) },
    { key: "shipping", label: "Frete", amount: clamp0(shipping) },
    { key: "fixedFee", label: "Taxa fixa", amount: clamp0(fixedFee) },
  ];
  if (input.otherCostKind === "reais" && input.otherCostValue > 0) {
    items.push({ key: "other", label: "Outros custos", amount: clamp0(input.otherCostValue) });
  }
  const total = items.reduce((s, it) => s + it.amount, 0);
  return { total: round2(total), items };
}

/** Percentuais variáveis (sem a margem). */
function buildVariableItems(input: PricingInput, commission: number): { total: number; items: BreakdownItem[] } {
  const items: BreakdownItem[] = [
    { key: "commission", label: "Comissão do marketplace", percent: clamp0(commission), amount: 0 },
    { key: "tax", label: "Impostos", percent: clamp0(input.taxPercent), amount: 0 },
    { key: "tacos", label: "TACoS / ADS", percent: clamp0(input.tacosPercent), amount: 0 },
    { key: "affiliate", label: "Afiliados", percent: clamp0(input.affiliatePercent), amount: 0 },
  ];
  if (input.otherCostKind === "percent" && input.otherCostValue > 0) {
    items.push({ key: "otherPct", label: "Outros custos", percent: clamp0(input.otherCostValue), amount: 0 });
  }
  const total = items.reduce((s, it) => s + (it.percent ?? 0), 0);
  return { total: round2(total), items };
}

/**
 * Determina o frete (R$) a usar para um dado preço, conforme as opções.
 * Para ML aplica a regra: FGR + preço<79 + (não Full e não Especial) → tabela custo-fixo (WL).
 */
function resolveShipping(input: PricingInput, price: number): number {
  if (input.manualShipping) return clamp0(input.shippingCost);
  if (!input.autoFees || input.marketplace !== "mercado_livre") {
    return clamp0(input.shippingCost);
  }
  const logistic = input.mlLogisticType ?? "padrao";
  const weightIndex = input.weightIndex ?? 0;
  const reputation = input.reputation ?? "verde";
  const isFull = logistic === "full_super";
  const isEsp = logistic === "cat_especial";
  if (input.freeShippingFast && price < 79 && !isFull && !isEsp) {
    return round2(mlFlatShipping(weightIndex, price));
  }
  return round2(mlShipping(weightIndex, price, logistic, reputation));
}

/** Taxa fixa (R$) a usar conforme o marketplace/opções. */
function resolveFixedFee(input: PricingInput): number {
  if (!input.autoFees) return clamp0(input.fixedFee);
  // No fluxo do ML a taxa fixa do frete é 0 (cue()).
  if (input.marketplace === "mercado_livre") return 0;
  return clamp0(input.fixedFee);
}

/* ------------------------------- Cálculo ---------------------------------- */

/**
 * Calcula a precificação. Funciona nos dois modos:
 * - custo_para_preco: resolve o preço pelo markup divisor, iterando quando
 *   o frete depende do preço (ML).
 * - preco_para_margem: usa o preço informado e deduz a margem real.
 */
export function calculatePricing(input: PricingInput): PricingResult {
  const commission = effectiveCommission(input);
  const variable = buildVariableItems(input, commission); // sem margem
  const desiredMargin = clamp0(input.desiredMargin);
  const promoPct = clamp0(input.promoPercent ?? 0);
  const fixedFee = resolveFixedFee(input);

  if (input.mode === "custo_para_preco") {
    const denomPct = variable.total + desiredMargin;
    // O markup divisor (Preço = fixos / (1 − deduções%)) explode quando as
    // deduções percentuais (margem + comissão + impostos + TACoS + afiliados)
    // se aproximam de 100%: o denominador tende a zero e o preço dispara para
    // valores irreais (ex.: margem 70% + variáveis 29% = 99% → preço × ~100).
    // Acima de MAX_DEDUCTION_PCT a margem é considerada inviável naquele cenário.
    if (denomPct >= MAX_DEDUCTION_PCT) {
      return invalidResult(
        input,
        commission,
        variable,
        "Margem inviável: a soma da margem desejada com os custos variáveis (comissão, impostos, TACoS, afiliados) está próxima ou acima de 100%. Não há preço de venda que cubra os custos fixos sem disparar para valores irreais. Reduza a margem ou os percentuais.",
      );
    }

    // Solver iterativo: o frete depende do preço.
    let shipping = resolveShipping(input, clamp0(input.productCost)); // estimativa inicial
    let price = 0;
    for (let i = 0; i < MAX_ITER; i++) {
      const fixedTotal =
        clamp0(input.productCost) +
        (input.otherCostKind === "reais" ? clamp0(input.otherCostValue) : 0) +
        fixedFee +
        shipping;
      const next = round2(fixedTotal / (1 - denomPct / 100));
      const nextShipping = resolveShipping(input, next);
      const converged = Math.abs(next - price) < TOLERANCE && Math.abs(nextShipping - shipping) < TOLERANCE;
      price = next;
      shipping = nextShipping;
      if (converged) break;
    }

    const fixed = buildFixedItems(input, shipping, fixedFee);
    return finalize(input, fixed, variable, price, desiredMargin, promoPct, commission, shipping, fixedFee);
  }

  // modo preco_para_margem
  const price = round2(clamp0(input.sellingPrice ?? 0));
  if (price <= 0) {
    return invalidResult(input, commission, variable, "Informe um preço de venda maior que zero para calcular a margem.");
  }
  const shipping = resolveShipping(input, price);
  const fixed = buildFixedItems(input, shipping, fixedFee);
  const variableAmount = (variable.total / 100) * price;
  const contributionMargin = round2(price - fixed.total - variableAmount);
  const realMarginPct = round2((contributionMargin / price) * 100);
  return finalize(input, fixed, variable, price, realMarginPct, promoPct, commission, shipping, fixedFee);
}

function invalidResult(
  input: PricingInput,
  commission: number,
  variable: { total: number; items: BreakdownItem[] },
  error: string,
): PricingResult {
  return {
    price: 0,
    promoPrice: 0,
    contributionMargin: 0,
    contributionMarginPct: 0,
    breakEven: 0,
    fixedTotal: 0,
    variableCostPct: variable.total,
    fixedItems: [],
    variableItems: variable.items,
    revenueShare: [],
    valid: false,
    error,
    shippingUsed: 0,
    fixedFeeUsed: 0,
    commissionUsed: commission,
  };
}

/** Monta o resultado final (itens com valores em R$, donut, break-even). */
function finalize(
  input: PricingInput,
  fixed: { total: number; items: BreakdownItem[] },
  variable: { total: number; items: BreakdownItem[] },
  price: number,
  marginPct: number,
  promoPct: number,
  commission: number,
  shipping: number,
  fixedFee: number,
): PricingResult {
  const variableItems = variable.items.map((it) => ({
    ...it,
    amount: round2(((it.percent ?? 0) / 100) * price),
  }));

  const contributionMargin = round2((marginPct / 100) * price);
  const breakEven = round2(price - contributionMargin);

  const revenueShare: PricingResult["revenueShare"] = [];
  const pushShare = (key: string, label: string, amount: number) => {
    if (amount <= 0 || price <= 0) return;
    revenueShare.push({ key, label, amount: round2(amount), percent: round2((amount / price) * 100) });
  };
  pushShare("margin", "Margem", contributionMargin);
  for (const it of fixed.items) pushShare(it.key, it.label, it.amount);
  for (const it of variableItems) pushShare(it.key, it.label, it.amount);

  return {
    price,
    promoPrice: promoPct > 0 ? round2(price * (1 - promoPct / 100)) : price,
    contributionMargin,
    contributionMarginPct: round2(marginPct),
    breakEven,
    fixedTotal: fixed.total,
    variableCostPct: variable.total,
    fixedItems: fixed.items,
    variableItems,
    revenueShare,
    valid: true,
    shippingUsed: round2(shipping),
    fixedFeeUsed: round2(fixedFee),
    commissionUsed: round2(commission),
  };
}

/** Comissão padrão sugerida conforme o canal/tipo de anúncio. */
export function defaultCommission(marketplace: Marketplace, listingType: MlListingType): number {
  if (marketplace === "mercado_livre") return ML_DEFAULT_COMMISSION[listingType];
  if (marketplace === "shopee") return SHOPEE_DEFAULT_COMMISSION;
  return OUTRO_DEFAULT_COMMISSION;
}

/** Taxa fixa padrão sugerida conforme o canal. */
export function defaultFixedFee(marketplace: Marketplace): number {
  if (marketplace === "shopee") return SHOPEE_DEFAULT_FIXED_FEE;
  if (marketplace === "outro") return OUTRO_DEFAULT_FIXED_FEE;
  return 0;
}


/* ============================ CUSTO-ALVO (China) ===========================
 * Cálculo INVERSO: dado o PREÇO de venda no ML e a MARGEM desejada, descobrir
 * o CUSTO MÁXIMO do produto ("quanto posso pagar pelo produto") já descontando
 * impostos + comissão + frete + taxa fixa + outros, exatamente com a MESMA
 * régua de custos da Calculadora de Precificação.
 *
 *   custoProduto = P − (varPct% + margem%)·P − frete(P) − taxaFixa − outros(R$)
 *
 * Onde varPct = comissão efetiva + impostos + TACoS + afiliados + outros(%).
 * O frete e a taxa fixa são auto-alimentados pelas tabelas do ML conforme o
 * preço informado (não há iteração: o preço é conhecido).
 * ------------------------------------------------------------------------- */

/** Resultado do custo-alvo para uma única margem. */
export interface TargetCostMarginResult {
  /** Margem desejada (%). */
  marginPct: number;
  /** Custo máximo do produto em BRL (pode ser negativo = inviável). */
  productCostBRL: number;
  /** Custo máximo do produto em USD (convertido pela cotação). */
  productCostUSD: number;
  /** Custo máximo do produto em RMB/CNY (convertido pela cotação). */
  productCostCNY: number;
  /** Lucro líquido em R$ nesse cenário. */
  netProfitBRL: number;
  /** Verdadeiro quando o custo-alvo é positivo (cenário viável). */
  feasible: boolean;
}

/** Detalhamento (em R$) dos descontos sobre o preço, comum a todas as margens. */
export interface TargetCostBreakdownItem {
  key: string;
  label: string;
  percent?: number;
  amount: number;
}

/** Resultado completo do cálculo de custo-alvo. */
export interface TargetCostResult {
  sellingPrice: number;
  /** Cotação USD→BRL usada (quantos reais vale 1 dólar). */
  usdToBrl: number;
  /** Cotação CNY→BRL usada (quantos reais vale 1 yuan). */
  cnyToBrl: number;
  /** Comissão efetiva usada (%). */
  commissionUsed: number;
  /** Frete usado (R$) para o preço informado. */
  shippingUsed: number;
  /** Taxa fixa usada (R$). */
  fixedFeeUsed: number;
  /** Soma dos custos variáveis SEM a margem (%). */
  variableCostPct: number;
  /** Descontos fixos (R$) que não dependem da margem (frete, taxa fixa, outros R$). */
  fixedDeductions: TargetCostBreakdownItem[];
  /** Descontos percentuais (R$) que não dependem da margem (comissão, impostos, etc.). */
  variableDeductions: TargetCostBreakdownItem[];
  /** Um resultado por margem solicitada. */
  perMargin: TargetCostMarginResult[];
  valid: boolean;
  error?: string;
}

/**
 * Calcula o custo-alvo do produto para uma ou várias margens, a partir do preço
 * de venda. Reaproveita a régua de custos da calculadora (comissão efetiva,
 * frete e taxa fixa auto-alimentados, impostos/TACoS/afiliados/outros).
 *
 * @param input  Mesmos parâmetros da calculadora (productCost e desiredMargin são ignorados aqui).
 * @param sellingPrice  Preço de venda no ML (R$).
 * @param margins  Lista de margens desejadas (%). Ex.: [15, 20, 30].
 * @param usdToBrl  Cotação USD→BRL (quantos reais vale 1 dólar). > 0.
 */
export function calculateTargetCost(
  input: PricingInput,
  sellingPrice: number,
  margins: number[],
  usdToBrl: number,
  cnyToBrl = 0,
): TargetCostResult {
  const commission = effectiveCommission(input);
  const variable = buildVariableItems(input, commission); // sem margem
  const price = round2(clamp0(sellingPrice));
  const rate = Number.isFinite(usdToBrl) && usdToBrl > 0 ? usdToBrl : 0;
  const rateCny = Number.isFinite(cnyToBrl) && cnyToBrl > 0 ? cnyToBrl : 0;

  const baseResult = (error?: string): TargetCostResult => ({
    sellingPrice: price,
    usdToBrl: round2(rate),
    cnyToBrl: round4(rateCny),
    commissionUsed: round2(commission),
    shippingUsed: 0,
    fixedFeeUsed: 0,
    variableCostPct: variable.total,
    fixedDeductions: [],
    variableDeductions: [],
    perMargin: [],
    valid: false,
    error,
  });

  if (price <= 0) {
    return baseResult("Informe um preço de venda maior que zero.");
  }
  if (rate <= 0) {
    return baseResult("Cotação do dólar indisponível. Tente novamente em instantes.");
  }

  const shipping = resolveShipping(input, price);
  const fixedFee = resolveFixedFee(input);
  const otherFixed = input.otherCostKind === "reais" ? clamp0(input.otherCostValue) : 0;

  // Descontos fixos em R$ (não dependem da margem).
  const fixedDeductions: TargetCostBreakdownItem[] = [
    { key: "shipping", label: "Frete", amount: round2(shipping) },
    { key: "fixedFee", label: "Taxa fixa", amount: round2(fixedFee) },
  ];
  if (otherFixed > 0) {
    fixedDeductions.push({ key: "other", label: "Outros custos", amount: round2(otherFixed) });
  }
  const fixedTotal = round2(shipping + fixedFee + otherFixed);

  // Descontos percentuais convertidos em R$ sobre o preço (não dependem da margem).
  const variableDeductions: TargetCostBreakdownItem[] = variable.items.map((it) => ({
    key: it.key,
    label: it.label,
    percent: it.percent,
    amount: round2(((it.percent ?? 0) / 100) * price),
  }));
  const variableAmount = round2((variable.total / 100) * price);

  // Para cada margem: custoProduto = P − margem$ − variável$ − fixos$.
  const perMargin: TargetCostMarginResult[] = margins.map((m) => {
    const marginPct = clamp0(m);
    const marginAmount = round2((marginPct / 100) * price);
    const productCostBRL = round2(price - marginAmount - variableAmount - fixedTotal);
    const productCostUSD = round2(productCostBRL / rate);
    const productCostCNY = rateCny > 0 ? round2(productCostBRL / rateCny) : 0;
    return {
      marginPct: round2(marginPct),
      productCostBRL,
      productCostUSD,
      productCostCNY,
      netProfitBRL: marginAmount,
      feasible: productCostBRL > 0,
    };
  });

  return {
    sellingPrice: price,
    usdToBrl: round2(rate),
    cnyToBrl: round4(rateCny),
    commissionUsed: round2(commission),
    shippingUsed: round2(shipping),
    fixedFeeUsed: round2(fixedFee),
    variableCostPct: variable.total,
    fixedDeductions,
    variableDeductions,
    perMargin,
    valid: true,
  };
}


/* ===================== PLANILHA INVERTIDA (preço por margem) =================
 * Conceito (v3): o usuário informa, por produto, o PREÇO DE VENDA no ML que dá
 * uma margem âncora (ex.: 20%). A partir desse preço derivamos o CUSTO FIXO a
 * pagar à Matriz (o quanto sobra para o produto naquele cenário). Esse custo é
 * fixo. Para cada outra margem, recalculamos o PREÇO DE VENDA necessário para
 * obter aquela margem, mantendo o mesmo custo (mesma régua: comissão, impostos,
 * TACoS, afiliados, frete auto-alimentado, taxa fixa).
 *
 *   custoMatriz = priceAnchor − (varPct% + margemAncora%)·priceAnchor − frete(priceAnchor) − fixos
 *   precoMargem = (custoMatriz + fixos) / (1 − (varPct% + margem%)/100)   [solver de frete]
 * ------------------------------------------------------------------------- */

/** Deriva o custo fixo a pagar à Matriz a partir de um preço de venda e margem. */
export function deriveMatrixCost(
  input: PricingInput,
  anchorSellingPrice: number,
  anchorMarginPct: number,
): number {
  const res = calculateTargetCost(input, anchorSellingPrice, [anchorMarginPct], 1, 0);
  if (!res.valid || res.perMargin.length === 0) return 0;
  return res.perMargin[0].productCostBRL;
}

/**
 * Dado um custo fixo de produto (Matriz) e uma margem desejada, calcula o
 * PREÇO DE VENDA no ML necessário (markup divisor com solver de frete).
 * Reaproveita calculatePricing no modo custo_para_preco.
 */
export function priceForMargin(
  input: PricingInput,
  matrixCost: number,
  marginPct: number,
): { price: number; valid: boolean; error?: string } {
  const res = calculatePricing({
    ...input,
    mode: "custo_para_preco",
    productCost: clamp0(matrixCost),
    desiredMargin: clamp0(marginPct),
  });
  return { price: res.price, valid: res.valid, error: res.error };
}

/** Resultado de uma célula (margem) da planilha invertida. */
export interface MarginPriceCell {
  marginPct: number;
  sellingPrice: number;
  valid: boolean;
  error?: string;
}

/** Calcula a linha completa de preços por margem para um produto. */
export function computeMarginRow(
  input: PricingInput,
  anchorSellingPrice: number,
  anchorMarginPct: number,
  margins: number[],
): { matrixCost: number; cells: MarginPriceCell[] } {
  const matrixCost = deriveMatrixCost(input, anchorSellingPrice, anchorMarginPct);
  const cells: MarginPriceCell[] = margins.map((m) => {
    // A coluna âncora reflete exatamente o preço informado.
    if (Math.abs(m - anchorMarginPct) < 1e-9) {
      return { marginPct: round2(m), sellingPrice: round2(anchorSellingPrice), valid: matrixCost > 0 };
    }
    const r = priceForMargin(input, matrixCost, m);
    return { marginPct: round2(m), sellingPrice: round2(r.price), valid: r.valid && matrixCost > 0, error: r.error };
  });
  return { matrixCost: round2(matrixCost), cells };
}


/* =================== CONFIGURAÇÕES GLOBAIS DA PLANILHA ====================== */

/** Regime de imposto da planilha invertida. */
export type MatrixTtsRegime = "com_tts" | "sem_tts";

/** Alíquota de imposto (%) por regime. COM TTS = 14%, SEM TTS = 24%. */
export const MATRIX_TAX_BY_REGIME: Record<MatrixTtsRegime, number> = {
  com_tts: 14,
  sem_tts: 24,
};

/** Configurações globais que se aplicam a TODAS as linhas da planilha. */
export interface MatrixGlobalSettings {
  ttsRegime: MatrixTtsRegime;
  listingType: MlListingType;
  tacosPercent: number;
  affiliatePercent: number;
  freeShipping: boolean;
}

/**
 * Monta o PricingInput base da planilha invertida a partir das configurações
 * globais e do peso do produto. Frete e taxa fixa são auto-alimentados pelas
 * tabelas reais do ML (Padrão), comissão pelo tipo de anúncio, imposto pelo
 * regime de TTS.
 */
export function buildMatrixInput(
  settings: MatrixGlobalSettings,
  weightIndex: number,
): PricingInput {
  return {
    mode: "preco_para_margem",
    marketplace: "mercado_livre",
    mlListingType: settings.listingType,
    desiredMargin: 0,
    productCost: 0,
    taxPercent: MATRIX_TAX_BY_REGIME[settings.ttsRegime],
    tacosPercent: clamp0(settings.tacosPercent),
    affiliatePercent: clamp0(settings.affiliatePercent),
    otherCostKind: "reais",
    otherCostValue: 0,
    commissionPercent: ML_DEFAULT_COMMISSION[settings.listingType],
    fixedFee: 0,
    shippingCost: 0,
    autoFees: true,
    mlLogisticType: "padrao",
    freeShippingFast: settings.freeShipping,
    highlightCampaign: false,
    weightIndex: clamp0(weightIndex),
    reputation: "verde",
    manualShipping: false,
    promoPercent: 0,
  };
}

/** Uma linha completa da planilha (produto + custo Matriz + células por margem). */
export interface MatrixRow {
  matrixCost: number;
  cells: MarginPriceCell[];
}

/**
 * Calcula a linha da planilha para um produto, a partir das configurações
 * globais, do preço âncora, da margem âncora e das margens exibidas.
 */
export function computeMatrixRow(
  settings: MatrixGlobalSettings,
  weightIndex: number,
  anchorSellingPrice: number,
  anchorMarginPct: number,
  margins: number[],
): MatrixRow {
  const input = buildMatrixInput(settings, weightIndex);
  return computeMarginRow(input, anchorSellingPrice, anchorMarginPct, margins);
}
