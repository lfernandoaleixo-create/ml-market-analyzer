/**
 * Profitability orchestration — shared by the tRPC router and the daily
 * Heartbeat snapshot. It performs the I/O (BaseLinker costs + ML orders +
 * optional Ads spend) and runs the pure tax engine, returning the full
 * ProfitabilityResult.
 *
 * Keeping this here (instead of inline in the router) lets the scheduled job
 * capture the exact same numbers the user sees in the UI.
 */

import { defaultTaxConfig, type TaxConfig, type UF } from "../../shared/finance";
import { BaselinkerError } from "../baselinker/client";
import { getInventories, getProductCosts, getOrders } from "../baselinker/provider";
import { buildProfitability, type AdsByItem } from "./profitability";
import { ensureUserAccessToken, forceRefreshUserAccessToken } from "../ml/oauthMl";
import { AdsProvider } from "../ml/adsProvider";
import { MLRateLimitError } from "../ml/accountProvider";
import { getTaxConfigRow } from "../dbMl";

const ALL_UF: UF[] = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB",
  "PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

export const ALL_UF_LIST = ALL_UF;

/** Merge a stored partial config over the defaults so new fields appear. */
export function hydrateConfig(stored: unknown, ttsEnabled: boolean): TaxConfig {
  const base = defaultTaxConfig();
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<TaxConfig>;
  return {
    ...base,
    ...s,
    icmsInternalByUF: { ...base.icmsInternalByUF, ...(s.icmsInternalByUF ?? {}) },
    fcpByUF: { ...(base.fcpByUF ?? {}), ...(s.fcpByUF ?? {}) },
    ttsEnabled,
  };
}

/** Build a per-listing Ads spend map (best-effort; never throws). */
export async function loadAdsByItem(userId: number, days: number): Promise<AdsByItem> {
  const map: AdsByItem = new Map();
  try {
    const token = await ensureUserAccessToken(userId);
    if (!token) return map;
    const ads = new AdsProvider(token, "MLB", (stale) =>
      forceRefreshUserAccessToken(userId, stale),
    );
    const advertiserId = await ads.getAdvertiserId();
    if (!advertiserId) return map;
    const rows = await ads.getAds(days, undefined, 400);
    for (const r of rows) {
      const prev = map.get(r.itemId) ?? 0;
      map.set(r.itemId, prev + (r.metrics?.cost ?? 0));
    }
  } catch (err) {
    if (!(err instanceof MLRateLimitError)) {
      console.warn("[finance] loadAdsByItem failed:", (err as Error)?.message ?? err);
    }
  }
  return map;
}

export interface ComputeOptions {
  /** Skip the Ads call entirely (faster; used by the daily snapshot). */
  skipAds?: boolean;
}

/**
 * Resolve config + inventory and compute the profitability payload for a user.
 * Throws BaselinkerError on data-source problems (caller decides how to surface).
 */
export async function computeProfitabilityForUser(
  userId: number,
  days: number,
  opts: ComputeOptions = {},
) {
  const row = await getTaxConfigRow(userId);
  const ttsEnabled = row?.ttsEnabled ?? false;
  const config = hydrateConfig(row?.config, ttsEnabled);
  let inventoryId = row?.baselinkerInventoryId ?? null;

  if (inventoryId == null) {
    const invs = await getInventories();
    inventoryId = invs[0]?.inventoryId ?? null;
    if (inventoryId == null) {
      throw new BaselinkerError("api_error", "Nenhum catálogo encontrado no BaseLinker.");
    }
  }

  const now = Date.now();
  const from = now - days * 24 * 60 * 60 * 1000;

  const [costs, orders, adsByItem] = await Promise.all([
    getProductCosts(inventoryId),
    getOrders(from),
    opts.skipAds ? Promise.resolve(new Map() as AdsByItem) : loadAdsByItem(userId, days),
  ]);

  return buildProfitability({ orders, costs, config, from, to: now, adsByItem });
}

/** YYYY-MM-DD for a given instant in America/Sao_Paulo. */
export function snapshotDayKey(now = new Date()): string {
  // pt-BR locale in São Paulo timezone, then reorder to ISO.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA already yields YYYY-MM-DD
}

export interface ProfitSnapshotCapture {
  userId: number;
  day: string;
  orderCount: number;
  revenue: number;
  netProfitSemTts: number;
  netProfitComTts: number;
  marginSemTts: number;
  marginComTts: number;
}

/**
 * Compute and persist the daily profitability snapshot for a user.
 * Idempotent per day (the DB helper upserts by (userId, day)).
 */
export async function captureProfitSnapshotForUser(
  userId: number,
  days = 30,
): Promise<ProfitSnapshotCapture> {
  const { upsertProfitSnapshot, getTaxConfigRow } = await import("../dbMl");
  const result = await computeProfitabilityForUser(userId, days);
  const day = snapshotDayKey();
  const row = await getTaxConfigRow(userId);
  const ttsEnabled = row?.ttsEnabled ?? false;

  const sem = result.comparison.semTts;
  const com = result.comparison.comTts;
  // Cost breakdown reflects the user's CURRENT (selected) scenario.
  const cur = result.totals;

  await upsertProfitSnapshot({
    userId,
    snapshotDate: day,
    periodDays: days,
    ttsEnabled,
    orderCount: result.orderCount,
    revenue: round2(result.totals.revenue),
    netProfitSemTts: round2(sem.netProfit),
    netProfitComTts: round2(com.netProfit),
    marginSemTts: round2(((sem.margin ?? 0) * 100)),
    marginComTts: round2(((com.margin ?? 0) * 100)),
    commission: round2(cur.commission),
    shipping: round2(cur.shipping),
    cmv: round2(cur.cmv),
    taxes: round2(cur.tax),
    ads: round2(cur.ads),
    capturedAt: Date.now(),
  });

  return {
    userId,
    day,
    orderCount: result.orderCount,
    revenue: round2(result.totals.revenue),
    netProfitSemTts: round2(sem.netProfit),
    netProfitComTts: round2(com.netProfit),
    marginSemTts: round2(((sem.margin ?? 0) * 100)),
    marginComTts: round2(((com.margin ?? 0) * 100)),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
