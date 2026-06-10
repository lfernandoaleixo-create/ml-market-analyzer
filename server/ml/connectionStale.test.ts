import { describe, expect, it } from "vitest";
import { isConnectionStale } from "./credentials";

/**
 * The dashboard shows a discreet "connection expired — reconnect" reminder
 * driven by `isConnectionStale`. These cases pin down exactly when it appears
 * so we never nag a freshly created account, but always warn once a previously
 * connected token has expired or errored.
 */
describe("isConnectionStale", () => {
  const HOUR = 60 * 60 * 1000;
  const now = 1_000_000_000_000;

  it("never flags when the user has not connected via OAuth yet", () => {
    expect(
      isConnectionStale({ oauthConnected: false, status: "unconfigured", tokenExpiresAt: null, now }),
    ).toBe(false);
    // Even an old expiry should be ignored while not connected.
    expect(
      isConnectionStale({ oauthConnected: false, status: "error", tokenExpiresAt: now - HOUR, now }),
    ).toBe(false);
  });

  it("does NOT flag when connected and the token is still valid", () => {
    expect(
      isConnectionStale({
        oauthConnected: true,
        status: "connected",
        tokenExpiresAt: now + HOUR,
        now,
      }),
    ).toBe(false);
  });

  it("flags when connected but the access token has expired", () => {
    expect(
      isConnectionStale({
        oauthConnected: true,
        status: "connected",
        tokenExpiresAt: now - 1,
        now,
      }),
    ).toBe(true);
  });

  it("flags when connected and the stored status is 'error' (refresh failed)", () => {
    expect(
      isConnectionStale({
        oauthConnected: true,
        status: "error",
        tokenExpiresAt: now + HOUR, // even with a future expiry, an error wins
        now,
      }),
    ).toBe(true);
  });

  it("treats the exact expiry instant as expired (boundary)", () => {
    expect(
      isConnectionStale({
        oauthConnected: true,
        status: "connected",
        tokenExpiresAt: now,
        now,
      }),
    ).toBe(true);
  });

  it("does not flag when there is no expiry recorded and status is healthy", () => {
    expect(
      isConnectionStale({
        oauthConnected: true,
        status: "connected",
        tokenExpiresAt: null,
        now,
      }),
    ).toBe(false);
  });
});
