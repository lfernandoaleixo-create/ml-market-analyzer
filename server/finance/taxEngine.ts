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
export function icmsLine(
  revenue: number,
  destinationUF: UF | null,
  scenario: TaxScenario,
  cfg: TaxConfig,
): { line: TaxLine; inState: boolean } {
  const inState = destinationUF != null && destinationUF === cfg.originUF;

  if (scenario === "com_tts") {
    const rate = inState ? cfg.ttsInternal : cfg.ttsInterstate;
    return {
      line: {
        key: "icms",
        label: inState ? "ICMS (TTS interno)" : "ICMS (TTS interestadual)",
        ratePercent: rate,
        amount: round2(pct(rate, revenue)),
      },
      inState,
    };
  }

  // WITHOUT TTS (normal regime).
  let rate: number;
  let label: string;
  if (inState) {
    rate = cfg.icmsInternalOrigin;
    label = "ICMS (interno MG)";
  } else if (destinationUF) {
    // Effective burden ≈ destination internal rate (interstate + DIFAL).
    rate = cfg.icmsInternalByUF[destinationUF] ?? cfg.icmsInternalOrigin;
    label = "ICMS+DIFAL (destino)";
  } else {
    // Unknown destination: fall back to origin internal rate as a conservative
    // estimate (signaled by the caller as an estimate).
    rate = cfg.icmsInternalOrigin;
    label = "ICMS (estimado)";
  }
  const fcp = destinationUF ? (cfg.fcpByUF?.[destinationUF] ?? 0) : 0;
  const totalRate = rate + fcp;
  return {
    line: {
      key: "icms",
      label: fcp > 0 ? `${label} + FCP` : label,
      ratePercent: totalRate,
      amount: round2(pct(totalRate, revenue)),
    },
    inState,
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
  const { line: icms, inState } = icmsLine(revenue, destinationUF, scenario, cfg);
  const lines = [...fed, icms];
  const federalTotal = round2(fed.reduce((s, l) => s + l.amount, 0));
  const icmsTotal = round2(icms.amount);
  const taxTotal = round2(federalTotal + icmsTotal);
  const effectiveRate = revenue > 0 ? round2((taxTotal / revenue) * 100) : 0;
  return {
    scenario,
    destinationUF,
    inState,
    revenue: round2(revenue),
    federalTotal,
    icmsTotal,
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
