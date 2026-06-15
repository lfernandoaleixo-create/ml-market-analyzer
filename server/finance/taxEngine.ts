/**
 * Tax engine — pure functions, fully testable, no I/O.
 *
 * Estimates the tax burden of a sale under the Lucro Presumido regime, in two
 * scenarios (WITHOUT and WITH the MG TTS benefit), handling ICMS/DIFAL by the
 * destination state. All rates come from a configurable TaxConfig.
 *
 * This is a MANAGEMENT estimate for pricing/decisions — not the official
 * assessment, which is the accountant's responsibility.
 */

import {
  interstateExitRate,
  type ProfitBreakdown,
  type TaxBreakdown,
  type TaxConfig,
  type TaxLine,
  type TaxScenario,
  type UF,
} from "../../shared/finance";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (rate: number, base: number) => (rate / 100) * base;

/** Federal taxes on revenue (Lucro Presumido) — same in both scenarios. */
export function federalLines(revenue: number, cfg: TaxConfig): TaxLine[] {
  return [
    { key: "pis", label: "PIS", ratePercent: cfg.pis, amount: round2(pct(cfg.pis, revenue)) },
    { key: "cofins", label: "COFINS", ratePercent: cfg.cofins, amount: round2(pct(cfg.cofins, revenue)) },
    { key: "irpj", label: "IRPJ (presumido)", ratePercent: cfg.irpjEffective, amount: round2(pct(cfg.irpjEffective, revenue)) },
    { key: "csll", label: "CSLL (presumido)", ratePercent: cfg.csllEffective, amount: round2(pct(cfg.csllEffective, revenue)) },
  ];
}

/**
 * ICMS line for one sale.
 * - WITHOUT TTS: in-state => origin internal rate; interstate => destination
 *   internal rate (origin interstate share + DIFAL completes to destination's
 *   internal rate). FCP added when configured for the destination UF.
 * - WITH TTS: credit-presumed effective burden (interstate flat, in-state flat).
 */
/**
 * Detailed split of the ICMS burden for one sale. Returns one or more lines so
 * the UI/PDF can show exactly how much is plain ICMS, how much is DIFAL and how
 * much is FCP. The SUM of all line amounts equals the total ICMS burden (the
 * previous single-line value), so totals never change — only transparency.
 */
export interface IcmsSplit {
  lines: TaxLine[];
  inState: boolean;
  /** ICMS kept by the origin state (interstate share, or full in-state ICMS). */
  icmsBaseAmount: number;
  /** DIFAL paid to the destination state (interstate B2C without TTS only). */
  difalAmount: number;
  /** FCP amount (destination), when configured. */
  fcpAmount: number;
  /** Total ICMS burden = icmsBaseAmount + difalAmount + fcpAmount. */
  totalAmount: number;
}

export function icmsSplit(
  revenue: number,
  destinationUF: UF | null,
  scenario: TaxScenario,
  cfg: TaxConfig,
): IcmsSplit {
  const inState = destinationUF != null && destinationUF === cfg.originUF;

  // ---- Scenario WITH TTS: single effective line, no DIFAL split. ----
  if (scenario === "com_tts") {
    const rate = inState ? cfg.ttsInternal : cfg.ttsInterstate;
    const amount = round2(pct(rate, revenue));
    return {
      lines: [
        {
          key: "icms",
          label: inState ? "ICMS (TTS interno)" : "ICMS (TTS interestadual)",
          ratePercent: rate,
          amount,
        },
      ],
      inState,
      icmsBaseAmount: amount,
      difalAmount: 0,
      fcpAmount: 0,
      totalAmount: amount,
    };
  }

  // ---- Scenario WITHOUT TTS (normal regime). ----
  const fcpRate = destinationUF ? (cfg.fcpByUF?.[destinationUF] ?? 0) : 0;
  const fcpAmount = round2(pct(fcpRate, revenue));

  // In-state sale: full internal ICMS of the origin state, no DIFAL.
  if (inState) {
    const rate = cfg.icmsInternalOrigin;
    const icmsBaseAmount = round2(pct(rate, revenue));
    const lines: TaxLine[] = [
      { key: "icms", label: `ICMS interno (${cfg.originUF})`, ratePercent: rate, amount: icmsBaseAmount },
    ];
    if (fcpAmount > 0) lines.push({ key: "fcp", label: "FCP", ratePercent: fcpRate, amount: fcpAmount });
    return {
      lines,
      inState,
      icmsBaseAmount,
      difalAmount: 0,
      fcpAmount,
      totalAmount: round2(icmsBaseAmount + fcpAmount),
    };
  }

  // Unknown destination: conservative estimate using origin internal rate.
  if (!destinationUF) {
    const rate = cfg.icmsInternalOrigin;
    const icmsBaseAmount = round2(pct(rate, revenue));
    return {
      lines: [
        { key: "icms", label: "ICMS (estimado — destino desconhecido)", ratePercent: rate, amount: icmsBaseAmount },
      ],
      inState,
      icmsBaseAmount,
      difalAmount: 0,
      fcpAmount: 0,
      totalAmount: icmsBaseAmount,
    };
  }

  // Interstate B2C sale: split into interstate ICMS (origin) + DIFAL (destination).
  const internalRate = cfg.icmsInternalByUF[destinationUF] ?? cfg.icmsInternalOrigin;
  const exitRate = interstateExitRate(destinationUF);
  // DIFAL completes the destination's internal rate; never negative.
  const difalRate = Math.max(0, round2(internalRate - exitRate));
  const icmsBaseAmount = round2(pct(exitRate, revenue));
  const difalAmount = round2(pct(difalRate, revenue));
  const lines: TaxLine[] = [
    { key: "icms_interestadual", label: `ICMS interestadual (saída ${cfg.originUF} → ${destinationUF})`, ratePercent: exitRate, amount: icmsBaseAmount },
    { key: "difal", label: `DIFAL (destino ${destinationUF})`, ratePercent: difalRate, amount: difalAmount },
  ];
  if (fcpAmount > 0) lines.push({ key: "fcp", label: `FCP (${destinationUF})`, ratePercent: fcpRate, amount: fcpAmount });
  return {
    lines,
    inState,
    icmsBaseAmount,
    difalAmount,
    fcpAmount,
    totalAmount: round2(icmsBaseAmount + difalAmount + fcpAmount),
  };
}

/**
 * Backward-compatible single ICMS line (sum of the split). Kept so existing
 * callers/tests that expect one consolidated line keep working.
 */
export function icmsLine(
  revenue: number,
  destinationUF: UF | null,
  scenario: TaxScenario,
  cfg: TaxConfig,
): { line: TaxLine; inState: boolean } {
  const split = icmsSplit(revenue, destinationUF, scenario, cfg);
  const totalRate = revenue > 0 ? round2((split.totalAmount / revenue) * 100) : 0;
  let label: string;
  if (scenario === "com_tts") {
    label = split.inState ? "ICMS (TTS interno)" : "ICMS (TTS interestadual)";
  } else if (split.inState) {
    label = `ICMS interno (${cfg.originUF})`;
  } else if (destinationUF) {
    label = split.fcpAmount > 0 ? "ICMS+DIFAL+FCP (destino)" : "ICMS+DIFAL (destino)";
  } else {
    label = "ICMS (estimado)";
  }
  return {
    line: { key: "icms", label, ratePercent: totalRate, amount: split.totalAmount },
    inState: split.inState,
  };
}

/** Full tax breakdown for one revenue amount under a scenario. */
export function taxRevenue(
  revenue: number,
  destinationUF: UF | null,
  scenario: TaxScenario,
  cfg: TaxConfig,
): TaxBreakdown {
  const fed = federalLines(revenue, cfg);
  const split = icmsSplit(revenue, destinationUF, scenario, cfg);
  const lines = [...fed, ...split.lines];
  const federalTotal = round2(fed.reduce((s, l) => s + l.amount, 0));
  const icmsTotal = round2(split.totalAmount);
  const taxTotal = round2(federalTotal + icmsTotal);
  const effectiveRate = revenue > 0 ? round2((taxTotal / revenue) * 100) : 0;
  return {
    scenario,
    destinationUF,
    inState: split.inState,
    revenue: round2(revenue),
    federalTotal,
    icmsTotal,
    icmsInterstateTotal: round2(split.icmsBaseAmount),
    difalTotal: round2(split.difalAmount),
    fcpTotal: round2(split.fcpAmount),
    taxTotal,
    effectiveRate,
    lines,
  };
}

/** Inputs to compute the profit of a sale (or an aggregate). */
export interface ProfitInput {
  revenue: number;
  commission: number;
  shipping: number;
  cmv: number;
  ads?: number;
  destinationUF: UF | null;
}

/** Compute the full profit breakdown for one sale under a scenario. */
export function computeProfit(
  input: ProfitInput,
  scenario: TaxScenario,
  cfg: TaxConfig,
): ProfitBreakdown {
  const tax = taxRevenue(input.revenue, input.destinationUF, scenario, cfg).taxTotal;
  const ads = round2(input.ads ?? 0);
  const commission = round2(input.commission);
  const shipping = round2(input.shipping);
  const cmv = round2(input.cmv);
  const revenue = round2(input.revenue);
  const netProfit = round2(revenue - commission - shipping - cmv - tax - ads);
  const margin = revenue > 0 ? netProfit / revenue : null;
  return { revenue, commission, shipping, cmv, tax, ads, netProfit, margin };
}

/** Add two profit breakdowns (for aggregation). Margin recomputed at the end. */
export function addProfit(a: ProfitBreakdown, b: ProfitBreakdown): ProfitBreakdown {
  const revenue = round2(a.revenue + b.revenue);
  const commission = round2(a.commission + b.commission);
  const shipping = round2(a.shipping + b.shipping);
  const cmv = round2(a.cmv + b.cmv);
  const tax = round2(a.tax + b.tax);
  const ads = round2(a.ads + b.ads);
  const netProfit = round2(revenue - commission - shipping - cmv - tax - ads);
  const margin = revenue > 0 ? netProfit / revenue : null;
  return { revenue, commission, shipping, cmv, tax, ads, netProfit, margin };
}

/** A zeroed profit breakdown (aggregation seed). */
export function emptyProfit(): ProfitBreakdown {
  return { revenue: 0, commission: 0, shipping: 0, cmv: 0, tax: 0, ads: 0, netProfit: 0, margin: null };
}
