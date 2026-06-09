import { describe, it, expect } from "vitest";
import { sortCompetitors, badgeCount, type SortKey } from "./competitorSort";
import type { UnifiedCompetitor } from "./sources";

/** Minimal builder: only the fields the sorter actually reads. */
function comp(
  name: string,
  opts: {
    price?: number | null;
    rating?: number | null;
    totalRatings?: number | null;
    officialStore?: boolean;
    fulfillment?: boolean;
    hasCoupon?: boolean;
    sponsored?: boolean;
  } = {},
): UnifiedCompetitor {
  const fc = <T>(value: T | null) => ({
    value,
    consensus: "single" as const,
    reportingCount: value === null ? 0 : 1,
    agreeingCount: value === null ? 0 : 1,
    contributions: [] as Array<{ source: never; value: T }>,
  });
  return {
    matchKey: name,
    name,
    url: null,
    thumbnail: null,
    price: fc(opts.price ?? null),
    listingPrice: fc(null),
    rating: fc(opts.rating ?? null),
    totalRatings: fc(opts.totalRatings ?? null),
    brand: fc(null),
    freeShipping: fc(null),
    sellerReputation: fc(null),
    officialStore: fc(opts.officialStore ?? null),
    fulfillment: fc(opts.fulfillment ?? null),
    hasCoupon: fc(opts.hasCoupon ?? null),
    sponsored: fc(opts.sponsored ?? null),
    sources: [],
    overallConsensus: "single",
  } as UnifiedCompetitor;
}

const names = (list: UnifiedCompetitor[]) => list.map((c) => c.name);

describe("badgeCount", () => {
  it("counts only TRUE attributes and tolerates missing fields", () => {
    expect(badgeCount(comp("a", { officialStore: true, hasCoupon: true }))).toBe(2);
    expect(badgeCount(comp("b"))).toBe(0);
    // Cache-safe: an object missing the attribute fields must not throw.
    expect(badgeCount({ name: "old" } as unknown as UnifiedCompetitor)).toBe(0);
  });
});

describe("sortCompetitors", () => {
  const base = [
    comp("A", { price: 30, rating: 4.0, totalRatings: 10, officialStore: true }),
    comp("B", { price: 10, rating: 5.0, totalRatings: 2 }),
    comp("C", { price: null, rating: 5.0, totalRatings: 100, fulfillment: true, hasCoupon: true }),
  ];

  it("strength: returns a copy in the original order (non-mutating)", () => {
    const out = sortCompetitors(base, "strength");
    expect(names(out)).toEqual(["A", "B", "C"]);
    expect(out).not.toBe(base);
  });

  it("price_asc: ascending price, nulls last", () => {
    expect(names(sortCompetitors(base, "price_asc"))).toEqual(["B", "A", "C"]);
  });

  it("price_desc: descending price, nulls still last", () => {
    expect(names(sortCompetitors(base, "price_desc"))).toEqual(["A", "B", "C"]);
  });

  it("badges_desc: more badges first, stable on ties", () => {
    expect(names(sortCompetitors(base, "badges_desc"))).toEqual(["C", "A", "B"]);
  });

  it("rating_desc: higher rating first; ties broken by totalRatings", () => {
    // B and C both 5.0 → C (100 ratings) before B (2); A (4.0) last.
    expect(names(sortCompetitors(base, "rating_desc"))).toEqual(["C", "B", "A"]);
  });

  it("does not mutate the input array", () => {
    const snapshot = names(base);
    sortCompetitors(base, "price_asc");
    expect(names(base)).toEqual(snapshot);
  });

  it("is deterministic for unknown-but-typed keys (defensive)", () => {
    const out = sortCompetitors(base, "strength" as SortKey);
    expect(out).toHaveLength(3);
  });
});
