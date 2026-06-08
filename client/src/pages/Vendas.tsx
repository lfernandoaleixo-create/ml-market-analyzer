import { useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatBRL,
  formatCompact,
  formatNumber,
  isoDateToShort,
} from "@/lib/format";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ShoppingBag, DollarSign, Receipt, Boxes, XCircle, ExternalLink } from "lucide-react";

const PERIODS = [
  { label: "30 dias", days: 30 },
  { label: "60 dias", days: 60 },
  { label: "90 dias", days: 90 },
];

export default function Vendas() {
  const [days, setDays] = useState(60);
  const conn = trpc.account.connection.useQuery();
  const { data, isLoading, error } = trpc.account.salesDashboard.useQuery(
    { days },
    { enabled: conn.data?.connected === true },
  );

  if (conn.isLoading) {
    return (
      <PageShell>
        <Skeleton className="h-9 w-64" />
        <KpiSkeletonRow count={4} />
      </PageShell>
    );
  }
  if (conn.data && !conn.data.connected) return <NotConnected />;
  if (error) return <ErrorState message={error.message} />;

  const k = data?.kpis;
  const chartData =
    data?.daily.map((d) => ({ ...d, label: isoDateToShort(d.date) })) ?? [];

  return (
    <PageShell>
      <PageHeader
        title="Vendas"
        subtitle="Faturamento, pedidos e ticket médio da sua loja, com dados reais do Mercado Livre."
        actions={
          <div className="flex items-center gap-1 rounded-xl bg-secondary p-1">
            {PERIODS.map((p) => (
              <Button
                key={p.days}
                size="sm"
                variant={days === p.days ? "default" : "ghost"}
                className="h-8 rounded-lg px-3 text-xs"
                onClick={() => setDays(p.days)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Faturamento"
          value={isLoading ? "" : formatBRL(k?.revenue ?? 0)}
          loading={isLoading}
          icon={DollarSign}
          accent="emerald"
        />
        <KpiCard
          label="Pedidos pagos"
          value={isLoading ? "" : formatNumber(k?.orders ?? 0)}
          loading={isLoading}
          icon={ShoppingBag}
          accent="primary"
        />
        <KpiCard
          label="Ticket médio"
          value={isLoading ? "" : formatBRL(k?.avgTicket ?? 0)}
          loading={isLoading}
          icon={Receipt}
          accent="blue"
        />
        <KpiCard
          label="Unidades vendidas"
          value={isLoading ? "" : formatNumber(k?.unitsSold ?? 0)}
          loading={isLoading}
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

      <SectionCard title="Faturamento diário" description={`Últimos ${days} dias`}>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : chartData.length === 0 ? (
          <EmptyChart />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(v) => formatCompact(Number(v))}
                />
                <Tooltip
                  formatter={(v: number) => [formatBRL(Number(v)), "Faturamento"]}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  fill="url(#rev)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Produtos que mais venderam" description={`Top do período (${days} dias)`}>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (data?.topProducts.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma venda registrada neste período.
          </p>
        ) : (
          <div className="divide-y">
            {data!.topProducts.map((p, idx) => (
              <div key={p.itemId} className="flex items-center gap-3 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-semibold text-muted-foreground">
                  {idx + 1}
                </span>
                {p.thumbnail ? (
                  <img
                    src={p.thumbnail}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-lg object-cover bg-secondary"
                  />
                ) : (
                  <div className="h-11 w-11 shrink-0 rounded-lg bg-secondary" />
                )}
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

function EmptyChart() {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
      Sem dados de faturamento no período.
    </div>
  );
}
