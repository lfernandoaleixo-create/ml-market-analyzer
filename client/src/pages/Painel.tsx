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
  formatCompact,
  reputationLabel,
  reputationColor,
} from "@/lib/format";
import {
  currentMonthRange,
  previousMonthRange,
  lastNMonthsRange,
  customRangeFromIso,
  monthStartIsoBrt,
  todayIsoBrt,
  monthLabel,
} from "@/lib/period";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

type PeriodKind = "current" | "previous" | "last2" | "custom";

const TABS: Array<{ key: PeriodKind; label: string }> = [
  { key: "current", label: "Mês atual" },
  { key: "previous", label: "Mês anterior" },
  { key: "last2", label: "Últimos 2 meses" },
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
    if (kind === "current") return currentMonthRange();
    if (kind === "previous") return previousMonthRange();
    if (kind === "last2") return lastNMonthsRange(2);
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

  const periodTitle =
    kind === "current" || kind === "previous"
      ? capitalize(monthLabel(activeRange.fromMs))
      : kind === "last2"
        ? `${capitalize(monthLabel(activeRange.fromMs))} – atual`
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

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Faturamento por dia"
          description={
            totalCancelledDays > 0
              ? `Barras em vermelho indicam dias com cancelamento (${totalCancelledDays} ${totalCancelledDays === 1 ? "dia" : "dias"})`
              : "Faturamento diário do período selecionado"
          }
          className="lg:col-span-2"
          actions={
            <Link href="/vendas" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              Ver vendas <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {loadingSales ? (
            <Skeleton className="h-64 w-full" />
          ) : bars.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Sem vendas registradas no período.
            </div>
          ) : (
            <>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                      interval={longSpan ? "preserveStartEnd" : 0}
                      minTickGap={longSpan ? 16 : 2}
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
                      content={<RevenueTooltip />}
                    />
                    <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={28}>
                      {bars.map((b, i) => (
                        <Cell
                          key={i}
                          fill={(b.cancelled ?? 0) > 0 ? "var(--color-rose-500, #f43f5e)" : "var(--primary)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Faturamento
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#f43f5e" }} /> Dia com
                  cancelamento
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
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-4">
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
              <div className="grid grid-cols-2 gap-3 pt-1">
                <MiniStat label="Concluídas" value={formatNumber(r?.transactionsCompleted ?? 0)} />
                <MiniStat label="Canceladas" value={formatNumber(r?.transactionsCanceled ?? 0)} />
                <MiniStat label="Positivas" value={formatNumber(r?.ratingsPositive ?? 0)} />
                <MiniStat label="Negativas" value={formatNumber(r?.ratingsNegative ?? 0)} />
              </div>
            </div>
          )}
        </SectionCard>
      </div>

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
                    <p className="text-xs text-muted-foreground">{formatCompact(p.unitsSold)} un.</p>
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
      <p className="font-medium">{label}</p>
      <p className="mt-1 text-emerald-600">{formatBRL(d.revenue)} faturado</p>
      <p className="text-muted-foreground">{formatNumber(d.orders)} pedido(s) pago(s)</p>
      {(d.cancelled ?? 0) > 0 && (
        <p className="mt-1 inline-flex items-center gap-1 text-rose-600">
          <XCircle className="h-3 w-3" /> {formatNumber(d.cancelled)} cancelado(s) ({formatBRL(d.cancelledAmount)})
        </p>
      )}
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
