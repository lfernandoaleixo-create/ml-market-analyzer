/**
 * Background runner for competitor searches.
 *
 * The dev/prod runtime is a single Node process with a per-request timeout, so
 * we deliberately DO NOT await the collection inside the tRPC mutation. Instead
 * we kick off `runSearchJob` (fire-and-forget) and let the client poll the DB
 * row for status. This keeps requests fast and survives the 180s request cap.
 *
 * A tiny in-memory guard prevents the same search id (or the same normalized
 * term) from being collected twice concurrently within one process.
 */

import { searchAllSources } from "./orchestrator";
import {
  markFailed,
  markRunning,
  saveResult,
} from "./searchStore";

/** Search ids currently being collected in THIS process. */
const inFlight = new Set<number>();

/** Returns true if a job for this id is already running in this process. */
export function isInFlight(id: number): boolean {
  return inFlight.has(id);
}

/**
 * Execute the collection for a search id. Fire-and-forget friendly: it never
 * throws to the caller; all outcomes are written to the DB row.
 */
export async function runSearchJob(id: number, query: string): Promise<void> {
  if (inFlight.has(id)) return;
  inFlight.add(id);
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
  } finally {
    inFlight.delete(id);
  }
}

/**
 * Fire-and-forget launcher used by the tRPC mutation. Intentionally not
 * awaited by the request handler.
 */
export function launchSearchJob(id: number, query: string): void {
  void runSearchJob(id, query).catch(() => {
    /* errors are already persisted inside runSearchJob */
  });
}
