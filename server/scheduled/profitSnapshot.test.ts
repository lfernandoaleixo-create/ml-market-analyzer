import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks -----------------------------------------------------------------
const authenticateRequest = vi.fn();
vi.mock("../_core/sdk", () => ({
  sdk: { authenticateRequest: (req: unknown) => authenticateRequest(req) },
}));

const isBaselinkerConfigured = vi.fn();
vi.mock("../baselinker/client", () => ({
  isBaselinkerConfigured: () => isBaselinkerConfigured(),
  BaselinkerError: class BaselinkerError extends Error {
    code: string;
    constructor(code: string, msg: string) {
      super(msg);
      this.code = code;
    }
  },
}));

const listUsersWithMlCredentials = vi.fn();
vi.mock("../dbMl", () => ({
  listUsersWithMlCredentials: () => listUsersWithMlCredentials(),
}));

const captureProfitSnapshotForUser = vi.fn();
vi.mock("../finance/profitabilityService", () => ({
  captureProfitSnapshotForUser: (uid: number, days: number) =>
    captureProfitSnapshotForUser(uid, days),
}));

vi.mock("../ml/accountProvider", () => ({
  MLRateLimitError: class MLRateLimitError extends Error {},
}));

import { profitSnapshotScheduledHandler } from "./profitSnapshot";

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

describe("profitSnapshotScheduledHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isBaselinkerConfigured.mockReturnValue(true);
  });

  it("rejects non-cron callers with 403", async () => {
    authenticateRequest.mockResolvedValue({ isCron: false });
    const res = mockRes();
    await profitSnapshotScheduledHandler({} as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(captureProfitSnapshotForUser).not.toHaveBeenCalled();
  });

  it("skips when BaseLinker is not configured", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "t1" });
    isBaselinkerConfigured.mockReturnValue(false);
    const res = mockRes();
    await profitSnapshotScheduledHandler({} as any, res);
    expect(res.body.skipped).toBe("baselinker-not-configured");
    expect(listUsersWithMlCredentials).not.toHaveBeenCalled();
  });

  it("captures a snapshot for every connected user", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "t1" });
    listUsersWithMlCredentials.mockResolvedValue([10, 20]);
    captureProfitSnapshotForUser.mockImplementation(async (uid: number) => ({
      userId: uid,
      day: "2026-06-13",
      orderCount: 3,
      revenue: 100,
      netProfitSemTts: 10,
      netProfitComTts: 40,
      marginSemTts: 10,
      marginComTts: 40,
    }));
    const res = mockRes();
    await profitSnapshotScheduledHandler({} as any, res);
    expect(captureProfitSnapshotForUser).toHaveBeenCalledTimes(2);
    expect(res.body.users).toBe(2);
    expect(res.body.succeeded).toBe(2);
  });

  it("is best-effort: one user's failure does not abort the others", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "t1" });
    listUsersWithMlCredentials.mockResolvedValue([1, 2]);
    captureProfitSnapshotForUser
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        userId: 2,
        day: "2026-06-13",
        orderCount: 1,
        revenue: 50,
        netProfitSemTts: 5,
        netProfitComTts: 20,
        marginSemTts: 10,
        marginComTts: 40,
      });
    const res = mockRes();
    await profitSnapshotScheduledHandler({} as any, res);
    expect(res.body.users).toBe(2);
    expect(res.body.succeeded).toBe(1);
    const failed = res.body.results.find((r: any) => !r.ok);
    expect(failed.error).toContain("boom");
  });
});
