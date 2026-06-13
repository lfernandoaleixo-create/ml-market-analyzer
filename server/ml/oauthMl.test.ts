import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory credentials store used to mock dbMl.
let store: any = null;
// Count of upsert writes, to assert atomic single-write behaviour.
let upsertCalls = 0;

vi.mock("../dbMl", () => ({
  getCredentials: vi.fn(async () => store),
  upsertCredentials: vi.fn(async (_userId: number, data: any) => {
    upsertCalls += 1;
    store = { ...store, ...data };
    return store;
  }),
}));

import { ensureUserAccessToken, forceRefreshUserAccessToken } from "./oauthMl";

function okFetch(body: any) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as any;
}

beforeEach(() => {
  store = null;
  upsertCalls = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ensureUserAccessToken", () => {
  it("returns null when there are no credentials", async () => {
    store = null;
    const token = await ensureUserAccessToken(1);
    expect(token).toBeNull();
  });

  it("returns the cached access token when it is still comfortably valid", async () => {
    store = {
      appId: "1790005725650717",
      clientSecret: "secret",
      accessToken: "VALID",
      refreshToken: "R",
      tokenExpiresAt: Date.now() + 60 * 60 * 1000,
    };
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const token = await ensureUserAccessToken(1);
    expect(token).toBe("VALID");
    // No refresh call should happen.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refreshes proactively when within the safety margin (not yet expired)", async () => {
    store = {
      appId: "1790005725650717",
      clientSecret: "secret",
      accessToken: "OLD",
      refreshToken: "REFRESH",
      // Expires in 2 minutes — inside the 5-minute proactive margin.
      tokenExpiresAt: Date.now() + 2 * 60 * 1000,
    };
    vi.stubGlobal(
      "fetch",
      okFetch({ access_token: "NEW", refresh_token: "REFRESH2", expires_in: 21600 }),
    );
    const token = await ensureUserAccessToken(1);
    expect(token).toBe("NEW");
    expect(store.refreshToken).toBe("REFRESH2");
  });

  it("refreshes the token when expired and persists the new one", async () => {
    store = {
      appId: "1790005725650717",
      clientSecret: "secret",
      accessToken: "OLD",
      refreshToken: "REFRESH",
      tokenExpiresAt: Date.now() - 1000, // expired
    };
    vi.stubGlobal(
      "fetch",
      okFetch({ access_token: "NEW", refresh_token: "REFRESH2", expires_in: 21600 }),
    );
    const token = await ensureUserAccessToken(1);
    expect(token).toBe("NEW");
    expect(store.accessToken).toBe("NEW");
    expect(store.refreshToken).toBe("REFRESH2");
    expect(store.status).toBe("connected");
  });

  it("keeps the previous refresh_token when the response omits a new one", async () => {
    store = {
      appId: "1790005725650717",
      clientSecret: "secret",
      accessToken: "OLD",
      refreshToken: "REFRESH",
      tokenExpiresAt: Date.now() - 1000,
    };
    vi.stubGlobal("fetch", okFetch({ access_token: "NEW", expires_in: 21600 }));
    const token = await ensureUserAccessToken(1);
    expect(token).toBe("NEW");
    expect(store.refreshToken).toBe("REFRESH");
  });

  it("flags an error status when the refresh is rejected (invalid_grant)", async () => {
    store = {
      appId: "1790005725650717",
      clientSecret: "secret",
      accessToken: "OLD",
      refreshToken: "ROTATED",
      tokenExpiresAt: Date.now() - 1000,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_grant" }),
        text: async () => "{}",
      })) as any,
    );
    const token = await ensureUserAccessToken(1);
    expect(token).toBeNull();
    expect(store.status).toBe("error");
    expect(store.statusMessage).toContain("invalid_grant");
  });

  it("does NOT flag error on a transient network failure (keeps connection)", async () => {
    store = {
      appId: "1790005725650717",
      clientSecret: "secret",
      accessToken: "OLD",
      refreshToken: "REFRESH",
      tokenExpiresAt: Date.now() - 1000,
      status: "connected",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }) as any,
    );
    const token = await ensureUserAccessToken(1);
    expect(token).toBeNull();
    // Status remains "connected" so a later request can retry the refresh.
    expect(store.status).toBe("connected");
  });

  it("returns null when expired and there is no refresh token", async () => {
    store = {
      appId: "1790005725650717",
      clientSecret: "secret",
      accessToken: "OLD",
      refreshToken: null,
      tokenExpiresAt: Date.now() - 1000,
    };
    const token = await ensureUserAccessToken(1);
    expect(token).toBeNull();
    expect(store.status).toBe("error");
  });

  it("does NOT hang and does NOT flag error when the refresh call times out (AbortError)", async () => {
    // Make the OAuth timeout tiny so the test is fast.
    const prev = process.env.ML_OAUTH_TIMEOUT_MS;
    process.env.ML_OAUTH_TIMEOUT_MS = "20";
    vi.resetModules();
    const mod = await import("./oauthMl");
    store = {
      appId: "1790005725650717",
      clientSecret: "secret",
      accessToken: "OLD",
      refreshToken: "REFRESH",
      tokenExpiresAt: Date.now() - 1000,
      status: "connected",
    };
    // fetch that respects the abort signal: rejects with AbortError when aborted,
    // otherwise would hang "forever" (well past the 20ms deadline).
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: any) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (signal) {
            signal.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }
        }),
      ) as any,
    );

    const start = Date.now();
    const token = await mod.ensureUserAccessToken(1);
    const elapsed = Date.now() - start;

    // It returned (did not hang) well within a sane bound...
    expect(token).toBeNull();
    expect(elapsed).toBeLessThan(2000);
    // ...and the connection is preserved (the refresh_token is still valid), so
    // the next request can retry instead of forcing a manual reconnect.
    expect(store.status).toBe("connected");

    // A subsequent call must be able to refresh again (the lock was released).
    vi.stubGlobal(
      "fetch",
      okFetch({ access_token: "AFTER_TIMEOUT", refresh_token: "R2", expires_in: 21600 }),
    );
    const token2 = await mod.ensureUserAccessToken(1);
    expect(token2).toBe("AFTER_TIMEOUT");

    if (prev === undefined) delete process.env.ML_OAUTH_TIMEOUT_MS;
    else process.env.ML_OAUTH_TIMEOUT_MS = prev;
    vi.resetModules();
  });

  it("coalesces concurrent refreshes into a SINGLE network call (race fix)", async () => {
    store = {
      appId: "1790005725650717",
      clientSecret: "secret",
      accessToken: "OLD",
      refreshToken: "REFRESH",
      tokenExpiresAt: Date.now() - 1000,
    };
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        // Simulate latency so all callers pile up before the first resolves.
        await new Promise((r) => setTimeout(r, 20));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "NEW",
            refresh_token: "REFRESH2",
            expires_in: 21600,
          }),
          text: async () => "{}",
        };
      }) as any,
    );

    // Ten simultaneous callers (mimicking the dashboard's burst of queries).
    const results = await Promise.all(
      Array.from({ length: 10 }, () => ensureUserAccessToken(1)),
    );

    expect(results.every((t) => t === "NEW")).toBe(true);
    // Crucially: only ONE refresh hit the network, so the single-use
    // refresh_token was rotated exactly once.
    expect(calls).toBe(1);
    expect(upsertCalls).toBe(1);
  });
});

describe("forceRefreshUserAccessToken", () => {
  it("forces a refresh even when the cached token still looks valid", async () => {
    store = {
      appId: "1790005725650717",
      clientSecret: "secret",
      accessToken: "STALE_BUT_NOT_EXPIRED",
      refreshToken: "REFRESH",
      // Far in the future — ensureUserAccessToken would have returned the cache,
      // but a 401 proved the token is actually dead.
      tokenExpiresAt: Date.now() + 60 * 60 * 1000,
    };
    vi.stubGlobal(
      "fetch",
      okFetch({ access_token: "FRESH", refresh_token: "REFRESH2", expires_in: 21600 }),
    );
    const token = await forceRefreshUserAccessToken(1, "STALE_BUT_NOT_EXPIRED");
    expect(token).toBe("FRESH");
    expect(store.accessToken).toBe("FRESH");
  });
});
