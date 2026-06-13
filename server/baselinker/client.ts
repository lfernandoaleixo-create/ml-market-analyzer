/**
 * BaseLinker API client.
 *
 * BaseLinker is the ERP that holds the financial "source of truth" we need to
 * compute REAL profit per sale and per listing:
 *   - product cost (average_cost) per SKU/product;
 *   - orders with the marketplace commission already calculated, the shipping
 *     paid by the seller and the destination state (for ICMS/DIFAL);
 *   - the auction_id of each ordered product, which links a BaseLinker order to
 *     the Mercado Livre listing (MLB...) shown in the Anúncios tab.
 *
 * Single endpoint, POST form-urlencoded, token in the `X-BLToken` header.
 * Docs: https://api.baselinker.com/  |  Limit: 100 requests/minute.
 *
 * SECURITY: the token is read from env (project secret) and never exposed to
 * the frontend. This module is server-only.
 */

import { ENV } from "../_core/env";

const BL_ENDPOINT = "https://api.baselinker.com/connector.php";

export type BlErrorCode =
  | "not_configured"
  | "auth"
  | "rate_limit"
  | "upstream"
  | "parse"
  | "api_error"
  | "unknown";

export class BaselinkerError extends Error {
  readonly code: BlErrorCode;
  constructor(code: BlErrorCode, message: string) {
    super(message);
    this.name = "BaselinkerError";
    this.code = code;
  }
}

export type FetchLike = typeof fetch;

/** Retry backoff (ms). Overridable via env so tests run instantly. */
export const BL_RETRY_DELAY_MS = (() => {
  const raw = process.env.BASELINKER_RETRY_DELAY_MS;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 600;
})();

const MAX_ATTEMPTS = 4;

const sleep = (ms: number) =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

export interface BlClientOptions {
  token?: string;
  fetchImpl?: FetchLike;
}

/** Returns true when a BaseLinker token is configured. */
export function isBaselinkerConfigured(token?: string): boolean {
  const t = (token ?? ENV.baselinkerApiToken ?? "").trim();
  return t.length > 0;
}

/**
 * Low-level call to a BaseLinker method. Returns the parsed JSON response
 * (already validated for status=SUCCESS). Retries transient failures.
 */
export async function callBaselinker<T = any>(
  method: string,
  parameters: Record<string, unknown> = {},
  opts: BlClientOptions = {},
): Promise<T> {
  const token = (opts.token ?? ENV.baselinkerApiToken ?? "").trim();
  if (!token) {
    throw new BaselinkerError(
      "not_configured",
      "BaseLinker não configurado. Informe o token de API nas configurações.",
    );
  }
  const doFetch = opts.fetchImpl ?? fetch;

  const body = new URLSearchParams();
  body.set("method", method);
  body.set("parameters", JSON.stringify(parameters ?? {}));

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await doFetch(BL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-BLToken": token,
        },
        body: body.toString(),
      });

      if (res.status === 401 || res.status === 403) {
        throw new BaselinkerError("auth", "Token do BaseLinker inválido ou sem permissão.");
      }
      if (res.status === 429) {
        throw new BaselinkerError("rate_limit", "Limite de requisições do BaseLinker atingido.");
      }
      if (res.status >= 500) {
        throw new BaselinkerError("upstream", `BaseLinker indisponível (HTTP ${res.status}).`);
      }
      if (!res.ok) {
        throw new BaselinkerError("upstream", `Resposta inesperada do BaseLinker (HTTP ${res.status}).`);
      }

      let json: any;
      try {
        json = await res.json();
      } catch {
        throw new BaselinkerError("parse", "Não foi possível interpretar a resposta do BaseLinker.");
      }

      if (json && json.status === "ERROR") {
        const code = String(json.error_code ?? "");
        const msg = String(json.error_message ?? "Erro do BaseLinker.");
        // Token errors are terminal.
        if (/token|auth|permission/i.test(code) || /token/i.test(msg)) {
          throw new BaselinkerError("auth", msg);
        }
        if (/limit/i.test(code) || /limit/i.test(msg)) {
          throw new BaselinkerError("rate_limit", msg);
        }
        throw new BaselinkerError("api_error", msg);
      }

      return json as T;
    } catch (err) {
      lastErr = err;
      const terminal =
        err instanceof BaselinkerError &&
        (err.code === "auth" || err.code === "not_configured" || err.code === "api_error");
      if (terminal || attempt >= MAX_ATTEMPTS) throw err;
      await sleep(BL_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastErr ?? new BaselinkerError("unknown", "Falha desconhecida ao consultar o BaseLinker.");
}
