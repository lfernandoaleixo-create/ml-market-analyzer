/**
 * Shared types for the "Lucratividade Real" feature.
 *
 * The system estimates the REAL profit of each sale and each listing by
 * combining data already available:
 *   - revenue, ML commission, seller-paid shipping and product cost (CMV) come
 *     from BaseLinker (the ERP);
 *   - taxes are estimated by a configurable engine that models the Lucro
 *     Presumido regime + ICMS/DIFAL by destination state, in two scenarios:
 *     WITHOUT the MG TTS benefit and WITH it.
 *
 * IMPORTANT: this is a MANAGEMENT estimate to support pricing/decisions. The
 * official tax assessment and payment is the accountant's responsibility.
 */

/** Brazilian federation units (UF). */
export type UF =
  | "AC" | "AL" | "AM" | "AP" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA"
  | "MG" | "MS" | "MT" | "PA" | "PB" | "PE" | "PI" | "PR" | "RJ" | "RN"
  | "RO" | "RR" | "RS" | "SC" | "SE" | "SP" | "TO";

/** Which tax scenario the profit was computed under. */
export type TaxScenario = "sem_tts" | "com_tts";

/**
 * Configurable tax parameters. Every rate is a PERCENT (e.g. 3 means 3%).
 * Defaults reflect the research in references/tributacao-lucro-presumido-tts.md
 * and are fully editable by the user in the UI.
 */
export interface TaxConfig {
  /** Master switch chosen by the user: is the TTS benefit active? */
  ttsEnabled: boolean;
  /** Origin UF of the seller (used to compute interstate rate). Default MG. */
  originUF: UF;

  /* ---- Federal taxes on revenue (Lucro Presumido) ---- */
  /** PIS (cumulative) — default 0.65%. */
  pis: number;
  /** COFINS (cumulative) — default 3.00%. */
  cofins: number;
  /** Effective IRPJ over revenue (15% over 8% presumption = 1.2%). */
  irpjEffective: number;
  /** Effective CSLL over revenue (9% over 12% presumption = 1.08%). */
  csllEffective: number;

  /* ---- ICMS — scenario WITHOUT TTS (normal regime) ---- */
  /** Internal ICMS rate of the ORIGIN state for in-state sales (MG = 18%). */
  icmsInternalOrigin: number;
  /**
   * Internal ICMS rate per destination UF (percent). For interstate B2C sales
   * the effective ICMS burden equals the destination's internal rate (origin
   * interstate share + DIFAL). Editable per state.
   */
  icmsInternalByUF: Record<UF, number>;
  /** Optional FCP (Fundo de Combate à Pobreza) additional percent per UF. */
  fcpByUF?: Partial<Record<UF, number>>;

  /* ---- ICMS — scenario WITH TTS (MG credit-presumed) ---- */
  /** Effective ICMS on interstate sales under TTS — default 1.3%. */
  ttsInterstate: number;
  /** Effective ICMS on in-state (MG) sales under TTS — default 6%. */
  ttsInternal: number;
}

/** A single line of the tax breakdown (for transparent display). */
export interface TaxLine {
  key: string;
  label: string;
  /** Rate applied (percent), when applicable. */
  ratePercent: number | null;
  /** Monetary value (BRL). */
  amount: number;
}

/** Result of taxing one revenue amount toward a destination UF. */
export interface TaxBreakdown {
  scenario: TaxScenario;
  destinationUF: UF | null;
  /** Whether the sale is in-state (origin == destination). */
  inState: boolean;
  revenue: number;
  /** Federal taxes total (PIS+COFINS+IRPJ+CSLL). */
  federalTotal: number;
  /** ICMS (+ DIFAL +FCP) total under the chosen scenario. */
  icmsTotal: number;
  /**
   * Of the icmsTotal, how much is the interstate ICMS share kept by the ORIGIN
   * state (7%/12% on interstate B2C sales without TTS). Zero for in-state
   * sales and for the TTS scenario.
   */
  icmsInterstateTotal: number;
  /**
   * Of the icmsTotal, how much is the DIFAL — the difference paid to the
   * DESTINATION state (destination internal rate minus interstate exit rate).
   * Zero for in-state sales and for the TTS scenario.
   */
  difalTotal: number;
  /** Of the icmsTotal, how much is FCP (Fundo de Combate à Pobreza). */
  fcpTotal: number;
  /** Sum of federalTotal + icmsTotal. */
  taxTotal: number;
  /** Effective total tax rate over revenue (percent). */
  effectiveRate: number;
  /** Detailed lines for display. */
  lines: TaxLine[];
}

/** Profit composition for a sale or a listing. */
export interface ProfitBreakdown {
  revenue: number;
  commission: number;
  shipping: number;
  cmv: number;
  tax: number;
  ads: number;
  /** revenue - commission - shipping - cmv - tax - ads. */
  netProfit: number;
  /** netProfit / revenue (0..1), null when revenue is 0. */
  margin: number | null;
}

/** Per-listing profit row (aggregated across its sales). */
export interface ListingProfitRow {
  itemId: string;
  title: string;
  thumbnail?: string;
  /** Units sold (in the analysed orders). */
  unitsSold: number;
  orders: number;
  /** Profit under the currently selected scenario. */
  current: ProfitBreakdown;
  /** Average unit cost (CMV) used. */
  unitCost: number | null;
  /** True when at least one product had no cost in BaseLinker. */
  missingCost: boolean;
}

/**
 * Period-level breakdown of the tax burden under the SELECTED scenario, so the
 * UI and the accountant PDF can show clearly how much of the tax was plain
 * ICMS, how much was DIFAL and how much was FCP.
 */
export interface TaxDetailTotals {
  /** Federal taxes (PIS+COFINS+IRPJ+CSLL). */
  federal: number;
  /** ICMS kept by origin: interstate share (B2C) + in-state internal ICMS. */
  icms: number;
  /** DIFAL paid to destination states (interstate B2C, sem TTS). */
  difal: number;
  /** FCP (Fundo de Combate à Pobreza), destination. */
  fcp: number;
  /** Total taxes = federal + icms + difal + fcp. */
  total: number;
}

/** A comparison of the two scenarios side by side (totals). */
export interface ScenarioComparison {
  semTts: ProfitBreakdown;
  comTts: ProfitBreakdown;
  /** Extra profit unlocked by TTS (comTts.netProfit - semTts.netProfit). */
  ttsGain: number;
}

/** Top-level profitability dashboard payload. */
export interface ProfitabilityResult {
  /** Period analysed (unix ms). */
  from: number;
  to: number;
  currency: string;
  /** Scenario currently selected by the user. */
  scenario: TaxScenario;
  /** Number of orders analysed. */
  orderCount: number;
  /** Totals under the selected scenario. */
  totals: ProfitBreakdown;
  /** Side-by-side comparison of both scenarios (totals). */
  comparison: ScenarioComparison;
  /** Tax breakdown of the period under the selected scenario (ICMS vs DIFAL vs FCP). */
  taxDetail: TaxDetailTotals;
  /** Profit per listing (selected scenario), ranked by netProfit desc. */
  listings: ListingProfitRow[];
  /** Sales distribution by destination UF (count). */
  byUF: Array<{ uf: UF | "??"; orders: number; revenue: number }>;
  /** Effective config used (so the UI can show/edit it). */
  config: TaxConfig;
  /** Number of distinct products that had no cost in BaseLinker. */
  productsMissingCost: number;
  /** Orders excluded from the calc (cancelled/returned/etc.). */
  excludedCount?: number;
  /** Total orders seen before the effective-sales filter. */
  totalOrdersSeen?: number;
  /** Excluded orders broken down by status name. */
  excludedByStatus?: Record<string, number>;
  /** True when results came from a resilient cache (BaseLinker congested). */
  stale?: boolean;
  /** Unix ms of the underlying data, when stale. */
  asOf?: number;
}

/** Default internal ICMS rates per destination UF (2025 reference, percent). */
export const DEFAULT_ICMS_INTERNAL: Record<UF, number> = {
  AC: 19, AL: 19, AM: 20, AP: 18, BA: 20.5, CE: 20, DF: 20, ES: 17, GO: 19,
  MA: 23, MG: 18, MS: 17, MT: 17, PA: 19, PB: 20, PE: 20.5, PI: 22.5,
  PR: 19.5, RJ: 20, RN: 20, RO: 19.5, RR: 20, RS: 17, SC: 17, SE: 19,
  SP: 18, TO: 20,
};

/**
 * Interstate exit rate from MG (and SE/S region rule):
 *  - 12% to South/Southeast except ES (SP, RJ, PR, SC, RS);
 *  - 7% to North/Northeast/Center-West and ES.
 * Used only as reference for the breakdown narrative (origin share). The
 * WITHOUT-TTS ICMS burden is the destination's internal rate.
 */
export const INTERSTATE_12_DESTINATIONS: UF[] = ["SP", "RJ", "PR", "SC", "RS"];

/**
 * Interstate ICMS exit rate from the origin state toward a destination UF, for
 * B2C interstate sales (percent). South/Southeast (except ES) = 12%; the rest
 * (North/Northeast/Center-West and ES) = 7%.
 *
 * NOTE: imported goods ("conteúdo de importação" > 40%) carry a 4% interstate
 * rate. This helper covers the common 7%/12% national-origin case; if the
 * seller deals mostly with imported goods, the rate can be tuned in config
 * later. The DIFAL is always (destination internal rate − this exit rate).
 */
export function interstateExitRate(destinationUF: UF): number {
  return INTERSTATE_12_DESTINATIONS.includes(destinationUF) ? 12 : 7;
}

/** Build the default, fully-editable tax config. */
export function defaultTaxConfig(): TaxConfig {
  return {
    ttsEnabled: false,
    originUF: "MG",
    pis: 0.65,
    cofins: 3.0,
    irpjEffective: 1.2,
    csllEffective: 1.08,
    icmsInternalOrigin: 18,
    icmsInternalByUF: { ...DEFAULT_ICMS_INTERNAL },
    fcpByUF: {},
    ttsInterstate: 1.3,
    ttsInternal: 6,
  };
}
