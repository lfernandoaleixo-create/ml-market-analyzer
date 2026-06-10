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
} from "@/components/account/AccountUI";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  formatBRL,
  formatNumber,
  formatBRLCompact,
  reputationLabel,
  reputationColor,
} from "@/lib/format";
import {
  currentMonthRange,
  currentMonthFullRange,
  previousMonthRange,
  lastNDaysRange,
  customRangeFromIso,
  monthStartIsoBrt,
  todayIsoBrt,
  monthLabel,
} from "@/lib/period";
import { isoDateBrt as brtIso } from "@shared/period";
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
  DollarSign,
  ShoppingBag,
  Package,
  Star,
  ArrowUpRight,
  AlertCircle,
  Search,
  XCircle,
  CalendarRange,
  Store,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Receipt,
  ShoppingCart,
  PackageOpen,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Link, useLocation } from "wouter";

type PeriodKind = "current" | "previous" | "last60" | "custom";

const TABS: Array<{ key: PeriodKind; label: string }> = [
  { key: "current", label: "Mês atual" },
  { key: "previous", label: "Mês anterior" },
  { key: "last60", label: "60 dias" },
  { key: "custom", label: "Personalizado" },
];

/** Maps a Mercado Livre reputation level id to a KpiCard accent color. */
function reputationAccent(
  levelId?: string | null,
): "green" | "yellow" | "orange" | "red" | "violet" {
  switch (levelId) {
    case "5_green":
    case "4_light_green":
      return "green";
    case "3_yellow":
      return "yellow";
    case "2_orange":
      return "orange";
    case "1_red":
      return "red";
    default:
      return "violet";
  }
}

export default function Painel() {
  const conn = trpc.account.connection.useQuery();
  const connected = conn.data?.connected === true;
  // Lightweight credentials read to surface a discreet "connection expired" reminder.
  const creds = trpc.monitor.getCredentials.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000, // re-check a cada 5 min
  });
  const connectionStale = creds.data?.tokenExpired === true;

  const [kind, setKind] = useState<PeriodKind>("current");
  const [fromIso, setFromIso] = useState(monthStartIsoBrt());
  const [toIso, setToIso] = useState(todayIsoBrt());

  // The range driving the bar chart + sales KPIs.
  const activeRange = useMemo(() => {
    if (kind === "current") return currentMonthFullRange();
    if (kind === "previous") return previousMonthRange();
    if (kind === "last60") return lastNDaysRange(60);
    return customRangeFromIso(fromIso, toIso) ?? currentMonthRange();
  }, [kind, fromIso, toIso]);

  // Keep querying as long as we believe we're connected OR we still have a
  // cached connection from before a transient session hiccup.
  const everConnected = conn.data?.connected === true;
  const sales = trpc.account.salesRange.useQuery(
    { fromMs: activeRange.fromMs, toMs: activeRange.toMs, fill: true },
    { enabled: everConnected },
  );
  const listings = trpc.account.listings.useQuery({ lastDays: 30 }, { enabled: everConnected });
  const rep = trpc.account.reputation.useQuery(undefined, { enabled: everConnected });
  const lifetime = trpc.account.storeLifetime.useQuery(undefined, { enabled: everConnected });

  // First load (no cached connection result yet): show skeleton.
  if (conn.isLoading && conn.data === undefined) {
    return (
      <PageShell>
        <Skeleton className="h-9 w-72" />
        <KpiSkeletonRow count={4} />
      </PageShell>
    );
  }
  // Only show "connect your account" when we have a definitive negative answer
  // and we are not merely refetching after a transient session drop.
  const hasCachedData = !!sales.data || !!listings.data || !!rep.data;
  if (conn.data && !connected && !conn.isFetching && !hasCachedData) {
    return <NotConnected />;
  }

  const k = sales.data?.kpis;
  const s = listings.data?.summary;
  const r = rep.data;
  const loadingSales = sales.isLoading;

  // Whether the range spans more than ~45 days (then label by month-day, else day).
  const spanDays = Math.round((activeRange.toMs - activeRange.fromMs) / 86400000) + 1;
  const longSpan = spanDays > 45;

  const bars =
    sales.data?.daily.map((d) => {
      const [, mm, dd] = d.date.split("-");
      return { ...d, label: longSpan ? `${dd}/${mm}` : String(Number(dd)) };
    }) ?? [];

  const totalCancelledDays = bars.filter((b) => (b.cancelled ?? 0) > 0).length;
  const totalRevenue = bars.reduce((acc, b) => acc + (b.revenue ?? 0), 0);
  const totalCancelledAmount = bars.reduce((acc, b) => acc + (b.cancelledAmount ?? 0), 0);

  // Always show EVERY day's label on the X axis (interval=0). To keep them
  // legible we widen each day's slot and tilt the labels on longer ranges so
  // they never overlap (horizontal scroll handles the extra width).
  const labelInterval = 0;
  // Wider per-day slot the longer the range, so all day labels stay readable.
  const perDayWidth = bars.length > 35 ? 36 : bars.length > 16 ? 32 : 38;

  const periodTitle =
    kind === "current" || kind === "previous"
      ? capitalize(monthLabel(activeRange.fromMs))
      : kind === "last60"
        ? "Últimos 60 dias"
        : `${fromIso} a ${toIso}`;

  return (
    <PageShell>
      <PageHeader
        title={
          <>
            Olá{conn.data?.nickname ? ", " : ""}
            {conn.data?.nickname && (
              <span className="brand-text-gradient">{conn.data.nickname}</span>
            )}
          </>
        }
        subtitle="Visão geral da sua loja no Mercado Livre — vendas, anúncios e reputação em tempo real."
        actions={connectionStale ? <ConnectionReminder /> : undefined}
      />

      {/* Lifetime store card — right under the title, compact */}
      <LifetimeCard
        loading={lifetime.isLoading}
        firstSaleMs={lifetime.data?.firstSaleMs ?? null}
        totalRevenue={lifetime.data?.totalRevenue ?? 0}
        totalOrders={lifetime.data?.totalOrders ?? 0}
        canceledOrders={lifetime.data?.canceledOrders ?? 0}
        canceledRevenue={lifetime.data?.canceledRevenue ?? 0}
      />

      {/* Period selector — controls both the KPI cards and the chart below */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-secondary p-1">
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
        <span className="ml-auto inline-flex items-center gap-2 rounded-xl bg-primary/10 px-3.5 py-2 font-display text-sm font-bold tracking-tight text-primary ring-1 ring-primary/20">
          <CalendarRange className="h-4 w-4" /> {periodTitle}
        </span>
      </div>

      {/* KPI cards for the selected period */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Faturamento"
          value={loadingSales ? "" : formatBRL(k?.revenue ?? 0)}
          loading={loadingSales}
          icon={DollarSign}
          accent="emerald"
          sublabel={
            loadingSales ? undefined : (
              <span className="inline-flex items-center gap-1">
                <ShoppingBag className="h-3 w-3 text-primary" />
                <span className="font-display text-sm font-bold text-foreground">{formatNumber(k?.orders ?? 0)}</span>{" "}
                {(k?.orders ?? 0) === 1 ? "pedido" : "pedidos"}
              </span>
            )
          }
        />
        <KpiCard
          label="Cancelados"
          value={loadingSales ? "" : formatBRL(k?.cancelledAmount ?? 0)}
          loading={loadingSales}
          icon={XCircle}
          accent="rose"
          sublabel={
            loadingSales ? undefined : (
              <span className="inline-flex items-center gap-1">
                <span className="font-display text-sm font-bold text-foreground">{formatNumber(k?.cancelled ?? 0)}</span>{" "}
                {(k?.cancelled ?? 0) === 1 ? "pedido cancelado" : "pedidos cancelados"}
              </span>
            )
          }
        />
        <KpiCard
          label="Anúncios ativos"
          value={listings.isLoading ? "" : `${formatNumber(s?.active ?? 0)} / ${formatNumber(s?.total ?? 0)}`}
          loading={listings.isLoading}
          icon={Package}
          accent="blue"
        />
        <KpiCard
          label="Reputação"
          value={rep.isLoading ? "" : (r?.levelId ? reputationLabel(r.levelId).split(" ")[0] : "—")}
          loading={rep.isLoading}
          icon={Star}
          accent={reputationAccent(r?.levelId)}
          sublabel={r ? `${formatNumber(r.transactionsCompleted)} concluídas` : undefined}
        />
      </div>

      {/* Bar chart — full width, two thin bars per day (sales + cancellations) */}
      <SectionCard
        title="Faturamento e cancelamentos por dia"
        description={
          totalCancelledDays > 0
            ? `Barra verde: faturamento · barra vermelha: valor cancelado (${totalCancelledDays} ${totalCancelledDays === 1 ? "dia" : "dias"} com cancelamento)`
            : "Faturamento diário do período selecionado"
        }
        actions={
          <Link href="/vendas" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Ver vendas <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        }
      >
        {loadingSales ? (
          <Skeleton className="h-72 w-full" />
        ) : bars.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            Sem vendas registradas no período.
          </div>
        ) : (
          <>
            {/* Summary mini-cards inside the chart card */}
            <div className="mb-5 grid grid-cols-2 gap-3">
              <SummaryStat
                label="Vendas totais"
                value={formatBRL(totalRevenue)}
                tone="emerald"
              />
              <SummaryStat
                label="Cancelamentos"
                value={formatBRL(totalCancelledAmount)}
                tone="rose"
              />
            </div>

            {/* Each day is a slot delimited by vertical divider lines, with the
                day number centered below and two thick bars (revenue + cancelled)
                inside. For long periods we enable horizontal scroll so the bars
                stay wide and readable instead of shrinking to invisible slivers. */}
            <div className="overflow-x-auto pb-1">
              <div
                className="h-72"
                style={{ minWidth: `${Math.max(bars.length * perDayWidth, 320)}px`, width: "100%" }}
              >
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={bars}
                      barGap={3}
                      barCategoryGap="20%"
                      margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        horizontal
                        vertical={false}
                      />
                    {/* Day axis: a tick line under each day acts as a slot
                        separator, with the day number centered in its slot. */}
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: longSpan ? 10 : 11, fill: "var(--muted-foreground)" }}
                      tickLine={{ stroke: "var(--border)" }}
                      tickSize={6}
                      axisLine={{ stroke: "var(--border)" }}
                      interval={labelInterval}
                      minTickGap={0}
                      angle={longSpan ? -45 : 0}
                      textAnchor={longSpan ? "end" : "middle"}
                      height={longSpan ? 52 : 24}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)", textAnchor: "end" }}
                      tickLine={false}
                      axisLine={false}
                      width={64}
                      tickMargin={8}
                      allowDecimals={false}
                      tickFormatter={(v) => formatBRLCompact(Number(v))}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--secondary)", opacity: 0.5 }}
                      content={<RevenueTooltip />}
                    />
                    <Bar
                      dataKey="revenue"
                      name="Faturamento"
                      fill="var(--primary)"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={14}
                    />
                    <Bar
                      dataKey="cancelledAmount"
                      name="Cancelado"
                      fill="#f43f5e"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={14}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {bars.length > 16 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Dica: arraste o gráfico para o lado para ver todos os dias.
              </p>
            )}
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Faturamento
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#f43f5e" }} /> Valor cancelado
              </span>
            </div>
          </>
        )}
      </SectionCard>

      {/* Day selector → products sold on the chosen day */}
      <DaySales
        days={bars}
        loading={loadingSales}
        fromIso={brtIso(activeRange.fromMs)}
        toIso={brtIso(activeRange.toMs)}
        isCurrentMonth={kind === "current"}
      />

      <SectionCard
        title="Saúde da conta"
        actions={
          <Link href="/reputacao" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Detalhes <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        }
      >
        {rep.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Nível atual</p>
              <p className="font-display text-lg tracking-tight">
                {r?.levelId ? reputationLabel(r.levelId) : "—"}
              </p>
              <div className="mt-2 flex gap-1">
                {["1_red", "2_orange", "3_yellow", "4_light_green", "5_green"].map((lvl) => (
                  <div
                    key={lvl}
                    className={`h-2 flex-1 rounded-full ${lvl === r?.levelId ? reputationColor(lvl) : "bg-secondary"}`}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-2">
              <MiniStat label="Concluídas" value={formatNumber(r?.transactionsCompleted ?? 0)} />
              <MiniStat label="Canceladas" value={formatNumber(r?.transactionsCanceled ?? 0)} />
              <MiniStat label="Positivas" value={formatNumber(r?.ratingsPositive ?? 0)} />
              <MiniStat label="Negativas" value={formatNumber(r?.ratingsNegative ?? 0)} />
            </div>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title={`Top 10 produtos (${periodTitle.toLowerCase()})`}
          className="lg:col-span-2"
          actions={
            <Link href="/anuncios" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              Meus anúncios <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {loadingSales ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2.5 pr-2 text-left font-semibold">#</th>
                    <th className="py-2.5 pr-2 text-left font-semibold">Produto</th>
                    <th className="py-2.5 px-2 text-right font-semibold whitespace-nowrap">Preço unit.</th>
                    <th className="py-2.5 px-2 text-right font-semibold whitespace-nowrap">Vendas</th>
                    <th className="py-2.5 pl-2 text-right font-semibold whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Array.from({ length: 10 }).map((_, i) => {
                    const p = sales.data?.topProducts[i];
                    if (!p) {
                      // Empty placeholder row — keeps the table at 10 rows even
                      // when there are fewer (or zero) sales in the period.
                      return (
                        <tr key={`empty-${i}`} className="align-middle">
                          <td className="py-2.5 pr-2 text-center text-sm font-semibold text-muted-foreground/40">
                            {i + 1}
                          </td>
                          <td className="py-2.5 pr-2">
                            <div className="flex items-center gap-2.5">
                              <div className="h-9 w-9 shrink-0 rounded-lg bg-secondary" />
                              <span className="text-sm text-muted-foreground/40">—</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right text-muted-foreground/40">—</td>
                          <td className="py-2.5 px-2 text-right text-muted-foreground/40">—</td>
                          <td className="py-2.5 pl-2 text-right text-muted-foreground/40">—</td>
                        </tr>
                      );
                    }
                    const unitPrice = p.unitsSold > 0 ? p.revenue / p.unitsSold : 0;
                    const rank = i + 1;
                    return (
                      <tr key={p.itemId} className="align-middle transition-colors hover:bg-secondary/50">
                        <td className="py-2.5 pr-2 text-center">
                          <span
                            className={cn(
                              "inline-flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold",
                              rank === 1
                                ? "bg-amber-400/20 text-amber-600"
                                : rank === 2
                                  ? "bg-slate-300/30 text-slate-600"
                                  : rank === 3
                                    ? "bg-orange-400/20 text-orange-700"
                                    : "text-muted-foreground",
                            )}
                          >
                            {rank}
                          </span>
                        </td>
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-2.5">
                            <ProductImage src={p.thumbnail} alt={p.title} className="h-9 w-9 shrink-0 rounded-lg ring-1 ring-border" />
                            <span className="line-clamp-2 max-w-[260px] text-sm font-medium leading-tight">
                              {p.title}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                          {formatBRL(unitPrice)}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap font-medium">
                          {formatNumber(p.unitsSold)}
                        </td>
                        <td className="py-2.5 pl-2 text-right font-bold tabular-nums whitespace-nowrap text-primary">
                          {formatBRL(p.revenue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(sales.data?.topProducts.length ?? 0) === 0 && (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Ainda sem vendas neste período — as posições serão preenchidas conforme suas vendas.
                </p>
              )}
            </div>
          )}
        </SectionCard>

        <div className="space-y-4">
          {!listings.isLoading && (s?.stagnant ?? 0) > 0 && (
            <Card className="card-soft border-0 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                  <AlertCircle className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{formatNumber(s!.stagnant)} anúncios sem vendas</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Têm estoque mas não venderam. Revise preço, título e fotos.
                  </p>
                  <Link href="/anuncios" className="mt-2 inline-block text-xs text-primary hover:underline">
                    Revisar anúncios →
                  </Link>
                </div>
              </div>
            </Card>
          )}
          <Card className="card-soft border-0 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Search className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Pesquisa de mercado</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Explore mais vendidos, tendências e preços de catálogo do Mercado Livre.
                </p>
                <Link href="/mais-vendidos" className="mt-2 inline-block text-xs text-primary hover:underline">
                  Explorar mercado →
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function RevenueTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload as {
    revenue: number;
    orders: number;
    cancelled: number;
    cancelledAmount: number;
  };
  return (
    <div className="rounded-xl border bg-background p-3 text-xs shadow-sm" style={{ borderColor: "var(--border)" }}>
      <p className="font-medium">Dia {label}</p>
      {d.revenue === 0 && (d.cancelled ?? 0) === 0 ? (
        <p className="mt-1 text-muted-foreground">Sem movimento</p>
      ) : (
        <>
          <p className="mt-1 text-emerald-600">{formatBRL(d.revenue)} faturado</p>
          <p className="text-muted-foreground">{formatNumber(d.orders)} pedido(s) pago(s)</p>
        </>
      )}
      {(d.cancelled ?? 0) > 0 && (
        <p className="mt-1 inline-flex items-center gap-1 text-rose-600">
          <XCircle className="h-3 w-3" /> {formatNumber(d.cancelled)} cancelado(s) ({formatBRL(d.cancelledAmount)})
        </p>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "rose" | "neutral";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "rose"
        ? "text-rose-600"
        : "text-foreground";
  const bgCls =
    tone === "emerald"
      ? "bg-emerald-500/8"
      : tone === "rose"
        ? "bg-rose-500/8"
        : "bg-secondary/50";
  const dot =
    tone === "emerald" ? "bg-emerald-500" : tone === "rose" ? "bg-rose-500" : "bg-muted-foreground";
  return (
    <div className={`rounded-xl p-3.5 ${bgCls}`}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${dot}`} /> {label}
      </p>
      <p className={`mt-1.5 font-display text-xl font-bold leading-none tracking-tight ${toneCls}`}>
        {value}
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-lg leading-tight tracking-tight">{value}</p>
    </div>
  );
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Format a yyyy-mm-dd (BRT) day as a friendly label like "24 de abril". */
function dayLongLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  // Use a BRT-noon anchor so the calendar day never shifts across the boundary.
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

/** Short label "24/04" for the compact option text. */
function dayShortLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/**
 * Day selector + the products sold on the chosen day. The list of selectable
 * days comes from the chart series (every calendar day in the period). Days
 * that had sales are marked; picking a day fetches its product breakdown.
 */
function DaySales({
  days,
  loading,
  fromIso,
  toIso,
  isCurrentMonth,
}: {
  days: Array<{ date: string; revenue: number; orders: number }>;
  loading: boolean;
  fromIso: string;
  toIso: string;
  isCurrentMonth: boolean;
}) {
  // Default selection:
  // - Current month: always today (clamped to the available day list).
  // - Other periods: the most recent day WITH sales, else the last day.
  const defaultDay = useMemo(() => {
    if (isCurrentMonth) {
      const today = todayIsoBrt();
      if (days.some((d) => d.date === today)) return today;
      return days.length ? days[days.length - 1].date : today;
    }
    const withSales = [...days].reverse().find((d) => (d.orders ?? 0) > 0);
    if (withSales) return withSales.date;
    return days.length ? days[days.length - 1].date : toIso;
  }, [days, toIso, isCurrentMonth]);

  const [selected, setSelected] = useState<string>(defaultDay);
  const [userPicked, setUserPicked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // While the user hasn't actively chosen a day, follow the computed default
  // (so switching period / loading the current day works automatically).
  const selectionValid = days.some((d) => d.date === selected);
  const effectiveDay = userPicked && selectionValid ? selected : defaultDay;

  const dayQuery = trpc.account.productsByDay.useQuery(
    { date: effectiveDay },
    { enabled: !loading && !!effectiveDay && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDay) },
  );

  const data = dayQuery.data;
  const products = data?.products ?? [];
  const COLLAPSED_COUNT = 6;
  const hasMore = products.length > COLLAPSED_COUNT;
  const visibleProducts = expanded ? products : products.slice(0, COLLAPSED_COUNT);

  return (
    <SectionCard
      title="Produtos vendidos por dia"
      description="Selecione um dia do período para ver exatamente quais produtos foram vendidos."
      actions={
        <Select
          value={effectiveDay}
          onValueChange={(v) => {
            setSelected(v);
            setUserPicked(true);
            setExpanded(false);
          }}
        >
          <SelectTrigger className="h-10 w-[230px] gap-1.5">
            <CalendarDays className="h-4 w-4 text-primary" />
            <SelectValue placeholder="Escolha um dia" />
          </SelectTrigger>
          <SelectContent className="max-h-96">
            {[...days].reverse().map((d) => {
              const had = (d.orders ?? 0) > 0;
              return (
                <SelectItem key={d.date} value={d.date}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        had ? "bg-primary" : "bg-muted-foreground/30",
                      )}
                    />
                    {dayShortLabel(d.date)}
                    {had && (
                      <span className="text-[11px] text-muted-foreground">
                        · {formatNumber(d.orders)} venda{d.orders === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-3.5 py-2 font-display text-sm font-bold tracking-tight text-primary ring-1 ring-primary/20">
          <CalendarDays className="h-4 w-4" /> {capitalize(dayLongLabel(effectiveDay))}
        </div>
        {!dayQuery.isLoading && data && (
          <div className="flex flex-wrap items-center gap-2">
            <DayBadge tone="emerald" label={formatBRL(data.revenue)} hint="faturado" />
            <DayBadge tone="primary" label={`${formatNumber(data.orders)} pedido${data.orders === 1 ? "" : "s"}`} hint="pago" />
            <DayBadge tone="neutral" label={`${formatNumber(data.unitsSold)} un.`} hint="vendidas" />
          </div>
        )}
      </div>

      {dayQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-secondary/40 py-10 text-center">
          <PackageOpen className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            Nenhum produto vendido em {dayShortLabel(effectiveDay)}.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Escolha outro dia no seletor acima.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2.5 pr-2 text-left font-semibold">Produto</th>
                <th className="py-2.5 px-2 text-right font-semibold whitespace-nowrap">Preço unit.</th>
                <th className="py-2.5 px-2 text-right font-semibold whitespace-nowrap">Qtd.</th>
                <th className="py-2.5 pl-2 text-right font-semibold whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleProducts.map((p) => {
                const unitPrice = p.unitsSold > 0 ? p.revenue / p.unitsSold : 0;
                return (
                  <tr key={p.itemId} className="align-middle transition-colors hover:bg-secondary/50">
                    <td className="py-2.5 pr-2">
                      <div className="flex items-center gap-2.5">
                        <ProductImage src={p.thumbnail} alt={p.title} className="h-9 w-9 shrink-0 rounded-lg ring-1 ring-border" />
                        <span className="line-clamp-2 max-w-[280px] text-sm font-medium leading-tight">
                          {p.title}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                      {formatBRL(unitPrice)}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap font-medium">
                      {formatNumber(p.unitsSold)}
                    </td>
                    <td className="py-2.5 pl-2 text-right font-bold tabular-nums whitespace-nowrap text-primary">
                      {formatBRL(p.revenue)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasMore && (
            <div className="mt-3 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 bg-secondary/40"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-4 w-4" /> Ver menos
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" /> Ver todos os {formatNumber(products.length)} produtos
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function DayBadge({
  tone,
  label,
  hint,
}: {
  tone: "emerald" | "primary" | "neutral";
  label: string;
  hint: string;
}) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20"
      : tone === "primary"
        ? "bg-primary/10 text-primary ring-primary/20"
        : "bg-secondary text-foreground ring-border";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1", cls)}>
      <ShoppingCart className="h-3.5 w-3.5" />
      {label} <span className="font-normal opacity-70">{hint}</span>
    </span>
  );
}

function LifetimeCard({
  loading,
  firstSaleMs,
  totalRevenue,
  totalOrders,
  canceledOrders,
  canceledRevenue,
}: {
  loading: boolean;
  firstSaleMs: number | null;
  totalRevenue: number;
  totalOrders: number;
  canceledOrders: number;
  canceledRevenue: number;
}) {
  const firstSaleLabel = firstSaleMs
    ? new Date(firstSaleMs).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "America/Sao_Paulo",
      })
    : "—";
  // Days in business: from first sale (BRT day) to today (BRT day), inclusive.
  const daysInBusiness =
    firstSaleMs != null
      ? Math.max(1, Math.floor((Date.now() - firstSaleMs) / 86400000) + 1)
      : 0;
  const years = Math.floor(daysInBusiness / 365);
  const remDays = daysInBusiness % 365;
  const ageLabel =
    firstSaleMs == null
      ? "—"
      : years >= 1
        ? `${years} ${years === 1 ? "ano" : "anos"}${remDays > 0 ? ` e ${remDays} ${remDays === 1 ? "dia" : "dias"}` : ""}`
        : `${daysInBusiness} ${daysInBusiness === 1 ? "dia" : "dias"}`;

  const items: Array<{
    icon: typeof Store;
    label: string;
    value: string;
    sub: string;
    tint: string;
  }> = [
    {
      icon: CalendarDays,
      label: "Primeira venda",
      value: firstSaleLabel,
      sub: "início efetivo da loja",
      tint: "bg-blue-500/12 text-blue-600",
    },
    {
      icon: Store,
      label: "Tempo de loja",
      value: ageLabel,
      sub: firstSaleMs != null ? `${formatNumber(daysInBusiness)} dias de existência` : "sem vendas ainda",
      tint: "bg-violet-500/12 text-violet-600",
    },
    {
      icon: TrendingUp,
      label: "Faturamento total",
      value: formatBRL(totalRevenue),
      sub: "acumulado de todas as vendas",
      tint: "bg-emerald-500/12 text-emerald-600",
    },
    {
      icon: Receipt,
      label: "Vendas totais",
      value: formatNumber(totalOrders),
      sub: "pedidos pagos no total",
      tint: "bg-primary/12 text-primary",
    },
    {
      icon: XCircle,
      label: "Vendas canceladas",
      value: formatNumber(canceledOrders),
      sub: "pedidos cancelados no total",
      tint: "bg-rose-500/12 text-rose-600",
    },
    {
      icon: TrendingDown,
      label: "Valor cancelado",
      value: formatBRL(canceledRevenue),
      sub: "acumulado ao longo do tempo",
      tint: "bg-amber-500/12 text-amber-600",
    },
  ];

  return (
    <Card className="card-soft overflow-hidden border-0 rounded-2xl">
      <div className="flex items-center gap-2.5 border-b px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
        <div className="brand-gradient flex h-7 w-7 items-center justify-center rounded-xl text-primary-foreground shadow-sm">
          <Store className="h-3.5 w-3.5" />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="font-display text-sm font-semibold leading-tight tracking-tight">Histórico acumulado</p>
          <p className="text-[11px] text-muted-foreground">Desde o início da loja — atualizado diariamente</p>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 divide-y divide-x sm:divide-y-0" style={{ borderColor: "var(--border)" }}>
        {items.map((it) => (
          <div key={it.label} className="px-4 py-3 transition-colors hover:bg-secondary/40">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <span className={`flex h-5 w-5 items-center justify-center rounded-md ${it.tint}`}>
                <it.icon className="h-3 w-3" />
              </span>
              {it.label}
            </p>
            {loading ? (
              <Skeleton className="mt-1.5 h-6 w-20" />
            ) : (
              <p className="mt-1.5 font-display text-lg font-bold leading-none tracking-tight">
                {it.value}
              </p>
            )}
            <p className="mt-1 text-[10px] text-muted-foreground">{it.sub}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}


/**
 * Discreet reminder shown in the top-right of the dashboard header only when the
 * Mercado Livre connection has expired or errored. Clicking it jumps to Settings
 * so the user can reconnect. Hidden entirely while the connection is healthy.
 */
function ConnectionReminder() {
  const [, setLocation] = useLocation();
  return (
    <button
      type="button"
      onClick={() => setLocation("/configuracoes")}
      title="Sua conexão com o Mercado Livre expirou. Clique para reconectar em Configurações."
      className={cn(
        "group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
        "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        "transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40",
      )}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
      </span>
      Conexão expirada — reconectar
    </button>
  );
}
