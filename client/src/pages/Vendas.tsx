import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { ProductCell } from "@/components/account/ProductCell";
import { filterProductsByName } from "@shared/productSearch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatBRL, formatNumber, formatBRLCompact, isoToWeekdayLong } from "@/lib/format";
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
  ShoppingBag,
  DollarSign,
  Receipt,
  Boxes,
  XCircle,
  ExternalLink,
  CalendarDays,
  CalendarRange,
  ShoppingCart,
  PackageOpen,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  Search,
  X,
} from "lucide-react";

type PeriodKind = "current" | "previous" | "last60" | "custom";

const TABS: Array<{ key: PeriodKind; label: string }> = [
  { key: "current", label: "Mês atual" },
  { key: "previous", label: "Mês anterior" },
  { key: "last60", label: "60 dias" },
  { key: "custom", label: "Personalizado" },
];

export default function Vendas() {
  const [kind, setKind] = useState<PeriodKind>("current");
  const [fromIso, setFromIso] = useState(monthStartIsoBrt());
  const [toIso, setToIso] = useState(todayIsoBrt());
  // Day picked in "Vendas do dia". Lifted so a chart-bar click can select it.
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const conn = trpc.account.connection.useQuery();
  const connected = conn.data?.connected === true;

  // The range driving the chart + KPIs + full ranking (identical to Painel).
  const activeRange = useMemo(() => {
    if (kind === "current") return currentMonthFullRange();
    if (kind === "previous") return previousMonthRange();
    if (kind === "last60") return lastNDaysRange(60);
    return customRangeFromIso(fromIso, toIso) ?? currentMonthRange();
  }, [kind, fromIso, toIso]);

  // topLimit: 0 => full ranking of EVERY product sold in the period.
  const rangeQuery = trpc.account.salesRange.useQuery(
    { fromMs: activeRange.fromMs, toMs: activeRange.toMs, fill: true, topLimit: 0 },
    { enabled: connected },
  );

  if (conn.isLoading && conn.data === undefined) {
    return (
      <PageShell>
        <Skeleton className="h-9 w-64" />
        <KpiSkeletonRow count={4} />
      </PageShell>
    );
  }
  const hasCachedData = !!rangeQuery.data;
  if (conn.data && !connected && !conn.isFetching && !hasCachedData) {
    return <NotConnected />;
  }
  if (conn.error && !hasCachedData) return <ErrorState message={conn.error.message} />;

  const k = rangeQuery.data?.kpis;
  const loadingSales = rangeQuery.isLoading;

  const bars = rangeQuery.data?.daily ?? [];

  const totalCancelledDays = bars.filter((b) => (b.cancelled ?? 0) > 0).length;
  const totalRevenue = bars.reduce((acc, b) => acc + (b.revenue ?? 0), 0);
  const totalCancelledAmount = bars.reduce((acc, b) => acc + (b.cancelledAmount ?? 0), 0);

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
        title="Vendas"
        subtitle="Faturamento, pedidos e ticket médio da sua loja, com dados reais do Mercado Livre."
      />

      {/* Period selector — identical to Painel: controls KPIs, chart and ranking */}
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

      {/* KPI row for the active period */}
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
                <span className="font-display text-sm font-bold text-foreground">
                  {formatNumber(k?.orders ?? 0)}
                </span>{" "}
                {(k?.orders ?? 0) === 1 ? "pedido" : "pedidos"}
              </span>
            )
          }
        />
        <KpiCard
          label="Ticket médio"
          value={loadingSales ? "" : formatBRL(k?.avgTicket ?? 0)}
          loading={loadingSales}
          icon={Receipt}
          accent="blue"
        />
        <KpiCard
          label="Unidades vendidas"
          value={loadingSales ? "" : formatNumber(k?.unitsSold ?? 0)}
          loading={loadingSales}
          icon={Boxes}
          accent="violet"
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
                <span className="font-display text-sm font-bold text-foreground">
                  {formatNumber(k?.cancelled ?? 0)}
                </span>{" "}
                {(k?.cancelled ?? 0) === 1 ? "pedido cancelado" : "pedidos cancelados"}
              </span>
            )
          }
        />
      </div>

      {/* Bar chart — identical to Painel (two bars per day, all days, h-scroll) */}
      <SectionCard
        title="Faturamento e cancelamentos por dia"
        description={
          totalCancelledDays > 0
            ? `Barra verde: faturamento · barra vermelha: valor cancelado (${totalCancelledDays} ${totalCancelledDays === 1 ? "dia" : "dias"} com cancelamento)`
            : "Faturamento diário do período selecionado"
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
            <div className="mb-5 grid grid-cols-2 gap-3">
              <SummaryStat label="Vendas totais" value={formatBRL(totalRevenue)} tone="emerald" />
              <SummaryStat label="Cancelamentos" value={formatBRL(totalCancelledAmount)} tone="rose" />
            </div>

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
                        setTimeout(() => {
                          document
                            .getElementById("vendas-do-dia")
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

      {/* Rich single-day card with full product breakdown */}
      <DayDetail
        isCurrentMonth={kind === "current"}
        days={bars}
        loading={loadingSales}
        pickedDay={pickedDay}
        onPickDay={setPickedDay}
      />

      {/* FULL ranking (every product sold in the period), expandable */}
      <FullRanking
        products={rangeQuery.data?.topProducts ?? []}
        loading={loadingSales}
        periodTitle={periodTitle}
      />
    </PageShell>
  );
}

/* ----------------------------- Day detail card ---------------------------- */

/**
 * Rich "Vendas do dia" card: a prominent day selector, a summary band
 * (faturamento, pedidos, ticket, unidades, cancelados) and the full list of
 * products sold that day. Designed so the user understands what happened.
 */
function DayDetail({
  isCurrentMonth,
  days,
  loading,
  pickedDay,
  onPickDay,
}: {
  isCurrentMonth: boolean;
  days: Array<{ date: string; revenue: number; orders: number }>;
  loading: boolean;
  /** Day selected externally (e.g. by clicking a chart bar). null => default. */
  pickedDay: string | null;
  onPickDay: (day: string) => void;
}) {
  const defaultDay = useMemo(() => {
    if (isCurrentMonth) {
      const today = todayIsoBrt();
      if (days.some((d) => d.date === today)) return today;
      return days.length ? days[days.length - 1].date : today;
    }
    const withSales = [...days].reverse().find((d) => (d.orders ?? 0) > 0);
    if (withSales) return withSales.date;
    return days.length ? days[days.length - 1].date : todayIsoBrt();
  }, [days, isCurrentMonth]);

  const [expanded, setExpanded] = useState(false);
  const selectionValid = pickedDay != null && days.some((d) => d.date === pickedDay);
  const effectiveDay = selectionValid ? (pickedDay as string) : defaultDay;

  const dayQuery = trpc.account.productsByDay.useQuery(
    { date: effectiveDay },
    { enabled: !loading && !!effectiveDay && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDay) },
  );

  const data = dayQuery.data;
  const products = data?.products ?? [];
  const cancelledProducts = data?.cancelledProducts ?? [];
  const COLLAPSED_COUNT = 8;
  const hasMore = products.length > COLLAPSED_COUNT;
  const visibleProducts = expanded ? products : products.slice(0, COLLAPSED_COUNT);
  const avgTicket = data && data.orders > 0 ? data.revenue / data.orders : 0;

  return (
    <div id="vendas-do-dia" className="scroll-mt-4">
    <SectionCard
      title="Vendas do dia"
      description="Escolha um dia (ou clique numa barra do gráfico acima) para entender exatamente o que aconteceu: faturamento, pedidos e todos os produtos vendidos."
      actions={
        <Select
          value={effectiveDay}
          onValueChange={(v) => {
            onPickDay(v);
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
      <div className="mb-4 inline-flex items-center gap-2 rounded-xl bg-primary/10 px-3.5 py-2 font-display text-sm font-bold tracking-tight text-primary ring-1 ring-primary/20">
        <CalendarDays className="h-4 w-4" /> {capitalize(dayLongLabel(effectiveDay))}
      </div>

      {/* Summary band */}
      {dayQuery.isLoading ? (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <DaySummaryCard
            tone="emerald"
            icon={DollarSign}
            label="Faturamento"
            value={formatBRL(data?.revenue ?? 0)}
          />
          <DaySummaryCard
            tone="primary"
            icon={ShoppingBag}
            label="Pedidos pagos"
            value={formatNumber(data?.orders ?? 0)}
          />
          <DaySummaryCard
            tone="blue"
            icon={Receipt}
            label="Ticket médio"
            value={formatBRL(avgTicket)}
          />
          <DaySummaryCard
            tone="violet"
            icon={Boxes}
            label="Unidades"
            value={formatNumber(data?.unitsSold ?? 0)}
          />
          <DaySummaryCard
            tone={(data?.cancelledOrders ?? 0) > 0 ? "rose" : "slate"}
            icon={XCircle}
            label="Cancelados"
            value={formatNumber(data?.cancelledOrders ?? 0)}
          />
        </div>
      )}

      {/* Product breakdown for the day */}
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
          <p className="text-xs text-muted-foreground/70">Escolha outro dia no seletor acima.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2.5 pr-2 text-left font-semibold">#</th>
                <th className="py-2.5 pr-2 text-left font-semibold">Produto</th>
                <th className="py-2.5 px-2 text-right font-semibold whitespace-nowrap">Preço unit.</th>
                <th className="py-2.5 px-2 text-right font-semibold whitespace-nowrap">Qtd.</th>
                <th className="py-2.5 pl-2 text-right font-semibold whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleProducts.map((p, idx) => {
                const unitPrice = p.unitsSold > 0 ? p.revenue / p.unitsSold : 0;
                return (
                  <tr key={p.itemId} className="align-middle transition-colors hover:bg-secondary/50">
                    <td className="py-2.5 pr-2 text-center text-xs font-semibold text-muted-foreground">
                      {idx + 1}
                    </td>
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
    </SectionCard>
    </div>
  );
}

/* ------------------------------ Full ranking ------------------------------ */

type RankedProduct = {
  itemId: string;
  title: string;
  thumbnail?: string | null;
  permalink?: string | null;
  unitsSold: number;
  revenue: number;
};

/**
 * Ranks EVERY distinct product sold in the period (no Top-10 cap). Collapsed to
 * the first 10 rows by default; "Ver todos" expands the full list — so even 500
 * different products are all visible.
 */
function FullRanking({
  products,
  loading,
  periodTitle,
}: {
  products: RankedProduct[];
  loading: boolean;
  periodTitle: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const COLLAPSED_COUNT = 10;

  // Filter by product name (case/diacritics-insensitive). When searching we
  // show ALL matches (no collapse) so nothing relevant stays hidden.
  const query = search.trim();
  const filtered = useMemo(
    () => filterProductsByName(products, query),
    [products, query],
  );

  const searching = query.length > 0;
  const hasMore = !searching && filtered.length > COLLAPSED_COUNT;
  const visible = searching || expanded ? filtered : filtered.slice(0, COLLAPSED_COUNT);

  return (
    <SectionCard
      title="Ranking de produtos vendidos"
      description={
        loading
          ? `Todos os produtos de ${periodTitle.toLowerCase()}`
          : `${formatNumber(products.length)} produto${products.length === 1 ? "" : "s"} distinto${products.length === 1 ? "" : "s"} em ${periodTitle.toLowerCase()}`
      }
      actions={
        !loading && products.length > 0 ? (
          <div className="relative w-[240px] max-w-[60vw]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto por nome"
              className="h-10 pl-8 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                title="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      {!loading && searching && (
        <p className="mb-3 text-xs text-muted-foreground">
          {filtered.length === 0
            ? `Nenhum produto encontrado para “${search.trim()}”.`
            : `${formatNumber(filtered.length)} de ${formatNumber(products.length)} produto${products.length === 1 ? "" : "s"} correspondem a “${search.trim()}”.`}
        </p>
      )}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-secondary/40 py-10 text-center">
          <PackageOpen className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            Nenhuma venda registrada neste período.
          </p>
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
                <th className="py-2.5 px-2 text-right font-semibold whitespace-nowrap">Total</th>
                <th className="py-2.5 pl-2 text-right font-semibold whitespace-nowrap">Anúncio</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((p, i) => {
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
                        titleClassName="max-w-[280px]"
                      />
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                      {formatBRL(unitPrice)}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap font-medium">
                      {formatNumber(p.unitsSold)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold tabular-nums whitespace-nowrap text-primary">
                      {formatBRL(p.revenue)}
                    </td>
                    <td className="py-2.5 pl-2 text-right">
                      {p.permalink ? (
                        <a
                          href={p.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Ver <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
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
                    <ChevronDown className="h-4 w-4" /> Ver todos os {formatNumber(filtered.length)} produtos
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

/* ------------------------------- Primitives ------------------------------- */

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
    tone === "emerald" ? "text-emerald-600" : tone === "rose" ? "text-rose-600" : "text-foreground";
  const bgCls =
    tone === "emerald" ? "bg-emerald-500/8" : tone === "rose" ? "bg-rose-500/8" : "bg-secondary/50";
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

function DaySummaryCard({
  tone,
  icon: Icon,
  label,
  value,
}: {
  tone: "emerald" | "primary" | "blue" | "violet" | "rose" | "slate";
  icon: typeof DollarSign;
  label: string;
  value: string;
}) {
  const tint =
    tone === "emerald"
      ? "bg-emerald-500/12 text-emerald-600"
      : tone === "primary"
        ? "bg-primary/12 text-primary"
        : tone === "blue"
          ? "bg-blue-500/12 text-blue-600"
          : tone === "violet"
            ? "bg-violet-500/12 text-violet-600"
            : tone === "slate"
              ? "bg-slate-400/15 text-slate-600"
              : "bg-rose-500/12 text-rose-600";
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-secondary/50 p-4 text-center">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <p className="font-display text-2xl font-bold leading-none tracking-tight tabular-nums">{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Format a yyyy-mm-dd (BRT) day as a friendly label like "24 de abril de 2026". */
function dayLongLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
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
