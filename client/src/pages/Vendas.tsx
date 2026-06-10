import { useMemo, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { trpc } from "@/lib/trpc";
import {
  PageShell,
  PageHeader,
  KpiCard,
  KpiSkeletonRow,
  SectionCard,
  NotConnected,
  ErrorState,
} from "@/components/account/AccountUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatBRL, formatCompact, formatNumber } from "@/lib/format";
import {
  currentMonthRange,
  previousMonthRange,
  customRangeFromIso,
  dayRangeFromIso,
  todayIsoBrt,
  monthStartIsoBrt,
  monthLabel,
} from "@/lib/period";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ShoppingBag,
  DollarSign,
  Receipt,
  Boxes,
  XCircle,
  ExternalLink,
  CalendarDays,
  CalendarRange,
} from "lucide-react";

type PeriodKind = "current" | "previous" | "custom";

const TABS: Array<{ key: PeriodKind; label: string }> = [
  { key: "current", label: "Mês atual" },
  { key: "previous", label: "Mês anterior" },
  { key: "custom", label: "Personalizado" },
];

export default function Vendas() {
  const [kind, setKind] = useState<PeriodKind>("current");
  const [fromIso, setFromIso] = useState(monthStartIsoBrt());
  const [toIso, setToIso] = useState(todayIsoBrt());
  const [dayIso, setDayIso] = useState(todayIsoBrt());

  const conn = trpc.account.connection.useQuery();
  const connected = conn.data?.connected === true;

  // Stable ranges for current + previous month (one batched call).
  const periodsInput = useMemo(() => {
    const cur = currentMonthRange();
    const prev = previousMonthRange();
    return {
      periods: [
        { key: "current", fromMs: cur.fromMs, toMs: cur.toMs },
        { key: "previous", fromMs: prev.fromMs, toMs: prev.toMs },
      ],
    };
  }, []);

  const periods = trpc.account.salesPeriods.useQuery(periodsInput, { enabled: connected });

  // The range driving the main chart + KPIs + top products.
  const activeRange = useMemo(() => {
    if (kind === "current") return currentMonthRange();
    if (kind === "previous") return previousMonthRange();
    return customRangeFromIso(fromIso, toIso) ?? currentMonthRange();
  }, [kind, fromIso, toIso]);

  const rangeQuery = trpc.account.salesRange.useQuery(
    { fromMs: activeRange.fromMs, toMs: activeRange.toMs, fill: true },
    { enabled: connected },
  );

  // Single-day card.
  const dayRange = useMemo(() => dayRangeFromIso(dayIso), [dayIso]);
  const dayQuery = trpc.account.salesRange.useQuery(
    { fromMs: dayRange?.fromMs ?? 0, toMs: dayRange?.toMs ?? 1, fill: false },
    { enabled: connected && !!dayRange },
  );

  if (conn.isLoading && conn.data === undefined) {
    return (
      <PageShell>
        <Skeleton className="h-9 w-64" />
        <KpiSkeletonRow count={4} />
      </PageShell>
    );
  }
  const hasCachedData = !!periods.data || !!rangeQuery.data || !!dayQuery.data;
  if (conn.data && !connected && !conn.isFetching && !hasCachedData) {
    return <NotConnected />;
  }
  if (conn.error && !hasCachedData) return <ErrorState message={conn.error.message} />;

  const cur = periods.data?.current;
  const prev = periods.data?.previous;
  const k = rangeQuery.data?.kpis;
  const dayK = dayQuery.data?.kpis;

  // Build dense daily bars (day number on X axis).
  const bars =
    rangeQuery.data?.daily.map((d) => {
      const day = Number(d.date.split("-")[2]);
      return { ...d, label: String(day) };
    }) ?? [];

  const periodTitle =
    kind === "current"
      ? capitalize(monthLabel(activeRange.fromMs))
      : kind === "previous"
        ? capitalize(monthLabel(activeRange.fromMs))
        : `${fromIso} a ${toIso}`;

  return (
    <PageShell>
      <PageHeader
        title="Vendas"
        subtitle="Faturamento, pedidos e ticket médio da sua loja, com dados reais do Mercado Livre."
      />

      {/* Month comparison cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MonthCompareCard
          title="Mês atual"
          subtitle={capitalize(monthLabel(periodsInput.periods[0].fromMs))}
          summary={cur}
          loading={periods.isLoading}
          accent="emerald"
          active={kind === "current"}
          onClick={() => setKind("current")}
        />
        <MonthCompareCard
          title="Mês anterior"
          subtitle={capitalize(monthLabel(periodsInput.periods[1].fromMs))}
          summary={prev}
          loading={periods.isLoading}
          accent="blue"
          active={kind === "previous"}
          onClick={() => setKind("previous")}
        />
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl bg-secondary p-1">
          {TABS.map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={kind === t.key ? "default" : "ghost"}
              className="h-8 rounded-lg px-3 text-xs"
              onClick={() => setKind(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        {kind === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={fromIso}
              max={toIso || todayIsoBrt()}
              onChange={(e) => setFromIso(e.target.value)}
              className="h-9 w-[150px]"
            />
            <span className="text-sm text-muted-foreground">até</span>
            <Input
              type="date"
              value={toIso}
              min={fromIso}
              max={todayIsoBrt()}
              onChange={(e) => setToIso(e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" /> {periodTitle}
        </span>
      </div>

      {/* KPI row for the active period */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Faturamento"
          value={rangeQuery.isLoading ? "" : formatBRL(k?.revenue ?? 0)}
          loading={rangeQuery.isLoading}
          icon={DollarSign}
          accent="emerald"
        />
        <KpiCard
          label="Pedidos pagos"
          value={rangeQuery.isLoading ? "" : formatNumber(k?.orders ?? 0)}
          loading={rangeQuery.isLoading}
          icon={ShoppingBag}
          accent="primary"
        />
        <KpiCard
          label="Ticket médio"
          value={rangeQuery.isLoading ? "" : formatBRL(k?.avgTicket ?? 0)}
          loading={rangeQuery.isLoading}
          icon={Receipt}
          accent="blue"
        />
        <KpiCard
          label="Unidades vendidas"
          value={rangeQuery.isLoading ? "" : formatNumber(k?.unitsSold ?? 0)}
          loading={rangeQuery.isLoading}
          icon={Boxes}
          accent="violet"
          sublabel={
            k && k.cancelled > 0 ? (
              <span className="inline-flex items-center gap-1 text-rose-600">
                <XCircle className="h-3 w-3" /> {formatNumber(k.cancelled)} cancelados
              </span>
            ) : undefined
          }
        />
      </div>

      {/* Bar chart (left, wide) + single-day card (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          title="Faturamento por dia"
          description={`Todos os dias de ${periodTitle.toLowerCase()}`}
          className="lg:col-span-2"
        >
          {rangeQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : bars.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    minTickGap={2}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(v) => formatCompact(Number(v))}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--secondary)", opacity: 0.5 }}
                    formatter={(v: number) => [formatBRL(Number(v)), "Faturamento"]}
                    labelFormatter={(l) => `Dia ${l}`}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="revenue" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        {/* Vendas do dia */}
        <SectionCard title="Vendas do dia">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={dayIso}
                max={todayIsoBrt()}
                onChange={(e) => setDayIso(e.target.value)}
                className="h-9"
              />
            </div>
            {dayQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl bg-emerald-500/10 p-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                    Faturamento do dia
                  </p>
                  <p className="font-display text-3xl text-emerald-600 mt-1">
                    {formatBRL(dayK?.revenue ?? 0)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <DayStat
                    label="Pedidos"
                    value={formatNumber(dayK?.orders ?? 0)}
                    icon={ShoppingBag}
                  />
                  <DayStat
                    label="Unidades"
                    value={formatNumber(dayK?.unitsSold ?? 0)}
                    icon={Boxes}
                  />
                </div>
                <div className="rounded-xl bg-secondary/60 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Ticket médio do dia</p>
                  <p className="text-lg font-semibold">{formatBRL(dayK?.avgTicket ?? 0)}</p>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Top products */}
      <SectionCard title="Produtos que mais venderam" description={`Top de ${periodTitle.toLowerCase()}`}>
        {rangeQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (rangeQuery.data?.topProducts.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma venda registrada neste período.
          </p>
        ) : (
          <div className="divide-y">
            {rangeQuery.data!.topProducts.map((p, idx) => (
              <div key={p.itemId} className="flex items-center gap-3 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-semibold text-muted-foreground">
                  {idx + 1}
                </span>
                <ProductImage src={p.thumbnail} alt={p.title} className="h-11 w-11 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(p.unitsSold)} un. vendidas
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatBRL(p.revenue)}</p>
                  {p.permalink && (
                    <a
                      href={p.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Ver anúncio <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}

function MonthCompareCard({
  title,
  subtitle,
  summary,
  loading,
  accent,
  active,
  onClick,
}: {
  title: string;
  subtitle: string;
  summary?: { revenue: number; orders: number; unitsSold: number; avgTicket: number };
  loading?: boolean;
  accent: "emerald" | "blue";
  active?: boolean;
  onClick?: () => void;
}) {
  const accentText = accent === "emerald" ? "text-emerald-600" : "text-blue-600";
  return (
    <Card
      onClick={onClick}
      className={cn(
        "card-soft border-0 rounded-2xl p-5 cursor-pointer transition-shadow hover:shadow-md",
        active && "ring-2 ring-primary/60",
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-base tracking-tight">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {active && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            Selecionado
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-9 w-32" />
      ) : (
        <>
          <p className={cn("font-display text-3xl tracking-tight mt-3", accentText)}>
            {formatBRL(summary?.revenue ?? 0)}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Pedidos" value={formatNumber(summary?.orders ?? 0)} />
            <MiniStat label="Unidades" value={formatNumber(summary?.unitsSold ?? 0)} />
            <MiniStat label="Ticket" value={formatBRL(summary?.avgTicket ?? 0)} />
          </div>
        </>
      )}
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/60 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function DayStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof ShoppingBag;
}) {
  return (
    <div className="rounded-xl bg-secondary/60 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function EmptyChart() {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
      Sem dados de faturamento no período.
    </div>
  );
}
