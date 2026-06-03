import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { getAppConfig } from "../dbMl";
import { runMonitoringAll } from "../ml/monitoring";

/**
 * Heartbeat callback: runs the monitoring routine for ALL active monitored
 * products across users. Triggered by the platform cron (see monitor router
 * `setSchedule`). Authenticated via the cron session shape.
 *
 * Idempotent: each run appends a fresh snapshot and compares to the previous
 * one to emit alerts. Safe to retry.
 */
export async function monitorScheduledHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const config = await getAppConfig();
    // Only proceed if this cron task is the one we registered.
    if (config?.monitoringCronTaskUid && config.monitoringCronTaskUid !== user.taskUid) {
      return res.json({ ok: true, skipped: "unknown-task" });
    }

    const thresholds = (config?.alertThresholds as any) ?? undefined;
    const result = await runMonitoringAll(thresholds);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({
      error: String(error instanceof Error ? error.message : error),
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}
