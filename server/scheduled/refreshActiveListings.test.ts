import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks -----------------------------------------------------------------
const authenticateRequest = vi.fn();
vi.mock("../_core/sdk", () => ({
  sdk: { authenticateRequest: (req: unknown) => authenticateRequest(req) },
}));

const listUsersWithMlCredentials = vi.fn();
vi.mock("../dbMl", () => ({
  listUsersWithMlCredentials: () => listUsersWithMlCredentials(),
}));

const resolveAccount = vi.fn();
vi.mock("../routers/account", () => ({
  resolveAccount: (uid: number) => resolveAccount(uid),
}));

const buildActiveListings = vi.fn();
vi.mock("../ml/activeListings", () => ({
  buildActiveListings: (uid: number, account: unknown, opts: unknown) =>
    buildActiveListings(uid, account, opts),
}));

vi.mock("../ml/accountProvider", () => ({
  MLRateLimitError: class MLRateLimitError extends Error {},
}));

import { refreshActiveListingsScheduledHandler } from "./refreshActiveListings";
import { MLRateLimitError } from "../ml/accountProvider";

function mockRes() {
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

function builtFor(active: number, withCost: number) {
  return {
    summary: {
      totalActive: active,
      withCost,
      withoutCost: active - withCost,
      totalRealProfit: 0,
      totalStockValue: 0,
      windowDays: 30,
      baselinkerConfigured: true,
      lastSyncIso: null,
    },
    items: [],
    margins: [20, 30, 40],
  };
}

describe("refreshActiveListingsScheduledHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAccount.mockResolvedValue({} as unknown);
  });

  it("rejects non-cron callers with 403", async () => {
    authenticateRequest.mockResolvedValue({ isCron: false });
    const res = mockRes();
    await refreshActiveListingsScheduledHandler({} as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(buildActiveListings).not.toHaveBeenCalled();
  });

  it("rejects cron callers without taskUid with 403", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true });
    const res = mockRes();
    await refreshActiveListingsScheduledHandler({} as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(listUsersWithMlCredentials).not.toHaveBeenCalled();
  });

  it("warms active listings for every connected user", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "t1" });
    listUsersWithMlCredentials.mockResolvedValue([10, 20]);
    buildActiveListings.mockImplementation(async (uid: number) =>
      builtFor(uid === 10 ? 27 : 5, uid === 10 ? 20 : 3),
    );
    const res = mockRes();
    await refreshActiveListingsScheduledHandler({} as any, res);
    expect(buildActiveListings).toHaveBeenCalledTimes(2);
    expect(res.body.users).toBe(2);
    expect(res.body.succeeded).toBe(2);
    const first = res.body.results.find((r: any) => r.userId === 10);
    expect(first.active).toBe(27);
    expect(first.withCost).toBe(20);
  });

  it("is best-effort: one user's failure does not abort the others", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "t1" });
    listUsersWithMlCredentials.mockResolvedValue([1, 2]);
    buildActiveListings
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(builtFor(3, 1));
    const res = mockRes();
    await refreshActiveListingsScheduledHandler({} as any, res);
    expect(res.body.users).toBe(2);
    expect(res.body.succeeded).toBe(1);
    const failed = res.body.results.find((r: any) => !r.ok);
    expect(failed.error).toContain("boom");
  });

  it("maps a Mercado Livre rate limit to a friendly marker", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "t1" });
    listUsersWithMlCredentials.mockResolvedValue([7]);
    buildActiveListings.mockRejectedValueOnce(new MLRateLimitError("429"));
    const res = mockRes();
    await refreshActiveListingsScheduledHandler({} as any, res);
    const r = res.body.results[0];
    expect(r.ok).toBe(false);
    expect(r.error).toBe("ml-rate-limited");
  });

  it("returns 500 with a JSON-encoded error when auth throws", async () => {
    authenticateRequest.mockRejectedValue(new Error("auth-down"));
    const res = mockRes();
    await refreshActiveListingsScheduledHandler({ originalUrl: "/api/scheduled/refreshActiveListings" } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body.error).toContain("auth-down");
  });
});
