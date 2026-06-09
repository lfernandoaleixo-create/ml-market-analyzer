import type { UnifiedCompetitor } from "./sources";

/**
 * Segment filters for the Radar results. Each flag, when ON, keeps ONLY the
 * competitors whose corresponding attribute is true. Multiple active flags are
 * combined with AND (e.g. "Loja oficial" + "FULL" → official stores that also
 * ship with FULL). All flags OFF → no filtering (show everything).
 */
export interface SegmentFilters {
  officialStore: boolean;
  fulfillment: boolean;
  hasCoupon: boolean;
  sponsored: boolean;
}

export const EMPTY_FILTERS: SegmentFilters = {
  officialStore: false,
  fulfillment: false,
  hasCoupon: false,
  sponsored: false,
};

export type SegmentKey = keyof SegmentFilters;

/** Human labels (PT-BR) used by the filter chips. */
export const SEGMENT_LABELS: Record<SegmentKey, string> = {
  officialStore: "Loja oficial",
  fulfillment: "FULL",
  hasCoupon: "Cupom",
  sponsored: "Patrocinado",
};

/** True when no filter is active (so the full list should be shown). */
export function noFiltersActive(f: SegmentFilters): boolean {
  return !f.officialStore && !f.fulfillment && !f.hasCoupon && !f.sponsored;
}

/**
 * Read a competitor's boolean attribute defensively. Cache entries created
 * before the enrichment feature won't have these fields, so we use optional
 * chaining and treat missing/null as `false` (i.e. "not in this segment").
 */
function attr(c: UnifiedCompetitor, key: SegmentKey): boolean {
  return c?.[key]?.value === true;
}

/**
 * Decide whether a single competitor passes the active filters. A competitor
 * passes only if it satisfies EVERY active flag (AND semantics). Pure, so it is
 * trivially unit-testable and safe to memoize on the client.
 */
export function matchesFilters(
  c: UnifiedCompetitor,
  f: SegmentFilters,
): boolean {
  if (f.officialStore && !attr(c, "officialStore")) return false;
  if (f.fulfillment && !attr(c, "fulfillment")) return false;
  if (f.hasCoupon && !attr(c, "hasCoupon")) return false;
  if (f.sponsored && !attr(c, "sponsored")) return false;
  return true;
}

/** Apply the active segment filters to a list of competitors. */
export function applyFilters(
  competitors: UnifiedCompetitor[],
  f: SegmentFilters,
): UnifiedCompetitor[] {
  if (noFiltersActive(f)) return competitors;
  return competitors.filter((c) => matchesFilters(c, f));
}

/**
 * Count how many competitors fall into EACH segment (independently), so the UI
 * can show a per-chip badge like "Loja oficial (48)". Counts are computed over
 * the full list, ignoring the currently active filters.
 */
export function countBySegment(
  competitors: UnifiedCompetitor[],
): Record<SegmentKey, number> {
  const counts: Record<SegmentKey, number> = {
    officialStore: 0,
    fulfillment: 0,
    hasCoupon: 0,
    sponsored: 0,
  };
  for (const c of competitors) {
    if (attr(c, "officialStore")) counts.officialStore += 1;
    if (attr(c, "fulfillment")) counts.fulfillment += 1;
    if (attr(c, "hasCoupon")) counts.hasCoupon += 1;
    if (attr(c, "sponsored")) counts.sponsored += 1;
  }
  return counts;
}
