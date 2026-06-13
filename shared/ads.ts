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
