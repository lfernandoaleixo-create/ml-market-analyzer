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
};
const orchestrator = {
  searchAllSources: vi.fn(),
};

vi.mock("./searchStore", () => ({
  markRunning: (...a: unknown[]) => store.markRunning(...a),
  markFailed: (...a: unknown[]) => store.markFailed(...a),
  saveResult: (...a: unknown[]) => store.saveResult(...a),
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

  it("in-flight guard: a second concurrent run for the same id is a no-op", async () => {
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

    // A second concurrent run for the same id must bail out immediately.
    await mod.runSearchJob(5, "x");
    expect(orchestrator.searchAllSources).toHaveBeenCalledTimes(1);

    // Now release the first run and let it settle.
    resolveCollect(
      result({
        competitors: [{ matchKey: "x" } as never],
        sourcesUsed: [sourceStatus({ health: "ok" })],
      }),
    );
    await first;

    expect(orchestrator.searchAllSources).toHaveBeenCalledTimes(1);
    expect(store.saveResult).toHaveBeenCalledTimes(1);
    expect(mod.isInFlight(5)).toBe(false);
  });
});
