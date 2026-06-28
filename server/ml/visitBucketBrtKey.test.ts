import { describe, it, expect } from "vitest";
import { visitBucketBrtKey } from "./accountProvider";

/**
 * Regression test for the "o gráfico parou na quinta-feira" bug.
 *
 * Mercado Livre's daily visits endpoint returns the per-day bucket `date` in
 * two different shapes depending on the item/endpoint version:
 *   - Brazil offset: "2026-06-27T00:00:00.000-04:00"
 *   - UTC "Z":       "2026-06-27T00:00:00Z"
 *
 * In BOTH cases the bucket means the calendar day spelled in the string (the
 * 27th). The old code did a naive parse that could shift a midnight-Z bucket to
 * the PREVIOUS day, dropping the most-recent day(s) from the chart. The helper
 * must always key by the literal calendar day.
 */
describe("visitBucketBrtKey", () => {
  it("keys a UTC 'Z' midnight bucket to the SAME calendar day (not the day before)", () => {
    expect(visitBucketBrtKey("2026-06-27T00:00:00Z")).toBe("2026-06-27");
    expect(visitBucketBrtKey("2026-06-27T00:00:00.000Z")).toBe("2026-06-27");
  });

  it("keys a Brazil-offset bucket to its calendar day", () => {
    expect(visitBucketBrtKey("2026-06-01T00:00:00.000-04:00")).toBe("2026-06-01");
    expect(visitBucketBrtKey("2026-06-01T00:00:00.000-03:00")).toBe("2026-06-01");
  });

  it("handles today's bucket without rolling forward/back a day", () => {
    expect(visitBucketBrtKey("2026-06-28T00:00:00Z")).toBe("2026-06-28");
  });

  it("returns null for unusable input", () => {
    expect(visitBucketBrtKey(undefined)).toBeNull();
    expect(visitBucketBrtKey(null)).toBeNull();
    expect(visitBucketBrtKey("")).toBeNull();
    expect(visitBucketBrtKey(12345)).toBeNull();
    expect(visitBucketBrtKey("not-a-date")).toBeNull();
  });

  it("falls back to BRT calendar day for non-midnight timestamps without a date-only prefix match", () => {
    // A full ISO with time still resolves by its date portion.
    expect(visitBucketBrtKey("2026-06-27T18:30:00Z")).toBe("2026-06-27");
  });
});
