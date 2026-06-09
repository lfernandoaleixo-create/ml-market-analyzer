/**
 * Shared types for the MULTI-SOURCE competitor intelligence layer.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  WHY THIS EXISTS
 * ──────────────────────────────────────────────────────────────────────────
 *  Competitor data is collected from up to FOUR independent sources and then
 *  "triangulated": when several sources agree on a field, confidence is high;
 *  when they disagree (or only one reports it), confidence is lower and we keep
 *  the provenance so the UI can be transparent about it.
 *
 *  The four sources:
 *    - "official"    → Mercado Livre official public API (sites/MLB/search)
 *    - "unwrangle"   → Unwrangle third-party scraper
 *    - "oxylabs"     → Oxylabs E-Commerce Scraper API
 *    - "scrapingbee" → ScrapingBee scraper
 *
 *  SECURITY: none of the scraper sources (unwrangle/oxylabs/scrapingbee) ever
 *  receive the seller's OAuth token, CNPJ, cookies or identity. They only get
 *  public keywords / public product URLs. The "official" source uses the public
 *  search endpoint and likewise carries no seller-private identifiers.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** Identifier of a data source. */
export type SourceId = "official" | "unwrangle" | "oxylabs" | "scrapingbee";

/** Human-readable labels for each source (UI). */
export const SOURCE_LABELS: Record<SourceId, string> = {
  official: "API oficial do Mercado Livre",
  unwrangle: "Unwrangle",
  oxylabs: "Oxylabs",
  scrapingbee: "ScrapingBee",
};

/** All known sources in display order. */
export const ALL_SOURCES: SourceId[] = ["official", "unwrangle", "oxylabs", "scrapingbee"];

/** Configuration + last-call health of a single source. */
export interface SourceStatus {
  id: SourceId;
  label: string;
  /** True when credentials/keys for this source are present on the server. */
  configured: boolean;
  /**
   * Operational signal from the most recent probe (optional):
   *  - "ok"        → returned data successfully
   *  - "upstream"  → configured but the provider is currently failing
   *  - "auth"      → configured but credentials rejected
   *  - "unconfigured" → no credentials
   *  - "unknown"   → not probed yet
   */
  health: "ok" | "upstream" | "auth" | "unconfigured" | "unknown";
  /** Optional short human note (PT-BR) about the current state. */
  note: string | null;
}

/** Overall multi-source status for the Radar module. */
export interface SourcesStatus {
  sources: SourceStatus[];
  /** Number of sources currently configured. */
  configuredCount: number;
  /** True when at least one source can serve data. */
  anyAvailable: boolean;
}

/** Confidence derived from how many sources agree on a value. */
export type ConsensusLevel = "high" | "medium" | "low" | "single" | "none";

/**
 * A single field value after triangulation. Generic over the value type so we
 * can reuse it for numbers (price), strings (seller name) and booleans.
 */
export interface FieldConsensus<T> {
  /** The consolidated/best-estimate value (null when no source reported it). */
  value: T | null;
  /** Confidence based on agreement among the reporting sources. */
  consensus: ConsensusLevel;
  /** How many sources reported a (non-null) value for this field. */
  reportingCount: number;
  /** How many of those agreed with the consolidated value. */
  agreeingCount: number;
  /** Per-source raw contributions (only sources that reported the field). */
  contributions: Array<{ source: SourceId; value: T }>;
}

/**
 * A competitor offer in NORMALIZED form, where each meaningful field carries
 * its own triangulated consensus + provenance.
 */
export interface UnifiedCompetitor {
  /** Stable-ish key used to match the same product across sources. */
  matchKey: string;
  /** Display name (best available). */
  name: string;
  /** Canonical public URL (best available). */
  url: string | null;
  /** Thumbnail (best available). */
  thumbnail: string | null;
  /** Triangulated fields. */
  price: FieldConsensus<number>;
  listingPrice: FieldConsensus<number>;
  rating: FieldConsensus<number>;
  totalRatings: FieldConsensus<number>;
  brand: FieldConsensus<string>;
  freeShipping: FieldConsensus<boolean>;
  /** Sellers' reputation label when available (e.g. "MercadoLíder"). */
  sellerReputation: FieldConsensus<string>;
  /** True when the listing belongs to an official brand store ("Loja oficial"). */
  officialStore: FieldConsensus<boolean>;
  /** True when fulfilled by Mercado Livre logistics ("Enviado pelo FULL"). */
  fulfillment: FieldConsensus<boolean>;
  /** True when the listing currently advertises a coupon/discount pill. */
  hasCoupon: FieldConsensus<boolean>;
  /** True when the listing is a paid/sponsored placement (is_advertising). */
  sponsored: FieldConsensus<boolean>;
  /** Which sources contributed ANY field to this competitor. */
  sources: SourceId[];
  /**
   * Overall confidence for the whole record: a roll-up of the per-field
   * consensus, weighted toward the most decision-relevant fields (price first).
   */
  overallConsensus: ConsensusLevel;
}

/** A triangulated search result. */
export interface UnifiedSearchResult {
  query: string;
  /** Normalized competitors, sorted by a transparent "strength" score. */
  competitors: UnifiedCompetitor[];
  /** Status snapshot of the sources used for this search. */
  sourcesUsed: SourceStatus[];
  /** True when results came from more than one source (triangulated). */
  triangulated: boolean;
}

/**
 * Credit/quota usage reported by a paid source provider.
 * `kind` distinguishes how to present it honestly in the UI:
 *  - "quota"        → provider exposes max/used credits (e.g. ScrapingBee)
 *  - "panel_only"   → configured, but provider has no public usage endpoint
 *                     (consumption is visible only on the provider dashboard,
 *                     e.g. Oxylabs)
 *  - "unconfigured" → no credentials on the server
 *  - "error"        → configured but the usage probe failed
 */
export interface SourceUsage {
  id: SourceId;
  label: string;
  kind: "quota" | "panel_only" | "unconfigured" | "error";
  /** Total credits in the plan (null unless kind = "quota"). */
  maxCredits: number | null;
  /** Credits already consumed this cycle (null unless kind = "quota"). */
  usedCredits: number | null;
  /** Convenience: maxCredits - usedCredits (null unless kind = "quota"). */
  remainingCredits: number | null;
  /** Plan renewal date as unix-ms (null when unknown). */
  renewalAt: number | null;
  /** Short PT-BR note for the UI (e.g. "Consumo visível no painel da Oxylabs"). */
  note: string | null;
}

/** Consumption panel payload: per-source quota + the user's search counts. */
export interface UsageStatus {
  sources: SourceUsage[];
  /** Searches the user STARTED today (since local midnight, server-computed UTC window). */
  searchesToday: number;
  /** Searches the user STARTED in the last 30 days. */
  searchesLast30Days: number;
}

/** A raw, per-source normalized offer BEFORE triangulation (internal). */
export interface RawSourceOffer {
  source: SourceId;
  name: string;
  url: string | null;
  thumbnail: string | null;
  price: number | null;
  listingPrice: number | null;
  rating: number | null;
  totalRatings: number | null;
  brand: string | null;
  freeShipping: boolean | null;
  sellerReputation: string | null;
  /** True when the listing belongs to an official brand store. */
  officialStore: boolean | null;
  /** True when fulfilled by Mercado Livre logistics (FULL). */
  fulfillment: boolean | null;
  /** True when a coupon/discount pill is shown on the card. */
  hasCoupon: boolean | null;
  /** True when the card is a sponsored/advertising placement. */
  sponsored: boolean | null;
}
