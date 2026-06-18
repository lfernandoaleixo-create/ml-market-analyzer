/**
 * Tiny in-process TTL cache for the connected seller's account data.
 *
 * Why: every dashboard page (Vendas, Anúncios, Pós-venda, Reputação) fires its
 * own tRPC query, and each one fans out into several Mercado Livre API calls.
 * Opening/navigating the panel within a short window therefore bursts dozens of
 * requests at ML and is the main cause of the 429 rate-limit hiccups that froze
 * the live demo.
 *
 * This cache memoizes each account procedure's RESULT per (user, key) for a
 * short TTL (default 5 min). Within that window the panel reads from memory —
 * near-instant and zero ML calls — which all but eliminates the rate-limit risk
 * during a presentation. After the TTL it transparently re-fetches.
 *
 * Notes
 * - Process-local (Cloud Run min-instances=0, single process). That is fine:
 *   the goal is to flatten short bursts, not to be a distributed cache.
 * - In-flight de-duplication: concurrent callers for the same key share ONE
 *   promise, so a page that mounts four queries at once still triggers a single
 *   underlying fetch.
 * - Keys are namespaced by Manus user id so users never see each other's data.
 */

type Entry = {
  /** Epoch ms when the value was stored. */
  at: number;
  /** Resolved value (only set once the promise fulfilled). */
  value?: unknown;
  /** In-flight promise while the underlying fetch is running. */
  inflight?: Promise<unknown>;
  /** Last KNOWN-GOOD value (kept for stale-while-error fallback). */
  lastGood?: unknown;
  /** Epoch ms when `lastGood` was captured. */
  lastGoodAt?: number;
  /** Last error message from a failed background load (cold-start only). */
  lastError?: string;
  /** Epoch ms when `lastError` was captured. */
  lastErrorAt?: number;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;

// Map<userId, Map<key, Entry>>
const store = new Map<number, Map<string, Entry>>();

function bucket(userId: number): Map<string, Entry> {
  let b = store.get(userId);
  if (!b) {
    b = new Map();
    store.set(userId, b);
  }
  return b;
}

/**
 * Return a cached value for (userId, key) if it is still fresh, otherwise run
 * `loader`, cache its result and return it. Concurrent calls for the same key
 * share a single loader invocation.
 *
 * Errors are NOT cached: if `loader` rejects, the entry is dropped so the next
 * call retries (a transient ML hiccup must not be remembered for 5 minutes).
 */
export async function cachedAccount<T>(
  userId: number,
  key: string,
  loader: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const b = bucket(userId);
  const existing = b.get(key);
  const now = Date.now();

  if (existing) {
    // Fresh resolved value → serve from cache.
    if (existing.value !== undefined && now - existing.at < ttlMs) {
      return existing.value as T;
    }
    // A fetch is already running → join it (covers the page's query burst).
    if (existing.inflight) {
      return existing.inflight as Promise<T>;
    }
  }

  const inflight = (async () => {
    const value = await loader();
    b.set(key, { at: Date.now(), value });
    return value;
  })();

  // Record the in-flight promise so siblings can join it.
  b.set(key, { at: now, inflight });

  try {
    return (await inflight) as T;
  } catch (err) {
    // Do not cache failures — drop the entry so the next call retries.
    const cur = b.get(key);
    if (cur && cur.inflight === inflight) b.delete(key);
    throw err;
  }
}

/**
 * Result of a resilient load: the value plus whether it came from a stale
 * fallback (so the UI can show an "atualizado há X" hint instead of an error).
 */
export type ResilientResult<T> = {
  value: T;
  stale: boolean;
  /** Epoch ms when the served value was captured (fresh = now). */
  asOf: number;
};

/**
 * Stale-while-error variant of {@link cachedAccount}.
 *
 * Behaviour:
 *  - Fresh value within `ttlMs` → served immediately (stale: false).
 *  - Otherwise run `loader`:
 *      • success → store as fresh + remember as last-known-good, return it.
 *      • failure → if a last-known-good exists and is younger than
 *        `staleMaxMs`, serve THAT instead of throwing (stale: true). Only when
 *        there is no usable fallback does the error propagate.
 *
 * This is what keeps the dashboard from ever showing the "Não foi possível
 * carregar" screen during a presentation: a transient ML 429/timeout falls back
 * to the last good snapshot (clearly labelled), never a broken page.
 */
export async function cachedAccountResilient<T>(
  userId: number,
  key: string,
  loader: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
  staleMaxMs: number = 6 * 60 * 60 * 1000,
): Promise<ResilientResult<T>> {
  const b = bucket(userId);
  const existing = b.get(key);
  const now = Date.now();

  if (existing) {
    if (existing.value !== undefined && now - existing.at < ttlMs) {
      return { value: existing.value as T, stale: false, asOf: existing.at };
    }
    if (existing.inflight) {
      // Join the running fetch, but still protect with the stale fallback.
      try {
        const v = (await existing.inflight) as T;
        return { value: v, stale: false, asOf: Date.now() };
      } catch (err) {
        const cur = b.get(key);
        if (
          cur?.lastGood !== undefined &&
          cur.lastGoodAt !== undefined &&
          Date.now() - cur.lastGoodAt < staleMaxMs
        ) {
          return { value: cur.lastGood as T, stale: true, asOf: cur.lastGoodAt };
        }
        throw err;
      }
    }
  }

  const inflight = (async () => {
    const value = await loader();
    const prev = b.get(key);
    b.set(key, {
      at: Date.now(),
      value,
      lastGood: value,
      lastGoodAt: Date.now(),
      // keep any older lastGood metadata irrelevant; we just refreshed it
      ...(prev ? {} : {}),
    });
    return value;
  })();

  // Preserve last-known-good while the new fetch runs.
  b.set(key, {
    at: now,
    inflight,
    lastGood: existing?.lastGood,
    lastGoodAt: existing?.lastGoodAt,
  });

  try {
    const value = (await inflight) as T;
    return { value, stale: false, asOf: Date.now() };
  } catch (err) {
    const cur = b.get(key);
    // Drop the failed in-flight entry but KEEP the last-known-good for fallback.
    if (cur && cur.inflight === inflight) {
      if (cur.lastGood !== undefined && cur.lastGoodAt !== undefined) {
        b.set(key, { at: cur.lastGoodAt, lastGood: cur.lastGood, lastGoodAt: cur.lastGoodAt });
      } else {
        b.delete(key);
      }
    }
    if (
      cur?.lastGood !== undefined &&
      cur.lastGoodAt !== undefined &&
      Date.now() - cur.lastGoodAt < staleMaxMs
    ) {
      return { value: cur.lastGood as T, stale: true, asOf: cur.lastGoodAt };
    }
    throw err;
  }
}

/**
 * Result of a non-blocking SWR read.
 *  - `value`  : the data to render right now (may be undefined on a cold start).
 *  - `status` : "fresh" (within TTL), "stale" (serving old data while a refresh
 *               runs in the background), or "loading" (cold start, no data yet —
 *               a refresh has just been kicked off).
 *  - `asOf`   : epoch ms the served value was captured (0 when loading).
 */
export type SwrResult<T> = {
  value: T | undefined;
  status: "fresh" | "stale" | "loading" | "error";
  asOf: number;
  /** Present only when status is "error" (cold start failed, no value to serve). */
  error?: string;
};

/**
 * Stale-while-revalidate read that NEVER blocks on a slow loader.
 *
 * This is purpose-built for the daily visits chart, whose loader fans out into
 * hundreds of Mercado Livre calls and can take many seconds (or hit a 429). We
 * must never make the page wait for it. Behaviour:
 *
 *  - Fresh value within `ttlMs`            → return it (status "fresh"), no work.
 *  - Stale value (older than `ttlMs`)      → return the OLD value immediately
 *                                            (status "stale") and kick off a
 *                                            background refresh (deduped).
 *  - No value yet (cold start)             → return undefined (status "loading")
 *                                            and kick off a background refresh.
 *
 * The loader runs detached; its result updates the cache for the NEXT poll. The
 * client simply polls this cheap endpoint every minute and the numbers fill in
 * as soon as the background collection finishes — the request itself returns in
 * milliseconds, every time.
 */
export function swrAccount<T>(
  userId: number,
  key: string,
  loader: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): SwrResult<T> {
  const b = bucket(userId);
  const existing = b.get(key);
  const now = Date.now();

  const hasValue = existing?.value !== undefined;
  const fresh = hasValue && now - (existing as Entry).at < ttlMs;

  // Fresh → serve as-is, no background work.
  if (fresh) {
    return { value: (existing as Entry).value as T, status: "fresh", asOf: (existing as Entry).at };
  }

  // Not fresh: ensure a single background refresh is running (dedupe via inflight).
  if (!existing?.inflight) {
    const inflight = (async () => {
      const value = await loader();
      b.set(key, { at: Date.now(), value, lastGood: value, lastGoodAt: Date.now() });
      return value;
    })();
    // Preserve any existing value so we keep serving it while the refresh runs.
    b.set(key, {
      at: existing?.at ?? 0,
      value: existing?.value,
      inflight,
      lastGood: existing?.value ?? existing?.lastGood,
      lastGoodAt: existing?.value !== undefined ? existing?.at : existing?.lastGoodAt,
    });
    // Detach: a background failure must not crash the process or be unhandled.
    inflight.catch((err: unknown) => {
      const cur = b.get(key);
      // Drop only the inflight marker; KEEP any value we were serving. Record the
      // error so a COLD start (no value) can surface an honest "error" status
      // instead of looping forever on "loading" (e.g. ML 429 on first access).
      if (cur && cur.inflight === inflight) {
        b.set(key, {
          at: cur.at,
          value: cur.value,
          lastGood: cur.lastGood,
          lastGoodAt: cur.lastGoodAt,
          lastError: err instanceof Error ? err.message : String(err),
          lastErrorAt: Date.now(),
        });
      }
    });
  }

  // Serve the old value if we have one (stale), otherwise signal a cold load.
  if (hasValue) {
    return { value: (existing as Entry).value as T, status: "stale", asOf: (existing as Entry).at };
  }
  // Cold start with NO value. If the most recent background attempt failed very
  // recently (and we still have nothing to serve), surface it as an honest error
  // so the UI can show "tente novamente" instead of an endless "preparando...".
  const RECENT_ERROR_MS = 20 * 1000;
  if (
    existing?.lastError !== undefined &&
    existing.lastErrorAt !== undefined &&
    now - existing.lastErrorAt < RECENT_ERROR_MS
  ) {
    return { value: undefined, status: "error", asOf: 0, error: existing.lastError };
  }
  return { value: undefined, status: "loading", asOf: 0 };
}

/** Invalidate one key (or the whole user bucket when key is omitted). */
export function invalidateAccount(userId: number, key?: string): void {
  if (key === undefined) {
    store.delete(userId);
    return;
  }
  store.get(userId)?.delete(key);
}

/** Test helper: wipe everything. */
export function __clearAccountCache(): void {
  store.clear();
}
