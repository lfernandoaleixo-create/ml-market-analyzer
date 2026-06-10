/**
 * Persistence layer for the ASYNC competitor search (job + cache).
 *
 * A search is keyed by its normalized query. The collection runs in the
 * background; the UI polls the row until status becomes "done"/"failed".
 * A finished row doubles as a cache: repeating the same term returns instantly
 * until the user explicitly refreshes it (which forces a brand-new run).
 *
 * All timestamps are stored as UTC unix-ms (bigint) at the API/DB layer.
 */

import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import {
  competitorResults,
  competitorSearches,
  type CompetitorSearch,
} from "../../drizzle/schema";
import type {
  SourceStatus,
  UnifiedCompetitor,
  UnifiedSearchResult,
} from "@shared/sources";
import { getDb } from "../db";

/** How long a finished search stays "fresh" before we suggest a refresh (ms). */
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Hard ceiling for how long a collection may stay in "pending"/"running".
 * Beyond this, the job is considered orphaned (e.g. the server restarted mid
 * collection and lost the in-process fire-and-forget runner) and gets failed
 * honestly so the UI never hangs on "Coletando…" forever.
 *
 * The orchestrator now finishes a collection within ~70s (global deadline), so
 * a job that hasn't been touched for 2 minutes is almost certainly orphaned
 * (e.g. the server restarted mid-collection). Failing it quickly keeps the UI
 * from ever sitting on "Coletando…" for long.
 */
export const STALE_JOB_MS = 2 * 60 * 1000; // 2 minutes

/** Normalize a query into a stable cache key. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Shape returned to the client when polling a search. */
export interface SearchView {
  id: number;
  query: string;
  status: CompetitorSearch["status"];
  resultCount: number;
  triangulated: boolean;
  sourcesUsed: SourceStatus[] | null;
  errorNote: string | null;
  finishedAt: number | null;
  createdAt: number;
  /** True when a finished result is older than CACHE_TTL_MS. */
  stale: boolean;
  /** Unified competitors (only populated for finished searches when requested). */
  competitors?: UnifiedCompetitor[];
}

function toView(row: CompetitorSearch): SearchView {
  const finishedAt = row.finishedAt ?? null;
  const stale =
    row.status === "done" && finishedAt !== null
      ? Date.now() - finishedAt > CACHE_TTL_MS
      : false;
  return {
    id: row.id,
    query: row.query,
    status: row.status,
    resultCount: row.resultCount,
    triangulated: row.triangulated,
    sourcesUsed: (row.sourcesUsed as SourceStatus[] | null) ?? null,
    errorNote: row.errorNote ?? null,
    finishedAt,
    createdAt: row.createdAt.getTime(),
    stale,
  };
}

/** Find the most recent search row for a normalized term (any status). */
export async function findLatestByQuery(
  userId: number,
  normalized: string,
): Promise<CompetitorSearch | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(competitorSearches)
    .where(
      and(
        eq(competitorSearches.userId, userId),
        eq(competitorSearches.normalizedQuery, normalized),
      ),
    )
    .orderBy(desc(competitorSearches.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Fetch a single search row by id (scoped to the user). */
export async function getSearchRow(
  userId: number,
  id: number,
): Promise<CompetitorSearch | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(competitorSearches)
    .where(
      and(eq(competitorSearches.id, id), eq(competitorSearches.userId, userId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Create a fresh pending search and return its id. */
export async function createSearch(
  userId: number,
  query: string,
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("database_unavailable");
  const normalized = normalizeQuery(query);
  const res = await db.insert(competitorSearches).values({
    userId,
    query: query.trim().slice(0, 256),
    normalizedQuery: normalized.slice(0, 256),
    status: "pending",
  });
  // mysql2 driver returns insertId on the first element.
  const insertId = (res as unknown as { insertId?: number }).insertId
    ?? (Array.isArray(res) ? (res[0] as { insertId?: number })?.insertId : undefined);
  if (!insertId) {
    // Fallback: read it back by latest.
    const row = await findLatestByQuery(userId, normalized);
    if (!row) throw new Error("create_search_failed");
    return row.id;
  }
  return insertId;
}

export async function markRunning(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(competitorSearches)
    .set({ status: "running" })
    .where(eq(competitorSearches.id, id));
}

export async function markFailed(id: number, note: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(competitorSearches)
    .set({ status: "failed", errorNote: note.slice(0, 1000), finishedAt: Date.now() })
    .where(eq(competitorSearches.id, id));
}

/** Persist a finished result: write competitors + flip status to done. */
export async function saveResult(
  id: number,
  result: UnifiedSearchResult,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Replace any previous results for this search (idempotent on refresh).
  await db.delete(competitorResults).where(eq(competitorResults.searchId, id));

  if (result.competitors.length > 0) {
    const rows = result.competitors.map((c, idx) => ({
      searchId: id,
      rank: idx,
      name: c.name.slice(0, 512),
      price: c.price.value,
      payload: c as unknown as Record<string, unknown>,
    }));
    // Chunk inserts to stay well under packet limits.
    const CHUNK = 50;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(competitorResults).values(rows.slice(i, i + CHUNK));
    }
  }

  await db
    .update(competitorSearches)
    .set({
      status: "done",
      resultCount: result.competitors.length,
      triangulated: result.triangulated,
      sourcesUsed: result.sourcesUsed as unknown as Record<string, unknown>[],
      errorNote: null,
      finishedAt: Date.now(),
    })
    .where(eq(competitorSearches.id, id));
}

/** Read the unified competitors persisted for a finished search. */
export async function getResults(
  searchId: number,
): Promise<UnifiedCompetitor[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(competitorResults)
    .where(eq(competitorResults.searchId, searchId))
    .orderBy(competitorResults.rank);
  return rows.map((r) => r.payload as unknown as UnifiedCompetitor);
}

/** Build a poll-friendly view of a search, optionally including competitors. */
export async function getSearchView(
  userId: number,
  id: number,
  includeResults: boolean,
): Promise<SearchView | null> {
  const row = await getSearchRow(userId, id);
  if (!row) return null;
  const view = toView(row);
  if (includeResults && row.status === "done") {
    view.competitors = await getResults(id);
  }
  return view;
}

/**
 * Count how many searches a user has STARTED since a given unix-ms instant.
 * Used by the consumption panel to show "buscas hoje / no mês". Counts every
 * started search (each one triggers the paid sources), regardless of outcome.
 */
export async function countSearchesSince(
  userId: number,
  sinceMs: number,
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(competitorSearches)
    .where(
      and(
        eq(competitorSearches.userId, userId),
        gte(competitorSearches.createdAt, new Date(sinceMs)),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

/** List the user's most recent searches (for the "recent searches" panel). */
export async function listRecentSearches(
  userId: number,
  limit = 12,
): Promise<SearchView[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(competitorSearches)
    .where(eq(competitorSearches.userId, userId))
    .orderBy(desc(competitorSearches.createdAt))
    .limit(limit);
  return rows.map(toView);
}

/** Honest note written on a search that was orphaned by a server restart. */
export const STALE_RECOVERY_NOTE =
  "A coleta foi interrompida antes de concluir (o serviço reiniciou durante o processo). Clique em \"Atualizar\" para tentar novamente.";

/**
 * Decide whether a poll-view row is an orphaned (stalled) collection: it is
 * still pending/running but hasn't been touched for longer than STALE_JOB_MS.
 * Pure helper so it can be unit-tested without a DB.
 */
export function isStalled(
  status: CompetitorSearch["status"],
  updatedAtMs: number,
  nowMs: number = Date.now(),
): boolean {
  if (status !== "pending" && status !== "running") return false;
  return nowMs - updatedAtMs > STALE_JOB_MS;
}

/**
 * Mark a set of search ids as failed with the honest recovery note. Idempotent:
 * only flips rows that are still pending/running (so it never overwrites a row
 * that finished in the meantime). Returns the number of rows recovered.
 */
export async function failStalledByIds(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  if (!db) return 0;
  const res = await db
    .update(competitorSearches)
    .set({
      status: "failed",
      errorNote: STALE_RECOVERY_NOTE,
      finishedAt: Date.now(),
    })
    .where(
      and(
        inArray(competitorSearches.id, ids),
        inArray(competitorSearches.status, ["pending", "running"]),
      ),
    );
  // mysql2 returns affectedRows on the first element.
  const affected =
    (res as unknown as { affectedRows?: number }).affectedRows ??
    (Array.isArray(res)
      ? (res[0] as { affectedRows?: number })?.affectedRows
      : undefined);
  return Number(affected ?? ids.length);
}

/**
 * Project-wide sweep: find every pending/running search whose `updatedAt` is
 * older than STALE_JOB_MS and fail it with the honest recovery note. Used by
 * the Heartbeat cron handler (`/api/scheduled/radarSweep`). Returns how many
 * rows were recovered. Safe to call repeatedly (idempotent).
 */
export async function recoverStalledSearches(
  nowMs: number = Date.now(),
  isAlive?: IsAlivePredicate,
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const cutoff = new Date(nowMs - STALE_JOB_MS);
  const stale = await db
    .select({ id: competitorSearches.id })
    .from(competitorSearches)
    .where(
      and(
        or(
          eq(competitorSearches.status, "pending"),
          eq(competitorSearches.status, "running"),
        ),
        lt(competitorSearches.updatedAt, cutoff),
      ),
    );
  const ids = stale
    .map((r) => r.id)
    .filter((id) => (isAlive ? !isAlive(id) : true));
  return failStalledByIds(ids);
}

/**
 * Optional predicate: returns true when a given search id is still being
 * actively collected in THIS process (in-flight). When provided, those ids are
 * NEVER recovered — so we never kill a job that is genuinely still running.
 */
export type IsAlivePredicate = (id: number) => boolean;

/**
 * Runtime fallback used by the polling endpoints: recover only THIS user's
 * stalled searches before returning a view, so the UI never hangs on
 * "Coletando…" even before the cron is deployed. Returns recovered ids.
 *
 * `isAlive` lets the caller exclude jobs still running in-process (in-flight),
 * so a long-but-alive collection is never failed prematurely.
 */
export async function recoverStalledForUser(
  userId: number,
  nowMs: number = Date.now(),
  isAlive?: IsAlivePredicate,
): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(nowMs - STALE_JOB_MS);
  const stale = await db
    .select({ id: competitorSearches.id })
    .from(competitorSearches)
    .where(
      and(
        eq(competitorSearches.userId, userId),
        or(
          eq(competitorSearches.status, "pending"),
          eq(competitorSearches.status, "running"),
        ),
        lt(competitorSearches.updatedAt, cutoff),
      ),
    );
  const ids = stale
    .map((r) => r.id)
    .filter((id) => (isAlive ? !isAlive(id) : true));
  await failStalledByIds(ids);
  return ids;
}
