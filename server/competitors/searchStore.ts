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

import { and, desc, eq, gte, sql } from "drizzle-orm";
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
