/**
 * Runner for competitor searches — designed to be robust on a serverless
 * runtime (Cloud Run, min-instances=0).
 *
 * IMPORTANT (production reality):
 * Fire-and-forget background work does NOT survive on Cloud Run: once the HTTP
 * response to `startSearch` returns, the instance can be frozen or recycled and
 * any in-flight async collection is lost — leaving the DB row stuck in
 * "running" forever (the classic "spinner infinito" in production).
 *
 * To avoid that, the collection runs SYNCHRONOUSLY inside a live request: the
 * polling endpoint (`getSearch`) calls `ensureCollected`, which performs the
 * actual `searchAllSources` work and awaits it. The orchestrator finishes
 * within a ~70s global deadline — comfortably under Cloud Run's 180s request
 * cap — so the work always completes inside a request that is kept alive by the
 * client poll. A per-process in-flight set + a shared promise prevent the same
 * search from being collected twice concurrently within one instance.
 */

import { searchAllSources } from "./orchestrator";
import {
  getSearchRow,
  markFailed,
  markRunning,
  saveResult,
} from "./searchStore";

/** Search ids currently being collected in THIS process, with their promise. */
const inFlight = new Map<number, Promise<void>>();

/** Returns true if a job for this id is already running in this process. */
export function isInFlight(id: number): boolean {
  return inFlight.has(id);
}

/**
 * Execute the collection for a search id. Never throws; all outcomes are
 * written to the DB row. Safe to await.
 */
async function collect(id: number, query: string): Promise<void> {
  try {
    await markRunning(id);
    const result = await searchAllSources(query);

    // If literally nothing came back AND no source even ran successfully,
    // surface it as a soft failure so the UI can explain it honestly.
    const anyOk = result.sourcesUsed.some((s) => s.health === "ok");
    if (result.competitors.length === 0 && !anyOk) {
      await markFailed(
        id,
        "Nenhuma fonte conseguiu coletar concorrentes para este termo no momento.",
      );
      return;
    }

    await saveResult(id, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await markFailed(id, `Falha inesperada na coleta: ${msg}`);
    } catch {
      /* swallow — nothing else we can do */
    }
  }
}

/**
 * Run the collection for an id, de-duplicated per process. Returns the shared
 * promise so concurrent callers await the SAME collection instead of starting
 * a second one.
 */
export function runSearchJob(id: number, query: string): Promise<void> {
  const existing = inFlight.get(id);
  if (existing) return existing;
  const p = collect(id, query).finally(() => {
    inFlight.delete(id);
  });
  inFlight.set(id, p);
  return p;
}

/**
 * Ensure a search has been collected, running the work SYNCHRONOUSLY inside the
 * current (live) request when needed. This is the production-safe entry point
 * used by the polling endpoint.
 *
 * Behaviour:
 *  - If the row is already "done"/"failed" → nothing to do.
 *  - If a collection for this id is already running in THIS process → await it
 *    (so the poll returns the final state in the same response).
 *  - Otherwise (row is pending/running but nobody is collecting it here, e.g.
 *    the original instance died) → take over and collect it now, awaiting the
 *    result. This is what makes the search resilient to instance recycling.
 *
 * It is bounded by the orchestrator's own global deadline (~70s), well under
 * the platform request timeout.
 */
export async function ensureCollected(
  userId: number,
  id: number,
): Promise<void> {
  // A poll that finds a collection already running in THIS process should NOT
  // block on the whole ~60s promise — it just returns the current state so the
  // client keeps polling. Only the FIRST poll (no in-flight job here) actually
  // runs the collection synchronously and awaits it to completion.
  if (inFlight.has(id)) return;

  const row = await getSearchRow(userId, id);
  if (!row) return;
  if (row.status === "done" || row.status === "failed") return;

  // Nobody is collecting it here. Take over and run it to completion now.
  await runSearchJob(id, row.query);
}

/**
 * Legacy fire-and-forget launcher. Kept for compatibility (e.g. warming a
 * collection right after startSearch) but production correctness no longer
 * depends on it: `ensureCollected` will (re)run the work inside a live poll if
 * this background attempt is lost to instance recycling.
 */
export function launchSearchJob(id: number, query: string): void {
  void runSearchJob(id, query).catch(() => {
    /* errors are already persisted inside collect() */
  });
}
