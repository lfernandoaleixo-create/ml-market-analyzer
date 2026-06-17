/**
 * Lógica pura da Calculadora de Precificação.
 *
 * Modelo baseado na ferramenta "Calculadora de Precificação" da Mamba Nexus
 * (ver references/mamba-pricing-calculator.md), usando o método de MARKUP
 * DIVISOR:
 *
 *   Preço = CustosFixos / (1 − CustosVariáveis%)
 *
 * onde os "custos fixos" são valores em REAIS por unidade (custo do produto,
 * frete, taxa fixa, outros em R$) e os "custos variáveis" são percentuais
 * aplicados sobre o PREÇO de venda (margem desejada, comissão do marketplace,
 * impostos, TACoS/ADS, afiliados, outros em %).
 *
 * Tudo aqui é puro (sem I/O) para ser facilmente testável com Vitest.
 */

/** Canais de venda suportados. */
export type Marketplace = "mercado_livre" | "shopee" | "outro";

/** Tipo de anúncio do Mercado Livre. */
export type MlListingType = "classico" | "premium";

/** Modo de cálculo da calculadora. */
export type PricingMode = "custo_para_preco" | "preco_para_margem";

/** Como o campo "Outros custos" é interpretado. */
export type OtherCostKind = "reais" | "percent";

/** Comissões padrão do Mercado Livre por tipo de anúncio (percentuais). */
export const ML_DEFAULT_COMMISSION: Record<MlListingType, number> = {
  classico: 12,
  premium: 17,
};

/** Comissão padrão aproximada da Shopee (programa de frete grátis), em %. */
export const SHOPEE_DEFAULT_COMMISSION = 20;

/** Frete padrão exibido pela referência quando não há cubagem (R$). */
export const DEFAULT_SHIPPING = 7.75;

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
  /** Taxa fixa do marketplace (R$). */
  fixedFee: number;
  /** Custo de frete (R$) pago pelo vendedor. */
  shippingCost: number;

  /**
   * Preço de venda informado (R$) — usado APENAS no modo preço→margem.
   * No modo custo→preço é ignorado.
   */
  sellingPrice?: number;

  /** Desconto promocional (%) aplicado sobre o preço base. 0..100. */
  promoPercent?: number;
}

/** Uma linha do detalhamento do cálculo (fixo em R$ ou variável em %). */
export interface BreakdownItem {
  key: string;
  label: string;
  /** Para itens variáveis: percentual sobre o preço. */
  percent?: number;
  /** Valor em reais (calculado a partir do preço para itens variáveis). */
  amount: number;
}

/** Resultado da Calculadora de Precificação. */
export interface PricingResult {
  /** Preço de venda sugerido (R$). No modo preço→margem, ecoa o preço informado. */
  price: number;
  /** Preço após promoção (R$), se houver desconto. Igual a `price` quando não há. */
  promoPrice: number;
  /** Margem de contribuição em reais (lucro por venda antes de custos fixos do negócio). */
  contributionMargin: number;
  /** Margem de contribuição em % sobre o preço. */
  contributionMarginPct: number;
  /** Custo total (break-even) em R$: a partir deste valor a venda não dá prejuízo. */
  breakEven: number;
  /** Soma dos custos fixos em R$ (produto + frete + taxa fixa + outros em R$). */
  fixedTotal: number;
  /** Soma dos percentuais variáveis (sem a margem), em %. */
  variableCostPct: number;
  /** Itens fixos (R$) para o detalhamento. */
  fixedItems: BreakdownItem[];
  /** Itens variáveis (%) para o detalhamento. */
  variableItems: BreakdownItem[];
  /** Distribuição da receita (para o donut): cada fatia em % do preço. */
  revenueShare: { key: string; label: string; percent: number; amount: number }[];
  /** Indica se o resultado é válido (ex.: variáveis < 100%). */
  valid: boolean;
  /** Mensagem de erro amigável quando inválido. */
  error?: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const clampPct = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);

/** Soma dos custos fixos em reais (custo do produto + frete + taxa fixa + outros em R$). */
function computeFixed(input: PricingInput): { total: number; items: BreakdownItem[] } {
  const items: BreakdownItem[] = [
    { key: "product", label: "Custo do produto", amount: clampPct(input.productCost) },
    { key: "shipping", label: "Frete", amount: clampPct(input.shippingCost) },
    { key: "fixedFee", label: "Taxa fixa", amount: clampPct(input.fixedFee) },
  ];
  if (input.otherCostKind === "reais" && input.otherCostValue > 0) {
    items.push({ key: "other", label: "Outros custos", amount: clampPct(input.otherCostValue) });
  }
  const total = items.reduce((s, it) => s + it.amount, 0);
  return { total: round2(total), items };
}

/**
 * Percentuais variáveis (sobre o preço), SEM a margem desejada.
 * Inclui comissão, impostos, TACoS, afiliados e "outros" quando em %.
 */
function computeVariablePct(input: PricingInput): { total: number; items: BreakdownItem[] } {
  const items: BreakdownItem[] = [
    { key: "commission", label: "Comissão do marketplace", percent: clampPct(input.commissionPercent), amount: 0 },
    { key: "tax", label: "Impostos", percent: clampPct(input.taxPercent), amount: 0 },
    { key: "tacos", label: "TACoS / ADS", percent: clampPct(input.tacosPercent), amount: 0 },
    { key: "affiliate", label: "Afiliados", percent: clampPct(input.affiliatePercent), amount: 0 },
  ];
  if (input.otherCostKind === "percent" && input.otherCostValue > 0) {
    items.push({ key: "otherPct", label: "Outros custos", percent: clampPct(input.otherCostValue), amount: 0 });
  }
  const total = items.reduce((s, it) => s + (it.percent ?? 0), 0);
  return { total: round2(total), items };
}

/**
 * Calcula a precificação. Funciona nos dois modos:
 * - custo_para_preco: usa a margem desejada e resolve o preço pelo markup divisor.
 * - preco_para_margem: usa o preço informado e deduz a margem real.
 */
export function calculatePricing(input: PricingInput): PricingResult {
  const fixed = computeFixed(input);
  const variable = computeVariablePct(input); // sem margem

  const desiredMargin = clampPct(input.desiredMargin);
  const promoPct = clampPct(input.promoPercent ?? 0);

  if (input.mode === "custo_para_preco") {
    // Markup divisor: Preço = Fixo / (1 - (variáveis% + margem%)/100)
    const denomPct = variable.total + desiredMargin;
    if (denomPct >= 100) {
      return {
        price: 0,
        promoPrice: 0,
        contributionMargin: 0,
        contributionMarginPct: 0,
        breakEven: fixed.total,
        fixedTotal: fixed.total,
        variableCostPct: variable.total,
        fixedItems: fixed.items,
        variableItems: variable.items,
        revenueShare: [],
        valid: false,
        error:
          "A soma da margem com os custos variáveis (comissão, impostos, etc.) atingiu 100% ou mais. Reduza a margem ou os percentuais para obter um preço válido.",
      };
    }
    const price = round2(fixed.total / (1 - denomPct / 100));
    return finalize(input, fixed, variable, price, desiredMargin, promoPct);
  }

  // modo preco_para_margem
  const price = round2(clampPct(input.sellingPrice ?? 0));
  if (price <= 0) {
    return {
      price: 0,
      promoPrice: 0,
      contributionMargin: 0,
      contributionMarginPct: 0,
      breakEven: fixed.total,
      fixedTotal: fixed.total,
      variableCostPct: variable.total,
      fixedItems: fixed.items,
      variableItems: variable.items,
      revenueShare: [],
      valid: false,
      error: "Informe um preço de venda maior que zero para calcular a margem.",
    };
  }
  // Margem real (R$) = Preço - Fixo - variáveis%*Preço
  const variableAmount = (variable.total / 100) * price;
  const contributionMargin = round2(price - fixed.total - variableAmount);
  const realMarginPct = round2((contributionMargin / price) * 100);
  return finalize(input, fixed, variable, price, realMarginPct, promoPct);
}

/** Monta o resultado final (itens com valores em R$, donut, break-even). */
function finalize(
  input: PricingInput,
  fixed: { total: number; items: BreakdownItem[] },
  variable: { total: number; items: BreakdownItem[] },
  price: number,
  marginPct: number,
  promoPct: number,
): PricingResult {
  // Preenche os valores em R$ dos itens variáveis a partir do preço.
  const variableItems = variable.items.map((it) => ({
    ...it,
    amount: round2(((it.percent ?? 0) / 100) * price),
  }));

  const contributionMargin = round2((marginPct / 100) * price);
  const breakEven = round2(price - contributionMargin);

  // Distribuição da receita (donut): fatias em % do preço.
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
  };
}

/** Comissão padrão sugerida conforme o canal/tipo de anúncio. */
export function defaultCommission(marketplace: Marketplace, listingType: MlListingType): number {
  if (marketplace === "mercado_livre") return ML_DEFAULT_COMMISSION[listingType];
  if (marketplace === "shopee") return SHOPEE_DEFAULT_COMMISSION;
  return 0;
}
