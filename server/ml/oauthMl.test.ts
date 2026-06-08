import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory credentials store used to mock dbMl.
let store: any = null;

vi.mock("../dbMl", () => ({
  getCredentials: vi.fn(async () => store),
  upsertCredentials: vi.fn(async (_userId: number, data: any) => {
    store = { ...store, ...data };
    return store;
  }),
}));

import { ensureUserAccessToken } from "./oauthMl";

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

  it("returns the cached access token when it is still valid", async () => {
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
  });
});
