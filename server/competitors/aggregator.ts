/**
 * Aggregator / triangulation layer.
 *
 * Pure, dependency-free logic that takes per-source normalized offers
 * (`RawSourceOffer`) from up to four providers and merges them into
 * `UnifiedCompetitor` records with per-field consensus + provenance.
 *
 * Kept side-effect free so it is trivially unit-testable.
 */

import type {
  RawSourceOffer,
  UnifiedCompetitor,
  FieldConsensus,
  ConsensusLevel,
  SourceId,
} from "@shared/sources";

/* ───────────────────────── matching ───────────────────────── */

/**
 * Extract the Mercado Livre item id (e.g. "MLB1234567890") from a public URL
 * when present. This is the strongest cross-source match signal.
 */
export function extractMlbId(url: string | null): string | null {
  if (!url) return null;
  // Matches MLB-1234567890 or MLB1234567890 anywhere in the URL.
  const m = url.toUpperCase().match(/MLB-?(\d{6,})/);
  return m ? `MLB${m[1]}` : null;
}

/** Lowercase, strip accents, collapse whitespace, drop punctuation. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token set similarity (Jaccard) between two product names in [0,1]. */
export function nameSimilarity(a: string, b: string): number {
  const sa = new Set(normalizeName(a).split(" ").filter((t) => t.length > 1));
  const sb = new Set(normalizeName(b).split(" ").filter((t) => t.length > 1));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of Array.from(sa)) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Relative price closeness in [0,1] (1 = identical, 0 = far apart). */
function priceCloseness(a: number | null, b: number | null): number {
  if (a == null || b == null || a <= 0 || b <= 0) return 0;
  const diff = Math.abs(a - b) / Math.max(a, b);
  return Math.max(0, 1 - diff);
}

/**
 * Decide whether two offers refer to the SAME product.
 * Strong rule: same MLB id. Fallback: high name similarity AND close price.
 */
export function isSameProduct(a: RawSourceOffer, b: RawSourceOffer): boolean {
  const ida = extractMlbId(a.url);
  const idb = extractMlbId(b.url);
  if (ida && idb) return ida === idb;
  const sim = nameSimilarity(a.name, b.name);
  if (sim >= 0.8) return true;
  if (sim >= 0.6 && priceCloseness(a.price, b.price) >= 0.9) return true;
  return false;
}

/** Group raw offers (from many sources) into clusters of the same product. */
export function clusterOffers(offers: RawSourceOffer[]): RawSourceOffer[][] {
  const clusters: RawSourceOffer[][] = [];
  for (const offer of offers) {
    let placed = false;
    for (const cluster of clusters) {
      // Compare against the cluster's representative (first element).
      if (isSameProduct(cluster[0], offer)) {
        cluster.push(offer);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([offer]);
  }
  return clusters;
}

/* ───────────────────────── consensus ───────────────────────── */

/**
 * Map (reporting, agreeing) counts to a confidence level.
 *
 * Confidence is RELATIVE to how many sources reported, not an absolute count —
 * the system runs with 2–4 active sources, so requiring 3+ agreeing would make
 * "high" unreachable whenever only two sources are configured. Full corroboration
 * (every reporting source agrees) is "high" even with two sources.
 */
export function consensusFromCounts(reporting: number, agreeing: number): ConsensusLevel {
  if (reporting === 0) return "none";
  if (reporting === 1) return "single";
  // 2+ sources reported. Confidence is the AGREEMENT RATIO among them.
  const ratio = agreeing / reporting;
  if (agreeing >= 2 && ratio === 1) return "high"; // unanimous corroboration
  if (agreeing >= 3) return "high"; // strong majority on a crowded field
  if (agreeing >= 2 && ratio >= 0.5) return "medium"; // majority agrees
  return "low"; // reported by several but little/no agreement
}

/**
 * Build a numeric field consensus. Two numbers "agree" when within `tolerance`
 * relative difference (default 2%). The consolidated value is the median of the
 * largest agreeing group.
 */
export function numericConsensus(
  contributions: Array<{ source: SourceId; value: number | null }>,
  tolerance = 0.02,
): FieldConsensus<number> {
  const present = contributions.filter(
    (c): c is { source: SourceId; value: number } => c.value != null && Number.isFinite(c.value),
  );
  if (present.length === 0) {
    return { value: null, consensus: "none", reportingCount: 0, agreeingCount: 0, contributions: [] };
  }
  if (present.length === 1) {
    return {
      value: present[0].value,
      consensus: "single",
      reportingCount: 1,
      agreeingCount: 1,
      contributions: present,
    };
  }
  // Find, for each value, how many others are within tolerance.
  let bestIdx = 0;
  let bestGroup: number[] = [];
  for (let i = 0; i < present.length; i++) {
    const base = present[i].value;
    const group = present
      .filter((c) => Math.abs(c.value - base) / Math.max(Math.abs(base), Math.abs(c.value), 1) <= tolerance)
      .map((c) => c.value);
    if (group.length > bestGroup.length) {
      bestGroup = group;
      bestIdx = i;
    }
  }
  const sorted = [...bestGroup].sort((x, y) => x - y);
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  return {
    value: median ?? present[bestIdx].value,
    consensus: consensusFromCounts(present.length, bestGroup.length),
    reportingCount: present.length,
    agreeingCount: bestGroup.length,
    contributions: present,
  };
}

/**
 * Build a string field consensus by normalized equality. Consolidated value is
 * the most frequent (mode); ties resolved by source priority order.
 */
export function stringConsensus(
  contributions: Array<{ source: SourceId; value: string | null }>,
): FieldConsensus<string> {
  const present = contributions.filter(
    (c): c is { source: SourceId; value: string } => typeof c.value === "string" && c.value.trim().length > 0,
  );
  if (present.length === 0) {
    return { value: null, consensus: "none", reportingCount: 0, agreeingCount: 0, contributions: [] };
  }
  const counts = new Map<string, { count: number; original: string }>();
  for (const c of present) {
    const key = normalizeName(c.value);
    const cur = counts.get(key);
    if (cur) cur.count++;
    else counts.set(key, { count: 1, original: c.value });
  }
  let best = { count: 0, original: present[0].value };
  for (const v of Array.from(counts.values())) if (v.count > best.count) best = v;
  return {
    value: best.original,
    consensus: consensusFromCounts(present.length, best.count),
    reportingCount: present.length,
    agreeingCount: best.count,
    contributions: present,
  };
}

/** Boolean consensus by majority vote. */
export function booleanConsensus(
  contributions: Array<{ source: SourceId; value: boolean | null }>,
): FieldConsensus<boolean> {
  const present = contributions.filter(
    (c): c is { source: SourceId; value: boolean } => typeof c.value === "boolean",
  );
  if (present.length === 0) {
    return { value: null, consensus: "none", reportingCount: 0, agreeingCount: 0, contributions: [] };
  }
  const trues = present.filter((c) => c.value).length;
  const falses = present.length - trues;
  const value = trues >= falses;
  const agreeing = value ? trues : falses;
  return {
    value,
    consensus: consensusFromCounts(present.length, agreeing),
    reportingCount: present.length,
    agreeingCount: agreeing,
    contributions: present,
  };
}

/* ───────────────────────── roll-up ───────────────────────── */

const CONSENSUS_RANK: Record<ConsensusLevel, number> = {
  high: 4,
  medium: 3,
  single: 2,
  low: 1,
  none: 0,
};

/** Overall confidence: prioritize price, then rating, then the rest. */
export function rollUpConsensus(c: UnifiedCompetitor): ConsensusLevel {
  const weighted: Array<[ConsensusLevel, number]> = [
    [c.price.consensus, 3],
    [c.rating.consensus, 2],
    [c.freeShipping.consensus, 1],
    [c.sellerReputation.consensus, 1],
  ];
  let num = 0;
  let den = 0;
  for (const [lvl, w] of weighted) {
    if (lvl === "none") continue;
    num += CONSENSUS_RANK[lvl] * w;
    den += w;
  }
  if (den === 0) return "none";
  const avg = num / den;
  if (avg >= 3.5) return "high";
  if (avg >= 2.5) return "medium";
  if (avg >= 1.5) return "single";
  return "low";
}

/** Pick the first non-null value following source priority order. */
function pickByPriority<T>(
  cluster: RawSourceOffer[],
  get: (o: RawSourceOffer) => T | null,
  priority: SourceId[],
): T | null {
  for (const src of priority) {
    const o = cluster.find((x) => x.source === src);
    const v = o ? get(o) : null;
    if (v != null && (typeof v !== "string" || v.trim().length > 0)) return v;
  }
  for (const o of cluster) {
    const v = get(o);
    if (v != null && (typeof v !== "string" || v.trim().length > 0)) return v;
  }
  return null;
}

/** Source trust order for tie-breaking display fields (official first). */
export const DISPLAY_PRIORITY: SourceId[] = ["official", "oxylabs", "scrapingbee", "unwrangle"];

/** Merge one cluster of same-product offers into a UnifiedCompetitor. */
export function mergeCluster(cluster: RawSourceOffer[]): UnifiedCompetitor {
  const contrib = <T>(get: (o: RawSourceOffer) => T | null) =>
    cluster.map((o) => ({ source: o.source, value: get(o) }));

  const price = numericConsensus(contrib((o) => o.price));
  const listingPrice = numericConsensus(contrib((o) => o.listingPrice));
  const rating = numericConsensus(contrib((o) => o.rating), 0.06);
  const totalRatings = numericConsensus(contrib((o) => o.totalRatings), 0.1);
  const brand = stringConsensus(contrib((o) => o.brand));
  const sellerReputation = stringConsensus(contrib((o) => o.sellerReputation));
  const freeShipping = booleanConsensus(contrib((o) => o.freeShipping));
  const officialStore = booleanConsensus(contrib((o) => o.officialStore));
  const fulfillment = booleanConsensus(contrib((o) => o.fulfillment));
  const hasCoupon = booleanConsensus(contrib((o) => o.hasCoupon));
  const sponsored = booleanConsensus(contrib((o) => o.sponsored));

  const name = pickByPriority(cluster, (o) => o.name, DISPLAY_PRIORITY) ?? cluster[0].name;
  const url = pickByPriority(cluster, (o) => o.url, DISPLAY_PRIORITY);
  const thumbnail = pickByPriority(cluster, (o) => o.thumbnail, DISPLAY_PRIORITY);
  const matchKey = extractMlbId(url) ?? normalizeName(name).slice(0, 60);
  const sources = Array.from(new Set(cluster.map((o) => o.source)));

  const merged: UnifiedCompetitor = {
    matchKey,
    name,
    url,
    thumbnail,
    price,
    listingPrice,
    rating,
    totalRatings,
    brand,
    freeShipping,
    sellerReputation,
    officialStore,
    fulfillment,
    hasCoupon,
    sponsored,
    sources,
    overallConsensus: "none",
  };
  merged.overallConsensus = rollUpConsensus(merged);
  return merged;
}

/**
 * Transparent "strength" score used to sort competitors. Combines social proof
 * (ratings volume + average), confidence (more agreeing sources = more trust)
 * and a light free-shipping boost. Higher = stronger competitor.
 */
export function strengthScore(c: UnifiedCompetitor): number {
  const ratingVol = c.totalRatings.value ?? 0;
  const ratingAvg = c.rating.value ?? 0;
  const social = Math.log10(ratingVol + 1) * 10 + ratingAvg * 4;
  const confidence = CONSENSUS_RANK[c.overallConsensus] * 3;
  const shipping = c.freeShipping.value ? 4 : 0;
  const corroboration = (c.sources.length - 1) * 5;
  return social + confidence + shipping + corroboration;
}

/** Full pipeline: cluster raw offers and merge each into a UnifiedCompetitor. */
export function triangulate(offers: RawSourceOffer[]): UnifiedCompetitor[] {
  const clusters = clusterOffers(offers);
  const merged = clusters.map(mergeCluster);
  merged.sort((a, b) => strengthScore(b) - strengthScore(a));
  return merged;
}
