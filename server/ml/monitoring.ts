import type { InsertAlert } from "../../drizzle/schema";
import {
  addAlert,
  addSnapshot,
  getCredentials,
  latestSnapshot,
  listAllActiveMonitored,
  updateMonitored,
} from "../dbMl";
import { getProvider } from "./provider";

export type AlertThresholds = {
  priceChangePercent: number; // e.g. 8 => alert if price moves >= 8%
  salesSurgePercent: number; // e.g. 25 => alert if sales jump >= 25%
  positionChange: number; // e.g. 3 => alert if rank moves >= 3 spots
};

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  priceChangePercent: 8,
  salesSurgePercent: 25,
  positionChange: 3,
};

/**
 * Derive a fresh, slightly-evolved metric set for a monitored product. When
 * the official provider is active this comes straight from the live item; in
 * demo mode we evolve the previous snapshot deterministically so the history
 * looks like a real, coherent time-series rather than random noise.
 */
function evolveMetrics(
  base: { price: number; soldQuantity: number; position: number; rating: number; reviews: number },
  seedNum: number,
  runIndex: number,
) {
  // Deterministic pseudo-random in [-1, 1] from seed + run.
  const wave = Math.sin(seedNum * 0.7 + runIndex * 1.3);
  const wave2 = Math.cos(seedNum * 1.1 + runIndex * 0.9);
  const priceDelta = wave * 0.05; // +/-5%
  const salesGrowth = Math.max(0, 0.04 + wave2 * 0.06); // 0..10% growth, mostly up
  const positionDelta = Math.round(wave2 * 2); // +/- 2

  const price = Math.max(1, Number((base.price * (1 + priceDelta)).toFixed(2)));
  const soldQuantity = Math.round(base.soldQuantity * (1 + salesGrowth));
  const position = Math.max(1, base.position + positionDelta);
  const reviews = base.reviews + Math.max(0, Math.round(salesGrowth * base.soldQuantity * 0.05));
  return { price, soldQuantity, position, rating: base.rating, reviews };
}

function hashNum(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Core monitoring routine. Idempotent per run by design (it appends a snapshot
 * with the current timestamp and compares to the previous one). Safe to call
 * from the scheduled handler or manually ("Run now").
 *
 * Returns a summary of what happened for observability.
 */
export async function runMonitoringForUser(userId: number, thresholds: AlertThresholds = DEFAULT_THRESHOLDS) {
  const all = await listAllActiveMonitored();
  const mine = all.filter((m) => m.userId === userId);
  return runMonitoringForProducts(mine, thresholds);
}

export async function runMonitoringAll(thresholds: AlertThresholds = DEFAULT_THRESHOLDS) {
  const all = await listAllActiveMonitored();
  return runMonitoringForProducts(all, thresholds);
}

async function runMonitoringForProducts(
  products: Awaited<ReturnType<typeof listAllActiveMonitored>>,
  thresholds: AlertThresholds,
) {
  const now = Date.now();
  let snapshots = 0;
  let alertsCreated = 0;

  for (const mp of products) {
    try {
      const creds = await getCredentials(mp.userId);
      const provider = getProvider(
        creds && creds.appId && creds.clientSecret
          ? { appId: creds.appId, clientSecret: creds.clientSecret }
          : null,
      );

      // Determine the run index based on how many snapshots already exist.
      const prev = await latestSnapshot(mp.id);
      const runIndex = prev ? Math.floor((now - new Date(mp.createdAt).getTime()) / (60 * 60 * 1000)) : 0;

      let metrics: { price: number; soldQuantity: number; position: number; rating: number; reviews: number };

      if (provider.mode === "official") {
        const live = await provider.getProduct(mp.mlItemId);
        if (live) {
          metrics = {
            price: live.price,
            soldQuantity: live.soldQuantity,
            position: live.catalogPosition ?? mp.lastPosition ?? 1,
            rating: live.rating,
            reviews: live.reviewsCount,
          };
        } else {
          continue;
        }
      } else {
        const base = {
          price: prev?.price ?? mp.lastPrice ?? 100,
          soldQuantity: prev?.soldQuantity ?? mp.lastSoldQuantity ?? 100,
          position: prev?.position ?? mp.lastPosition ?? 10,
          rating: prev?.rating ?? 4.5,
          reviews: prev?.reviewsCount ?? 50,
        };
        metrics = evolveMetrics(base, hashNum(mp.mlItemId), runIndex + 1);
      }

      await addSnapshot({
        monitoredProductId: mp.id,
        price: metrics.price,
        soldQuantity: metrics.soldQuantity,
        availableQuantity: null,
        position: metrics.position,
        reviewsCount: metrics.reviews,
        rating: metrics.rating,
        capturedAt: now,
      });
      snapshots++;

      // Compare to previous snapshot and raise alerts.
      if (prev) {
        const newAlerts = detectAlerts(mp, prev, metrics, thresholds);
        for (const a of newAlerts) {
          await addAlert(a);
          alertsCreated++;
        }
      }

      await updateMonitored(mp.id, {
        lastPrice: metrics.price,
        lastSoldQuantity: metrics.soldQuantity,
        lastPosition: metrics.position,
      });
    } catch (err) {
      // Never let one product break the whole run.
      console.error(`[monitoring] failed for product ${mp.id}:`, err);
    }
  }

  return { snapshots, alertsCreated, products: products.length, ranAt: now };
}

function pct(prev: number, cur: number): number {
  if (!prev) return 0;
  return Number((((cur - prev) / prev) * 100).toFixed(1));
}

function detectAlerts(
  mp: Awaited<ReturnType<typeof listAllActiveMonitored>>[number],
  prev: { price: number | null; soldQuantity: number | null; position: number | null },
  cur: { price: number; soldQuantity: number; position: number },
  thresholds: AlertThresholds,
): InsertAlert[] {
  const out: InsertAlert[] = [];
  const shortTitle = mp.title.length > 50 ? mp.title.slice(0, 47) + "..." : mp.title;

  // Price changes
  if (prev.price) {
    const change = pct(prev.price, cur.price);
    if (Math.abs(change) >= thresholds.priceChangePercent) {
      const isDrop = change < 0;
      out.push({
        userId: mp.userId,
        monitoredProductId: mp.id,
        type: isDrop ? "price_drop" : "price_rise",
        severity: Math.abs(change) >= thresholds.priceChangePercent * 2 ? "warning" : "info",
        title: isDrop ? "Queda de preço detectada" : "Aumento de preço detectado",
        message: `${shortTitle}: preço ${isDrop ? "caiu" : "subiu"} ${Math.abs(change)}% (de R$ ${prev.price.toFixed(2)} para R$ ${cur.price.toFixed(2)}).`,
        changePercent: change,
        previousValue: prev.price,
        currentValue: cur.price,
      });
    }
  }

  // Sales surge
  if (prev.soldQuantity) {
    const change = pct(prev.soldQuantity, cur.soldQuantity);
    if (change >= thresholds.salesSurgePercent) {
      out.push({
        userId: mp.userId,
        monitoredProductId: mp.id,
        type: "sales_surge",
        severity: change >= thresholds.salesSurgePercent * 2 ? "critical" : "warning",
        title: "Disparada de vendas",
        message: `${shortTitle}: vendas dispararam ${change}% no período (de ${prev.soldQuantity} para ${cur.soldQuantity} unidades). Possível oportunidade.`,
        changePercent: change,
        previousValue: prev.soldQuantity,
        currentValue: cur.soldQuantity,
      });
    }
  }

  // Position movement (lower number = better)
  if (prev.position) {
    const delta = prev.position - cur.position; // positive = gained positions
    if (Math.abs(delta) >= thresholds.positionChange) {
      const gained = delta > 0;
      out.push({
        userId: mp.userId,
        monitoredProductId: mp.id,
        type: gained ? "position_gain" : "position_loss",
        severity: "info",
        title: gained ? "Subiu no ranking" : "Caiu no ranking",
        message: `${shortTitle}: ${gained ? "subiu" : "caiu"} ${Math.abs(delta)} posições na busca (de #${prev.position} para #${cur.position}).`,
        changePercent: pct(prev.position, cur.position),
        previousValue: prev.position,
        currentValue: cur.position,
      });
    }
  }

  return out;
}

/**
 * Generate a backfill of synthetic historical snapshots for a product, so the
 * trend charts are populated immediately when a product is first added. Only
 * used in demo mode. Returns the rows to insert.
 */
export function buildBackfillSnapshots(opts: {
  monitoredProductId: number;
  itemId: string;
  basePrice: number;
  baseSold: number;
  basePosition: number;
  baseRating: number;
  baseReviews: number;
  days: number;
}) {
  const rows: Omit<import("../../drizzle/schema").InsertProductSnapshot, "id">[] = [];
  const seed = hashNum(opts.itemId);
  const dayMs = 24 * 60 * 60 * 1000;
  const startSold = Math.max(1, Math.round(opts.baseSold * 0.6));
  for (let d = opts.days; d >= 0; d--) {
    const runIndex = opts.days - d;
    const progress = runIndex / Math.max(opts.days, 1);
    const wave = Math.sin(seed * 0.7 + runIndex * 0.5);
    const price = Number((opts.basePrice * (1 + wave * 0.06)).toFixed(2));
    const sold = Math.round(startSold + (opts.baseSold - startSold) * progress);
    const position = Math.max(1, Math.round(opts.basePosition + Math.cos(seed + runIndex * 0.4) * 3));
    const reviews = Math.round(opts.baseReviews * (0.6 + 0.4 * progress));
    rows.push({
      monitoredProductId: opts.monitoredProductId,
      price,
      soldQuantity: sold,
      availableQuantity: null,
      position,
      reviewsCount: reviews,
      rating: opts.baseRating,
      capturedAt: Date.now() - d * dayMs,
    });
  }
  return rows;
}
