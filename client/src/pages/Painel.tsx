import { DataSourceBanner, PageContainer, PageHeader, ScoreRing } from "@/components/market/Common";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatCompact, formatPercent, verdictMeta } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  ArrowUpRight,
  Bell,
  Flame,
  LineChart,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Link } from "wouter";

export default function Painel() {
  const opportunities = trpc.market.opportunities.useQuery({ limit: 4 });
  const bestSellers = trpc.market.bestSellers.useQuery({ limit: 5 });
  const trends = trpc.market.trends.useQuery(undefined);
  const monitored = trpc.monitor.list.useQuery();
  const alerts = trpc.monitor.alerts.useQuery();

  const unread = (alerts.data ?? []).filter((a) => !a.isRead).length;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Visão geral"
        title="Painel de inteligência"
        description="Um panorama do mercado: oportunidades de curto prazo, líderes de venda, tendências de busca e o estado do seu monitoramento."
      />

      <DataSourceBanner />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Sparkles}
          label="Oportunidades"
          value={opportunities.isLoading ? null : String(opportunities.data?.analyses.length ?? 0)}
          hint="alto potencial detectado"
          to="/oportunidades"
        />
        <StatCard
          icon={LineChart}
          label="Monitorados"
          value={monitored.isLoading ? null : String(monitored.data?.length ?? 0)}
          hint="produtos acompanhados"
          to="/monitoramento"
        />
        <StatCard
          icon={Bell}
          label="Alertas"
          value={alerts.isLoading ? null : String(unread)}
          hint="não lidos"
          to="/alertas"
        />
        <StatCard
          icon={Flame}
          label="Tendências"
          value={trends.isLoading ? null : String(trends.data?.length ?? 0)}
          hint="termos em alta"
          to="/categorias"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Opportunities */}
        <Card className="lg:col-span-2 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-600">Oportunidades em destaque</h2>
            </div>
            <Link href="/oportunidades" className="text-sm text-primary hover:underline">
              Ver todas
            </Link>
          </div>
          <div className="space-y-3">
            {opportunities.isLoading
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
              : opportunities.data?.analyses.map((a) => {
                  const meta = verdictMeta(a.verdict);
                  return (
                    <div
                      key={a.product.id}
                      className="flex items-center gap-3 rounded-lg border border-border/70 p-3 transition-colors hover:bg-accent/40"
                    >
                      <ScoreRing score={a.potentialScore} size={48} />
                      <img
                        src={a.product.thumbnail}
                        alt=""
                        className="h-12 w-12 rounded-md object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.product.title}</p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatBRL(a.product.price)}</span>
                          <span>·</span>
                          <span className="text-emerald-500">
                            {formatPercent(a.salesGrowthPercent)} vendas
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className={meta.className}>
                        {meta.label}
                      </Badge>
                    </div>
                  );
                })}
          </div>
        </Card>

        {/* Trends */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-600">Termos em alta</h2>
          </div>
          <div className="space-y-2.5">
            {trends.isLoading
              ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
              : trends.data?.slice(0, 9).map((t, i) => (
                  <div key={t.keyword} className="flex items-center gap-3">
                    <span className="w-4 text-xs font-medium text-muted-foreground">{i + 1}</span>
                    <span className="flex-1 truncate text-sm capitalize">{t.keyword}</span>
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${t.volumeIndex}%` }} />
                    </div>
                  </div>
                ))}
          </div>
        </Card>
      </div>

      {/* Best sellers */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-600">Mais vendidos agora</h2>
          </div>
          <Link href="/mais-vendidos" className="text-sm text-primary hover:underline">
            Ver ranking
          </Link>
        </div>
        <div className="space-y-2">
          {bestSellers.isLoading
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            : bestSellers.data?.products.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/40">
                  <span className="w-6 text-center font-display text-lg font-600 text-muted-foreground">
                    {i + 1}
                  </span>
                  <img src={p.thumbnail} alt="" className="h-11 w-11 rounded-md object-cover" />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{p.title}</p>
                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-medium">
                      {p.priceAvailable !== false && p.price > 0 ? formatBRL(p.price) : "Sob consulta"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.salesAvailable !== false ? `${formatCompact(p.soldQuantity)} vendidos` : "Vendas —"}
                    </p>
                  </div>
                </div>
              ))}
        </div>
      </Card>
    </PageContainer>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  hint: string;
  to: string;
}) {
  return (
    <Link href={to}>
      <Card className="group p-4 transition-all hover:shadow-md hover:-translate-y-0.5">
        <div className="flex items-center justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="mt-3">
          {value === null ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <p className="font-display text-3xl font-600 tracking-tight">{value}</p>
          )}
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </Card>
    </Link>
  );
}
