import type { Express, Request, Response } from "express";
import { parse as parseCookie } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { sdk } from "../_core/sdk";
import { getCredentials, upsertCredentials } from "../dbMl";

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

/** Build the redirect URI from the incoming request origin (origin-safe). */
function redirectUriFor(req: Request): string {
  // Prefer the configured public origin via forwarded headers; fall back to host.
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host;
  return `${proto}://${host}/api/oauth/ml/callback`;
}

export function registerMlOAuthRoutes(app: Express) {
  /**
   * Start the ML authorization flow. Redirects the user's browser to the ML
   * consent screen. We pass the user id + origin in `state` so the callback
   * can persist tokens for the right account and bounce back to the SPA.
   */
  app.get("/api/oauth/ml/connect", async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) {
      res.status(401).send("É necessário estar autenticado no Mercato para conectar o Mercado Livre.");
      return;
    }
    const creds = await getCredentials(userId);
    if (!creds || !creds.appId) {
      res.status(400).send("Configure o App ID antes de conectar.");
      return;
    }

    const siteId = creds.siteId || "MLB";
    const authBase = ML_AUTH_BASE[siteId] ?? ML_AUTH_BASE.MLB;
    const redirectUri = redirectUriFor(req);

    // Encode userId + return origin in state (base64 JSON).
    const origin =
      (getQueryParam(req, "origin") as string) ||
      `${(req.headers["x-forwarded-proto"] as string) || "https"}://${
        (req.headers["x-forwarded-host"] as string) || req.headers.host
      }`;
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
      `${origin || ""}/configuracoes?ml=${status}`;

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
      const r = await fetch(TOKEN_URL, {
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
 * Ensure a valid (non-expired) access token for the user, refreshing via the
 * refresh_token when needed. Returns the access token string, or null if no
 * valid OAuth session exists.
 */
export async function ensureUserAccessToken(userId: number): Promise<string | null> {
  const creds = await getCredentials(userId);
  if (!creds) return null;

  // Still valid? (30s safety margin)
  if (creds.accessToken && creds.tokenExpiresAt && creds.tokenExpiresAt > Date.now() + 30_000) {
    return creds.accessToken;
  }

  // Try to refresh.
  if (creds.refreshToken && creds.appId && creds.clientSecret) {
    try {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: creds.appId,
        client_secret: creds.clientSecret,
        refresh_token: creds.refreshToken,
      });
      const r = await fetch(TOKEN_URL, {
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
      };
      if (json.access_token) {
        await upsertCredentials(userId, {
          status: "connected",
          statusMessage: "Token renovado automaticamente.",
          accessToken: json.access_token,
          refreshToken: json.refresh_token ?? creds.refreshToken,
          tokenExpiresAt: Date.now() + (json.expires_in ?? 21600) * 1000,
        });
        return json.access_token;
      }
    } catch {
      // fall through to null
    }
  }

  return null;
}
