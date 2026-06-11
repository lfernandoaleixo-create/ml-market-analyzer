import { describe, it, expect } from "vitest";
import { isoToWeekdayShort, isoToDayNum, isoToWeekdayLong } from "../client/src/lib/format";

describe("date weekday helpers (UTC, pt-BR)", () => {
  it("isoToWeekdayShort returns short weekday without trailing dot", () => {
    expect(isoToWeekdayShort("2026-06-10")).toBe("qua");
    expect(isoToWeekdayShort("2026-06-11")).toBe("qui");
  });

  it("isoToDayNum returns the day-of-month as a string", () => {
    expect(isoToDayNum("2026-06-10")).toBe("10");
    expect(isoToDayNum("2026-06-01")).toBe("1");
  });

  it("isoToWeekdayLong returns capitalized weekday + dd/mm", () => {
    expect(isoToWeekdayLong("2026-06-10")).toBe("Quarta-feira, 10/06");
    expect(isoToWeekdayLong("2026-06-11")).toBe("Quinta-feira, 11/06");
  });

  it("does not drift across timezones (uses UTC)", () => {
    expect(isoToDayNum("2026-01-01")).toBe("1");
    expect(isoToWeekdayShort("2026-01-01")).toBe("qui");
  });

  it("returns safe fallbacks for malformed input", () => {
    expect(isoToWeekdayShort("")).toBe("");
    expect(isoToDayNum("abc")).toBe("");
    expect(isoToWeekdayLong("not-a-date")).toBe("not-a-date");
  });
});
