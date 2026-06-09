import type { UnifiedCompetitor } from "./sources";
import type { SegmentKey } from "./competitorFilters";

/**
 * Sort options for the Radar results. "strength" is the default and preserves
 * the server's transparent market-strength ordering (the list already arrives
 * sorted that way). All other modes re-order a COPY of the list with a stable
 * tie-breaker so the output is deterministic and safe to memoize on the client.
 */
export type SortKey =
  | "strength"
  | "price_asc"
  | "price_desc"
  | "badges_desc"
  | "rating_desc";

export const DEFAULT_SORT: SortKey = "strength";

/** Human labels (PT-BR) for the sort dropdown. */
export const SORT_LABELS: Record<SortKey, string> = {
  strength: "Força de mercado",
  price_asc: "Preço: menor → maior",
  price_desc: "Preço: maior → menor",
  badges_desc: "Mais selos",
  rating_desc: "Mais avaliados",
};

/** Sort options in display order. */
export const SORT_OPTIONS: SortKey[] = [
  "strength",
  "price_asc",
  "price_desc",
  "badges_desc",
  "rating_desc",
];

const BADGE_KEYS: SegmentKey[] = [
  "officialStore",
  "fulfillment",
  "hasCoupon",
  "sponsored",
];

/** Read a numeric consensus value defensively (missing/null → null). */
function num(
  c: UnifiedCompetitor,
  key: "price" | "rating" | "totalRatings",
): number | null {
  const v = c?.[key]?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Count how many segment badges are TRUE for a competitor (cache-safe). */
export function badgeCount(c: UnifiedCompetitor): number {
  let n = 0;
  for (const k of BADGE_KEYS) {
    if (c?.[k]?.value === true) n += 1;
  }
  return n;
}

/**
 * Comparator helper that pushes `null` values to the END regardless of the
 * sort direction, so listings with unknown price/rating never crowd the top.
 * Returns a number when the nullness differs, otherwise `null` (decide later).
 */
function nullsLast(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // a goes after b
  if (b === null) return -1; // b goes after a
  return null;
}

/**
 * Sort a list of competitors by the given key WITHOUT mutating the input.
 * Uses the original index as a stable tie-breaker (and to keep the server's
 * strength order intact for "strength"). Pure + deterministic.
 */
export function sortCompetitors(
  competitors: UnifiedCompetitor[],
  key: SortKey,
): UnifiedCompetitor[] {
  // "strength" = keep incoming order (already strength-sorted by the server).
  if (key === "strength") return competitors.slice();

  const indexed = competitors.map((c, i) => ({ c, i }));

  indexed.sort((x, y) => {
    let cmp = 0;
    switch (key) {
      case "price_asc": {
        const a = num(x.c, "price");
        const b = num(y.c, "price");
        const nn = nullsLast(a, b);
        cmp = nn !== null ? nn : (a as number) - (b as number);
        break;
      }
      case "price_desc": {
        const a = num(x.c, "price");
        const b = num(y.c, "price");
        const nn = nullsLast(a, b);
        cmp = nn !== null ? nn : (b as number) - (a as number);
        break;
      }
      case "badges_desc": {
        cmp = badgeCount(y.c) - badgeCount(x.c);
        break;
      }
      case "rating_desc": {
        const a = num(x.c, "rating");
        const b = num(y.c, "rating");
        const nn = nullsLast(a, b);
        if (nn !== null) {
          cmp = nn;
        } else if ((b as number) !== (a as number)) {
          cmp = (b as number) - (a as number);
        } else {
          // Same rating → more ratings first (more reliable).
          const ta = num(x.c, "totalRatings") ?? 0;
          const tb = num(y.c, "totalRatings") ?? 0;
          cmp = tb - ta;
        }
        break;
      }
    }
    // Stable tie-breaker: original order.
    return cmp !== 0 ? cmp : x.i - y.i;
  });

  return indexed.map((e) => e.c);
}
