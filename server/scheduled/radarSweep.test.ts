import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the Radar background-sweep Heartbeat handler.
 *
 * The SDK auth, app-config lookup and the recovery routine are mocked so no
 * network/DB is touched. We verify:
 *  - non-cron requests are rejected (403 cron-only)
 *  - a foreign task uid is skipped (2xx so the platform stops retrying)
 *  - a matching/empty task uid runs the recovery and returns the count
 *  - thrown errors are JSON-encoded on 500 for the Investigate flow
 */

const auth = { authenticateRequest: vi.fn() };
const cfg = { getAppConfig: vi.fn() };
const store = { recoverStalledSearches: vi.fn() };

vi.mock("../_core/sdk", () => ({ sdk: { authenticateRequest: (...a: unknown[]) => auth.authenticateRequest(...a) } }));
vi.mock("../dbMl", () => ({ getAppConfig: (...a: unknown[]) => cfg.getAppConfig(...a) }));
vi.mock("../competitors/searchStore", () => ({
  recoverStalledSearches: (...a: unknown[]) => store.recoverStalledSearches(...a),
}));
vi.mock("../competitors/searchJob", () => ({ isInFlight: () => false }));

function makeRes() {
  const res: any = {};
  res.statusCode = 200;
  res.status = vi.fn((c: number) => {
    res.statusCode = c;
    return res;
  });
  res.json = vi.fn((b: unknown) => {
    res.body = b;
    return res;
  });
  return res;
}

async function loadHandler() {
  vi.resetModules();
  return (await import("./radarSweep")).radarSweepScheduledHandler;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.recoverStalledSearches.mockResolvedValue(0);
  cfg.getAppConfig.mockResolvedValue(undefined);
});

describe("radarSweep handler", () => {
  it("rejects a non-cron request with 403", async () => {
    auth.authenticateRequest.mockResolvedValue({ isCron: false });
    const handler = await loadHandler();
    const res = makeRes();
    await handler({ originalUrl: "/api/scheduled/radarSweep" } as never, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "cron-only" });
    expect(store.recoverStalledSearches).not.toHaveBeenCalled();
  });

  it("skips a foreign task uid without running recovery", async () => {
    auth.authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "T_other" });
    cfg.getAppConfig.mockResolvedValue({ radarSweepCronTaskUid: "T_ours" });
    const handler = await loadHandler();
    const res = makeRes();
    await handler({ originalUrl: "/x" } as never, res);
    expect(res.body).toEqual({ ok: true, skipped: "unknown-task" });
    expect(store.recoverStalledSearches).not.toHaveBeenCalled();
  });

  it("runs recovery when the task uid matches and returns the count", async () => {
    auth.authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "T_ours" });
    cfg.getAppConfig.mockResolvedValue({ radarSweepCronTaskUid: "T_ours" });
    store.recoverStalledSearches.mockResolvedValue(3);
    const handler = await loadHandler();
    const res = makeRes();
    await handler({ originalUrl: "/x" } as never, res);
    expect(store.recoverStalledSearches).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({ ok: true, recovered: 3 });
  });

  it("runs recovery when no task uid is registered yet (config empty)", async () => {
    auth.authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "T_any" });
    cfg.getAppConfig.mockResolvedValue(undefined);
    store.recoverStalledSearches.mockResolvedValue(1);
    const handler = await loadHandler();
    const res = makeRes();
    await handler({ originalUrl: "/x" } as never, res);
    expect(res.body).toEqual({ ok: true, recovered: 1 });
  });

  it("JSON-encodes errors on 500 for the Investigate flow", async () => {
    auth.authenticateRequest.mockRejectedValue(new Error("kaboom"));
    const handler = await loadHandler();
    const res = makeRes();
    await handler({ originalUrl: "/api/scheduled/radarSweep" } as never, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toContain("kaboom");
    expect(res.body.context.url).toBe("/api/scheduled/radarSweep");
  });
});
