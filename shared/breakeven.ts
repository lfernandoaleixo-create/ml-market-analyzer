/**
 * Lógica pura do Ponto de Equilíbrio.
 *
 * Modelo baseado na ferramenta "Ponto de Equilíbrio" da Mamba Nexus
 * (ver references/mamba-equilibrium-point.md).
 *
 * Conceito:
 *   - Margem de contribuição unitária = ticket médio − custo variável por unidade
 *   - Ponto de equilíbrio (R$)   = custos fixos / margem de contribuição %
 *   - Ponto de equilíbrio (unid) = custos fixos / margem de contribuição unitária
 *
 * Tudo aqui é puro (sem I/O) para ser testável com Vitest.
 */

/** Custos variáveis (em reais, exceto alíquotas que são %). */
export interface VariableCosts {
  /** Custo de mercadoria vendida (CMV) — R$. */
  cmv: number;
  /** Investimento em publicidade — R$. */
  advertising: number;
  /** Comissão do canal de venda — R$. */
  channelCommission: number;
  /** Custo de frete/envios — R$. */
  shipping: number;
  /** Custo de embalagem — R$. */
  packaging: number;
  /** Custo de devolução — R$. */
  returns: number;
  /** Alíquota principal (%) sobre o faturamento. */
  taxRate: number;
  /** Outros impostos (%) sobre o faturamento. */
  otherTaxRate: number;
}

/** Custos fixos mensais (todos em R$). */
export interface FixedCosts {
  proLabore: number;
  salaries: number;
  rent: number;
  waterAndEnergy: number;
  internet: number;
  insurance: number;
  managementSystem: number;
  otherSoftware: number;
  bankFees: number;
  financing: number;
  accounting: number;
  other: number;
}

/** Informações de venda (mensais). */
export interface SalesInfo {
  /** Faturamento bruto mensal — R$. */
  grossRevenue: number;
  /** Faturamento cancelado mensal — R$. */
  cancelledRevenue: number;
  /** Unidades vendidas no mês. */
  unitsSold: number;
}

export interface BreakEvenInput {
  sales: SalesInfo;
  variable: VariableCosts;
  fixed: FixedCosts;
}

/** Um cenário (atual, -10%, +10%, ponto de equilíbrio). */
export interface Scenario {
  key: string;
  label: string;
  units: number;
  revenue: number;
  profit: number;
  marginPct: number;
}

export interface BreakEvenResult {
  /** Receita líquida (bruto − cancelado). */
  netRevenue: number;
  /** Ticket médio (receita líquida / unidades). */
  avgTicket: number;
  /** Soma dos custos variáveis em R$ (inclui impostos sobre o faturamento). */
  variableTotal: number;
  /** Custo variável por unidade — R$. */
  variableCostPerUnit: number;
  /** Soma dos custos fixos — R$. */
  fixedTotal: number;
  /** Margem de contribuição total — R$. */
  contributionMargin: number;
  /** Margem de contribuição — % sobre a receita líquida. */
  contributionMarginPct: number;
  /** Margem de contribuição unitária — R$. */
  contributionMarginPerUnit: number;
  /** Ponto de equilíbrio em reais (receita mínima). */
  breakEvenRevenue: number;
  /** Ponto de equilíbrio em unidades. */
  breakEvenUnits: number;
  /** Lucro líquido atual — R$. */
  netProfit: number;
  /** Margem líquida atual — % sobre a receita líquida. */
  netMarginPct: number;
  /** Impostos totais estimados — R$. */
  taxes: number;
  /** Composição "custos pela margem" para o donut. */
  costShare: { key: string; label: string; amount: number; percent: number }[];
  /** Cenários: ponto de equilíbrio, atual −10%, atual +10%. */
  scenarios: Scenario[];
  valid: boolean;
  error?: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pos = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);

export function sumFixed(f: FixedCosts): number {
  return round2(
    pos(f.proLabore) +
      pos(f.salaries) +
      pos(f.rent) +
      pos(f.waterAndEnergy) +
      pos(f.internet) +
      pos(f.insurance) +
      pos(f.managementSystem) +
      pos(f.otherSoftware) +
      pos(f.bankFees) +
      pos(f.financing) +
      pos(f.accounting) +
      pos(f.other),
  );
}

/** Soma dos custos variáveis em R$ (campos em reais + impostos % sobre o faturamento). */
export function sumVariable(v: VariableCosts, netRevenue: number): number {
  const reais =
    pos(v.cmv) +
    pos(v.advertising) +
    pos(v.channelCommission) +
    pos(v.shipping) +
    pos(v.packaging) +
    pos(v.returns);
  const taxes = ((pos(v.taxRate) + pos(v.otherTaxRate)) / 100) * pos(netRevenue);
  return round2(reais + taxes);
}

export function calculateBreakEven(input: BreakEvenInput): BreakEvenResult {
  const { sales, variable, fixed } = input;
  const netRevenue = round2(pos(sales.grossRevenue) - pos(sales.cancelledRevenue));
  const units = pos(sales.unitsSold);
  const fixedTotal = sumFixed(fixed);
  const variableTotal = sumVariable(variable, netRevenue);

  const base: BreakEvenResult = {
    netRevenue,
    avgTicket: 0,
    variableTotal,
    variableCostPerUnit: 0,
    fixedTotal,
    contributionMargin: 0,
    contributionMarginPct: 0,
    contributionMarginPerUnit: 0,
    breakEvenRevenue: 0,
    breakEvenUnits: 0,
    netProfit: 0,
    netMarginPct: 0,
    taxes: round2(((pos(variable.taxRate) + pos(variable.otherTaxRate)) / 100) * netRevenue),
    costShare: [],
    scenarios: [],
    valid: false,
  };

  if (netRevenue <= 0 || units <= 0) {
    return {
      ...base,
      error: "Informe o faturamento e as unidades vendidas para calcular o ponto de equilíbrio.",
    };
  }

  const avgTicket = round2(netRevenue / units);
  const variableCostPerUnit = round2(variableTotal / units);
  const contributionMargin = round2(netRevenue - variableTotal);
  const contributionMarginPct = round2((contributionMargin / netRevenue) * 100);
  const contributionMarginPerUnit = round2(avgTicket - variableCostPerUnit);
  const netProfit = round2(contributionMargin - fixedTotal);
  const netMarginPct = round2((netProfit / netRevenue) * 100);

  if (contributionMarginPct <= 0 || contributionMarginPerUnit <= 0) {
    return {
      ...base,
      avgTicket,
      variableCostPerUnit,
      contributionMargin,
      contributionMarginPct,
      contributionMarginPerUnit,
      netProfit,
      netMarginPct,
      error:
        "Os custos variáveis estão maiores ou iguais ao preço de venda — a margem de contribuição é negativa. Revise os custos para encontrar um ponto de equilíbrio.",
    };
  }

  const breakEvenRevenue = round2(fixedTotal / (contributionMarginPct / 100));
  const breakEvenUnits = Math.ceil(fixedTotal / contributionMarginPerUnit);

  // Donut "custos pela margem": fixos / variáveis / margem (lucro), em % da receita.
  const costShare = [
    { key: "fixed", label: "Custos fixos", amount: fixedTotal },
    { key: "variable", label: "Custos variáveis", amount: variableTotal },
    { key: "margin", label: "Margem (lucro)", amount: Math.max(0, netProfit) },
  ].map((s) => ({ ...s, percent: round2((s.amount / netRevenue) * 100) }));

  // Cenários: variar o VOLUME de vendas mantendo ticket e estrutura de custos.
  const scenarioFor = (key: string, label: string, factor: number): Scenario => {
    const u = Math.round(units * factor);
    const rev = round2(avgTicket * u);
    const varCost = round2(variableCostPerUnit * u);
    const profit = round2(rev - varCost - fixedTotal);
    const margin = rev > 0 ? round2((profit / rev) * 100) : 0;
    return { key, label, units: u, revenue: rev, profit, marginPct: margin };
  };

  const scenarios: Scenario[] = [
    {
      key: "breakeven",
      label: "Ponto de equilíbrio",
      units: breakEvenUnits,
      revenue: breakEvenRevenue,
      profit: 0,
      marginPct: 0,
    },
    scenarioFor("minus10", "Cenário atual −10%", 0.9),
    scenarioFor("current", "Cenário atual", 1),
    scenarioFor("plus10", "Cenário atual +10%", 1.1),
  ];

  return {
    netRevenue,
    avgTicket,
    variableTotal,
    variableCostPerUnit,
    fixedTotal,
    contributionMargin,
    contributionMarginPct,
    contributionMarginPerUnit,
    breakEvenRevenue,
    breakEvenUnits,
    netProfit,
    netMarginPct,
    taxes: base.taxes,
    costShare,
    scenarios,
    valid: true,
  };
}
