/**
 * adsAuditStore — persistence + orchestration for the Mamba audit and the
 * category tracker. This is the I/O layer that sits on top of:
 *   - adsProvider  (live Mercado Ads reads)
 *   - adsAudit     (pure categorization + change-detection logic)
 *   - drizzle       (daily snapshots + change log)
 *
 * Core idea: every time the ADS audit/category views are opened (or the daily
 * Heartbeat fires) we call `captureDailySnapshot`. It is IDEMPOTENT per
 * (user, captureDay): the first call of the day stores the snapshot and diffs
 * it against the most recent PRIOR day, recording any detected changes. Later
 * calls the same day just refresh the stored metrics without duplicating
 * change-log rows.
 */
import { and, desc, eq, lt } from "drizzle-orm";
import {
  adsCampaignSnapshots,
  adsChangeLog,
  adsItemSnapshots,
  type AdsCampaignSnapshot,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  ADS_CATEGORIES,
  type AdsAdRow,
  type AdsAuditReport,
  type AdsCampaign,
  type AdsCategoryKey,
  type AdsCategoryReport,
  type AdsChangeEntry,
  type AdsManagedCampaign,
} from "@shared/ads";
import {
  buildCategoryStats,
  categorize,
  diffCampaign,
  judgeCurrentConfig,
  type CampaignSnapshotLike,
  toSnapshotLike,
} from "./adsAudit";

const TZ = "America/Sao_Paulo";

/** YYYY-MM-DD for "now" in the seller's timezone. */
export function captureDayString(d = new Date()): string {
  // en-CA yields YYYY-MM-DD; timeZone forces the São Paulo calendar date.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const labelMap = Object.fromEntries(
  ADS_CATEGORIES.map((c) => [c.key, c.label]),
) as Record<AdsCategoryKey, string>;

/**
 * Persist today's snapshot for all campaigns + ads (idempotent per day) and,
 * on the FIRST capture of the day, diff against the latest prior snapshot and
 * record detected changes. Safe to call on every page open.
 */
export async function captureDailySnapshot(
  userId: number,
  campaigns: AdsCampaign[],
  ads: AdsAdRow[],
): Promise<{ day: string; changesDetected: number; firstOfDay: boolean }> {
  const db = await getDb();
  const day = captureDayString();
  if (!db) return { day, changesDetected: 0, firstOfDay: false };

  // Has today already been captured?
  const existingToday = await db
    .select({ id: adsCampaignSnapshots.id })
    .from(adsCampaignSnapshots)
    .where(
      and(
        eq(adsCampaignSnapshots.userId, userId),
        eq(adsCampaignSnapshots.captureDay, day),
      ),
    )
    .limit(1);
  const firstOfDay = existingToday.length === 0;

  // Snapshot rows for campaigns (upsert-by-delete to keep metrics fresh).
  if (!firstOfDay) {
    await db
      .delete(adsCampaignSnapshots)
      .where(
        and(
          eq(adsCampaignSnapshots.userId, userId),
          eq(adsCampaignSnapshots.captureDay, day),
        ),
      );
    await db
      .delete(adsItemSnapshots)
      .where(
        and(
          eq(adsItemSnapshots.userId, userId),
          eq(adsItemSnapshots.captureDay, day),
        ),
      );
  }

  if (campaigns.length > 0) {
    await db.insert(adsCampaignSnapshots).values(
      campaigns.map((c) => ({
        userId,
        captureDay: day,
        campaignId: c.id,
        name: c.name,
        status: c.status,
        strategy: c.strategy ?? null,
        acosTarget: c.acosTarget,
        roasTarget: c.roasTarget,
        budget: c.budget,
        automaticBudget: c.automaticBudget,
        mlLastUpdated: c.lastUpdated ?? null,
        metrics: c.metrics,
      })),
    );
  }

  if (ads.length > 0) {
    // Chunk inserts to stay well within statement limits.
    const rows = ads.map((a) => ({
      userId,
      captureDay: day,
      itemId: a.itemId,
      campaignId: a.campaignId,
      title: a.title,
      categoryKey: categorize(a.title),
      status: a.status,
      price: a.price,
      metrics: a.metrics,
    }));
    for (let i = 0; i < rows.length; i += 100) {
      await db.insert(adsItemSnapshots).values(rows.slice(i, i + 100));
    }
  }

  let changesDetected = 0;

  // Only diff on the first capture of the day, against the latest PRIOR day.
  if (firstOfDay) {
    const prior = await db
      .select()
      .from(adsCampaignSnapshots)
      .where(
        and(
          eq(adsCampaignSnapshots.userId, userId),
          lt(adsCampaignSnapshots.captureDay, day),
        ),
      )
      .orderBy(desc(adsCampaignSnapshots.captureDay));

    if (prior.length > 0) {
      const priorDay = prior[0].captureDay;
      const priorRows = prior.filter((r) => r.captureDay === priorDay);
      const priorById = new Map<number, AdsCampaignSnapshot>(
        priorRows.map((r) => [r.campaignId, r]),
      );

      const detected: (typeof adsChangeLog.$inferInsert)[] = [];
      for (const c of campaigns) {
        const prev = priorById.get(c.id);
        if (!prev) continue;
        const prevLike: CampaignSnapshotLike = {
          campaignId: prev.campaignId,
          name: prev.name,
          status: prev.status,
          strategy: prev.strategy,
          acosTarget: prev.acosTarget,
          budget: prev.budget,
          automaticBudget: prev.automaticBudget,
        };
        const changes = diffCampaign(prevLike, toSnapshotLike(c), c.metrics);
        for (const ch of changes) {
          detected.push({
            userId,
            campaignId: ch.campaignId,
            campaignName: ch.campaignName,
            detectedDay: day,
            field: ch.field,
            oldValue: ch.oldValue,
            newValue: ch.newValue,
            verdict: ch.verdict,
            assessment: ch.assessment,
            recommendation: ch.recommendation,
          });
        }
      }
      if (detected.length > 0) {
        await db.insert(adsChangeLog).values(detected);
        changesDetected = detected.length;
      }
    }
  }

  return { day, changesDetected, firstOfDay };
}

/** Build the Mamba audit report from stored changes + live campaign config. */
export async function buildAuditReport(
  userId: number,
  campaigns: AdsCampaign[],
): Promise<Omit<AdsAuditReport, "connection">> {
  const db = await getDb();
  const now = Date.now();

  let changeRows: (typeof adsChangeLog.$inferSelect)[] = [];
  let firstDay: string | null = null;
  let snapshotDays = 0;

  if (db) {
    changeRows = await db
      .select()
      .from(adsChangeLog)
      .where(eq(adsChangeLog.userId, userId))
      .orderBy(desc(adsChangeLog.detectedAt));

    const days = await db
      .selectDistinct({ day: adsCampaignSnapshots.captureDay })
      .from(adsCampaignSnapshots)
      .where(eq(adsCampaignSnapshots.userId, userId))
      .orderBy(adsCampaignSnapshots.captureDay);
    snapshotDays = days.length;
    firstDay = days.length > 0 ? days[0].day : null;
  }

  const changes: AdsChangeEntry[] = changeRows.map((r) => ({
    id: r.id,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    detectedDay: r.detectedDay,
    field: r.field,
    oldValue: r.oldValue,
    newValue: r.newValue,
    verdict: r.verdict,
    assessment: r.assessment,
    recommendation: r.recommendation,
    detectedAt: r.detectedAt instanceof Date ? r.detectedAt.getTime() : Number(r.detectedAt),
  }));

  const managedCampaigns: AdsManagedCampaign[] = campaigns.map((c) => {
    const verdict = judgeCurrentConfig(c);
    return {
      campaignId: c.id,
      name: c.name,
      managedByMamba: /mamba|fibra/i.test(c.name),
      status: c.status,
      acosTarget: c.acosTarget,
      budget: c.budget,
      automaticBudget: c.automaticBudget,
      strategy: c.strategy,
      metrics: c.metrics,
      ourVerdict: verdict.verdict,
      ourComment: verdict.comment,
    };
  });

  const daysTracked = firstDay
    ? Math.max(
        1,
        Math.round(
          (Date.now() - new Date(firstDay + "T00:00:00-03:00").getTime()) /
            86400000,
        ) + 1,
      )
    : 0;

  return {
    trackingSince: firstDay,
    daysTracked,
    snapshotDays,
    changes,
    managedCampaigns,
    summary: {
      totalChanges: changes.length,
      coherent: changes.filter((c) => c.verdict === "coherent").length,
      questionable: changes.filter((c) => c.verdict === "questionable").length,
      mambaCampaigns: managedCampaigns.filter((c) => c.managedByMamba).length,
    },
    computedAt: now,
  };
}

/** Build the category tracker report from LIVE ads (real-time). */
export function buildCategoryReport(
  ads: AdsAdRow[],
  periodDays: number,
): Omit<AdsCategoryReport, "connection"> {
  const categories = buildCategoryStats(ads, labelMap);
  return {
    periodDays,
    categories,
    computedAt: Date.now(),
  };
}
