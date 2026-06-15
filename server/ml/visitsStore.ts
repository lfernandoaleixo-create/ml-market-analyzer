/**
 * Progressive, process-level store for per-item visit counts.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Mercado Livre dated visits endpoint (`/items/{id}/visits/time_window`)
 * only accepts ONE item per request. A seller with ~130 listings therefore
 * needs ~130 sequential/parallel calls to compute the "Visits (30d)" total, and
 * ML aggressively throttles (429) bursts. The old design ran this fan-out INSIDE
 * each `getListings` request under a 13s budget and threw the partial result
 * away every time. Under throttling it frequently resolved ZERO items, so the
 * card was stuck forever on "carregando" no matter how many times the user hit
 * refresh — each refresh restarted from scratch and hit the same wall.
 *
 * THE FIX
 * -------
 * Decouple visit collection from the request and make it ACCUMULATE:
 *   - A per-user map `itemId -> { visits, at }` lives in this module (process
 *     memory) and is MERGED across runs — we never discard what we already got.
 *   - A single background collector runs per (user, window), walking the items
 *     that are missing or stale, with gentle concurrency. Each item it resolves
 *     is written into the map immediately, so progress survives even if the run
 *     is later cancelled or 429s halfway.
 *   - `getListings` reads this map (instant, non-blocking) and kicks the
 *     collector if data is missing/stale. The card shows whatever is collected
 *     so far and fills in on the next poll — it can never be permanently stuck.
 *
 * Process-local is fine: Cloud Run runs a single process (min-instances=0); the
 * goal is to make collection progressive within a session, not distributed.
 */

type ItemVisit = {
  /** Real visit count ML returned for this item over `windowDays`. */
  visits: number;
  /** Epoch ms when it was collected (for staleness). */
  at: number;
};

type WindowStore = {
  /** itemId -> collected visits for this window. */
  items: Map<string, ItemVisit>;
  /** A background collection currently running for this window (dedupe). */
  inflight?: Promise<void>;
  /** Epoch ms the last background run finished (success or give-up). */
  lastRunAt?: number;
};

// Map<userId, Map<windowDays, WindowStore>>
const store = new Map<number, Map<number, WindowStore>>();

/** A collected per-item visit is considered fresh for this long. */
const ITEM_TTL_MS = 15 * 60 * 1000; // 15 minutes

function userBucket(userId: number): Map<number, WindowStore> {
  let b = store.get(userId);
  if (!b) {
    b = new Map();
    store.set(userId, b);
  }
  return b;
}

function windowStore(userId: number, windowDays: number): WindowStore {
  const b = userBucket(userId);
  let w = b.get(windowDays);
  if (!w) {
    w = { items: new Map() };
    b.set(windowDays, w);
  }
  return w;
}

/** Snapshot of the current collection progress for a (user, window). */
export type VisitsSnapshot = {
  /** itemId -> visits, ONLY for items collected so far (real ML answers). */
  map: Map<string, number>;
  /** How many of the requested ids already have a (fresh) collected value. */
  resolved: number;
  /** How many ids were requested. */
  attempted: number;
  /** Whether a background collection is currently running. */
  collecting: boolean;
  /** Epoch ms the last run finished (0 if never). */
  lastRunAt: number;
};

/**
 * Read the visits collected so far for the given ids WITHOUT blocking. Only
 * items with a fresh collected value are included in `map`; the rest are simply
 * absent (callers must treat absence as "pending", never as a real zero).
 */
export function readVisits(userId: number, windowDays: number, ids: string[]): VisitsSnapshot {
  const w = windowStore(userId, windowDays);
  const now = Date.now();
  const map = new Map<string, number>();
  let resolved = 0;
  for (const id of ids) {
    const hit = w.items.get(id);
    if (hit && now - hit.at < ITEM_TTL_MS) {
      map.set(id, hit.visits);
      resolved += 1;
    }
  }
  return {
    map,
    resolved,
    attempted: ids.length,
    collecting: w.inflight !== undefined,
    lastRunAt: w.lastRunAt ?? 0,
  };
}

/** Write one collected item visit into the store (merge, never discard). */
export function putVisit(userId: number, windowDays: number, itemId: string, visits: number): void {
  const w = windowStore(userId, windowDays);
  w.items.set(itemId, { visits, at: Date.now() });
}

/**
 * Ensure a background collector is running for the ids that are still missing
 * or stale. Returns immediately; the work runs detached and writes results into
 * the store as they arrive. Deduped: only one collection per (user, window) at
 * a time.
 *
 * @param fetchOne async fn that returns the real visit count for ONE item, or
 *   null when ML did not answer (timeout/429) — nulls are simply not stored, so
 *   they are retried on the next run.
 */
export function ensureCollecting(
  userId: number,
  windowDays: number,
  ids: string[],
  fetchOne: (itemId: string) => Promise<number | null>,
  opts: { concurrency?: number } = {},
): void {
  const w = windowStore(userId, windowDays);
  if (w.inflight) return; // already collecting

  const now = Date.now();
  const missing = ids.filter((id) => {
    const hit = w.items.get(id);
    return !hit || now - hit.at >= ITEM_TTL_MS;
  });
  if (missing.length === 0) return; // everything fresh, nothing to do

  const concurrency = opts.concurrency ?? 4;
  const run = (async () => {
    for (let i = 0; i < missing.length; i += concurrency) {
      const batch = missing.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (id) => {
          try {
            return [id, await fetchOne(id)] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      );
      for (const [id, v] of results) {
        if (typeof v === "number") putVisit(userId, windowDays, id, v);
      }
    }
  })();

  w.inflight = run;
  run
    .catch(() => {
      /* swallow: partial progress is already persisted item-by-item */
    })
    .finally(() => {
      const cur = windowStore(userId, windowDays);
      if (cur.inflight === run) {
        cur.inflight = undefined;
        cur.lastRunAt = Date.now();
      }
    });
}

/** Test/maintenance helper: wipe the whole store. */
export function __clearVisitsStore(): void {
  store.clear();
}
