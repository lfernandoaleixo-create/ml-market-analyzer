import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  readVisits,
  putVisit,
  ensureCollecting,
  __clearVisitsStore,
} from "./visitsStore";

const USER = 4242;
const WINDOW = 30;

function flush(ms = 0) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("visitsStore", () => {
  beforeEach(() => {
    __clearVisitsStore();
  });

  it("reports everything pending on a cold read (nothing collected yet)", () => {
    const snap = readVisits(USER, WINDOW, ["A", "B", "C"]);
    expect(snap.resolved).toBe(0);
    expect(snap.attempted).toBe(3);
    expect(snap.map.size).toBe(0);
    expect(snap.collecting).toBe(false);
  });

  it("returns the collected partial and counts resolved correctly", () => {
    putVisit(USER, WINDOW, "A", 12);
    putVisit(USER, WINDOW, "B", 0); // a genuine zero is still a resolved answer
    const snap = readVisits(USER, WINDOW, ["A", "B", "C"]);
    expect(snap.resolved).toBe(2);
    expect(snap.attempted).toBe(3);
    expect(snap.map.get("A")).toBe(12);
    expect(snap.map.get("B")).toBe(0);
    expect(snap.map.has("C")).toBe(false);
  });

  it("never loses data already collected for another user/window key", () => {
    putVisit(USER, WINDOW, "A", 5);
    putVisit(USER, 7, "A", 99); // different window
    putVisit(999, WINDOW, "A", 1); // different user
    expect(readVisits(USER, WINDOW, ["A"]).map.get("A")).toBe(5);
    expect(readVisits(USER, 7, ["A"]).map.get("A")).toBe(99);
    expect(readVisits(999, WINDOW, ["A"]).map.get("A")).toBe(1);
  });

  it("collects missing items in the background and persists progress item-by-item", async () => {
    const ids = ["A", "B", "C", "D"];
    const fetchOne = vi.fn(async (id: string) => {
      // C fails (ML 429/timeout) → must be retried later, not stored as 0
      if (id === "C") return null;
      return id.charCodeAt(0); // deterministic per id
    });

    ensureCollecting(USER, WINDOW, ids, fetchOne, { concurrency: 2 });
    // Let the detached batches finish.
    await flush(20);

    const snap = readVisits(USER, WINDOW, ids);
    expect(fetchOne).toHaveBeenCalledTimes(4);
    expect(snap.map.get("A")).toBe("A".charCodeAt(0));
    expect(snap.map.get("D")).toBe("D".charCodeAt(0));
    // The failed item is NOT stored (absent => pending, not a fake zero).
    expect(snap.map.has("C")).toBe(false);
    expect(snap.resolved).toBe(3);
    expect(snap.collecting).toBe(false);
  });

  it("dedupes concurrent collections (only one run at a time)", async () => {
    const ids = ["A", "B"];
    let active = 0;
    let maxActive = 0;
    const fetchOne = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await flush(10);
      active -= 1;
      return 1;
    });

    // Fire three collections back-to-back; the 2nd/3rd must be ignored while the
    // first is still in flight.
    ensureCollecting(USER, WINDOW, ids, fetchOne, { concurrency: 2 });
    ensureCollecting(USER, WINDOW, ids, fetchOne, { concurrency: 2 });
    ensureCollecting(USER, WINDOW, ids, fetchOne, { concurrency: 2 });
    await flush(40);

    // Only the first run's two fetches should have happened.
    expect(fetchOne).toHaveBeenCalledTimes(2);
  });

  it("re-fetches only the still-missing items on a subsequent run", async () => {
    putVisit(USER, WINDOW, "A", 7); // already have A
    const fetchOne = vi.fn(async (id: string) => id.length);
    ensureCollecting(USER, WINDOW, ["A", "B"], fetchOne, { concurrency: 2 });
    await flush(20);
    // A was fresh → only B is fetched.
    expect(fetchOne).toHaveBeenCalledTimes(1);
    expect(fetchOne).toHaveBeenCalledWith("B");
  });
});
