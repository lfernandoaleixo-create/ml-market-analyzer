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
import { Badge } from "@/components/ui/badge";
import {
  formatBRL,
  formatNumber,
  formatCompact,
  isoDateToShort,
  reputationLabel,
  reputationColor,
} from "@/lib/format";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  DollarSign,
  ShoppingBag,
  Package,
  Star,
  ArrowUpRight,
  AlertCircle,
  Search,
} from "lucide-react";
import { Link } from "wouter";

export default function Painel() {
  const conn = trpc.account.connection.useQuery();
  const connected = conn.data?.connected === true;

  const sales = trpc.account.salesDashboard.useQuery({ days: 60 }, { enabled: connected });
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
  const chartData =
    sales.data?.daily.map((d) => ({ ...d, label: isoDateToShort(d.date) })) ?? [];
  const loadingSales = sales.isLoading;

  return (
    <PageShell>
      <PageHeader
        title={`Olá${conn.data?.nickname ? `, ${conn.data.nickname}` : ""}`}
        subtitle="Visão geral da sua loja no Mercado Livre — vendas, anúncios e reputação em tempo real."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Faturamento (60d)"
          value={loadingSales ? "" : formatBRL(k?.revenue ?? 0)}
          loading={loadingSales}
          icon={DollarSign}
          accent="emerald"
        />
        <KpiCard
          label="Pedidos (60d)"
          value={loadingSales ? "" : formatNumber(k?.orders ?? 0)}
          loading={loadingSales}
          icon={ShoppingBag}
          accent="primary"
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

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Faturamento dos últimos 60 dias"
          className="lg:col-span-2"
          actions={
            <Link href="/vendas" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              Ver vendas <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {loadingSales ? (
            <Skeleton className="h-56 w-full" />
          ) : chartData.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
              Sem vendas registradas no período.
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revHome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                  />
                  <Tooltip
                    formatter={(v: number) => [formatBRL(Number(v)), "Faturamento"]}
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    fill="url(#revHome)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
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
          title="Top produtos (60 dias)"
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
                  {p.thumbnail ? (
                    <img src={p.thumbnail} alt="" className="h-10 w-10 rounded-lg object-cover bg-secondary" />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-secondary" />
                  )}
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-lg leading-tight tracking-tight">{value}</p>
    </div>
  );
}
