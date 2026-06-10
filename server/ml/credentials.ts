import { ENV } from "../_core/env";

/**
 * Mercado Livre developer credentials are optional. The platform may
 * auto-populate the env vars with unrelated values (e.g. a user's name),
 * so we apply a light format gate before treating them as "configured".
 *
 * Real ML App IDs are long numeric strings (typically 15-16 digits) and
 * the Client Secret is a long alphanumeric random string. Anything that
 * doesn't match these shapes is treated as "not configured" → demo mode.
 */
export function hasValidMlCredentialFormat(
  appId: string | undefined | null,
  secret: string | undefined | null,
): boolean {
  const id = (appId ?? "").trim();
  const sec = (secret ?? "").trim();

  // App ID: only digits, at least 8 of them (real ones are 15-16).
  const appIdLooksReal = /^[0-9]{8,}$/.test(id);
  // Secret: at least 16 chars, alphanumeric-ish, and not equal to the app id.
  const secretLooksReal = /^[A-Za-z0-9]{16,}$/.test(sec) && sec !== id;

  return appIdLooksReal && secretLooksReal;
}

export type MlCredentials = {
  appId: string;
  clientSecret: string;
};

/**
 * Resolves the active ML credentials from the environment.
 * Returns null when credentials are not configured (demo mode).
 *
 * Note: credentials stored in the database (via the Settings page) take
 * precedence; that lookup is handled in the provider layer. This function
 * only resolves the env-level fallback.
 */
export function resolveEnvMlCredentials(): MlCredentials | null {
  const appId = ENV.mlAppId.trim();
  const clientSecret = ENV.mlClientSecret.trim();
  if (!hasValidMlCredentialFormat(appId, clientSecret)) return null;
  return { appId, clientSecret };
}

/**
 * Decides whether the dashboard should surface the "connection expired" reminder.
 *
 * The reminder is only meaningful once the user has actually connected via OAuth
 * (so we never nag a brand-new account that simply hasn't connected yet). It turns
 * on when the stored credentials report an error status OR the cached access token
 * has already passed its expiry instant.
 */
export function isConnectionStale(input: {
  oauthConnected: boolean;
  status?: string | null;
  tokenExpiresAt?: number | null;
  now?: number;
}): boolean {
  if (!input.oauthConnected) return false;
  if (input.status === "error") return true;
  const now = input.now ?? Date.now();
  return (
    typeof input.tokenExpiresAt === "number" &&
    input.tokenExpiresAt > 0 &&
    input.tokenExpiresAt <= now
  );
}
