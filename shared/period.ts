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

/** Full current calendar month in BRT (day 1 .. last day), relative to nowMs.
 *  Used for charts that should show every day of the month even when the
 *  month is still in progress (future days come back empty/zeroed). */
export function currentMonthFullRange(nowMs: number): PeriodRange {
  const { year, month } = brtParts(nowMs);
  return {
    fromMs: brtStartOfDayMs(year, month, 1),
    toMs: brtEndOfDayMs(year, month, lastDayOfMonth(year, month)),
  };
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

/** Range covering the last N calendar months including the current one, from
 *  the first BRT day of the oldest month up to nowMs. E.g. N=2 on Jun 10 =>
 *  [May 1 00:00 BRT, Jun 10 now]. */
export function lastNMonthsRange(nowMs: number, months: number): PeriodRange {
  const n = Math.max(1, months);
  const { year, month } = brtParts(nowMs);
  let m = month - (n - 1);
  let y = year;
  while (m < 0) {
    m += 12;
    y -= 1;
  }
  return { fromMs: brtStartOfDayMs(y, m, 1), toMs: nowMs };
}

/** Range covering the last N calendar days ending today (inclusive), anchored
 *  to BRT day boundaries. E.g. N=60 on Jun 10 => [Apr 12 00:00 BRT, today 23:59].
 *  Used for a rolling window that reliably spans previous months. */
export function lastNDaysRange(nowMs: number, days: number): PeriodRange {
  const n = Math.max(1, days);
  const { year, month, day } = brtParts(nowMs);
  // End = end of today (BRT). Start = start of the day (n-1) days ago.
  const toMs = brtEndOfDayMs(year, month, day);
  const startDayMs = brtStartOfDayMs(year, month, day) - (n - 1) * 24 * 60 * 60 * 1000;
  return { fromMs: startDayMs, toMs };
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

// ---------------------------------------------------------------------------
// Unified period model (system-wide standard)
// ---------------------------------------------------------------------------
// Every page that filters by date MUST use the same five options:
//   current  -> "Mês atual"            (day 1 of this month .. now)
//   previous -> "Mês anterior"         (full previous calendar month)
//   last60   -> "60 dias"              (rolling last 60 days)
//   historic -> "Base histórica"       (first sale ever .. now)
//   custom   -> "Personalizado"        (free ISO range chosen by the user)
//
// `historic` needs the account's first-sale instant (firstSaleMs), which the
// backend already exposes via account.storeLifetime. When it is unknown we fall
// back to a wide rolling window so the UI never breaks.

export type StandardPeriodKey = "current" | "previous" | "last60" | "historic" | "custom";

export interface StandardPeriodOption {
  key: StandardPeriodKey;
  label: string;
}

/** The canonical, ordered list of options shown in every selector. */
export const STANDARD_PERIOD_OPTIONS: StandardPeriodOption[] = [
  { key: "current", label: "Mês atual" },
  { key: "previous", label: "Mês anterior" },
  { key: "last60", label: "60 dias" },
  { key: "historic", label: "Base histórica" },
  { key: "custom", label: "Personalizado" },
];

export interface StandardPeriodInput {
  key: StandardPeriodKey;
  /** ISO yyyy-mm-dd, only used when key === "custom". */
  fromIso?: string;
  /** ISO yyyy-mm-dd, only used when key === "custom". */
  toIso?: string;
  /** First sale instant (unix ms). Required for a precise "historic" range. */
  firstSaleMs?: number | null;
}

/** Fallback start for "historic" when the first sale is unknown: ~3 years back. */
const HISTORIC_FALLBACK_MS = 3 * 365 * 24 * 60 * 60 * 1000;

/**
 * Resolve any standard period selection into a concrete [fromMs, toMs] range,
 * anchored to BRT day boundaries. `nowMs` is injected so this stays pure/testable.
 */
export function resolveStandardRange(input: StandardPeriodInput, nowMs: number): PeriodRange {
  switch (input.key) {
    case "current":
      // Full current calendar month so charts can show every day (zeros ahead).
      return currentMonthFullRange(nowMs);
    case "previous":
      return previousMonthRange(nowMs);
    case "last60":
      return lastNDaysRange(nowMs, 60);
    case "historic": {
      const { year, month, day } = brtParts(nowMs);
      const toMs = brtEndOfDayMs(year, month, day);
      const startMs =
        input.firstSaleMs && input.firstSaleMs > 0
          ? // Anchor to the BRT start-of-day of the first sale.
            (() => {
              const p = brtParts(input.firstSaleMs);
              return brtStartOfDayMs(p.year, p.month, p.day);
            })()
          : nowMs - HISTORIC_FALLBACK_MS;
      return { fromMs: startMs, toMs };
    }
    case "custom": {
      if (input.fromIso && input.toIso) {
        const r = customRangeFromIso(input.fromIso, input.toIso);
        if (r) return r;
      }
      // Safe fallback: current month so the UI never renders an invalid range.
      return currentMonthRange(nowMs);
    }
  }
}

/** Whole days (rounded up, min 1) covered by a range. Used to drive day-window
 *  backends (Ads, Lucratividade) from the unified selector without refactoring
 *  their rolling-day contracts. */
export function rangeToDays(range: PeriodRange, nowMs: number): number {
  // For ranges that end in the future (e.g. full current month), clamp the end
  // to "now" so the day count reflects elapsed time, not the whole month.
  const effectiveTo = Math.min(range.toMs, nowMs);
  const ms = Math.max(0, effectiveTo - range.fromMs);
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return Math.max(1, days);
}

/**
 * Resolve a standard selection straight into the equivalent number of days for
 * backends that only accept a rolling window. `current` counts elapsed days of
 * the month; `previous` the length of last month; `last60` is 60; `historic`
 * counts days since the first sale; `custom` the span between the two dates.
 */
export function resolveStandardDays(input: StandardPeriodInput, nowMs: number): number {
  if (input.key === "last60") return 60;
  const range = resolveStandardRange(input, nowMs);
  return rangeToDays(range, nowMs);
}

/** Human-readable title for the active selection (for the header chip). */
export function standardPeriodTitle(
  input: StandardPeriodInput,
  nowMs: number,
  monthLabelFn: (fromMs: number) => string,
): string {
  switch (input.key) {
    case "current":
    case "previous": {
      const range = resolveStandardRange(input, nowMs);
      const label = monthLabelFn(range.fromMs);
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    case "last60":
      return "Últimos 60 dias";
    case "historic":
      return "Base histórica";
    case "custom":
      return input.fromIso && input.toIso ? `${input.fromIso} a ${input.toIso}` : "Personalizado";
  }
}
