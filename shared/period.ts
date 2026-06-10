// Pure period math anchored to the seller's timezone (Brazil, GMT-3).
// Kept in `shared/` so it can be unit-tested and reused by the client.
// Boundaries are computed in BRT and returned as UTC unix ms so they line up
// with the backend, which buckets orders by UTC ISO date.

const BR_OFFSET_MS = 3 * 60 * 60 * 1000; // BRT = UTC-3 (no DST)

export interface PeriodRange {
  fromMs: number;
  toMs: number;
}

/** Wall-clock parts (year, month 0-11, day) in BRT for a given instant. */
export function brtParts(nowMs: number): { year: number; month: number; day: number } {
  const d = new Date(nowMs - BR_OFFSET_MS); // shift so UTC getters read BRT
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

/** UTC ms for the BRT start-of-day (00:00:00 BRT) of a given Y/M/D. */
export function brtStartOfDayMs(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day, 0, 0, 0, 0) + BR_OFFSET_MS;
}

/** UTC ms for the BRT end-of-day (23:59:59.999 BRT) of a given Y/M/D. */
export function brtEndOfDayMs(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day, 23, 59, 59, 999) + BR_OFFSET_MS;
}

/** Last calendar day of a given month (1-based month input via Date.UTC trick). */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** [start of current month 00:00 BRT, nowMs]. */
export function currentMonthRange(nowMs: number): PeriodRange {
  const { year, month } = brtParts(nowMs);
  return { fromMs: brtStartOfDayMs(year, month, 1), toMs: nowMs };
}

/** Full previous calendar month in BRT, relative to nowMs. */
export function previousMonthRange(nowMs: number): PeriodRange {
  const { year, month } = brtParts(nowMs);
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  return {
    fromMs: brtStartOfDayMs(prevYear, prevMonth, 1),
    toMs: brtEndOfDayMs(prevYear, prevMonth, lastDayOfMonth(prevYear, prevMonth)),
  };
}

/** Full calendar month containing the given anchor (month 0-11). */
export function monthRange(year: number, month: number): PeriodRange {
  return {
    fromMs: brtStartOfDayMs(year, month, 1),
    toMs: brtEndOfDayMs(year, month, lastDayOfMonth(year, month)),
  };
}

/** A single BRT calendar day from an ISO yyyy-mm-dd string. */
export function dayRangeFromIso(iso: string): PeriodRange | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { fromMs: brtStartOfDayMs(y, m - 1, d), toMs: brtEndOfDayMs(y, m - 1, d) };
}

/** Custom inclusive range from two ISO dates. */
export function customRangeFromIso(fromIso: string, toIso: string): PeriodRange | null {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return null;
  return { fromMs: brtStartOfDayMs(fy, fm - 1, fd), toMs: brtEndOfDayMs(ty, tm - 1, td) };
}

/** yyyy-mm-dd for an instant, in BRT. */
export function isoDateBrt(nowMs: number): string {
  const { year, month, day } = brtParts(nowMs);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** First day of the BRT month of an instant, as yyyy-mm-dd. */
export function monthStartIsoBrt(nowMs: number): string {
  const { year, month } = brtParts(nowMs);
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}
