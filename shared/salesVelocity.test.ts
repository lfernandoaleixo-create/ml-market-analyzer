import { describe, expect, it } from "vitest";
import { computeVelocityWindow, computeSalesVelocity, formatVelocity } from "./salesVelocity";

const DAY = 24 * 60 * 60 * 1000;

describe("computeVelocityWindow", () => {
  it("returns unavailable with fewer than two real points", () => {
    const now = 1_000 * DAY;
    const w = computeVelocityWindow([{ capturedAt: now, soldQuantity: 100 }], 7, now);
    expect(w.available).toBe(false);
    expect(w.salesInWindow).toBe(0);
  });

  it("measures sales accumulated in a 7-day window using the baseline before window start", () => {
    const now = 1_000 * DAY;
    const snaps = [
      { capturedAt: now - 30 * DAY, soldQuantity: 500 },
      { capturedAt: now - 7 * DAY, soldQuantity: 800 }, // baseline at window start
      { capturedAt: now, soldQuantity: 920 },
    ];
    const w = computeVelocityWindow(snaps, 7, now);
    expect(w.available).toBe(true);
    expect(w.salesInWindow).toBe(120); // 920 - 800
    expect(w.measuredDays).toBeCloseTo(7, 1);
    expect(w.salesPerDay).toBeCloseTo(120 / 7, 1);
  });

  it("uses the earliest point when no point is old enough but span is meaningful", () => {
    const now = 1_000 * DAY;
    const snaps = [
      { capturedAt: now - 3 * DAY, soldQuantity: 200 },
      { capturedAt: now, soldQuantity: 260 },
    ];
    const w = computeVelocityWindow(snaps, 7, now);
    expect(w.available).toBe(true);
    expect(w.salesInWindow).toBe(60);
    expect(w.measuredDays).toBeCloseTo(3, 1);
  });

  it("clamps negative deltas to zero (counter reset/rounding)", () => {
    const now = 1_000 * DAY;
    const snaps = [
      { capturedAt: now - 8 * DAY, soldQuantity: 900 },
      { capturedAt: now, soldQuantity: 850 },
    ];
    const w = computeVelocityWindow(snaps, 7, now);
    expect(w.salesInWindow).toBe(0);
  });

  it("ignores points without a real sold value", () => {
    const now = 1_000 * DAY;
    const snaps = [
      { capturedAt: now - 10 * DAY, soldQuantity: null },
      { capturedAt: now - 8 * DAY, soldQuantity: 100 },
      { capturedAt: now, soldQuantity: 180 },
    ];
    const w = computeVelocityWindow(snaps, 7, now);
    expect(w.available).toBe(true);
    expect(w.salesInWindow).toBe(80);
  });
});

describe("computeSalesVelocity + formatVelocity", () => {
  it("computes 7 and 30 day windows and flags real sales", () => {
    const now = 1_000 * DAY;
    const snaps = [
      { capturedAt: now - 30 * DAY, soldQuantity: 100 },
      { capturedAt: now - 7 * DAY, soldQuantity: 300 },
      { capturedAt: now, soldQuantity: 420 },
    ];
    const v = computeSalesVelocity(snaps, now);
    expect(v.last7.available).toBe(true);
    expect(v.last7.salesInWindow).toBe(120);
    expect(v.last30.available).toBe(true);
    expect(v.last30.salesInWindow).toBe(320);
    expect(v.hasAnyRealSales).toBe(true);
  });

  it("formats an available window and a missing one", () => {
    const now = 1_000 * DAY;
    const ok = computeVelocityWindow(
      [
        { capturedAt: now - 7 * DAY, soldQuantity: 100 },
        { capturedAt: now, soldQuantity: 170 },
      ],
      7,
      now,
    );
    expect(formatVelocity(ok)).toContain("+70 em 7 d");
    expect(formatVelocity({ windowDays: 7, available: false, salesInWindow: 0, salesPerDay: 0, measuredDays: 0 })).toBe("—");
  });
});
