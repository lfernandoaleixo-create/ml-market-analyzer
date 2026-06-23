import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the self-healing behavior of `account.connection`.
 *
 * Background: when the ML API returned 429 (rate limit) the stored credential
 * status could get stuck at "error" in the DB. Even after the token started
 * working again, the UI kept showing a false "desconectado" because it read the
 * stale persisted status. The probe now self-heals: a SUCCESSFUL probe (which
 * proves the token works) resets status to "connected" in the DB.
 *
 * A 429 during the probe must NOT downgrade the persisted status — it surfaces
 * as connected-but-rate-limited and leaves the DB untouched.
 */

const probe = vi.fn();
const getCredentials = vi.fn();
const upsertCredentials = vi.fn();

class MLRateLimitErrorMock extends Error {}

vi.mock("../ml/oauthMl", () => ({
  ensureUserAccessToken: vi.fn(async () => "fake-token"),
  forceRefreshUserAccessToken: vi.fn(async () => "fake-token"),
}));
vi.mock("../dbMl", () => ({
  getCredentials: (uid: number) => getCredentials(uid),
  upsertCredentials: (uid: number, patch: unknown) => upsertCredentials(uid, patch),
  resolveMlOwnerUserId: vi.fn(async (uid: number) => uid),
}));
vi.mock("../ml/resolveMlUserId", () => ({
  resolveMlUserId: vi.fn(async () => ({ mlUserId: "123456", source: "db" })),
}));
vi.mock("../ml/accountProvider", () => ({
  AccountProvider: class {
    constructor() {}
    async probe() {
      return probe();
    }
  },
  MLRateLimitError: MLRateLimitErrorMock,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("account.connection self-heal", () => {
  it("resets a stuck status='error' to 'connected' when the probe succeeds", async () => {
    probe.mockResolvedValue({ ok: true, nickname: "LOJADOSRWU" });
    getCredentials.mockResolvedValue({ mlUserId: "123456", status: "error" });
    upsertCredentials.mockResolvedValue(undefined);

    const caller = await makeCaller();
    const res = await caller.account.connection();

    expect(res.connected).toBe(true);
    expect(res.nickname).toBe("LOJADOSRWU");
    // The stale "error" status was healed.
    expect(upsertCredentials).toHaveBeenCalledWith(
      4242,
      expect.objectContaining({ status: "connected" }),
    );
  });

  it("does NOT write when the status is already 'connected'", async () => {
    probe.mockResolvedValue({ ok: true, nickname: "LOJADOSRWU" });
    getCredentials.mockResolvedValue({ mlUserId: "123456", status: "connected" });

    const caller = await makeCaller();
    const res = await caller.account.connection();

    expect(res.connected).toBe(true);
    expect(upsertCredentials).not.toHaveBeenCalled();
  });

  it("a 429 during the probe does NOT downgrade the persisted status", async () => {
    probe.mockRejectedValue(new MLRateLimitErrorMock("rate limited"));
    getCredentials.mockResolvedValue({ mlUserId: "123456", status: "connected" });

    const caller = await makeCaller();
    const res = await caller.account.connection();

    // Connected-but-rate-limited, and the DB was left untouched.
    expect(res.connected).toBe(true);
    expect((res as { rateLimited?: boolean }).rateLimited).toBe(true);
    expect(upsertCredentials).not.toHaveBeenCalled();
  });
});
