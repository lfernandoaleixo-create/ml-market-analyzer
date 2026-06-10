import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SourceStatus, UnifiedSearchResult } from "@shared/sources";

/**
 * Tests for the background search job runner.
 *
 * Both the orchestrator (`searchAllSources`) and the persistence layer
 * (`markRunning` / `markFailed` / `saveResult`) are mocked so no network or DB
 * is touched. We verify the status lifecycle and the honest failure handling:
 *  - happy path: markRunning → saveResult (status done)
 *  - empty + no source ok → markFailed (honest "nothing collected")
 *  - empty BUT a source ran ok → saveResult (legit zero-result, not a failure)
 *  - thrown error inside collection → markFailed (never throws to caller)
 *  - in-flight guard prevents a second concurrent run for the same id
 */

const store = {
  markRunning: vi.fn(),
  markFailed: vi.fn(),
  saveResult: vi.fn(),
  getSearchRow: vi.fn(),
};
const orchestrator = {
  searchAllSources: vi.fn(),
};

vi.mock("./searchStore", () => ({
  markRunning: (...a: unknown[]) => store.markRunning(...a),
  markFailed: (...a: unknown[]) => store.markFailed(...a),
  saveResult: (...a: unknown[]) => store.saveResult(...a),
  getSearchRow: (...a: unknown[]) => store.getSearchRow(...a),
}));
vi.mock("./orchestrator", () => ({
  searchAllSources: (...a: unknown[]) => orchestrator.searchAllSources(...a),
}));

function sourceStatus(over: Partial<SourceStatus> = {}): SourceStatus {
  return {
    id: "scrapingbee",
    label: "ScrapingBee",
    configured: true,
    health: "ok",
    note: null,
    ...over,
  };
}

function result(over: Partial<UnifiedSearchResult> = {}): UnifiedSearchResult {
  return {
    query: "shampoo",
    competitors: [],
    triangulated: false,
    sourcesUsed: [sourceStatus()],
    ...over,
  };
}

async function loadModule() {
  vi.resetModules();
  return await import("./searchJob");
}

beforeEach(() => {
  vi.clearAllMocks();
  store.markRunning.mockResolvedValue(undefined);
  store.markFailed.mockResolvedValue(undefined);
  store.saveResult.mockResolvedValue(undefined);
  store.getSearchRow.mockResolvedValue(null);
});

describe("searchJob — runSearchJob", () => {
  it("happy path: marks running then saves the result (done)", async () => {
    orchestrator.searchAllSources.mockResolvedValue(
      result({
        competitors: [{ matchKey: "x" } as never],
        sourcesUsed: [sourceStatus({ health: "ok" })],
      }),
    );
    const mod = await loadModule();
    await mod.runSearchJob(1, "shampoo");

    expect(store.markRunning).toHaveBeenCalledWith(1);
    expect(store.saveResult).toHaveBeenCalledTimes(1);
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("empty result and no source ok → marks failed honestly", async () => {
    orchestrator.searchAllSources.mockResolvedValue(
      result({
        competitors: [],
        sourcesUsed: [sourceStatus({ health: "upstream" })],
      }),
    );
    const mod = await loadModule();
    await mod.runSearchJob(2, "termo raro");

    expect(store.markRunning).toHaveBeenCalledWith(2);
    expect(store.markFailed).toHaveBeenCalledTimes(1);
    expect(store.saveResult).not.toHaveBeenCalled();
  });

  it("empty result BUT a source ran ok → saves a legit zero-result", async () => {
    orchestrator.searchAllSources.mockResolvedValue(
      result({
        competitors: [],
        sourcesUsed: [sourceStatus({ health: "ok" })],
      }),
    );
    const mod = await loadModule();
    await mod.runSearchJob(3, "nicho vazio");

    expect(store.saveResult).toHaveBeenCalledTimes(1);
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("never throws to the caller when collection blows up", async () => {
    orchestrator.searchAllSources.mockRejectedValue(new Error("boom"));
    const mod = await loadModule();
    await expect(mod.runSearchJob(4, "x")).resolves.toBeUndefined();
    expect(store.markFailed).toHaveBeenCalledTimes(1);
    const note = store.markFailed.mock.calls[0][1] as string;
    expect(note).toContain("boom");
  });

  it("ensureCollected runs the collection synchronously when the row is pending", async () => {
    store.getSearchRow.mockResolvedValue({ id: 10, query: "shampoo", status: "pending" } as never);
    orchestrator.searchAllSources.mockResolvedValue(
      result({
        competitors: [{ matchKey: "x" } as never],
        sourcesUsed: [sourceStatus({ health: "ok" })],
      }),
    );
    const mod = await loadModule();
    await mod.ensureCollected(1, 10);

    expect(store.markRunning).toHaveBeenCalledWith(10);
    expect(orchestrator.searchAllSources).toHaveBeenCalledWith("shampoo");
    expect(store.saveResult).toHaveBeenCalledTimes(1);
  });

  it("ensureCollected is a no-op when the row is already done", async () => {
    store.getSearchRow.mockResolvedValue({ id: 11, query: "x", status: "done" } as never);
    const mod = await loadModule();
    await mod.ensureCollected(1, 11);

    expect(orchestrator.searchAllSources).not.toHaveBeenCalled();
    expect(store.markRunning).not.toHaveBeenCalled();
  });

  it("ensureCollected does not block when a job is already in-flight in this process", async () => {
    let resolveCollect!: (v: UnifiedSearchResult) => void;
    const gate = new Promise<UnifiedSearchResult>((res) => {
      resolveCollect = res;
    });
    orchestrator.searchAllSources.mockReturnValue(gate);
    const mod = await loadModule();

    // Start a real collection that parks on the gate.
    const running = mod.runSearchJob(20, "x");
    await Promise.resolve();
    expect(mod.isInFlight(20)).toBe(true);

    // ensureCollected for the same id returns immediately (does not await gate).
    await mod.ensureCollected(1, 20);
    // getSearchRow must NOT have been consulted (short-circuited on in-flight).
    expect(store.getSearchRow).not.toHaveBeenCalled();

    resolveCollect(
      result({
        competitors: [{ matchKey: "x" } as never],
        sourcesUsed: [sourceStatus({ health: "ok" })],
      }),
    );
    await running;
  });

  it("in-flight dedupe: concurrent runs for the same id share ONE collection", async () => {
    // Hold the collection open via a deferred promise we control.
    let resolveCollect!: (v: UnifiedSearchResult) => void;
    const gate = new Promise<UnifiedSearchResult>((res) => {
      resolveCollect = res;
    });
    orchestrator.searchAllSources.mockReturnValue(gate);
    const mod = await loadModule();

    // Launch the first run; it parks on `gate` after calling markRunning.
    const first = mod.runSearchJob(5, "x");
    // Let the microtask queue flush so markRunning + the await on gate happen.
    await Promise.resolve();
    expect(mod.isInFlight(5)).toBe(true);

    // A second concurrent run for the same id reuses the SAME promise — it must
    // NOT start a second collection.
    const second = mod.runSearchJob(5, "x");
    expect(orchestrator.searchAllSources).toHaveBeenCalledTimes(1);

    // Now release the collection and let both settle together.
    resolveCollect(
      result({
        competitors: [{ matchKey: "x" } as never],
        sourcesUsed: [sourceStatus({ health: "ok" })],
      }),
    );
    await Promise.all([first, second]);

    expect(orchestrator.searchAllSources).toHaveBeenCalledTimes(1);
    expect(store.saveResult).toHaveBeenCalledTimes(1);
    expect(mod.isInFlight(5)).toBe(false);
  });
});
