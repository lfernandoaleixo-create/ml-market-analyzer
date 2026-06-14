import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { ProductCell } from "@/components/account/ProductCell";
import type { ListingRow } from "@shared/account";
import {
  PageShell,
  PageHeader,
  KpiSkeletonRow,
  SectionCard,
  NotConnected,
} from "@/components/account/AccountUI";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
  isoToWeekdayLong,
} from "@/lib/format";
import { todayIsoBrt } from "@/lib/period";
import { isoDateBrt as brtIso } from "@shared/period";
import { usePeriod } from "@/hooks/usePeriod";
import { PeriodSelector } from "@/components/PeriodSelector";
import type { ProfitBreakdown } from "@shared/finance";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DayAxisTick, dayAxisProps } from "@/components/charts/DayAxisTick";
import {
  Package,
  Star,
  ArrowUpRight,
  AlertCircle,
  Search,
  XCircle,
  Store,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Receipt,
  Wallet,
  Coins,
  Truck,
  Megaphone,
  ShoppingCart,
  PackageOpen,
  ChevronDown,
  ChevronUp,
  PauseCircle,
  Archive,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation } from "wouter";

export default function Painel() {
  const conn = trpc.account.connection.useQuery();
  const connected = conn.data?.connected === true;
  // Lightweight credentials read to surface a discreet "connection expired" reminder.
  const creds = trpc.monitor.getCredentials.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000, // re-check a cada 5 min
  });
  const connectionStale = creds.data?.tokenExpired === true;

  // Day picked in the "Produtos vendidos por dia" card. Lifted here so that
  // clicking a bar in the chart can select that day. null => follow default.
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  // Top 10 ranking starts collapsed every time the page opens, so the user can
  // scroll past it quickly when there are many products.
  const [topOpen, setTopOpen] = useState(false);

  // Keep querying as long as we believe we're connected OR we still have a
  // cached connection from before a transient session hiccup.
  const everConnected = conn.data?.connected === true;
  const lifetime = trpc.account.storeLifetime.useQuery(undefined, { enabled: everConnected });

  // Unified period selector (system-wide standard). `historic` uses the store's
  // first sale instant from storeLifetime.
  const period = usePeriod({
    initialKey: "current",
    firstSaleMs: lifetime.data?.firstSaleMs ?? null,
  });
  const activeRange = period.range;

  const sales = trpc.account.salesRange.useQuery(
    { fromMs: activeRange.fromMs, toMs: activeRange.toMs, fill: true },
    { enabled: everConnected },
  );
  const listings = trpc.account.listings.useQuery({ lastDays: 30 }, { enabled: everConnected });
  const rep = trpc.account.reputation.useQuery(undefined, { enabled: everConnected });

  // Historic-base profit summary (mirror of the Lucratividade "Da receita ao
  // resultado" card), pinned below the lifetime card. Uses days since the first
  // sale so it always reflects the whole store history. Requires BaseLinker for
  // CMV; otherwise we show a friendly hint instead of misleading numbers.
  const financeStatus = trpc.finance.status.useQuery(undefined, {
    enabled: everConnected,
    staleTime: 60_000,
  });
  const historicDays = useMemo(() => {
    const first = lifetime.data?.firstSaleMs;
    if (!first) return 0;
    const ms = Date.now() - first;
    return Math.max(1, Math.ceil(ms / 86_400_000));
  }, [lifetime.data?.firstSaleMs]);
  const historicProfit = trpc.finance.profitability.useQuery(
    { days: historicDays },
    {
      enabled:
        everConnected &&
        historicDays > 0 &&
        financeStatus.data?.baselinkerConfigured === true,
      staleTime: 2 * 60_000,
    },
  );

  // Profit breakdown that follows the SELECTED period (not the historic base),
  // powering the "Da receita ao resultado" strip below the period selector.
  const periodProfit = trpc.finance.profitability.useQuery(
    { days: period.days },
    {
      enabled:
        everConnected &&
        period.days > 0 &&
        financeStatus.data?.baselinkerConfigured === true,
      staleTime: 2 * 60_000,
    },
  );

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

  // Detect a Mercado Livre rate limit (429 -> TOO_MANY_REQUESTS) on any of the
  // core queries. When it happens we must NOT silently show R$ 0,00 — we show an
  // honest banner with a retry button so a live demo never looks like "no sales".
  const isRateLimited = [sales.error, listings.error, rep.error, lifetime.error].some(
    (e) => (e?.data as { code?: string } | undefined)?.code === "TOO_MANY_REQUESTS",
  );
  const retryAll = () => {
    sales.refetch();
    listings.refetch();
    rep.refetch();
    lifetime.refetch();
  };
  const anyRefetching =
    sales.isFetching || listings.isFetching || rep.isFetching || lifetime.isFetching;

  // Whether the range spans more than ~45 days (then label by month-day, else day).
  const bars = sales.data?.daily ?? [];

  const totalCancelledDays = bars.filter((b) => (b.cancelled ?? 0) > 0).length;
  const totalRevenue = bars.reduce((acc, b) => acc + (b.revenue ?? 0), 0);
  const totalCancelledAmount = bars.reduce((acc, b) => acc + (b.cancelledAmount ?? 0), 0);

  // Wider per-day slot the longer the range, so all day labels stay readable.
  const perDayWidth = bars.length > 35 ? 36 : bars.length > 16 ? 32 : 38;

  const periodTitle = period.title;

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

      {isRateLimited && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm leading-snug">
              <p className="font-semibold">O Mercado Livre limitou temporariamente as consultas</p>
              <p className="text-amber-800/90 dark:text-amber-200/80">
                Isso é momentâneo (excesso de chamadas em sequência). Sua conexão segue ativa — aguarde alguns segundos e atualize. Os números abaixo podem estar incompletos até atualizar.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={retryAll}
            disabled={anyRefetching}
            className="shrink-0 border-amber-400 bg-white/70 text-amber-900 hover:bg-white dark:bg-transparent dark:text-amber-100"
          >
            <RefreshCw className={cn("mr-1.5 h-4 w-4", anyRefetching && "animate-spin")} />
            {anyRefetching ? "Atualizando…" : "Atualizar agora"}
          </Button>
        </div>
      )}

      {/* Two compact summary cards pulled tight to the top, stacked with minimal
          spacing so they take the least vertical room possible. */}
      <div className="-mt-2 space-y-2">
        <LifetimeCard
          loading={lifetime.isLoading}
          firstSaleMs={lifetime.data?.firstSaleMs ?? null}
          totalRevenue={lifetime.data?.totalRevenue ?? 0}
          totalOrders={lifetime.data?.totalOrders ?? 0}
          canceledOrders={lifetime.data?.canceledOrders ?? 0}
          canceledRevenue={lifetime.data?.canceledRevenue ?? 0}
        />
        <HistoricProfitCard
          loading={historicProfit.isLoading || lifetime.isLoading || financeStatus.isLoading}
          notConfigured={!financeStatus.isLoading && financeStatus.data?.baselinkerConfigured !== true}
          breakdown={historicProfit.data && historicProfit.data.totals.revenue > 0 ? historicProfit.data.totals : null}
        />
      </div>

      {/* Period selector — controls both the KPI cards and the chart below */}
      <PeriodSelector
        value={period.key}
        onChange={period.setKey}
        fromIso={period.fromIso}
        toIso={period.toIso}
        onFromIso={period.setFromIso}
        onToIso={period.setToIso}
        title={periodTitle}
      />

      {/* Single "Da receita ao resultado" strip for the selected period */}
      <PeriodFlowStrip
        periodTitle={periodTitle}
        loadingSales={loadingSales}
        revenue={k?.revenue ?? 0}
        orders={k?.orders ?? 0}
        cancelledAmount={k?.cancelledAmount ?? 0}
        cancelled={k?.cancelled ?? 0}
        activeListings={s?.active ?? 0}
        totalListings={s?.total ?? 0}
        listingsLoading={listings.isLoading}
        notConfigured={financeStatus.data?.baselinkerConfigured !== true}
        profitLoading={periodProfit.isLoading}
        breakdown={periodProfit.data && periodProfit.data.totals.revenue > 0 ? periodProfit.data.totals : null}
      />

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
                      onClick={(state: any) => {
                        const d = state?.activePayload?.[0]?.payload?.date as string | undefined;
                        if (d) {
                          setPickedDay(d);
                          // Bring the day card into view so the result is visible.
                          setTimeout(() => {
                            document
                              .getElementById("produtos-por-dia")
                              ?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }, 50);
                        }
                      }}
                      className="cursor-pointer"
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
                      dataKey="date"
                      tick={<DayAxisTick todayKey={todayIsoBrt()} />}
                      {...dayAxisProps}
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
        isCurrentMonth={period.key === "current"}
        pickedDay={pickedDay}
        onPickDay={setPickedDay}
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

      <SectionCard
          title={`Top 10 produtos (${periodTitle.toLowerCase()})`}
          actions={
            <div className="flex items-center gap-3">
              <Link href="/anuncios" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Meus anúncios <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 bg-secondary/40"
                onClick={() => setTopOpen((v) => !v)}
                aria-expanded={topOpen}
              >
                {topOpen ? (
                  <>
                    <ChevronUp className="h-4 w-4" /> Retrair
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" /> Expandir
                  </>
                )}
              </Button>
            </div>
          }
        >
          {!topOpen ? (
            <button
              type="button"
              onClick={() => setTopOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary/40 py-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
            >
              <ChevronDown className="h-4 w-4" />
              Ver Top 10 produtos do período
            </button>
          ) : loadingSales ? (
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
                          <ProductCell
                            title={p.title}
                            thumbnail={p.thumbnail}
                            permalink={p.permalink}
                            titleClassName="max-w-[260px]"
                          />
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

        {/* Detailed listings breakdown — below the ranking, full width */}
        <ListingsBreakdown items={listings.data?.items} loading={listings.isLoading} />
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
      <p className="font-medium">{isoToWeekdayLong(String(label))}</p>
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

/* --------------------------- Listings breakdown --------------------------- */

/** One metric tile in the listings breakdown grid. */
function ListingStat({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: LucideIcon;
  tone: "emerald" | "amber" | "rose" | "blue" | "slate" | "violet";
}) {
  const toneCls: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
    rose: "bg-rose-500/10 text-rose-600",
    blue: "bg-blue-500/10 text-blue-600",
    slate: "bg-slate-400/15 text-slate-600",
    violet: "bg-violet-500/10 text-violet-600",
  };
  return (
    <div className="flex h-full flex-col rounded-xl bg-secondary/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", toneCls[tone])}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <p className="font-display text-2xl font-bold leading-none tracking-tight tabular-nums">
          {formatNumber(value)}
        </p>
      </div>
      <p className="text-sm font-semibold leading-tight">{label}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground leading-snug">{hint}</p>}
    </div>
  );
}

/**
 * Detailed breakdown of the seller's listings by status and sales activity.
 * Computed client-side from the listing rows so we surface actionable buckets:
 * active, sem vendas, pausados (sem/com venda), sem estoque, encerrados.
 */
function ListingsBreakdown({
  items,
  loading,
}: {
  items?: ListingRow[];
  loading: boolean;
}) {
  const stats = useMemo(() => {
    const list = items ?? [];
    const active = list.filter((i) => i.status === "active").length;
    const paused = list.filter((i) => i.status === "paused");
    const pausedNoSale = paused.filter((i) => i.soldQuantity === 0).length;
    const pausedWithSale = paused.filter((i) => i.soldQuantity > 0).length;
    // "Sem vendas" = active with stock but never sold (actionable now).
    const activeNoSale = list.filter(
      (i) => i.status === "active" && i.availableQuantity > 0 && i.soldQuantity === 0,
    ).length;
    const outOfStock = list.filter(
      (i) => i.status === "active" && i.availableQuantity === 0,
    ).length;
    const closed = list.filter((i) => i.status === "closed").length;
    const total = list.length;
    return {
      total,
      active,
      activeNoSale,
      pausedNoSale,
      pausedWithSale,
      paused: paused.length,
      outOfStock,
      closed,
    };
  }, [items]);

  return (
    <SectionCard
      title="Anúncios em detalhe"
      description="Distribuição dos seus anúncios por status e atividade de vendas (amostra dos itens mais recentes)."
      actions={
        <Link href="/anuncios" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          Gerenciar anúncios <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      }
    >
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : stats.total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-secondary/40 py-10 text-center">
          <PackageOpen className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            Nenhum anúncio encontrado nesta conta.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <ListingStat
              label="Ativos"
              value={stats.active}
              icon={Package}
              tone="emerald"
              hint="Publicados e à venda"
            />
            <ListingStat
              label="Ativos sem vendas"
              value={stats.activeNoSale}
              icon={AlertCircle}
              tone="amber"
              hint="Com estoque, sem vender"
            />
            <ListingStat
              label="Sem estoque"
              value={stats.outOfStock}
              icon={XCircle}
              tone="rose"
              hint="Ativos zerados"
            />
            <ListingStat
              label="Pausados sem venda"
              value={stats.pausedNoSale}
              icon={PauseCircle}
              tone="slate"
              hint="Nunca venderam"
            />
            <ListingStat
              label="Pausados com venda"
              value={stats.pausedWithSale}
              icon={PauseCircle}
              tone="violet"
              hint="Já venderam — reativar?"
            />
            <ListingStat
              label="Encerrados"
              value={stats.closed}
              icon={Archive}
              tone="slate"
              hint="Finalizados"
            />
          </div>
          {stats.activeNoSale > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>{formatNumber(stats.activeNoSale)}</strong> anúncio(s) ativo(s) com estoque ainda não venderam.
                Revise preço, título e fotos para destravar as vendas.
              </span>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
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
  pickedDay,
  onPickDay,
}: {
  days: Array<{ date: string; revenue: number; orders: number }>;
  loading: boolean;
  fromIso: string;
  toIso: string;
  isCurrentMonth: boolean;
  /** Day selected externally (e.g. by clicking a chart bar). null => default. */
  pickedDay: string | null;
  onPickDay: (day: string | null) => void;
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

  const [expanded, setExpanded] = useState(false);
  // Whole card starts collapsed every time the page opens, so the user can
  // scroll past it quickly when a day has many products.
  const [open, setOpen] = useState(false);
  // While no day was actively picked (via the selector OR by clicking a chart
  // bar), follow the computed default so switching period works automatically.
  const selectionValid = pickedDay != null && days.some((d) => d.date === pickedDay);
  const effectiveDay = selectionValid ? (pickedDay as string) : defaultDay;

  // When the user clicks a bar in the chart (sets pickedDay), auto-expand this
  // card so the products for that day are immediately visible.
  useEffect(() => {
    if (selectionValid) setOpen(true);
  }, [pickedDay, selectionValid]);

  const dayQuery = trpc.account.productsByDay.useQuery(
    { date: effectiveDay },
    { enabled: !loading && !!effectiveDay && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDay) },
  );

  const data = dayQuery.data;
  const products = data?.products ?? [];
  const cancelledProducts = data?.cancelledProducts ?? [];
  const COLLAPSED_COUNT = 6;
  const hasMore = products.length > COLLAPSED_COUNT;
  const visibleProducts = expanded ? products : products.slice(0, COLLAPSED_COUNT);

  return (
    <div id="produtos-por-dia" className="scroll-mt-4">
    <SectionCard
      title="Produtos vendidos por dia"
      description="Selecione um dia (ou clique numa barra do gráfico acima) para ver exatamente quais produtos foram vendidos."
      actions={
        <div className="flex items-center gap-3">
          <Select
            value={effectiveDay}
            onValueChange={(v) => {
              onPickDay(v);
              setExpanded(false);
              setOpen(true);
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
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 bg-secondary/40"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? (
              <>
                <ChevronUp className="h-4 w-4" /> Retrair
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" /> Expandir
              </>
            )}
          </Button>
        </div>
      }
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary/40 py-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
        >
          <ChevronDown className="h-4 w-4" />
          Ver produtos vendidos por dia
        </button>
      ) : (
      <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-3.5 py-2 font-display text-sm font-bold tracking-tight text-primary ring-1 ring-primary/20">
          <CalendarDays className="h-4 w-4" /> {capitalize(dayLongLabel(effectiveDay))}
        </div>
        {!dayQuery.isLoading && data && (
          <div className="flex flex-wrap items-center gap-2">
            <DayBadge tone="emerald" label={formatBRL(data.revenue)} hint="faturado" />
            <DayBadge tone="primary" label={`${formatNumber(data.orders)} pedido${data.orders === 1 ? "" : "s"}`} hint="pago" />
            <DayBadge tone="neutral" label={`${formatNumber(data.unitsSold)} un.`} hint="vendidas" />
            {data.cancelledOrders > 0 && (
              <DayBadge
                tone="rose"
                label={`${formatNumber(data.cancelledOrders)} cancelado${data.cancelledOrders === 1 ? "" : "s"}`}
                hint={formatBRL(data.cancelledRevenue)}
              />
            )}
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
                      <ProductCell
                        title={p.title}
                        thumbnail={p.thumbnail}
                        permalink={p.permalink}
                        titleClassName="max-w-[280px]"
                      />
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

      {!dayQuery.isLoading && cancelledProducts.length > 0 && (
        <div className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
          <div className="mb-3 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-rose-600" />
            <p className="font-display text-sm font-semibold tracking-tight text-rose-700">
              Produtos cancelados neste dia
            </p>
            <span className="text-xs text-muted-foreground">
              · {formatNumber(data?.cancelledUnits ?? 0)} un. · {formatBRL(data?.cancelledRevenue ?? 0)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2.5 pr-2 text-left font-semibold">Produto</th>
                  <th className="py-2.5 px-2 text-right font-semibold whitespace-nowrap">Qtd.</th>
                  <th className="py-2.5 pl-2 text-right font-semibold whitespace-nowrap">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cancelledProducts.map((p) => (
                  <tr key={p.itemId} className="align-middle transition-colors hover:bg-rose-500/[0.06]">
                    <td className="py-2.5 pr-2">
                      <ProductCell
                        title={p.title}
                        thumbnail={p.thumbnail}
                        permalink={p.permalink}
                        titleClassName="max-w-[280px]"
                      />
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap font-medium">
                      {formatNumber(p.unitsSold)}
                    </td>
                    <td className="py-2.5 pl-2 text-right font-bold tabular-nums whitespace-nowrap text-rose-600">
                      {formatBRL(p.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      )}
    </SectionCard>
    </div>
  );
}

function DayBadge({
  tone,
  label,
  hint,
}: {
  tone: "emerald" | "primary" | "neutral" | "rose";
  label: string;
  hint: string;
}) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20"
      : tone === "primary"
        ? "bg-primary/10 text-primary ring-primary/20"
        : tone === "rose"
          ? "bg-rose-500/10 text-rose-700 ring-rose-500/20"
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
    valueClass?: string;
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
      valueClass: "text-emerald-600",
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
      tint: "bg-rose-500/12 text-rose-600",
      valueClass: "text-rose-600",
    },
  ];

  return (
    <Card className="card-soft overflow-hidden border-0 rounded-2xl">
      <div className="flex items-center gap-2 border-b px-3 py-1.5" style={{ borderColor: "var(--border)" }}>
        <div className="brand-gradient flex h-5 w-5 items-center justify-center rounded-lg text-primary-foreground shadow-sm">
          <Store className="h-3 w-3" />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="font-display text-base font-semibold leading-tight tracking-tight">Histórico acumulado</p>
          <p className="text-[10px] text-muted-foreground">Desde o início da loja</p>
        </div>
      </div>
      <div className="grid grid-cols-3 lg:grid-cols-6 divide-y divide-x sm:divide-y-0" style={{ borderColor: "var(--border)" }}>
        {items.map((it) => (
          <div key={it.label} className="px-3 py-1.5 transition-colors hover:bg-secondary/40">
            <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <span className={`flex h-4 w-4 items-center justify-center rounded ${it.tint}`}>
                <it.icon className="h-2.5 w-2.5" />
              </span>
              <span className="truncate">{it.label}</span>
            </p>
            {loading ? (
              <Skeleton className="mt-1 h-6 w-20" />
            ) : (
              <p className={cn("mt-0.5 font-display text-lg font-bold leading-tight tracking-tight tabular-nums", it.valueClass)}>
                {it.value}
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Compact "Da receita ao resultado" card, styled identically to LifetimeCard
 * (gradient header + a single row of divided cells). Locked to the historic
 * base. Each cell shows the value and what % of revenue it represents.
 */
function HistoricProfitCard({
  loading,
  notConfigured,
  breakdown,
}: {
  loading: boolean;
  notConfigured: boolean;
  breakdown: ProfitBreakdown | null;
}) {
  const rev = breakdown?.revenue ?? 0;
  const pct = (v: number) => (rev > 0 ? `${((v / rev) * 100).toFixed(1)}%` : "—");
  const isLoss = (breakdown?.netProfit ?? 0) < 0;

  const cells: Array<{
    icon: typeof Store;
    label: string;
    value: string;
    pctOnly: string;
    tint: string;
    valueClass?: string;
  }> = breakdown
    ? [
        {
          icon: Wallet,
          label: "Receita",
          value: formatBRL(breakdown.revenue),
          pctOnly: "100%",
          tint: "bg-blue-500/12 text-blue-600",
        },
        {
          icon: Coins,
          label: "Comissão ML",
          value: `−${formatBRL(breakdown.commission)}`,
          pctOnly: pct(breakdown.commission),
          tint: "bg-rose-500/12 text-rose-600",
          valueClass: "text-rose-600",
        },
        {
          icon: Truck,
          label: "Frete",
          value: `−${formatBRL(breakdown.shipping)}`,
          pctOnly: pct(breakdown.shipping),
          tint: "bg-rose-500/12 text-rose-600",
          valueClass: "text-rose-600",
        },
        {
          icon: Package,
          label: "Custo (CMV)",
          value: `−${formatBRL(breakdown.cmv)}`,
          pctOnly: pct(breakdown.cmv),
          tint: "bg-rose-500/12 text-rose-600",
          valueClass: "text-rose-600",
        },
        {
          icon: Receipt,
          label: "Impostos",
          value: `−${formatBRL(breakdown.tax)}`,
          pctOnly: pct(breakdown.tax),
          tint: "bg-rose-500/12 text-rose-600",
          valueClass: "text-rose-600",
        },
        ...(breakdown.ads > 0
          ? [
              {
                icon: Megaphone,
                label: "Ads",
                value: `−${formatBRL(breakdown.ads)}`,
                pctOnly: pct(breakdown.ads),
                tint: "bg-rose-500/12 text-rose-600",
                valueClass: "text-rose-600",
              } as const,
            ]
          : []),
        {
          icon: TrendingUp,
          label: "Resultado",
          value: formatBRL(breakdown.netProfit),
          pctOnly: `${pct(breakdown.netProfit)} margem`,
          tint: isLoss ? "bg-rose-500/12 text-rose-600" : "bg-emerald-500/12 text-emerald-600",
          valueClass: isLoss ? "text-rose-600" : "text-emerald-600",
        },
      ]
    : [];

  // Use exactly as many columns as there are cells so the dividers fall between
  // equal-width columns (no leftover empty slot). Maps to fixed Tailwind classes.
  const lgColsMap: Record<number, string> = {
    5: "lg:grid-cols-5",
    6: "lg:grid-cols-6",
    7: "lg:grid-cols-7",
    8: "lg:grid-cols-8",
  };
  const colsClass = cn("grid-cols-3", lgColsMap[cells.length] ?? "lg:grid-cols-7");

  return (
    <Card className="card-soft overflow-hidden border-0 rounded-2xl">
      <div className="flex items-center gap-2 border-b px-3 py-1.5" style={{ borderColor: "var(--border)" }}>
        <div className="brand-gradient flex h-5 w-5 items-center justify-center rounded-lg text-primary-foreground shadow-sm">
          <Wallet className="h-3 w-3" />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="font-display text-base font-semibold leading-tight tracking-tight">Da receita ao resultado</p>
          <p className="text-[10px] text-muted-foreground">Base histórica</p>
        </div>
      </div>

      {notConfigured ? (
        <div className="flex items-center justify-center gap-2 px-3 py-2.5 text-center">
          <Receipt className="h-4 w-4 text-muted-foreground/50" />
          <p className="text-[11px] text-muted-foreground">
            Configure os custos (BaseLinker e impostos) na{" "}
            <Link href="/lucratividade" className="font-medium text-primary hover:underline">
              Lucratividade
            </Link>{" "}
            para ver a quebra de lucro.
          </p>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-4 lg:grid-cols-7 divide-y divide-x sm:divide-y-0" style={{ borderColor: "var(--border)" }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="px-3 py-1.5">
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="mt-1 h-4 w-16" />
            </div>
          ))}
        </div>
      ) : breakdown ? (
        <div className={cn("grid divide-y divide-x sm:divide-y-0", colsClass)} style={{ borderColor: "var(--border)" }}>
          {cells.map((c) => (
            <div key={c.label} className="px-3 py-1.5 transition-colors hover:bg-secondary/40">
              <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${c.tint}`}>
                  <c.icon className="h-2.5 w-2.5" />
                </span>
                <span className="truncate">{c.label}</span>
              </p>
              <p className={cn("mt-0.5 font-display text-lg font-bold leading-tight tracking-tight tabular-nums", c.valueClass)}>
                {c.value}
              </p>
              <p className="text-[13px] font-semibold text-muted-foreground tabular-nums">{c.pctOnly}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 px-3 py-2.5 text-center">
          <TrendingUp className="h-4 w-4 text-muted-foreground/50" />
          <p className="text-[11px] text-muted-foreground">Sem dados de lucro histórico ainda.</p>
        </div>
      )}
    </Card>
  );
}


/**
 * Single divided strip below the period selector that summarizes the SELECTED
 * period: Anúncios ativos · Receita · (custos) · Cancelados · Resultado.
 * Visually identical to HistoricProfitCard (gradient header + divide-x cells),
 * but follows the chosen period instead of being pinned to the historic base.
 *
 * Sales-side columns (Anúncios ativos, Receita, Cancelados) always render from
 * the sales/listings KPIs. The cost columns (Comissão, Frete, CMV, Impostos,
 * Ads) and Resultado require BaseLinker; when it is not configured they render
 * as "—" with a subtle hint.
 */
function PeriodFlowStrip({
  periodTitle,
  loadingSales,
  revenue,
  orders,
  cancelledAmount,
  cancelled,
  activeListings,
  totalListings,
  listingsLoading,
  notConfigured,
  profitLoading,
  breakdown,
}: {
  periodTitle: string;
  loadingSales: boolean;
  revenue: number;
  orders: number;
  cancelledAmount: number;
  cancelled: number;
  activeListings: number;
  totalListings: number;
  listingsLoading: boolean;
  notConfigured: boolean;
  profitLoading: boolean;
  breakdown: ProfitBreakdown | null;
}) {
  const rev = breakdown?.revenue ?? revenue;
  const pct = (v: number) => (rev > 0 ? `${((v / rev) * 100).toFixed(1)}%` : "—");
  const isLoss = (breakdown?.netProfit ?? 0) < 0;
  const dash = "—";

  type Cell = {
    icon: typeof Store;
    label: string;
    value: string;
    sub: string;
    tint: string;
    valueClass?: string;
    loading?: boolean;
  };

  // Cost columns: real values when configured, otherwise muted placeholders.
  const costCell = (
    icon: typeof Store,
    label: string,
    amount: number | undefined,
  ): Cell => {
    if (notConfigured) {
      return {
        icon,
        label,
        value: dash,
        sub: "configurar",
        tint: "bg-muted text-muted-foreground",
        valueClass: "text-muted-foreground/60",
      };
    }
    const a = amount ?? 0;
    return {
      icon,
      label,
      value: `−${formatBRL(a)}`,
      sub: pct(a),
      tint: "bg-rose-500/12 text-rose-600",
      valueClass: "text-rose-600",
      loading: profitLoading,
    };
  };

  const resultCell: Cell = notConfigured
    ? {
        icon: TrendingUp,
        label: "Resultado",
        value: dash,
        sub: "configurar",
        tint: "bg-muted text-muted-foreground",
        valueClass: "text-muted-foreground/60",
      }
    : {
        icon: TrendingUp,
        label: "Resultado",
        value: formatBRL(breakdown?.netProfit ?? 0),
        sub: `${pct(breakdown?.netProfit ?? 0)} margem`,
        tint: isLoss ? "bg-rose-500/12 text-rose-600" : "bg-emerald-500/12 text-emerald-600",
        valueClass: isLoss ? "text-rose-600" : "text-emerald-600",
        loading: profitLoading,
      };

  const cells: Cell[] = [
    {
      icon: Package,
      label: "Anúncios ativos",
      value: `${formatNumber(activeListings)} / ${formatNumber(totalListings)}`,
      sub: "ativos / total",
      tint: "bg-blue-500/12 text-blue-600",
      valueClass: "text-blue-600",
      loading: listingsLoading,
    },
    {
      icon: Wallet,
      label: "Receita",
      value: formatBRL(revenue),
      sub: `${formatNumber(orders)} ${orders === 1 ? "pedido" : "pedidos"}`,
      tint: "bg-emerald-500/12 text-emerald-600",
      valueClass: "text-emerald-600",
      loading: loadingSales,
    },
    costCell(Coins, "Comissão ML", breakdown?.commission),
    costCell(Truck, "Frete", breakdown?.shipping),
    costCell(Package, "Custo (CMV)", breakdown?.cmv),
    costCell(Receipt, "Impostos", breakdown?.tax),
    costCell(Megaphone, "Ads", breakdown?.ads),
    {
      icon: XCircle,
      label: "Cancelados",
      value: formatBRL(cancelledAmount),
      sub: `${formatNumber(cancelled)} ${cancelled === 1 ? "pedido" : "pedidos"}`,
      tint: "bg-rose-500/12 text-rose-600",
      valueClass: "text-rose-600",
      loading: loadingSales,
    },
    resultCell,
  ];

  const count = cells.length; // 9
  const lgColsMap: Record<number, string> = {
    8: "lg:grid-cols-8",
    9: "lg:grid-cols-9",
  };
  const colsClass = cn("grid-cols-3", lgColsMap[count] ?? "lg:grid-cols-9");

  return (
    <Card className="card-soft overflow-hidden border-0 rounded-2xl">
      <div className="flex items-center gap-2 border-b px-3 py-1.5" style={{ borderColor: "var(--border)" }}>
        <div className="brand-gradient flex h-5 w-5 items-center justify-center rounded-lg text-primary-foreground shadow-sm">
          <TrendingUp className="h-3 w-3" />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="font-display text-base font-semibold leading-tight tracking-tight">Da receita ao resultado</p>
          <p className="text-[10px] text-muted-foreground">{periodTitle}</p>
        </div>
      </div>

      <div className={cn("grid divide-y divide-x sm:divide-y-0", colsClass)} style={{ borderColor: "var(--border)" }}>
        {cells.map((c) => (
          <div key={c.label} className="px-3 py-1.5 transition-colors hover:bg-secondary/40">
            <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${c.tint}`}>
                <c.icon className="h-2.5 w-2.5" />
              </span>
              <span className="truncate">{c.label}</span>
            </p>
            {c.loading ? (
              <>
                <Skeleton className="mt-1 h-4 w-16" />
                <Skeleton className="mt-1 h-2.5 w-10" />
              </>
            ) : (
              <>
                <p className={cn("mt-0.5 font-display text-lg font-bold leading-tight tracking-tight tabular-nums", c.valueClass)}>
                  {c.value}
                </p>
                <p className="text-[13px] font-semibold text-muted-foreground tabular-nums">{c.sub}</p>
              </>
            )}
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
