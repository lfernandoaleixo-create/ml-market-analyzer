import { describe, expect, it } from "vitest";
import {
  mergeCredentialsForSave,
  probeMayFlagError,
  isConnectionStale,
} from "./credentials";

const REAL_APP_ID = "1790005725650717";
const REAL_SECRET = "qvxb0BNJiGR5bYC5Xm1sYrvAdymxKqLZ"; // 32-char shape

describe("mergeCredentialsForSave (anti-wipe guard)", () => {
  it("keeps the stored secret when the form sends an empty secret", () => {
    const existing = {
      appId: REAL_APP_ID,
      clientSecret: REAL_SECRET,
      accessToken: "A",
      refreshToken: "R",
    };
    const merged = mergeCredentialsForSave({ appId: REAL_APP_ID, clientSecret: "" }, existing);
    // The empty field must NOT erase the previously stored secret.
    expect(merged.clientSecret).toBe(REAL_SECRET);
    expect(merged.appId).toBe(REAL_APP_ID);
  });

  it("keeps the stored appId when the form sends an empty appId", () => {
    const existing = {
      appId: REAL_APP_ID,
      clientSecret: REAL_SECRET,
      accessToken: "A",
      refreshToken: "R",
    };
    const merged = mergeCredentialsForSave({ appId: "", clientSecret: REAL_SECRET }, existing);
    expect(merged.appId).toBe(REAL_APP_ID);
  });

  it("keeps a healthy OAuth session 'connected' after a save", () => {
    const existing = {
      appId: REAL_APP_ID,
      clientSecret: REAL_SECRET,
      accessToken: "A",
      refreshToken: "R",
    };
    const merged = mergeCredentialsForSave({ appId: "", clientSecret: "" }, existing);
    expect(merged.status).toBe("connected");
  });

  it("marks 'unconfigured' when there is no OAuth session yet", () => {
    const merged = mergeCredentialsForSave(
      { appId: REAL_APP_ID, clientSecret: REAL_SECRET },
      null,
    );
    expect(merged.status).toBe("unconfigured");
  });

  it("uses new values when provided (overrides stored)", () => {
    const existing = {
      appId: "111",
      clientSecret: "old",
      accessToken: null,
      refreshToken: null,
    };
    const merged = mergeCredentialsForSave(
      { appId: REAL_APP_ID, clientSecret: REAL_SECRET },
      existing,
    );
    expect(merged.appId).toBe(REAL_APP_ID);
    expect(merged.clientSecret).toBe(REAL_SECRET);
  });
});

describe("probeMayFlagError (protect live OAuth)", () => {
  it("forbids flagging error when both tokens are present", () => {
    expect(
      probeMayFlagError({ accessToken: "A", refreshToken: "R" }),
    ).toBe(false);
  });

  it("allows flagging error when there is no OAuth session", () => {
    expect(probeMayFlagError({ accessToken: null, refreshToken: null })).toBe(true);
    expect(probeMayFlagError(null)).toBe(true);
  });

  it("allows flagging error when only one token is present (incomplete)", () => {
    expect(probeMayFlagError({ accessToken: "A", refreshToken: null })).toBe(true);
  });
});

describe("isConnectionStale (regression: not stale just because status=error after fix)", () => {
  it("is NOT stale when disconnected (no OAuth)", () => {
    expect(isConnectionStale({ oauthConnected: false, status: "error" })).toBe(false);
  });

  it("is stale when connected and the access token already expired", () => {
    expect(
      isConnectionStale({
        oauthConnected: true,
        status: "connected",
        tokenExpiresAt: Date.now() - 1000,
      }),
    ).toBe(true);
  });

  it("is NOT stale when connected and token valid", () => {
    expect(
      isConnectionStale({
        oauthConnected: true,
        status: "connected",
        tokenExpiresAt: Date.now() + 60 * 60 * 1000,
      }),
    ).toBe(false);
  });
});
