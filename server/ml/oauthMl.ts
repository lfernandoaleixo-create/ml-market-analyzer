import type { Express, Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { ENV } from "../_core/env";
import { getCredentials, upsertCredentials, resolveMlOwnerUserId } from "../dbMl";

/**
 * Mercado Livre OAuth 2.0 — Authorization Code flow (with offline_access).
 *
 * Unlike client_credentials (an app-only token), this flow produces a user
 * access_token + refresh_token. The refresh_token lets us keep live access
 * for up to 6 months, renewing the short-lived access_token automatically.
 *
 * Endpoints (Brazil / mercadolivre.com.br):
 *  - Authorize: https://auth.mercadolivre.com.br/authorization
 *  - Token:     https://api.mercadolibre.com/oauth/token
 *
 * The redirect URI MUST exactly match the one registered in DevCenter:
 *   https://mlmarketanl-kcmkt5tl.manus.space/api/oauth/ml/callback
 */

const ML_AUTH_BASE: Record<string, string> = {
  MLB: "https://auth.mercadolivre.com.br/authorization",
  MLA: "https://auth.mercadolibre.com.ar/authorization",
  MLM: "https://auth.mercadolibre.com.mx/authorization",
  MLC: "https://auth.mercadolibre.cl/authorization",
  MCO: "https://auth.mercadolibre.com.co/authorization",
};

const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

/**
 * Hard timeout (ms) for every OAuth network call (code exchange + refresh).
 *
 * This is critical: the per-user refresh lock awaits this fetch. If the ML
 * OAuth endpoint ever hangs (slow network, provider incident), WITHOUT a
 * timeout the lock would never release and EVERY subsequent request for that
 * user would wait forever — exactly the kind of freeze we must avoid during a
 * live presentation. With a bounded timeout, a stuck call aborts, the lock
 * releases, and the next request can retry cleanly.
 *
 * 10s is generous for a single token call yet short enough that the UI never
 * appears frozen (the frontend also has its own deadline as a second layer).
 */
const OAUTH_TIMEOUT_MS = (() => {
  const raw = process.env.ML_OAUTH_TIMEOUT_MS;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
})();

/**
 * fetch() wrapped with an AbortController deadline. Always clears its timer.
 * Throws (AbortError) if the deadline is hit, so callers fail fast instead of
 * hanging. Used for both the authorization-code exchange and the refresh.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = OAUTH_TIMEOUT_MS,
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Proactive refresh margin. We renew the access token when it is within this
 * window of expiring, so we never hand out a token that dies mid-request.
 * ML access tokens last ~6h; a 5-minute margin is generous and safe.
 */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/** Resolve the current logged-in Manus user from the session cookie. */
async function resolveUserId(req: Request): Promise<number | null> {
  try {
    const user = await sdk.authenticateRequest(req);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Canonical public origin (e.g. https://mlmarketanl-kcmkt5tl.manus.space).
 * We always use this for the redirect_uri so it matches exactly what is
 * registered in the ML DevCenter — even if the flow is started from the
 * preview/sandbox domain. ML rejects any redirect_uri that is not registered.
 */
function publicOrigin(): string {
  return (ENV.mlPublicOrigin || "").replace(/\/$/, "");
}

/** Build the redirect URI from the canonical public origin. */
function redirectUriFor(_req?: Request): string {
  return `${publicOrigin()}/api/oauth/ml/callback`;
}

export function registerMlOAuthRoutes(app: Express) {
  /**
   * Start the ML authorization flow. Redirects the user's browser to the ML
   * consent screen. We pass the user id + origin in `state` so the callback
   * can persist tokens for the right account and bounce back to the SPA.
   */
  app.get("/api/oauth/ml/connect", async (req: Request, res: Response) => {
    const requestUserId = await resolveUserId(req);
    if (!requestUserId) {
      res.status(401).send("É necessário estar autenticado no Mercato para conectar o Mercado Livre.");
      return;
    }
    // SINGLE-STORE: connect/refresh the OWNER's shared ML connection so every
    // login updates the same row instead of creating an orphan per-user one.
    const userId = await resolveMlOwnerUserId(requestUserId);
    const creds = await getCredentials(userId);
    if (!creds || !creds.appId) {
      res.status(400).send("Configure o App ID antes de conectar.");
      return;
    }

    const siteId = creds.siteId || "MLB";
    const authBase = ML_AUTH_BASE[siteId] ?? ML_AUTH_BASE.MLB;
    const redirectUri = redirectUriFor(req);

    // Always return to the canonical public origin. The callback runs on the
    // published domain (that is the registered redirect_uri), so bouncing the
    // user back there keeps the session/cookies consistent.
    const origin = publicOrigin();
    const state = Buffer.from(JSON.stringify({ userId, origin })).toString("base64url");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: creds.appId,
      redirect_uri: redirectUri,
      state,
    });
    res.redirect(302, `${authBase}?${params.toString()}`);
  });

  /**
   * OAuth callback. ML redirects here with `?code=...&state=...`. We exchange
   * the code for access + refresh tokens and store them, then redirect the
   * user back to the Settings page with a status flag.
   */
  app.get("/api/oauth/ml/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const oauthError = getQueryParam(req, "error");

    let userId: number | null = null;
    let origin = "";
    try {
      if (state) {
        const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
        userId = typeof decoded.userId === "number" ? decoded.userId : null;
        origin = typeof decoded.origin === "string" ? decoded.origin : "";
      }
    } catch {
      // ignore malformed state
    }

    const settingsUrl = (status: string) =>
      `${origin || publicOrigin()}/configuracoes?ml=${status}`;

    if (oauthError) {
      if (userId) {
        await upsertCredentials(userId, {
          status: "error",
          statusMessage: `Autorização negada: ${oauthError}`,
        });
      }
      res.redirect(302, settingsUrl("erro"));
      return;
    }

    if (!code || !userId) {
      res.status(400).send("Parâmetros de callback inválidos.");
      return;
    }

    // Persist tokens on the OWNER's row (single-store shared connection).
    userId = await resolveMlOwnerUserId(userId);
    const creds = await getCredentials(userId);
    if (!creds || !creds.appId || !creds.clientSecret) {
      res.redirect(302, settingsUrl("sem-credenciais"));
      return;
    }

    try {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: creds.appId,
        client_secret: creds.clientSecret,
        code,
        redirect_uri: redirectUriFor(req),
      });
      const r = await fetchWithTimeout(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
      });
      const json = (await r.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        user_id?: number;
        error?: string;
        message?: string;
      };

      if (!json.access_token) {
        await upsertCredentials(userId, {
          status: "error",
          statusMessage: `Falha ao obter token: ${json.error ?? json.message ?? "desconhecida"}`,
        });
        res.redirect(302, settingsUrl("erro"));
        return;
      }

      await upsertCredentials(userId, {
        status: "connected",
        statusMessage: "Conectado via OAuth (Authorization Code + offline_access).",
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? creds.refreshToken ?? null,
        tokenExpiresAt: Date.now() + (json.expires_in ?? 21600) * 1000,
        // Persist the ML seller id (distinct from the local user id). All ML
        // API calls that take a user id MUST use this value.
        ...(typeof json.user_id === "number" ? { mlUserId: json.user_id } : {}),
      });

      res.redirect(302, settingsUrl("conectado"));
    } catch (err) {
      await upsertCredentials(userId, {
        status: "error",
        statusMessage: `Erro de rede no callback: ${String(err)}`,
      });
      res.redirect(302, settingsUrl("erro"));
    }
  });
}

/**
 * Per-user in-flight refresh lock.
 *
 * The Mercado Livre refresh_token is SINGLE-USE: every successful refresh
 * rotates it and invalidates the previous one. The dashboard fires several
 * queries at once, so when the access token is expired multiple requests would
 * each try to refresh in parallel — the first consumes the refresh_token and
 * the others send an already-rotated (now invalid) token, permanently breaking
 * the connection until a manual reconnect.
 *
 * To prevent this, we keep a single in-flight refresh Promise per user. Only
 * the first caller performs the network refresh; concurrent callers await the
 * SAME promise and receive the same freshly-minted access token.
 */
const inFlightRefresh = new Map<number, Promise<string | null>>();

/** Renew the access token via refresh_token. Persists the rotated pair. */
async function performRefresh(userId: number, force = false): Promise<string | null> {
  const creds = await getCredentials(userId);
  if (!creds) return null;

  // Re-check validity inside the lock: another caller may have just refreshed
  // while we were queued, so we should reuse the fresh token instead of
  // burning the refresh_token again. Skipped when `force` (e.g. a 401 proved
  // the cached token is dead despite its advertised expiry).
  if (
    !force &&
    creds.accessToken &&
    creds.tokenExpiresAt &&
    creds.tokenExpiresAt > Date.now() + REFRESH_MARGIN_MS
  ) {
    return creds.accessToken;
  }

  if (!creds.refreshToken || !creds.appId || !creds.clientSecret) {
    // No way to refresh — surface a clear, reconnect-able error state.
    await upsertCredentials(userId, {
      status: "error",
      statusMessage: "Sessão do Mercado Livre expirada e sem refresh token. Reconecte em Configurações.",
    });
    return null;
  }

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: creds.appId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
    });
    const r = await fetchWithTimeout(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
    const json = (await r.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      user_id?: number;
      error?: string;
      message?: string;
    };

    if (json.access_token) {
      // Atomically persist BOTH the new access token and the rotated refresh
      // token. ML rotates the refresh_token on every use; if the response does
      // not include a new one (rare), keep the previous one.
      await upsertCredentials(userId, {
        status: "connected",
        statusMessage: "Token renovado automaticamente.",
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? creds.refreshToken,
        tokenExpiresAt: Date.now() + (json.expires_in ?? 21600) * 1000,
        // Keep the ML seller id fresh (backfills rows created before this field
        // existed, where mlUserId may still be null).
        ...(typeof json.user_id === "number" ? { mlUserId: json.user_id } : {}),
      });
      return json.access_token;
    }

    // Refresh was rejected (e.g. invalid_grant: token already rotated/revoked).
    await upsertCredentials(userId, {
      status: "error",
      statusMessage: `Falha ao renovar o token: ${json.error ?? json.message ?? "desconhecida"}. Reconecte em Configurações.`,
    });
    return null;
  } catch (err) {
    // Network/transient error OR our own timeout (AbortError): do NOT flip to
    // "error" (the refresh_token is still valid). We just bail out fast and keep
    // the connection, so the lock releases immediately and the next request can
    // retry instead of the whole app hanging.
    return null;
  }
}

/**
 * Ensure a valid (non-expired) access token for the user, refreshing via the
 * refresh_token when needed. Returns the access token string, or null if no
 * valid OAuth session exists.
 *
 * Concurrency-safe: a single refresh runs per user at a time (see
 * `inFlightRefresh`), so simultaneous callers never race over the single-use
 * refresh_token.
 */
export async function ensureUserAccessToken(requestUserId: number): Promise<string | null> {
  // SINGLE-STORE: always operate on the OWNER's ML connection, no matter which
  // Manus login is active. This is what stops the false "desconectado" when the
  // user signs in with a different account (e.g. gestao@grupo-fox.com vs the
  // owner's Apple login). See resolveMlOwnerUserId for the resolution order.
  const userId = await resolveMlOwnerUserId(requestUserId);
  const creds = await getCredentials(userId);
  if (!creds) return null;

  // Still comfortably valid? Renew proactively before expiry (5 min margin) so
  // we never hand out a token that dies mid-request.
  if (creds.accessToken && creds.tokenExpiresAt && creds.tokenExpiresAt > Date.now() + REFRESH_MARGIN_MS) {
    return creds.accessToken;
  }

  // Join an in-flight refresh if one is already running for this user.
  const pending = inFlightRefresh.get(userId);
  if (pending) return pending;

  const promise = performRefresh(userId).finally(() => {
    inFlightRefresh.delete(userId);
  });
  inFlightRefresh.set(userId, promise);
  return promise;
}

/**
 * Force a token refresh regardless of the cached expiry. Used by the data layer
 * when a request unexpectedly comes back 401 (the cached token died earlier than
 * its advertised expiry, e.g. revoked on ML's side). Shares the same per-user
 * in-flight lock so it never races concurrent callers.
 */
export async function forceRefreshUserAccessToken(
  requestUserId: number,
  staleToken?: string,
): Promise<string | null> {
  // Same single-store resolution as ensureUserAccessToken: refresh the OWNER's
  // connection so the per-user in-flight lock is keyed on the real connection.
  const userId = await resolveMlOwnerUserId(requestUserId);
  // If a refresh is already running, await it first — it may already produce a
  // brand-new token (refreshed by another caller), which resolves our 401.
  const pending = inFlightRefresh.get(userId);
  if (pending) {
    const resolved = await pending;
    // If the in-flight refresh returned a token different from the one that
    // failed, trust it. Otherwise fall through and force a fresh refresh.
    if (resolved && resolved !== staleToken) return resolved;
  }

  const promise = performRefresh(userId, true).finally(() => {
    inFlightRefresh.delete(userId);
  });
  inFlightRefresh.set(userId, promise);
  return promise;
}
