/**
 * Sales-velocity helpers — derive "how many sales in how much time" from the
 * real monitoring time-series. The Mercado Livre public search does NOT expose
 * per-period sales, so the only honest way to know velocity is to track the
 * cumulative "sold" figure over time and diff it. These helpers do exactly that
 * and never fabricate numbers: when there is not enough real history, they
 * return `available: false` so the UI can stay honest.
 */

export type VelocitySnapshot = {
  /** Unix ms timestamp of the capture. */
  capturedAt: number;
  /** Cumulative sold quantity reported at that capture (or null/undefined). */
  soldQuantity?: number | null;
};

export type VelocityWindow = {
  /** Window size in days requested (e.g. 7, 30). */
  windowDays: number;
  /** Whether a real, usable measurement exists for this window. */
  available: boolean;
  /** Sales accumulated within the window (cur - past), clamped to >= 0. */
  salesInWindow: number;
  /** Average sales per day across the measured span. */
  salesPerDay: number;
  /** Actual span measured, in days (may be < windowDays when history is short). */
  measuredDays: number;
};

/** Sort ascending by capture time and keep only points with a real sold value. */
function usablePoints(snapshots: VelocitySnapshot[]): { t: number; sold: number }[] {
  return snapshots
    .filter((s) => typeof s.soldQuantity === "number" && Number.isFinite(s.soldQuantity) && (s.soldQuantity as number) >= 0)
    .map((s) => ({ t: s.capturedAt, sold: s.soldQuantity as number }))
    .sort((a, b) => a.t - b.t);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compute the sales accumulated over the last `windowDays`, using the latest
 * point as "now" and the earliest point at-or-before the window start as the
 * baseline. Honest by construction:
 *  - needs at least two real points to measure anything;
 *  - clamps negatives to 0 (sold counters never legitimately decrease, but ML
 *    sometimes resets/rounds them — we don't invent a negative velocity).
 */
export function computeVelocityWindow(
  snapshots: VelocitySnapshot[],
  windowDays: number,
  now: number = Date.now(),
): VelocityWindow {
  const pts = usablePoints(snapshots);
  const empty: VelocityWindow = {
    windowDays,
    available: false,
    salesInWindow: 0,
    salesPerDay: 0,
    measuredDays: 0,
  };
  if (pts.length < 2) return empty;

  const latest = pts[pts.length - 1];
  const windowStart = now - windowDays * DAY_MS;

  // Baseline = last point at or before the window start; if none, use the
  // earliest available point (so a short history still yields a measurement).
  let baseline = pts.find((p) => p.t <= windowStart) ?? null;
  if (!baseline) {
    // No point old enough: use the earliest point but only if it is meaningfully
    // before "latest" (avoid dividing by ~0).
    const earliest = pts[0];
    if (latest.t - earliest.t < DAY_MS / 2) return empty;
    baseline = earliest;
  } else {
    // Among multiple points before windowStart, take the closest to it.
    const before = pts.filter((p) => p.t <= windowStart);
    baseline = before[before.length - 1];
  }

  const measuredMs = Math.max(latest.t - baseline.t, 1);
  const measuredDays = measuredMs / DAY_MS;
  const salesInWindow = Math.max(0, latest.sold - baseline.sold);
  const salesPerDay = salesInWindow / measuredDays;

  return {
    windowDays,
    available: true,
    salesInWindow,
    salesPerDay: Number(salesPerDay.toFixed(2)),
    measuredDays: Number(measuredDays.toFixed(2)),
  };
}

/** Convenience: compute the common 7-day and 30-day windows at once. */
export function computeSalesVelocity(
  snapshots: VelocitySnapshot[],
  now: number = Date.now(),
): { last7: VelocityWindow; last30: VelocityWindow; hasAnyRealSales: boolean } {
  const last7 = computeVelocityWindow(snapshots, 7, now);
  const last30 = computeVelocityWindow(snapshots, 30, now);
  const hasAnyRealSales = usablePoints(snapshots).some((p) => p.sold > 0);
  return { last7, last30, hasAnyRealSales };
}

/** Human-friendly label, e.g. "+128 em 7 d (~18/dia)" or "— sem dados". */
export function formatVelocity(w: VelocityWindow): string {
  if (!w.available) return "—";
  const perDay = w.salesPerDay >= 1 ? `~${Math.round(w.salesPerDay)}/dia` : `~${w.salesPerDay}/dia`;
  return `+${w.salesInWindow} em ${w.windowDays} d (${perDay})`;
}
