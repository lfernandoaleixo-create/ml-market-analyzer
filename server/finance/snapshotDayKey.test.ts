import { describe, it, expect } from "vitest";
import { snapshotDayKey } from "./profitabilityService";

describe("snapshotDayKey", () => {
  it("returns an ISO YYYY-MM-DD string", () => {
    const key = snapshotDayKey(new Date("2026-06-13T15:00:00Z"));
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(key).toBe("2026-06-13");
  });

  it("uses America/Sao_Paulo day boundary (UTC-3)", () => {
    // 2026-06-14 01:00 UTC is still 2026-06-13 22:00 in São Paulo.
    const key = snapshotDayKey(new Date("2026-06-14T01:00:00Z"));
    expect(key).toBe("2026-06-13");
  });

  it("rolls to the next day correctly after the SP midnight", () => {
    // 2026-06-14 04:00 UTC is 2026-06-14 01:00 in São Paulo.
    const key = snapshotDayKey(new Date("2026-06-14T04:00:00Z"));
    expect(key).toBe("2026-06-14");
  });
});
