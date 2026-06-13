// Centralizes the unified period selector state used across every page.
// One source of truth so the selector behaves identically everywhere and any
// new section just calls usePeriod() + renders <PeriodSelector>.
import { useMemo, useState } from "react";
import {
  type PeriodRange,
  type StandardPeriodKey,
  type StandardPeriodInput,
  resolveStandardRange,
  resolveStandardDays,
  standardPeriodTitle,
} from "@shared/period";
import { monthLabel, todayIsoBrt, monthStartIsoBrt } from "@/lib/period";

export interface UsePeriodOptions {
  /** Default option when the page opens. Defaults to "current". */
  initialKey?: StandardPeriodKey;
  /** First sale instant (unix ms) for a precise "Base histórica" range. */
  firstSaleMs?: number | null;
}

export interface UsePeriodResult {
  key: StandardPeriodKey;
  setKey: (k: StandardPeriodKey) => void;
  fromIso: string;
  toIso: string;
  setFromIso: (v: string) => void;
  setToIso: (v: string) => void;
  /** Concrete [fromMs, toMs] for range-based backends (Painel, Vendas). */
  range: PeriodRange;
  /** Equivalent rolling-day count for day-window backends (Ads, Lucratividade). */
  days: number;
  /** Header chip title for the active selection. */
  title: string;
  /** The normalized input object (handy to pass around). */
  input: StandardPeriodInput;
}

/**
 * Stateful hook driving the standard 5-option period selector. The `nowMs` is
 * frozen on first render so query inputs stay referentially stable (avoids the
 * "new Date() every render" infinite-refetch pitfall).
 */
export function usePeriod(opts: UsePeriodOptions = {}): UsePeriodResult {
  const [key, setKey] = useState<StandardPeriodKey>(opts.initialKey ?? "current");
  const [fromIso, setFromIso] = useState(() => monthStartIsoBrt());
  const [toIso, setToIso] = useState(() => todayIsoBrt());
  const [nowMs] = useState(() => Date.now());

  const firstSaleMs = opts.firstSaleMs ?? null;

  const input = useMemo<StandardPeriodInput>(
    () => ({ key, fromIso, toIso, firstSaleMs }),
    [key, fromIso, toIso, firstSaleMs],
  );

  const range = useMemo(() => resolveStandardRange(input, nowMs), [input, nowMs]);
  const days = useMemo(() => resolveStandardDays(input, nowMs), [input, nowMs]);
  const title = useMemo(
    () => standardPeriodTitle(input, nowMs, monthLabel),
    [input, nowMs],
  );

  return { key, setKey, fromIso, toIso, setFromIso, setToIso, range, days, title, input };
}
