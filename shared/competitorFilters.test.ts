import { describe, it, expect } from "vitest";
import {
  applyFilters,
  countBySegment,
  EMPTY_FILTERS,
  matchesFilters,
  noFiltersActive,
  type SegmentFilters,
} from "./competitorFilters";
import type { UnifiedCompetitor } from "./sources";

/** Build a competitor with the four boolean attributes set as requested. */
function comp(
  flags: Partial<Record<"officialStore" | "fulfillment" | "hasCoupon" | "sponsored", boolean | null>>,
  name = "x",
): UnifiedCompetitor {
  const f = (v: boolean | null | undefined) => ({
    value: v ?? null,
    consensus: "single" as const,
    reportingCount: v == null ? 0 : 1,
    agreeingCount: v == null ? 0 : 1,
    contributions: [],
  });
  return {
    name,
    officialStore: f(flags.officialStore),
    fulfillment: f(flags.fulfillment),
    hasCoupon: f(flags.hasCoupon),
    sponsored: f(flags.sponsored),
  } as unknown as UnifiedCompetitor;
}

const filters = (over: Partial<SegmentFilters>): SegmentFilters => ({
  ...EMPTY_FILTERS,
  ...over,
});

describe("competitorFilters", () => {
  it("noFiltersActive is true only when all flags are off", () => {
    expect(noFiltersActive(EMPTY_FILTERS)).toBe(true);
    expect(noFiltersActive(filters({ hasCoupon: true }))).toBe(false);
  });

  it("returns the full list when no filter is active", () => {
    const list = [comp({ officialStore: true }), comp({ fulfillment: true })];
    expect(applyFilters(list, EMPTY_FILTERS)).toHaveLength(2);
  });

  it("single filter keeps only matching competitors", () => {
    const a = comp({ officialStore: true }, "a");
    const b = comp({ officialStore: false }, "b");
    const out = applyFilters([a, b], filters({ officialStore: true }));
    expect(out.map((c) => c.name)).toEqual(["a"]);
  });

  it("multiple filters combine with AND", () => {
    const a = comp({ officialStore: true, fulfillment: true }, "a");
    const b = comp({ officialStore: true, fulfillment: false }, "b");
    const out = applyFilters(
      [a, b],
      filters({ officialStore: true, fulfillment: true }),
    );
    expect(out.map((c) => c.name)).toEqual(["a"]);
  });

  it("treats missing/null attributes as not-in-segment (cache-safe)", () => {
    // Simulate an old cache entry with NO enrichment fields at all.
    const legacy = { name: "legacy" } as unknown as UnifiedCompetitor;
    expect(matchesFilters(legacy, filters({ officialStore: true }))).toBe(false);
    // And it should never throw.
    expect(() => applyFilters([legacy], filters({ hasCoupon: true }))).not.toThrow();
  });

  it("countBySegment counts each segment independently over the full list", () => {
    const list = [
      comp({ officialStore: true, fulfillment: true }),
      comp({ officialStore: true, hasCoupon: true }),
      comp({ sponsored: true }),
      comp({}),
    ];
    expect(countBySegment(list)).toEqual({
      officialStore: 2,
      fulfillment: 1,
      hasCoupon: 1,
      sponsored: 1,
    });
  });
});
