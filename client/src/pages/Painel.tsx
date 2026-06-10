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
} from "lucide-react";
import { Link } from "wouter";

type PeriodKind = "current" | "previous" | "last60" | "custom";

const TABS: Array<{ key: PeriodKind; label: string }> = [
  { key: "current", label: "Mês atual" },
  { key: "previous", label: "Mês anterior" },
  { key: "last60", label: "60 dias" },
  { key: "custom", label: "Personalizado" },
];

export default function Painel() {
  const conn = trpc.account.connection.useQuery();
  const connected = conn.data?.connected === true;

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

  const sales = trpc.account.salesRange.useQuery(
    { fromMs: activeRange.fromMs, toMs: activeRange.toMs, fill: true },
    { enabled: connected },
  );
  const listings = trpc.account.listings.useQuery({ lastDays: 30 }, { enabled: connected });
  const rep = trpc.account.reputation.useQuery(undefined, { enabled: connected });

  if (conn.isLoading) {
    return (
      <PageShell>
        <Skeleton className="h-9 w-72" />
        <KpiSkeletonRow count={4} />
      </PageShell>
    );
  }
  if (conn.data && !connected) return <NotConnected />;

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
  const netBalance = totalRevenue - totalCancelledAmount;

  const periodTitle =
    kind === "current" || kind === "previous"
      ? capitalize(monthLabel(activeRange.fromMs))
      : kind === "last60"
        ? "Últimos 60 dias"
        : `${fromIso} a ${toIso}`;

  return (
    <PageShell>
      <PageHeader
        title={`Olá${conn.data?.nickname ? `, ${conn.data.nickname}` : ""}`}
        subtitle="Visão geral da sua loja no Mercado Livre — vendas, anúncios e reputação em tempo real."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Faturamento"
          value={loadingSales ? "" : formatBRL(k?.revenue ?? 0)}
          loading={loadingSales}
          icon={DollarSign}
          accent="emerald"
          sublabel={periodTitle.toLowerCase()}
        />
        <KpiCard
          label="Pedidos pagos"
          value={loadingSales ? "" : formatNumber(k?.orders ?? 0)}
          loading={loadingSales}
          icon={ShoppingBag}
          accent="primary"
          sublabel={
            k && k.cancelled > 0 ? (
              <span className="inline-flex items-center gap-1 text-rose-600">
                <XCircle className="h-3 w-3" /> {formatNumber(k.cancelled)} cancelados
              </span>
            ) : undefined
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
          accent="violet"
          sublabel={r ? `${formatNumber(r.transactionsCompleted)} concluídas` : undefined}
        />
      </div>

      {/* Period selector */}
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
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" /> {periodTitle}
        </span>
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
            <div className="mb-5 grid grid-cols-3 gap-3">
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
              <SummaryStat
                label="Saldo"
                value={formatBRL(netBalance)}
                tone="neutral"
              />
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={bars}
                  barGap={2}
                  barCategoryGap={longSpan ? "35%" : "45%"}
                  margin={{ top: 8, right: 12, left: 8, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={!longSpan}
                    verticalCoordinatesGenerator={undefined}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={{ stroke: "var(--border)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    interval={longSpan ? 2 : 0}
                    minTickGap={0}
                    padding={{ left: 8, right: 8 }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)", textAnchor: "end" }}
                    tickLine={false}
                    axisLine={false}
                    width={72}
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
                    radius={[2, 2, 0, 0]}
                    maxBarSize={longSpan ? 5 : 7}
                  />
                  <Bar
                    dataKey="cancelledAmount"
                    name="Cancelado"
                    fill="#f43f5e"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={longSpan ? 5 : 7}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
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
          title={`Top produtos (${periodTitle.toLowerCase()})`}
          className="lg:col-span-2"
          actions={
            <Link href="/anuncios" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              Meus anúncios <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {loadingSales ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (sales.data?.topProducts.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ainda sem vendas no período.
            </p>
          ) : (
            <div className="divide-y">
              {sales.data!.topProducts.slice(0, 5).map((p, i) => (
                <div key={p.itemId} className="flex items-center gap-3 py-2.5">
                  <span className="w-5 text-center text-sm font-semibold text-muted-foreground">{i + 1}</span>
                  <ProductImage src={p.thumbnail} alt={p.title} className="h-10 w-10 rounded-lg" />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{p.title}</p>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatBRL(p.revenue)}</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(p.unitsSold)} un.</p>
                  </div>
                </div>
              ))}
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
  const dot =
    tone === "emerald" ? "bg-primary" : tone === "rose" ? "bg-rose-500" : "bg-muted-foreground";
  return (
    <div className="rounded-xl border bg-secondary/40 p-3" style={{ borderColor: "var(--border)" }}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${dot}`} /> {label}
      </p>
      <p className={`mt-1 font-display text-lg font-semibold leading-tight tracking-tight ${toneCls}`}>
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
