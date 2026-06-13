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
