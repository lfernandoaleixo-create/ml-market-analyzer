import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the `account.activeListings` procedure SWR (non-blocking) contract.
 *
 * Why this matters: in production (Cloud Run cold start) the full assembly of
 * active listings (item ids -> details -> SKUs -> costs) can take longer than
 * the 180s request timeout, which surfaced to the user as "conexão
 * interrompida" (a 502). The procedure was converted to a non-blocking
 * stale-while-revalidate read:
 *   - cold start returns { ready: false, status: "loading" } in milliseconds
 *     and kicks the heavy assembly off in the BACKGROUND;
 *   - once the background load lands, the next call returns { ready: true, ... }
 *     with the full payload.
 *
 * We mock buildActiveListings + the account resolution so there is no network,
 * and assert the contract above.
 */

const buildActiveListings = vi.fn();

vi.mock("../ml/activeListings", () => ({
  buildActiveListings: (uid: number, account: unknown, opts: unknown) =>
    buildActiveListings(uid, account, opts),
}));

// Account resolution must be inert (no ML token / network / DB).
vi.mock("../ml/oauthMl", () => ({
  ensureUserAccessToken: vi.fn(async () => "fake-token"),
  forceRefreshUserAccessToken: vi.fn(async () => "fake-token"),
}));
vi.mock("../dbMl", () => ({
  getCredentials: vi.fn(async () => ({ mlUserId: "123456" })),
  upsertCredentials: vi.fn(async () => undefined),
  resolveMlOwnerUserId: vi.fn(async (userId: number) => userId),
}));
vi.mock("../ml/resolveMlUserId", () => ({
  resolveMlUserId: vi.fn(async () => ({ mlUserId: "123456", source: "db" })),
}));
vi.mock("../ml/accountProvider", () => ({
  AccountProvider: class {
    constructor() {}
  },
  MLRateLimitError: class extends Error {},
}));

function protectedContext() {
  return {
    user: { id: 4242, role: "user" },
    req: { protocol: "https", headers: { cookie: "" } },
    res: {},
  } as never;
}

async function makeCaller() {
  const { appRouter } = await import("../routers");
  return appRouter.createCaller(protectedContext());
}

const PAYLOAD = {
  summary: {
    totalActive: 2,
    withCost: 2,
    withoutCost: 0,
    totalRealProfit: 100,
    totalStockValue: 500,
    baselinkerConfigured: true,
  },
  items: [
    { itemId: "MLB1", title: "A", price: 10, stockValue: 100, cost: 5, realProfit: 50, targetPrices: {} },
    { itemId: "MLB2", title: "B", price: 20, stockValue: 400, cost: 8, realProfit: 50, targetPrices: {} },
  ],
  margins: [20, 30, 40],
};

/** Poll the procedure until it reports ready (background load landed). */
async function waitReady(caller: Awaited<ReturnType<typeof makeCaller>>, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const r = await caller.account.activeListings({ margins: [20, 30, 40], taxPercent: 5.93 });
    if (r.ready) return r;
    await new Promise((res) => setTimeout(res, 10));
  }
  throw new Error("activeListings never became ready");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("account.activeListings (non-blocking SWR contract)", () => {
  it("cold start returns ready:false (loading) WITHOUT waiting for the assembly", async () => {
    // A slow loader: if the procedure awaited it, the call would hang.
    buildActiveListings.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(PAYLOAD), 200)),
    );
    const caller = await makeCaller();

    const started = Date.now();
    const first = await caller.account.activeListings({ margins: [20, 30, 40], taxPercent: 5.93 });
    const elapsed = Date.now() - started;

    expect(first.ready).toBe(false);
    if (first.ready === false) {
      expect(first.status).toBe("loading");
    }
    // Returned promptly — it did NOT block on the 200ms loader.
    expect(elapsed).toBeLessThan(150);
  });

  it("returns ready:true with the full payload once the background load lands", async () => {
    buildActiveListings.mockResolvedValue(PAYLOAD);
    const caller = await makeCaller();

    const ready = await waitReady(caller);
    expect(ready.ready).toBe(true);
    if (ready.ready) {
      expect(ready.items).toHaveLength(2);
      expect(ready.summary.totalActive).toBe(2);
      expect(ready.stale).toBe(false);
    }
  });

  it("dedupes concurrent cold-start calls into a single assembly", async () => {
    buildActiveListings.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(PAYLOAD), 50)),
    );
    const caller = await makeCaller();
    // Distinct margins → a FRESH cache key, so this test is independent of the
    // entries the previous tests populated (the SWR cache is process-local).
    const input = { margins: [11, 22, 33] as number[], taxPercent: 7 };

    // Fire several calls at once (mimics the page mounting + a quick poll).
    await Promise.all([
      caller.account.activeListings(input),
      caller.account.activeListings(input),
      caller.account.activeListings(input),
    ]);
    // Poll the SAME key until the background load lands.
    for (let i = 0; i < 20; i++) {
      const r = await caller.account.activeListings(input);
      if (r.ready) break;
      await new Promise((res) => setTimeout(res, 10));
    }

    // Despite multiple callers, the heavy assembly ran once (SWR de-dupe).
    expect(buildActiveListings).toHaveBeenCalledTimes(1);
  });
});
