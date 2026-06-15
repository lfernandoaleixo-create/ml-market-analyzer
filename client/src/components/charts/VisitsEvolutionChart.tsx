import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatNumber, formatCompact, isoToWeekdayLong } from "@/lib/format";
import { DayAxisTick, dayAxisProps } from "@/components/charts/DayAxisTick";
import { TrendingUp, Eye, Loader2, RefreshCw } from "lucide-react";
import {
  Area,
  ComposedChart,
  Line,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { VisitsDayPoint } from "@shared/account";

/**
 * Daily visits evolution for active listings, with a 7-day moving average and a
 * compact summary strip (Hoje / Ontem / Total / Média / Pico). Shared between
 * the Anúncios page and the Painel so both render an identical chart.
 */
export function VisitsEvolutionChart({
  series,
  loading,
  windowDays = 30,
  pending = false,
  onRetry,
  refreshing = false,
}: {
  series: VisitsDayPoint[];
  loading?: boolean;
  windowDays?: number;
  /** True when the backend could NOT fetch the series (timeout / ML 429). We must
   *  NOT claim "sem visitas" — show a "carregando" state with a retry instead. */
  pending?: boolean;
  /** Optional handler to re-fetch the series (wired to the tRPC refetch). */
  onRetry?: () => void;
  /** True while a manual/auto refetch triggered by onRetry is in flight. */
  refreshing?: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-52 w-full" />;
  }

  const total = series.reduce((s, p) => s + p.visits, 0);

  // The backend asked ML for the series but nothing came back in time (timeout /
  // rate limit). This is NOT a real zero — be honest and offer a refresh.
  if (pending) {
    return (
      <div className="flex h-52 flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Carregando as visitas dos seus anúncios…</p>
          <p className="text-xs text-muted-foreground">
            O Mercado Livre está demorando para responder (muitos anúncios ou limite temporário).
            Os números aparecem assim que a coleta terminar.
          </p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" className="gap-1.5 bg-secondary/40" onClick={onRetry} disabled={refreshing}>
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            {refreshing ? "Atualizando…" : "Atualizar agora"}
          </Button>
        )}
      </div>
    );
  }

  if (series.length === 0 || total === 0) {
    return (
      <div className="flex h-52 flex-col items-center justify-center gap-2 text-center">
        <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Sem visitas registradas nos anúncios ativos nos últimos {windowDays} dias.
        </p>
      </div>
    );
  }

  // "Hoje" must be the BRAZIL (UTC-3) calendar day, matching how the backend
  // anchors the series axis. Using the browser's UTC day would break at night
  // in Brazil (after 21:00 BRT it is already the next day in UTC), making the
  // "Hoje (parcial)" card read 0 and hiding the highlighted dot.
  const todayKey = new Date(Date.now() - 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  // 7-day trailing moving average to smooth the daily noise. Null until there
  // are enough points so the line doesn't start with a misleading ramp.
  const data = series.map((p, i) => {
    let ma: number | null = null;
    if (i >= 6) {
      let sum = 0;
      for (let k = i - 6; k <= i; k++) sum += series[k].visits;
      ma = Math.round(sum / 7);
    }
    return { ...p, isToday: p.date === todayKey, ma };
  });
  const peak = Math.max(...series.map((p) => p.visits));
  const avg = Math.round(total / series.length);
  const todayVisits = series.find((p) => p.date === todayKey)?.visits ?? 0;
  const yesterdayVisits = series.length >= 2 ? series[series.length - 2].visits : 0;
  const showMA = series.length >= 7;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryMini label="Hoje (parcial)" value={formatNumber(todayVisits)} tone="primary" />
        <SummaryMini label="Ontem" value={formatNumber(yesterdayVisits)} tone="muted" />
        <SummaryMini label={`Total ${windowDays}d`} value={formatNumber(total)} tone="muted" />
        <SummaryMini label="Média/dia" value={formatNumber(avg)} tone="muted" />
        <SummaryMini label="Pico" value={formatNumber(peak)} tone="muted" />
      </div>
      <div className="h-56 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={80}>
          <ComposedChart data={data} margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="visitsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal vertical={false} />
            <XAxis
              dataKey="date"
              tick={<DayAxisTick todayKey={todayKey} />}
              {...dayAxisProps}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickMargin={6}
              allowDecimals={false}
              tickFormatter={(v) => formatCompact(Number(v))}
            />
            <Tooltip cursor={{ stroke: "var(--border)" }} content={<VisitsTooltip todayKey={todayKey} />} />
            {showMA && (
              <Legend
                verticalAlign="top"
                align="right"
                height={22}
                iconType="plainline"
                wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)", paddingBottom: 4 }}
              />
            )}
            <Area
              type="monotone"
              dataKey="visits"
              name="Visitas"
              stroke="var(--primary)"
              strokeWidth={2.25}
              fill="url(#visitsFill)"
              dot={<TodayDot todayKey={todayKey} />}
              activeDot={{ r: 4, fill: "var(--primary)", stroke: "var(--background)", strokeWidth: 2 }}
            />
            {showMA && (
              <Line
                type="monotone"
                dataKey="ma"
                name="Média móvel (7d)"
                stroke="var(--muted-foreground)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SummaryMini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "muted";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border px-3 py-2",
        tone === "primary"
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-muted/30",
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "font-display text-xl leading-none tabular-nums",
          tone === "primary" ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Render a visible, highlighted dot only on the current day (real-time, partial). */
function TodayDot({ cx, cy, payload, todayKey }: any) {
  if (payload?.date !== todayKey || cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill="var(--primary)" fillOpacity={0.18} />
      <circle cx={cx} cy={cy} r={3.5} fill="var(--primary)" stroke="var(--background)" strokeWidth={1.5} />
    </g>
  );
}

function VisitsTooltip({ active, payload, todayKey }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload as { date: string; visits: number };
  const isToday = d.date === todayKey;
  return (
    <div
      className="rounded-xl border bg-background px-3 py-2 text-xs shadow-md"
      style={{ borderColor: "var(--border)" }}
    >
      <p className="font-medium text-foreground">
        {isoToWeekdayLong(d.date)}
        {isToday && <span className="ml-1 text-primary">· hoje (parcial)</span>}
      </p>
      <p className="mt-1.5 inline-flex items-center gap-1.5 font-display text-sm text-primary">
        <Eye className="h-3.5 w-3.5" /> {formatNumber(d.visits)}
        <span className="text-muted-foreground">visita(s)</span>
      </p>
    </div>
  );
}
