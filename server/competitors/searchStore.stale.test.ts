import { describe, it, expect } from "vitest";
import { isStalled, STALE_JOB_MS } from "./searchStore";

/**
 * Pure-logic tests for stalled-job detection. No DB is touched: `isStalled`
 * decides, for a given status + last-update instant, whether a collection is
 * orphaned (server restarted mid-run) and should be recovered.
 */
describe("searchStore — isStalled", () => {
  const now = 1_000_000_000_000;

  it("returns false for finished states regardless of age", () => {
    expect(isStalled("done", now - STALE_JOB_MS - 1, now)).toBe(false);
    expect(isStalled("failed", now - STALE_JOB_MS - 1, now)).toBe(false);
  });

  it("returns false for fresh pending/running jobs (within the window)", () => {
    expect(isStalled("pending", now - 1000, now)).toBe(false);
    expect(isStalled("running", now - (STALE_JOB_MS - 1), now)).toBe(false);
  });

  it("returns true for pending/running jobs older than the window", () => {
    expect(isStalled("pending", now - STALE_JOB_MS - 1, now)).toBe(true);
    expect(isStalled("running", now - STALE_JOB_MS - 1000, now)).toBe(true);
  });

  it("is exclusive at exactly the boundary (not yet stalled)", () => {
    expect(isStalled("running", now - STALE_JOB_MS, now)).toBe(false);
  });
});
