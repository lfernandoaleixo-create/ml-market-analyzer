import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SourceStatus, UnifiedSearchResult } from "@shared/sources";

/**
 * Production-resilience test.
 *
 * Reproduces the Cloud Run failure mode: `startSearch` returns immediately and
 * the instance that would run a fire-and-forget collection is GONE. We assert
 * that the FIRST `getSearch` poll (via `ensureCollected`) runs the collection
 * synchronously inside the live request and flips the row to "done".
 *
 * The persistence layer is backed by a tiny in-memory fake (no DB), and the
 * orchestrator is mocked, so the test is deterministic and offline.
 */

interface FakeRow {
  id: number;
  query: string;
  status: "pending" | "running" | "done" | "failed";
  resultCount: number;
}

const db = new Map<number, FakeRow>();
const orchestrator = { searchAllSources: vi.fn() };

vi.mock("./orchestrator", () => ({
  searchAllSources: (...a: unknown[]) => orchestrator.searchAllSources(...a),
}));

// In-memory fake of the store functions used by searchJob.
vi.mock("./searchStore", () => ({
  getSearchRow: async (_userId: number, id: number) => db.get(id) ?? null,
  markRunning: async (id: number) => {
    const r = db.get(id);
    if (r) r.status = "running";
  },
  markFailed: async (id: number) => {
    const r = db.get(id);
    if (r) r.status = "failed";
  },
  saveResult: async (id: number, result: UnifiedSearchResult) => {
    const r = db.get(id);
    if (r) {
      r.status = "done";
      r.resultCount = result.competitors.length;
    }
  },
}));

function sourceStatus(over: Partial<SourceStatus> = {}): SourceStatus {
  return { id: "oxylabs", label: "Oxylabs", configured: true, health: "ok", note: null, ...over };
}

async function loadModule() {
  vi.resetModules();
  return await import("./searchJob");
}

beforeEach(() => {
  vi.clearAllMocks();
  db.clear();
});

describe("resilient collection (Cloud Run instance loss)", () => {
  it("first poll runs the collection synchronously and finishes the row", async () => {
    // A search was created by startSearch but its background job was lost.
    db.set(100, { id: 100, query: "vareta de bambu", status: "pending", resultCount: 0 });
    orchestrator.searchAllSources.mockResolvedValue({
      query: "vareta de bambu",
      competitors: [{ matchKey: "a" }, { matchKey: "b" }] as never,
      triangulated: true,
      sourcesUsed: [sourceStatus({ health: "ok" })],
    } satisfies UnifiedSearchResult);

    const mod = await loadModule();

    // Simulate the polling endpoint's call.
    await mod.ensureCollected(1, 100);

    const row = db.get(100)!;
    expect(orchestrator.searchAllSources).toHaveBeenCalledWith("vareta de bambu");
    expect(row.status).toBe("done");
    expect(row.resultCount).toBe(2);
  });

  it("a finished row is never re-collected by a later poll", async () => {
    db.set(101, { id: 101, query: "x", status: "done", resultCount: 5 });
    const mod = await loadModule();
    await mod.ensureCollected(1, 101);
    expect(orchestrator.searchAllSources).not.toHaveBeenCalled();
  });
});
