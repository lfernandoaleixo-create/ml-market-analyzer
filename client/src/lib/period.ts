// Client-facing period helpers. The pure date math lives in `shared/period.ts`
// (unit-tested); here we bind it to the live clock and add display labels.
import {
  type PeriodRange,
  currentMonthRange as currentMonthRangeAt,
  previousMonthRange as previousMonthRangeAt,
  monthRange as monthRangePure,
  lastNMonthsRange as lastNMonthsRangeAt,
  dayRangeFromIso as dayRangeFromIsoPure,
  customRangeFromIso as customRangeFromIsoPure,
  isoDateBrt,
  monthStartIsoBrt as monthStartIsoBrtPure,
  brtParts,
} from "@shared/period";

export type { PeriodRange };

export function currentMonthRange(): PeriodRange {
  return currentMonthRangeAt(Date.now());
}

export function previousMonthRange(): PeriodRange {
  return previousMonthRangeAt(Date.now());
}

export function lastNMonthsRange(months: number): PeriodRange {
  return lastNMonthsRangeAt(Date.now(), months);
}

export function monthRange(year: number, month: number): PeriodRange {
  return monthRangePure(year, month);
}

export function dayRangeFromIso(iso: string): PeriodRange | null {
  return dayRangeFromIsoPure(iso);
}

export function customRangeFromIso(fromIso: string, toIso: string): PeriodRange | null {
  return customRangeFromIsoPure(fromIso, toIso);
}

export function todayIsoBrt(): string {
  return isoDateBrt(Date.now());
}

export function monthStartIsoBrt(): string {
  return monthStartIsoBrtPure(Date.now());
}

/** Month label like "junho de 2026" from a range's fromMs. */
export function monthLabel(fromMs: number): string {
  return new Date(fromMs).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

/** Build a list of selectable months (most recent first), back `count` months. */
export function recentMonths(
  count: number,
): Array<{ value: string; label: string; range: PeriodRange }> {
  const { year, month } = brtParts(Date.now());
  const out: Array<{ value: string; label: string; range: PeriodRange }> = [];
  for (let i = 0; i < count; i++) {
    let m = month - i;
    let y = year;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    const range = monthRangePure(y, m);
    out.push({
      value: `${y}-${String(m + 1).padStart(2, "0")}`,
      label: monthLabel(range.fromMs),
      range,
    });
  }
  return out;
}
