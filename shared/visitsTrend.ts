/**
 * Pure, framework-free helpers shared between client and tests.
 *
 * Kept under `shared/` so the Vitest config (which only picks up
 * `server/**` and `shared/**`) can cover them. The React components import
 * these directly.
 */

/** Parse an ISO date (yyyy-mm-dd) into a UTC Date, or null when malformed. */
function isoToUtcDate(iso: string): Date | null {
  const [y, m, d] = (iso ?? "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/** True when the ISO date falls on Saturday (6) or Sunday (0), in UTC. */
export function isoIsWeekend(iso: string): boolean {
  const dt = isoToUtcDate(iso);
  if (!dt) return false;
  const dow = dt.getUTCDay();
  return dow === 0 || dow === 6;
}

export type VisitsPoint = { date: string; visits: number };

/**
 * Visits evolution: percentage change between the first and the second half of
 * the window, ignoring `todayKey` (the current day is partial and would skew
 * the trend). Returns null when there isn't enough history to be meaningful.
 *
 * - secondHalf > firstHalf  => positive (visits growing)
 * - firstHalf === 0 && second > 0 => +100 (came from zero)
 */
export function computeVisitsTrendPct(
  series: VisitsPoint[],
  todayKey: string,
): number | null {
  if (!Array.isArray(series) || series.length < 4) return null;
  const past = series.filter((p) => p.date !== todayKey);
  if (past.length < 4) return null;
  const mid = Math.floor(past.length / 2);
  const firstHalf = past.slice(0, mid).reduce((s, p) => s + p.visits, 0);
  const secondHalf = past.slice(mid).reduce((s, p) => s + p.visits, 0);
  if (firstHalf === 0) return secondHalf > 0 ? 100 : null;
  return ((secondHalf - firstHalf) / firstHalf) * 100;
}
