import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the background-sweep schedule procedures (getSweepSchedule /
 * setSweepSchedule). The DB layer (app config) and the Heartbeat SDK are
 * mocked, so we assert the lifecycle wiring without any network/DB:
 *  - getSweepSchedule reflects whether a task uid is stored
 *  - enabling with no existing uid → createHeartbeatJob + persist uid
 *  - enabling with an existing uid → updateHeartbeatJob (no new job)
 *  - disabling with an existing uid → deleteHeartbeatJob + clear uid
 */

const db = { getAppConfig: vi.fn(), upsertAppConfig: vi.fn() };
const hb = {
  createHeartbeatJob: vi.fn(),
  updateHeartbeatJob: vi.fn(),
  deleteHeartbeatJob: vi.fn(),
};

vi.mock("../dbMl", () => ({
  getAppConfig: (...a: unknown[]) => db.getAppConfig(...a),
  upsertAppConfig: (...a: unknown[]) => db.upsertAppConfig(...a),
}));
vi.mock("../_core/heartbeat", () => ({
  createHeartbeatJob: (...a: unknown[]) => hb.createHeartbeatJob(...a),
  updateHeartbeatJob: (...a: unknown[]) => hb.updateHeartbeatJob(...a),
  deleteHeartbeatJob: (...a: unknown[]) => hb.deleteHeartbeatJob(...a),
}));
// Keep the source orchestrator/clients inert (they read env on import).
vi.mock("../competitors/orchestrator", () => ({
  getSourcesStatus: vi.fn(),
  searchAllSources: vi.fn(),
}));

function protectedContext() {
  return {
    user: { id: 1, role: "user" },
    req: { protocol: "https", headers: { cookie: "" } },
    res: {},
  } as never;
}

async function makeCaller() {
  vi.resetModules();
  const { appRouter } = await import("../routers");
  return appRouter.createCaller(protectedContext());
}

beforeEach(() => {
  vi.clearAllMocks();
  db.upsertAppConfig.mockResolvedValue(undefined);
});

describe("competitors.getSweepSchedule", () => {
  it("reports disabled when no task uid is stored", async () => {
    db.getAppConfig.mockResolvedValue({ radarSweepCronTaskUid: null });
    const caller = await makeCaller();
    const res = await caller.competitors.getSweepSchedule();
    expect(res).toEqual({ enabled: false, taskUid: null });
  });

  it("reports enabled when a task uid is stored", async () => {
    db.getAppConfig.mockResolvedValue({ radarSweepCronTaskUid: "T_123" });
    const caller = await makeCaller();
    const res = await caller.competitors.getSweepSchedule();
    expect(res).toEqual({ enabled: true, taskUid: "T_123" });
  });
});

describe("competitors.setSweepSchedule", () => {
  it("creates a new job and persists the uid when enabling fresh", async () => {
    db.getAppConfig.mockResolvedValue({ radarSweepCronTaskUid: null });
    hb.createHeartbeatJob.mockResolvedValue({ taskUid: "T_new" });
    const caller = await makeCaller();

    const res = await caller.competitors.setSweepSchedule({ enabled: true });

    expect(hb.createHeartbeatJob).toHaveBeenCalledTimes(1);
    const jobArg = hb.createHeartbeatJob.mock.calls[0][0] as { path: string };
    expect(jobArg.path).toBe("/api/scheduled/radarSweep");
    expect(db.upsertAppConfig).toHaveBeenCalledWith({ radarSweepCronTaskUid: "T_new" });
    expect(res).toEqual({ enabled: true, taskUid: "T_new" });
  });

  it("updates the existing job (no new job) when already enabled", async () => {
    db.getAppConfig.mockResolvedValue({ radarSweepCronTaskUid: "T_exist" });
    const caller = await makeCaller();

    const res = await caller.competitors.setSweepSchedule({ enabled: true });

    expect(hb.updateHeartbeatJob).toHaveBeenCalledTimes(1);
    expect(hb.createHeartbeatJob).not.toHaveBeenCalled();
    expect(res).toEqual({ enabled: true, taskUid: "T_exist" });
  });

  it("deletes the job and clears the uid when disabling", async () => {
    db.getAppConfig.mockResolvedValue({ radarSweepCronTaskUid: "T_exist" });
    const caller = await makeCaller();

    const res = await caller.competitors.setSweepSchedule({ enabled: false });

    expect(hb.deleteHeartbeatJob).toHaveBeenCalledWith("T_exist", "");
    expect(db.upsertAppConfig).toHaveBeenCalledWith({ radarSweepCronTaskUid: null });
    expect(res).toEqual({ enabled: false, taskUid: null });
  });

  it("is a no-op delete when disabling with no stored uid", async () => {
    db.getAppConfig.mockResolvedValue({ radarSweepCronTaskUid: null });
    const caller = await makeCaller();

    const res = await caller.competitors.setSweepSchedule({ enabled: false });

    expect(hb.deleteHeartbeatJob).not.toHaveBeenCalled();
    expect(res).toEqual({ enabled: false, taskUid: null });
  });
});
