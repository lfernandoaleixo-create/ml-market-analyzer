import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { listUsersWithMlCredentials } from "../dbMl";
import { isBaselinkerConfigured, BaselinkerError } from "../baselinker/client";
import { captureProfitSnapshotForUser } from "../finance/profitabilityService";
import { MLRateLimitError } from "../ml/accountProvider";

/**
 * Heartbeat callback: captures the DAILY profitability snapshot for every
 * connected user, so the margin history (sem TTS x com TTS) keeps building even
 * when nobody opens the Lucratividade screen.
 *
 * Idempotent per (user, day): the store upserts today's row, so retries are
 * safe. Best-effort per user: one user's rate limit/error never aborts others.
 *
 * Authenticated via the cron session shape (`user.isCron`).
 */
export async function profitSnapshotScheduledHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    if (!isBaselinkerConfigured()) {
      return res.json({
        ok: true,
        skipped: "baselinker-not-configured",
        timestamp: new Date().toISOString(),
      });
    }

    const userIds = await listUsersWithMlCredentials();
    const results: Array<{
      userId: number;
      ok: boolean;
      day?: string;
      orders?: number;
      revenue?: number;
      netSemTts?: number;
      netComTts?: number;
      error?: string;
    }> = [];

    for (const userId of userIds) {
      try {
        const snap = await captureProfitSnapshotForUser(userId, 30);
        results.push({
          userId,
          ok: true,
          day: snap.day,
          orders: snap.orderCount,
          revenue: snap.revenue,
          netSemTts: snap.netProfitSemTts,
          netComTts: snap.netProfitComTts,
        });
      } catch (err) {
        let msg: string;
        if (err instanceof MLRateLimitError) msg = "ml-rate-limited";
        else if (err instanceof BaselinkerError) msg = `baselinker:${err.code}`;
        else msg = String(err instanceof Error ? err.message : err);
        // Best-effort: record and continue with the next user.
        results.push({ userId, ok: false, error: msg });
      }
    }

    return res.json({
      ok: true,
      users: userIds.length,
      succeeded: results.filter((r) => r.ok).length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error: String(error instanceof Error ? error.message : error),
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}
