/**
 * Shared HTTP utilities for competitor data providers (Oxylabs, ScrapingBee,
 * and the official-source adapter). Centralizes the retry/backoff policy and a
 * standard error type so every provider behaves consistently.
 *
 * SECURITY: nothing here knows about the ML seller account. Providers only ever
 * pass public keywords / public URLs through these helpers.
 */

export type ProviderErrorCode =
  | "not_configured"
  | "auth"
  | "credits"
  | "upstream"
  | "bad_input"
  | "parse"
  | "unknown";

/** Standard, user-facing provider error. */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly source: string;
  constructor(source: string, code: ProviderErrorCode, message: string) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.source = source;
  }
}

export type FetchLike = typeof fetch;

/** Base backoff (ms). Overridable via env so tests run instantly (set to 0). */
export const RETRY_DELAY_MS = (() => {
  const raw = process.env.COMPETITOR_RETRY_DELAY_MS;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 600;
})();

export const MAX_ATTEMPTS = 4;

export const sleep = (ms: number) =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    // Handle "R$ 1.299,90" and "1299.90" styles.
    const cleaned = v
      .replace(/[^\d.,-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Run an async producer with retry on transient failures. The producer should
 * throw a ProviderError with code "upstream" (or a network error) to signal a
 * retryable condition; terminal codes (auth/credits/bad_input) are rethrown
 * immediately.
 */
export async function withRetry<T>(
  source: string,
  producer: (attempt: number) => Promise<T>,
  maxAttempts: number = MAX_ATTEMPTS,
): Promise<T> {
  const attempts = Math.max(1, Math.floor(maxAttempts));
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await producer(attempt);
    } catch (err) {
      lastErr = err;
      const terminal =
        err instanceof ProviderError &&
        (err.code === "auth" || err.code === "credits" || err.code === "bad_input" || err.code === "not_configured");
      if (terminal || attempt >= attempts) throw err;
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw (
    lastErr ??
    new ProviderError(source, "unknown", "Falha desconhecida ao consultar o provedor.")
  );
}
