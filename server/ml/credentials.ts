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
