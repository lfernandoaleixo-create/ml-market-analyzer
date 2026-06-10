import { describe, it, expect } from "vitest";
import {
  brtParts,
  brtStartOfDayMs,
  brtEndOfDayMs,
  currentMonthRange,
  currentMonthFullRange,
  previousMonthRange,
  monthRange,
  lastNMonthsRange,
  dayRangeFromIso,
  customRangeFromIso,
  isoDateBrt,
  monthStartIsoBrt,
  lastDayOfMonth,
} from "./period";

// A fixed instant: 2026-06-10 12:00 BRT == 2026-06-10 15:00 UTC.
const JUN_10_2026_BRT_NOON = Date.UTC(2026, 5, 10, 15, 0, 0, 0);

describe("brtParts", () => {
  it("reads BRT wall-clock parts from a UTC instant", () => {
    expect(brtParts(JUN_10_2026_BRT_NOON)).toEqual({ year: 2026, month: 5, day: 10 });
  });

  it("rolls back a day for instants before 03:00 UTC (still previous BRT day)", () => {
    // 2026-06-10 01:00 UTC == 2026-06-09 22:00 BRT.
    const earlyUtc = Date.UTC(2026, 5, 10, 1, 0, 0, 0);
    expect(brtParts(earlyUtc)).toEqual({ year: 2026, month: 5, day: 9 });
  });
});

describe("brt day boundaries", () => {
  it("start of day is 03:00 UTC of the same calendar day", () => {
    expect(brtStartOfDayMs(2026, 5, 10)).toBe(Date.UTC(2026, 5, 10, 3, 0, 0, 0));
  });

  it("end of day is 02:59:59.999 UTC of the NEXT day", () => {
    // 23:59:59.999 BRT == 02:59:59.999 UTC next day.
    expect(brtEndOfDayMs(2026, 5, 10)).toBe(Date.UTC(2026, 5, 11, 2, 59, 59, 999));
  });
});

describe("lastDayOfMonth", () => {
  it("handles 30/31 day months and leap February", () => {
    expect(lastDayOfMonth(2026, 4)).toBe(31); // May
    expect(lastDayOfMonth(2026, 3)).toBe(30); // April
    expect(lastDayOfMonth(2024, 1)).toBe(29); // Feb leap
    expect(lastDayOfMonth(2026, 1)).toBe(28); // Feb non-leap
  });
});

describe("currentMonthRange", () => {
  it("starts at the first BRT day of the month and ends at now", () => {
    const r = currentMonthRange(JUN_10_2026_BRT_NOON);
    expect(r.fromMs).toBe(brtStartOfDayMs(2026, 5, 1));
    expect(r.toMs).toBe(JUN_10_2026_BRT_NOON);
  });
});

describe("previousMonthRange", () => {
  it("covers the full previous calendar month (May 2026)", () => {
    const r = previousMonthRange(JUN_10_2026_BRT_NOON);
    expect(r.fromMs).toBe(brtStartOfDayMs(2026, 4, 1));
    expect(r.toMs).toBe(brtEndOfDayMs(2026, 4, 31));
  });

  it("wraps the year at January (Jan -> previous Dec)", () => {
    const jan2027 = Date.UTC(2027, 0, 5, 15, 0, 0, 0); // 2027-01-05 12:00 BRT
    const r = previousMonthRange(jan2027);
    expect(r.fromMs).toBe(brtStartOfDayMs(2026, 11, 1));
    expect(r.toMs).toBe(brtEndOfDayMs(2026, 11, 31));
  });
});

describe("monthRange / dayRange / customRange", () => {
  it("monthRange covers the whole month", () => {
    const r = monthRange(2026, 4); // May
    expect(r.fromMs).toBe(brtStartOfDayMs(2026, 4, 1));
    expect(r.toMs).toBe(brtEndOfDayMs(2026, 4, 31));
  });

  it("dayRangeFromIso returns a single inclusive day", () => {
    const r = dayRangeFromIso("2026-06-10")!;
    expect(r.fromMs).toBe(brtStartOfDayMs(2026, 5, 10));
    expect(r.toMs).toBe(brtEndOfDayMs(2026, 5, 10));
  });

  it("dayRangeFromIso rejects malformed input", () => {
    expect(dayRangeFromIso("")).toBeNull();
    expect(dayRangeFromIso("2026-06")).toBeNull();
  });

  it("customRangeFromIso spans from start of first day to end of last day", () => {
    const r = customRangeFromIso("2026-06-01", "2026-06-10")!;
    expect(r.fromMs).toBe(brtStartOfDayMs(2026, 5, 1));
    expect(r.toMs).toBe(brtEndOfDayMs(2026, 5, 10));
  });
});

describe("iso helpers", () => {
  it("isoDateBrt formats the BRT calendar day", () => {
    expect(isoDateBrt(JUN_10_2026_BRT_NOON)).toBe("2026-06-10");
  });

  it("monthStartIsoBrt formats the first BRT day of the month", () => {
    expect(monthStartIsoBrt(JUN_10_2026_BRT_NOON)).toBe("2026-06-01");
  });
});

describe("lastNMonthsRange", () => {
  it("spans the last 2 calendar months ending at now (Jun 10 => May 1..now)", () => {
    const r = lastNMonthsRange(JUN_10_2026_BRT_NOON, 2);
    // Starts at May 1 00:00 BRT.
    expect(r.fromMs).toBe(brtStartOfDayMs(2026, 4, 1));
    // Ends exactly at the provided "now" instant.
    expect(r.toMs).toBe(JUN_10_2026_BRT_NOON);
  });

  it("handles year boundary (Jan with N=2 => previous Dec)", () => {
    // 2026-01-10 12:00 BRT == 2026-01-10 15:00 UTC.
    const jan = Date.UTC(2026, 0, 10, 15, 0, 0, 0);
    const r = lastNMonthsRange(jan, 2);
    expect(r.fromMs).toBe(brtStartOfDayMs(2025, 11, 1));
    expect(r.toMs).toBe(jan);
  });

  it("N=1 starts at the first day of the current month", () => {
    const r = lastNMonthsRange(JUN_10_2026_BRT_NOON, 1);
    expect(r.fromMs).toBe(brtStartOfDayMs(2026, 5, 1));
  });

  it("clamps N below 1 to a single month", () => {
    const r = lastNMonthsRange(JUN_10_2026_BRT_NOON, 0);
    expect(r.fromMs).toBe(brtStartOfDayMs(2026, 5, 1));
  });
});

describe("currentMonthFullRange", () => {
  it("spans the whole current month (day 1 .. last day) regardless of 'now'", () => {
    const r = currentMonthFullRange(JUN_10_2026_BRT_NOON);
    expect(r.fromMs).toBe(brtStartOfDayMs(2026, 5, 1));
    // June has 30 days; end is 30th 23:59:59.999 BRT.
    expect(r.toMs).toBe(brtEndOfDayMs(2026, 5, 30));
    // The end is strictly after "now" (the month is still in progress).
    expect(r.toMs).toBeGreaterThan(JUN_10_2026_BRT_NOON);
  });

  it("respects month length (February 2025 => 28 days)", () => {
    const feb = Date.UTC(2025, 1, 10, 15, 0, 0, 0);
    const r = currentMonthFullRange(feb);
    expect(r.fromMs).toBe(brtStartOfDayMs(2025, 1, 1));
    expect(r.toMs).toBe(brtEndOfDayMs(2025, 1, 28));
  });
});
