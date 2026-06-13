import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { listUsersWithMlCredentials } from "../dbMl";
import { ensureUserAccessToken, forceRefreshUserAccessToken } from "../ml/oauthMl";
import { AdsProvider } from "../ml/adsProvider";
import { MLRateLimitError } from "../ml/accountProvider";
import { captureDailySnapshot } from "../ml/adsAuditStore";

/**
 * Heartbeat callback: captures the DAILY Mercado Ads snapshot for every
 * connected user, so the Mamba audit + category history keep building even when
 * nobody opens the ADS screen.
 *
 * Tracks ACTIVE ads only (paused/closed are excluded) — the category and audit
 * tracking always follows the live set. Idempotent per (user, day): the store
 * refreshes today's snapshot and only diffs once per day, so retries are safe.
 *
 * Authenticated via the cron session shape (`user.isCron`). Best-effort per
 * user: one user's rate limit or transient error never aborts the others.
 */
export async function adsSnapshotScheduledHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const userIds = await listUsersWithMlCredentials();
    const results: Array<{
      userId: number;
      ok: boolean;
      day?: string;
      changes?: number;
      activeAds?: number;
      campaigns?: number;
      error?: string;
    }> = [];

    for (const userId of userIds) {
      try {
        const token = await ensureUserAccessToken(userId);
        if (!token) {
          results.push({ userId, ok: false, error: "no-token" });
          continue;
        }
        const ads = new AdsProvider(token, "MLB", (staleToken) =>
          forceRefreshUserAccessToken(userId, staleToken),
        );
        const advertiserId = await ads.getAdvertiserId();
        if (!advertiserId) {
          results.push({ userId, ok: true, error: "no-ads-access" });
          continue;
        }
        const campaigns = await ads.getCampaigns(30);
        // ACTIVE ads only — the snapshot must follow the live set.
        const adRows = await ads.getAds(30, undefined, 400, { activeOnly: true });
        const snap = await captureDailySnapshot(userId, campaigns, adRows);
        results.push({
          userId,
          ok: true,
          day: snap.day,
          changes: snap.changesDetected,
          activeAds: adRows.length,
          campaigns: campaigns.length,
        });
      } catch (err) {
        const msg =
          err instanceof MLRateLimitError
            ? "rate-limited"
            : String(err instanceof Error ? err.message : err);
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
