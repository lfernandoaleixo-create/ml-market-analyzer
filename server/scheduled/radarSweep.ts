import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { getAppConfig } from "../dbMl";
import { recoverStalledSearches } from "../competitors/searchStore";
import { isInFlight } from "../competitors/searchJob";

/**
 * Heartbeat callback: project-level sweep that keeps the Radar resilient to
 * server restarts. A competitor collection runs as an in-process fire-and-forget
 * job; if the instance is recycled mid-collection (Cloud Run scales to zero,
 * a deploy happens, or dev HMR restarts), that job is lost and its DB row would
 * otherwise stay stuck in "running" forever.
 *
 * This handler finds every pending/running search whose `updatedAt` is older
 * than STALE_JOB_MS and fails it honestly, so the UI shows a clear "tente
 * novamente" instead of an endless "Coletando…". Jobs still alive in THIS
 * process (in-flight) are excluded so we never kill a genuinely running job.
 *
 * Idempotent and safe to retry: a second pass over already-failed rows is a
 * no-op (the recovery only flips pending/running rows).
 */
export async function radarSweepScheduledHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    // Only proceed if this cron task is the one we registered (defends against
    // a stale/foreign task pointing at this endpoint).
    const config = await getAppConfig();
    if (
      config?.radarSweepCronTaskUid &&
      config.radarSweepCronTaskUid !== user.taskUid
    ) {
      return res.json({ ok: true, skipped: "unknown-task" });
    }

    const recovered = await recoverStalledSearches(Date.now(), isInFlight);
    return res.json({ ok: true, recovered });
  } catch (error) {
    return res.status(500).json({
      error: String(error instanceof Error ? error.message : error),
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}
