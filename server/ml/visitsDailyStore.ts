/**
 * Progressive, process-level store for per-item DAILY visit series.
 *
 * Mirrors `visitsStore.ts` (which keeps a single TOTAL per item) but stores the
 * per-day breakdown (Map<isoDate, visits>) for each item, so the Lista de
 * anúncios can show visits split by day (hoje / ontem / anteontem / 3 dias).
 *
 * The Mercado Livre dated endpoint (`/items/{id}/visits/time_window`) only
 * accepts ONE item per request and throttles bursts (429), so — exactly like
 * the totals collector — we:
 *   - keep a per-user `itemId -> { days, at }` map in process memory,
 *   - serve whatever has been collected so far WITHOUT blocking, and
 *   - kick a single background collector per (user, window) for missing/stale
 *     items, with gentle concurrency, persisting each item as it resolves.
 *
 * Process-local is fine: Cloud Run runs a single process (min-instances=0); the
 * goal is progressive collection within a session, not distribution.
 */

type ItemDaily = {
  /** isoDate (yyyy-mm-dd, BRT) -> visits on that day. */
  days: Map<string, number>;
  /** Epoch ms when collected (for staleness). */
  at: number;
};

type WindowStore = {
  /** itemId -> collected daily series for this window. */
  items: Map<string, ItemDaily>;
  /** A background collection currently running for this window (dedupe). */
  inflight?: Promise<void>;
  /** Epoch ms the last background run finished. */
  lastRunAt?: number;
};

// Map<userId, Map<windowDays, WindowStore>>
const store = new Map<number, Map<number, WindowStore>>();

/** A collected per-item daily series is considered fresh for this long.
 *  Shorter than the totals TTL (15 min) because the breakdown changes by the
 *  hour for TODAY — we want the current day to refresh reasonably often. */
const ITEM_TTL_MS = 10 * 60 * 1000; // 10 minutes

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

export type DailySnapshot = {
  /** itemId -> Map<isoDate, visits>, ONLY for items collected so far. */
  map: Map<string, Map<string, number>>;
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
 * Read the daily series collected so far for the given ids WITHOUT blocking.
 * Only items with a fresh collected value are included; the rest are absent
 * (callers must treat absence as "pending", never as a real zero).
 */
export function readDailyVisits(
  userId: number,
  windowDays: number,
  ids: string[],
): DailySnapshot {
  const w = windowStore(userId, windowDays);
  const now = Date.now();
  const map = new Map<string, Map<string, number>>();
  let resolved = 0;
  for (const id of ids) {
    const hit = w.items.get(id);
    if (hit && now - hit.at < ITEM_TTL_MS) {
      map.set(id, new Map(hit.days));
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

/** Write one collected item's daily series into the store (merge, never discard). */
export function putDailyVisits(
  userId: number,
  windowDays: number,
  itemId: string,
  days: Map<string, number>,
): void {
  const w = windowStore(userId, windowDays);
  w.items.set(itemId, { days: new Map(days), at: Date.now() });
}

/**
 * Ensure a background collector is running for the ids that are still missing
 * or stale. Returns immediately; the work runs detached and writes results into
 * the store as they arrive. Deduped: only one collection per (user, window).
 *
 * @param fetchOne async fn that returns { ok, days } for ONE item, where `ok`
 *   means ML actually answered (a genuine all-zero day still counts). When
 *   `ok` is false the item is NOT stored, so it is retried on the next run.
 */
export function ensureCollectingDaily(
  userId: number,
  windowDays: number,
  ids: string[],
  fetchOne: (itemId: string) => Promise<{ ok: boolean; days: Map<string, number> }>,
  opts: { concurrency?: number } = {},
): void {
  const w = windowStore(userId, windowDays);
  if (w.inflight) return; // already collecting

  const now = Date.now();
  const missing = ids.filter((id) => {
    const hit = w.items.get(id);
    return !hit || now - hit.at >= ITEM_TTL_MS;
  });
  if (missing.length === 0) return; // everything fresh

  const concurrency = opts.concurrency ?? 2;
  const run = (async () => {
    for (let i = 0; i < missing.length; i += concurrency) {
      const batch = missing.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (id) => {
          try {
            return [id, await fetchOne(id)] as const;
          } catch {
            return [id, { ok: false, days: new Map<string, number>() }] as const;
          }
        }),
      );
      for (const [id, res] of results) {
        if (res.ok) putDailyVisits(userId, windowDays, id, res.days);
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
export function __clearVisitsDailyStore(): void {
  store.clear();
}
