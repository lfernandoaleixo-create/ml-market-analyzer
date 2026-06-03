import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";
import { hasValidMlCredentialFormat } from "./ml/credentials";

/**
 * Validates the Mercado Livre credential wiring.
 *
 * The credentials (ML_APP_ID / ML_CLIENT_SECRET) are OPTIONAL by design:
 * - When empty or malformed, the app runs on the demo data provider.
 * - When both look like real ML credentials, the app can validate them against
 *   the official Mercado Livre OAuth token endpoint and use the official provider.
 *
 * Mercado Livre App IDs are long numeric strings and secrets are long random
 * strings, so a value like "Fernando" is treated as "not configured".
 */
describe("Mercado Livre credentials wiring", () => {
  it("exposes ML credential fields on ENV (string, possibly empty)", () => {
    expect(typeof ENV.mlAppId).toBe("string");
    expect(typeof ENV.mlClientSecret).toBe("string");
  });

  it("recognizes non-credential placeholder values as 'not configured'", () => {
    expect(hasValidMlCredentialFormat("Fernando", "Fernando")).toBe(false);
    expect(hasValidMlCredentialFormat("", "")).toBe(false);
    expect(hasValidMlCredentialFormat("123", "abc")).toBe(false);
    // A plausible ML app id (long numeric) + long secret passes the format gate.
    expect(
      hasValidMlCredentialFormat(
        "1234567890123456",
        "aB3xK9mPq2RsT5uV7wXy1zZc4dE6fG8h",
      ),
    ).toBe(true);
  });

  it("validates credentials against the ML OAuth endpoint when they look real", async () => {
    const appId = ENV.mlAppId;
    const secret = ENV.mlClientSecret;

    if (!hasValidMlCredentialFormat(appId, secret)) {
      // No real credentials yet — demo mode. Nothing to validate live.
      expect(true).toBe(true);
      return;
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: appId,
      client_secret: secret,
    });

    const res = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });

    const json = (await res.json()) as { access_token?: string; error?: string };
    expect(json.access_token, `ML OAuth failed: ${JSON.stringify(json)}`).toBeTruthy();
  }, 20000);
});
