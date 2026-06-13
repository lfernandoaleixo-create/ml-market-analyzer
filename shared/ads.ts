/**
 * Shared types for the ADS module (Mercado Ads / Product Ads).
 *
 * All numbers are REAL values read from the Mercado Livre Advertising API for
 * the connected seller account. We never fabricate metrics: when a value is not
 * available we keep it at 0 only when the API itself returns 0, and surface
 * rate-limit / connection problems as explicit errors instead of fake zeros.
 *
 * Money is in BRL. Rates (acos, ctr, sov) are percentages as returned by ML
 * (e.g. 15.48 means 15.48%).
 */

export type AdsConnectionState = "connected" | "not_connected" | "no_ads_access";

/** Native ML campaign strategies. */
export type AdsStrategy = "PROFITABILITY" | "INCREASE" | "VISIBILITY" | string;

export type AdsCampaignStatus = "active" | "paused" | "idle" | string;

/** The metric block returned by ML for both campaigns and ads. */
export type AdsMetrics = {
  clicks: number;
  prints: number; // impressions
  cost: number; // R$ spent
  cpc: number; // average cost per click
  ctr: number; // % click-through rate
  acos: number; // % advertising cost of sales
  sov: number; // % share of voice
  directAmount: number; // revenue from clicks that converted directly
  indirectAmount: number; // revenue attributed indirectly
  totalAmount: number; // total attributed revenue
  directUnits: number;
  indirectUnits: number;
  units: number; // total attributed units
  organicUnits: number; // organic units attributed to the campaign window
  organicItems: number;
};

export type AdsCampaign = {
  id: number;
  name: string;
  status: AdsCampaignStatus;
  strategy: AdsStrategy;
  acosTarget: number | null; // % target ACOS
  roasTarget: number | null;
  budget: number | null; // daily budget R$
  automaticBudget: boolean;
  channel: string;
  dateCreated: string | null; // ISO
  lastUpdated: string | null; // ISO
  metrics: AdsMetrics;
};

export type AdsAdRow = {
  itemId: string;
  campaignId: number;
  title: string;
  price: number;
  status: string;
  thumbnail: string | null;
  permalink: string | null;
  listingTypeId: string | null; // gold_pro etc.
  logisticType: string | null; // drop_off, fulfillment, etc.
  buyBoxWinner: boolean;
  catalogListing: boolean;
  brand: string | null;
  imageQuality: string | null;
  hasDiscount: boolean;
  metrics: AdsMetrics;
};

/** Aggregate of the whole account over the selected window. */
export type AdsAccountSummary = {
  advertiserId: number;
  currency: string;
  campaignCount: number;
  activeCampaignCount: number;
  metrics: AdsMetrics;
  /** Derived KPIs computed from the metrics above (never fabricated). */
  derived: {
    roas: number | null; // totalAmount / cost
    acos: number | null; // cost / totalAmount * 100
    conversionRate: number | null; // units / clicks * 100
    totalBudget: number; // sum of campaign budgets
    /** % of attributed revenue that is organic (organic units share). */
    organicShare: number | null;
  };
};

export type AdsDashboard = {
  connection: AdsConnectionState;
  summary: AdsAccountSummary | null;
  topCampaigns: AdsCampaign[]; // by cost desc
  /** A few notable ads for the quick-view dashboard. */
  topAds: AdsAdRow[]; // by cost desc
  /** Heuristic, read-only recommendations (no write actions performed). */
  insightsCount: number;
};

export type AdsPeriod = "7" | "15" | "30" | "60" | "90";

/** Read-only intelligence signal produced by analysing real metrics. */
export type AdsInsightSeverity = "critical" | "warning" | "good" | "info";

export type AdsInsight = {
  id: string;
  severity: AdsInsightSeverity;
  title: string;
  detail: string;
  /** Optional entity the insight refers to (campaign or ad). */
  scope: "account" | "campaign" | "ad";
  refId?: string;
  /** Quantified impact when measurable (e.g. wasted spend in R$). */
  metric?: { label: string; value: string };
};


/* ------------------------------------------------------------------ *
 * Category tracking (group active ads into product families)
 * ------------------------------------------------------------------ */

/** Stable category keys for the seller's product families. */
export type AdsCategoryKey =
  | "espetos"
  | "manicure"
  | "aroma_fibra"
  | "aroma_madeira"
  | "hashi"
  | "palitos_bambu"
  | "outros";

export type AdsCategoryDef = {
  key: AdsCategoryKey;
  label: string;
};

/** All categories in display order. "outros" catches anything unmatched. */
export const ADS_CATEGORIES: AdsCategoryDef[] = [
  { key: "espetos", label: "Espetos" },
  { key: "manicure", label: "Palito de manicure" },
  { key: "aroma_fibra", label: "Aromatizador (fibra)" },
  { key: "aroma_madeira", label: "Aromatizador (madeira)" },
  { key: "hashi", label: "Hashi" },
  { key: "palitos_bambu", label: "Palitos de bambu" },
  { key: "outros", label: "Outros" },
];

/** One category's aggregated, real-time view. */
export type AdsCategoryStat = {
  key: AdsCategoryKey;
  label: string;
  adCount: number;
  activeAdCount: number;
  metrics: AdsMetrics;
  /** Derived, never fabricated. */
  derived: {
    roas: number | null;
    acos: number | null;
    conversionRate: number | null;
    organicShare: number | null;
  };
  /** Up to a few representative ads (highest cost) for drill-in. */
  sampleAds: AdsAdRow[];
};

export type AdsCategoryReport = {
  connection: AdsConnectionState;
  periodDays: number;
  categories: AdsCategoryStat[];
  /** ISO timestamp of when this report was computed. */
  computedAt: number;
};

/* ------------------------------------------------------------------ *
 * Mamba audit (track the agency's changes and judge coherence)
 * ------------------------------------------------------------------ */

export type AdsChangeVerdict = "coherent" | "questionable" | "neutral";

export type AdsChangeEntry = {
  id: number;
  campaignId: number;
  campaignName: string;
  detectedDay: string; // YYYY-MM-DD
  field: string; // status | acosTarget | budget | automaticBudget | strategy
  oldValue: string | null;
  newValue: string | null;
  verdict: AdsChangeVerdict;
  assessment: string | null;
  recommendation: string | null;
  detectedAt: number; // unix ms
};

/** Per-campaign snapshot of the agency's current configuration. */
export type AdsManagedCampaign = {
  campaignId: number;
  name: string;
  managedByMamba: boolean; // inferred from the name
  status: AdsCampaignStatus;
  acosTarget: number | null;
  budget: number | null;
  automaticBudget: boolean;
  strategy: AdsStrategy;
  metrics: AdsMetrics;
  /** Our own read-only verdict on the CURRENT configuration. */
  ourVerdict: AdsChangeVerdict;
  ourComment: string;
};

export type AdsAuditReport = {
  connection: AdsConnectionState;
  /** Day the audit window started (when tracking began / Mamba took over). */
  trackingSince: string | null; // YYYY-MM-DD
  daysTracked: number;
  /** How many daily snapshots we have captured so far. */
  snapshotDays: number;
  changes: AdsChangeEntry[]; // most recent first
  managedCampaigns: AdsManagedCampaign[];
  /** Headline counts for the quick view. */
  summary: {
    totalChanges: number;
    coherent: number;
    questionable: number;
    mambaCampaigns: number;
  };
  computedAt: number;
};
