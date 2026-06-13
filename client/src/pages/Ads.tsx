import { useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatBRL, formatNumber, formatCompact, formatRatePct } from "@/lib/format";
import type {
  AdsCampaign,
  AdsAdRow,
  AdsInsight,
  AdsInsightSeverity,
  AdsCategoryStat,
  AdsChangeEntry,
  AdsManagedCampaign,
  AdsChangeVerdict,
} from "@shared/ads";
import {
  Megaphone,
  DollarSign,
  MousePointerClick,
  Eye,
  Target,
  TrendingUp,
  Sparkles,
  Leaf,
  AlertTriangle,
  CheckCircle2,
  Info,
  Lightbulb,
  ExternalLink,
  RefreshCw,
  Layers,
  ShoppingCart,
  Boxes,
  ShieldQuestion,
  History,
  ArrowRight,
  Clock,
  HelpCircle,
} from "lucide-react";

type AdsPeriod = "7" | "15" | "30" | "60" | "90";
const PERIOD_LABEL: Record<AdsPeriod, string> = {
  "7": "7 dias",
  "15": "15 dias",
  "30": "30 dias",
  "60": "60 dias",
  "90": "90 dias",
};

/** Map an ML campaign strategy to a human label + color. */
function strategyMeta(s: string): { label: string; accent: string } {
  switch (s) {
    case "PROFITABILITY":
      return { label: "Rentabilidade", accent: "text-emerald-600 bg-emerald-500/10" };
    case "INCREASE":
      return { label: "Crescimento", accent: "text-blue-600 bg-blue-500/10" };
    case "VISIBILITY":
      return { label: "Visibilidade", accent: "text-violet-600 bg-violet-500/10" };
    default:
      return { label: s || "—", accent: "text-muted-foreground bg-muted" };
  }
}

function statusMeta(s: string): { label: string; cls: string } {
  switch (s) {
    case "active":
      return { label: "Ativa", cls: "bg-emerald-500/12 text-emerald-700 border-emerald-500/20" };
    case "paused":
      return { label: "Pausada", cls: "bg-amber-500/12 text-amber-700 border-amber-500/20" };
    default:
      return { label: s || "—", cls: "bg-muted text-muted-foreground" };
  }
}

/** Color an ACOS value vs an optional target (lower is better). */
function acosColor(acos: number, target?: number | null): string {
  if (!acos) return "text-muted-foreground";
  if (target && acos > target * 1.25) return "text-rose-600";
  if (target && acos <= target) return "text-emerald-600";
  if (acos < 15) return "text-emerald-600";
  if (acos < 30) return "text-amber-600";
  return "text-rose-600";
}

export default function Ads() {
  const [period, setPeriod] = useState<AdsPeriod>("30");
  const [tab, setTab] = useState("dashboard");

  // Connection / Ads-access probe (cheap, uncached on purpose for honest status).
  const access = trpc.ads.access.useQuery(undefined, { staleTime: 60_000 });

  if (access.isLoading) {
    return (
      <PageShell>
        <PageHeader title="ADS" subtitle="Carregando dados de Mercado Ads…" />
        <KpiSkeletonRow count={4} />
      </PageShell>
    );
  }
  if (access.data && !access.data.connected) {
    return (
      <PageShell>
        <NotConnected />
      </PageShell>
    );
  }
  if (access.data && access.data.connected && !access.data.hasAds) {
    return (
      <PageShell>
        <PageHeader title="ADS" subtitle="Gestão de Mercado Ads" />
        <SectionCard>
          <div className="py-10 text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Megaphone className="h-7 w-7" />
            </div>
            <h2 className="font-display text-xl">Esta conta ainda não tem Mercado Ads ativo</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Quando houver campanhas de Product Ads na conta, todos os dados aparecerão aqui
              automaticamente — campanhas, anúncios e inteligência.
            </p>
          </div>
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <Megaphone className="h-5 w-5" />
            </span>
            ADS
          </span>
        }
        subtitle="Central de Mercado Ads — campanhas, anúncios patrocinados e inteligência com dados reais da sua conta."
        actions={
          <Select value={period} onValueChange={(v) => setPeriod(v as AdsPeriod)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABEL) as AdsPeriod[]).map((p) => (
                <SelectItem key={p} value={p}>
                  Últimos {PERIOD_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {access.data?.rateLimited && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          O Mercado Livre está limitando as consultas no momento. Os números podem demorar — tente
          atualizar em instantes.
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="bg-muted/60">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <Layers className="h-4 w-4" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-1.5">
            <Target className="h-4 w-4" /> Campanhas
          </TabsTrigger>
          <TabsTrigger value="ads" className="gap-1.5">
            <ShoppingCart className="h-4 w-4" /> Anúncios
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-1.5">
            <Boxes className="h-4 w-4" /> Categorias
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <ShieldQuestion className="h-4 w-4" /> Auditoria Mamba
          </TabsTrigger>
          <TabsTrigger value="intel" className="gap-1.5">
            <Lightbulb className="h-4 w-4" /> Inteligência
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab period={period} />
        </TabsContent>
        <TabsContent value="campaigns">
          <CampaignsTab period={period} />
        </TabsContent>
        <TabsContent value="ads">
          <AdsTab period={period} />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesTab period={period} />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab period={period} />
        </TabsContent>
        <TabsContent value="intel">
          <IntelTab period={period} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

/* ----------------------------------------------------------------------- */
/* Dashboard tab — quick view that reunites the whole picture.             */
/* ----------------------------------------------------------------------- */
function DashboardTab({ period }: { period: AdsPeriod }) {
  const q = trpc.ads.dashboard.useQuery({ days: Number(period) as 7 | 15 | 30 | 60 | 90 });

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <KpiSkeletonRow count={4} />
        <KpiSkeletonRow count={4} />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (q.isError || !q.data || !q.data.summary) {
    return (
      <ErrorState
        message={q.error?.message}
        onRetry={() => q.refetch()}
        retrying={q.isFetching}
      />
    );
  }

  const s = q.data.summary;
  const m = s.metrics;
  const d = s.derived;

  return (
    <div className="space-y-6">
      {/* Primary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Investimento"
          value={formatBRL(m.cost)}
          icon={DollarSign}
          accent="primary"
          sublabel={`Orçamento diário: ${formatBRL(d.totalBudget)}`}
        />
        <KpiCard
          label="Receita atribuída"
          value={formatBRL(m.totalAmount)}
          icon={TrendingUp}
          accent="emerald"
          sublabel={`Direta ${formatBRL(m.directAmount)} · Indireta ${formatBRL(m.indirectAmount)}`}
        />
        <KpiCard
          label="ROAS"
          value={d.roas != null ? `${d.roas.toFixed(2)}x` : "—"}
          icon={Target}
          accent="blue"
          sublabel="Retorno sobre investimento em ads"
        />
        <KpiCard
          label="ACOS"
          value={d.acos != null ? formatRatePct(d.acos) : "—"}
          icon={Target}
          accent={d.acos != null && d.acos < 20 ? "emerald" : "amber"}
          valueClassName={acosColor(d.acos ?? 0)}
          sublabel="Custo de publicidade sobre a venda"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Cliques" value={formatNumber(m.clicks)} icon={MousePointerClick} accent="violet" sublabel={`CPC médio ${formatBRL(m.cpc)}`} />
        <KpiCard label="Impressões" value={formatCompact(m.prints)} icon={Eye} accent="blue" sublabel={`CTR ${formatRatePct(m.ctr, 2)}`} />
        <KpiCard label="Unidades vendidas" value={formatNumber(m.units)} icon={ShoppingCart} accent="emerald" sublabel={`Conversão ${d.conversionRate != null ? formatRatePct(d.conversionRate) : "—"}`} />
        <KpiCard
          label="Venda orgânica"
          value={d.organicShare != null ? formatRatePct(d.organicShare, 0) : "—"}
          icon={Leaf}
          accent="green"
          sublabel={`${formatNumber(m.organicUnits)} un. impulsionadas`}
        />
      </div>

      {/* Organic halo highlight — the differentiator */}
      {d.organicShare != null && d.organicShare > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-5 py-4">
          <Leaf className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-sm">
            <p className="font-semibold text-emerald-800">Efeito halo: Ads impulsionando a venda orgânica</p>
            <p className="text-muted-foreground">
              Cerca de <strong>{formatRatePct(d.organicShare, 0)}</strong> das unidades atribuídas
              ao período vieram de forma orgânica. Investir em Ads também aquece a venda que não paga
              clique — um ganho que ferramentas focadas só no Ads costumam ignorar.
            </p>
          </div>
        </div>
      )}

      {/* Top campaigns quick table */}
      <SectionCard title="Campanhas com maior investimento" description={`Período: últimos ${PERIOD_LABEL[period]}`}>
        <CampaignTable campaigns={q.data.topCampaigns} compact />
      </SectionCard>

      {/* Top ads quick view */}
      <SectionCard title="Anúncios patrocinados em destaque" description="Maior investimento no período">
        <AdsTable ads={q.data.topAds} compact />
      </SectionCard>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Campaigns tab                                                           */
/* ----------------------------------------------------------------------- */
function CampaignsTab({ period }: { period: AdsPeriod }) {
  const q = trpc.ads.campaigns.useQuery({ days: Number(period) as 7 | 15 | 30 | 60 | 90 });

  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (q.isError || !q.data) {
    return <ErrorState message={q.error?.message} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  }
  if (q.data.length === 0) {
    return (
      <SectionCard>
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma campanha encontrada no período selecionado.
        </p>
      </SectionCard>
    );
  }

  const sorted = [...q.data].sort((a, b) => b.metrics.cost - a.metrics.cost);
  return (
    <SectionCard
      title={`${q.data.length} campanha(s)`}
      description={`Dados reais de Product Ads · últimos ${PERIOD_LABEL[period]}`}
    >
      <CampaignTable campaigns={sorted} />
    </SectionCard>
  );
}

function CampaignTable({ campaigns, compact = false }: { campaigns: AdsCampaign[]; compact?: boolean }) {
  if (campaigns.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sem campanhas no período.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground" style={{ borderColor: "var(--border)" }}>
            <th className="py-2.5 pr-3 font-semibold">Campanha</th>
            <th className="py-2.5 px-3 font-semibold">Estratégia</th>
            <th className="py-2.5 px-3 font-semibold text-right">Invest.</th>
            <th className="py-2.5 px-3 font-semibold text-right">Receita</th>
            <th className="py-2.5 px-3 font-semibold text-right">ACOS</th>
            {!compact && <th className="py-2.5 px-3 font-semibold text-right">Alvo</th>}
            <th className="py-2.5 px-3 font-semibold text-right">Cliques</th>
            {!compact && <th className="py-2.5 px-3 font-semibold text-right">Unid.</th>}
            <th className="py-2.5 pl-3 font-semibold text-right">Orçam./dia</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => {
            const sm = strategyMeta(c.strategy);
            const st = statusMeta(c.status);
            return (
              <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30" style={{ borderColor: "var(--border)" }}>
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", st.cls)}>{st.label}</Badge>
                  </div>
                </td>
                <td className="py-3 px-3">
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", sm.accent)}>{sm.label}</span>
                </td>
                <td className="py-3 px-3 text-right tabular-nums font-medium">{formatBRL(c.metrics.cost)}</td>
                <td className="py-3 px-3 text-right tabular-nums">{formatBRL(c.metrics.totalAmount)}</td>
                <td className={cn("py-3 px-3 text-right tabular-nums font-semibold", acosColor(c.metrics.acos, c.acosTarget))}>
                  {c.metrics.acos ? formatRatePct(c.metrics.acos) : "—"}
                </td>
                {!compact && (
                  <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">
                    {c.acosTarget != null ? formatRatePct(c.acosTarget) : "—"}
                  </td>
                )}
                <td className="py-3 px-3 text-right tabular-nums">{formatNumber(c.metrics.clicks)}</td>
                {!compact && <td className="py-3 px-3 text-right tabular-nums">{formatNumber(c.metrics.units)}</td>}
                <td className="py-3 pl-3 text-right tabular-nums">
                  {c.budget != null ? formatBRL(c.budget) : "—"}
                  {c.automaticBudget && <span className="ml-1 text-[10px] text-muted-foreground">(auto)</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Ads tab                                                                 */
/* ----------------------------------------------------------------------- */
function AdsTab({ period }: { period: AdsPeriod }) {
  const q = trpc.ads.ads.useQuery({ days: Number(period) as 7 | 15 | 30 | 60 | 90 });
  const [onlyActive, setOnlyActive] = useState(false);

  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (q.isError || !q.data) {
    return <ErrorState message={q.error?.message} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  }

  const withCost = q.data.filter((a) => (onlyActive ? a.metrics.cost > 0 : true)).sort((a, b) => b.metrics.cost - a.metrics.cost);

  return (
    <SectionCard
      title={`${q.data.length} anúncio(s) patrocinado(s)`}
      description={`Métricas por anúncio · últimos ${PERIOD_LABEL[period]}`}
      actions={
        <Button
          variant={onlyActive ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyActive((v) => !v)}
        >
          {onlyActive ? "Mostrando com gasto" : "Só com gasto"}
        </Button>
      }
    >
      <AdsTable ads={withCost} />
    </SectionCard>
  );
}

function AdsTable({ ads, compact = false }: { ads: AdsAdRow[]; compact?: boolean }) {
  if (ads.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhum anúncio para exibir.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground" style={{ borderColor: "var(--border)" }}>
            <th className="py-2.5 pr-3 font-semibold">Anúncio</th>
            <th className="py-2.5 px-3 font-semibold text-right">Preço</th>
            <th className="py-2.5 px-3 font-semibold text-right">Invest.</th>
            <th className="py-2.5 px-3 font-semibold text-right">Cliques</th>
            {!compact && <th className="py-2.5 px-3 font-semibold text-right">CTR</th>}
            <th className="py-2.5 px-3 font-semibold text-right">ACOS</th>
            <th className="py-2.5 pl-3 font-semibold text-right">Unid.</th>
          </tr>
        </thead>
        <tbody>
          {ads.map((a) => (
            <tr key={a.itemId} className="border-b last:border-0 hover:bg-muted/30" style={{ borderColor: "var(--border)" }}>
              <td className="py-2.5 pr-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {a.thumbnail ? (
                    <img src={a.thumbnail.replace("http://", "https://")} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover border" style={{ borderColor: "var(--border)" }} />
                  ) : (
                    <div className="h-9 w-9 shrink-0 rounded-md bg-muted" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate max-w-[280px] font-medium">{a.title}</p>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      {a.buyBoxWinner && <span className="text-emerald-600">Ganha Buy Box</span>}
                      {a.permalink && (
                        <a href={a.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-primary">
                          ver <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums">{formatBRL(a.price)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums font-medium">{formatBRL(a.metrics.cost)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{formatNumber(a.metrics.clicks)}</td>
              {!compact && <td className="py-2.5 px-3 text-right tabular-nums">{a.metrics.ctr ? formatRatePct(a.metrics.ctr, 2) : "—"}</td>}
              <td className={cn("py-2.5 px-3 text-right tabular-nums font-semibold", acosColor(a.metrics.acos))}>
                {a.metrics.acos ? formatRatePct(a.metrics.acos) : a.metrics.cost > 0 && a.metrics.units === 0 ? <span className="text-rose-600">sem venda</span> : "—"}
              </td>
              <td className="py-2.5 pl-3 text-right tabular-nums">{formatNumber(a.metrics.units)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Intelligence tab                                                        */
/* ----------------------------------------------------------------------- */
const SEVERITY_META: Record<AdsInsightSeverity, { icon: typeof Info; cls: string; ring: string; label: string }> = {
  critical: { icon: AlertTriangle, cls: "text-rose-600 bg-rose-500/10", ring: "border-rose-500/20", label: "Crítico" },
  warning: { icon: AlertTriangle, cls: "text-amber-600 bg-amber-500/10", ring: "border-amber-500/20", label: "Atenção" },
  good: { icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-500/10", ring: "border-emerald-500/20", label: "Oportunidade" },
  info: { icon: Info, cls: "text-blue-600 bg-blue-500/10", ring: "border-blue-500/20", label: "Informação" },
};

function IntelTab({ period }: { period: AdsPeriod }) {
  const q = trpc.ads.insights.useQuery({ days: Number(period) as 7 | 15 | 30 | 60 | 90 });

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }
  if (q.isError || !q.data) {
    return <ErrorState message={q.error?.message} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  }

  const insights = q.data as AdsInsight[];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/[0.05] px-5 py-4">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="text-sm">
          <p className="font-semibold">Inteligência de Ads (somente leitura)</p>
          <p className="text-muted-foreground">
            Recomendações geradas a partir das métricas reais da sua conta. Hoje servem de guia para
            a equipe; quando a escrita for habilitada, os robôs internos poderão executá-las
            automaticamente.
          </p>
        </div>
      </div>

      {insights.length === 0 ? (
        <SectionCard>
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum alerta no período — as campanhas estão dentro do esperado.
          </p>
        </SectionCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {insights.map((it) => {
            const meta = SEVERITY_META[it.severity];
            const Icon = meta.icon;
            return (
              <div key={it.id} className={cn("rounded-2xl border bg-card p-5 card-soft", meta.ring)}>
                <div className="flex items-start gap-3">
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", meta.cls)}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-sm tracking-tight">{it.title}</h3>
                      <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", meta.cls)}>{meta.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{it.detail}</p>
                    {it.metric && (
                      <div className="pt-1.5">
                        <span className="text-xs text-muted-foreground">{it.metric.label}: </span>
                        <span className="font-semibold tabular-nums">{it.metric.value}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


/* ----------------------------------------------------------------------- */
/* Categories tab — real-time tracking by product family                   */
/* ----------------------------------------------------------------------- */
const CATEGORY_ACCENT: Record<string, string> = {
  espetos: "from-orange-500/15 to-orange-500/5 text-orange-700 border-orange-500/20",
  manicure: "from-pink-500/15 to-pink-500/5 text-pink-700 border-pink-500/20",
  aroma_fibra: "from-violet-500/15 to-violet-500/5 text-violet-700 border-violet-500/20",
  aroma_madeira: "from-amber-500/15 to-amber-500/5 text-amber-700 border-amber-500/20",
  hashi: "from-emerald-500/15 to-emerald-500/5 text-emerald-700 border-emerald-500/20",
  palitos_bambu: "from-lime-500/15 to-lime-500/5 text-lime-700 border-lime-500/20",
  outros: "from-slate-500/15 to-slate-500/5 text-slate-700 border-slate-500/20",
};

function CategoriesTab({ period }: { period: AdsPeriod }) {
  const q = trpc.ads.categories.useQuery({ days: Number(period) as 7 | 15 | 30 | 60 | 90 });
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (q.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-44 w-full rounded-2xl" />
        ))}
      </div>
    );
  }
  if (q.isError || !q.data) {
    return <ErrorState message={q.error?.message} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  }

  const cats = (q.data.categories as AdsCategoryStat[]).filter((c) => c.adCount > 0);
  const totalAds = cats.reduce((s, c) => s + c.adCount, 0);
  const updatedAt = new Date(q.data.computedAt);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/[0.05] px-5 py-3.5 flex-1 min-w-[260px]">
          <Boxes className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-semibold">Rastreio por categoria — em tempo real</p>
            <p className="text-muted-foreground">
              Os {totalAds} anúncios patrocinados agrupados por linha de produto. Métricas reais do
              período, atualizadas a cada consulta.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching} className="gap-1.5">
          <RefreshCw className={cn("h-3.5 w-3.5", q.isFetching && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cats.map((c) => {
          const accent = CATEGORY_ACCENT[c.key] ?? CATEGORY_ACCENT.outros;
          const isOpen = openKey === c.key;
          return (
            <div key={c.key} className={cn("rounded-2xl border bg-gradient-to-br p-5 card-soft", accent)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg tracking-tight text-foreground">{c.label}</h3>
                  <p className="text-xs text-muted-foreground">
                    {c.adCount} anúncio(s) · {c.activeAdCount} ativo(s)
                  </p>
                </div>
                <Boxes className="h-5 w-5 opacity-70" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-foreground">
                <CatMetric label="Visualizações" value={formatCompact(c.metrics.prints)} icon={Eye} />
                <CatMetric label="Cliques" value={formatNumber(c.metrics.clicks)} icon={MousePointerClick} />
                <CatMetric label="Investimento" value={formatBRL(c.metrics.cost)} icon={DollarSign} />
                <CatMetric label="Receita" value={formatBRL(c.metrics.totalAmount)} icon={TrendingUp} />
                <CatMetric
                  label="ACOS"
                  value={c.derived.acos != null ? formatRatePct(c.derived.acos) : "—"}
                  icon={Target}
                  valueClass={acosColor(c.derived.acos ?? 0)}
                />
                <CatMetric label="Unidades" value={formatNumber(c.metrics.units)} icon={ShoppingCart} />
              </div>

              <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs" style={{ borderColor: "var(--border)" }}>
                <span className="text-muted-foreground">
                  CTR {c.metrics.ctr ? formatRatePct(c.metrics.ctr, 2) : "—"} · Conv.{" "}
                  {c.derived.conversionRate != null ? formatRatePct(c.derived.conversionRate) : "—"}
                </span>
                <button
                  onClick={() => setOpenKey(isOpen ? null : c.key)}
                  className="inline-flex items-center gap-1 font-medium hover:underline"
                >
                  {isOpen ? "Ocultar" : "Ver anúncios"} <ArrowRight className="h-3 w-3" />
                </button>
              </div>

              {isOpen && c.sampleAds.length > 0 && (
                <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                  {c.sampleAds.map((a) => (
                    <div key={a.itemId} className="flex items-center gap-2 text-xs">
                      {a.thumbnail ? (
                        <img src={a.thumbnail.replace("http://", "https://")} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
                      ) : (
                        <div className="h-7 w-7 shrink-0 rounded bg-muted" />
                      )}
                      <span className="truncate flex-1 text-foreground/80">{a.title}</span>
                      <span className="tabular-nums font-medium">{formatBRL(a.metrics.cost)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-right">
        Atualizado em {updatedAt.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

function CatMetric({
  label,
  value,
  icon: Icon,
  valueClass,
}: {
  label: string;
  value: string;
  icon: typeof Eye;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={cn("font-semibold tabular-nums", valueClass)}>{value}</div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Audit tab — track Mamba's changes and judge coherence                   */
/* ----------------------------------------------------------------------- */
const VERDICT_META: Record<AdsChangeVerdict, { cls: string; label: string; icon: typeof Info }> = {
  coherent: { cls: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20", label: "Coerente", icon: CheckCircle2 },
  questionable: { cls: "text-rose-700 bg-rose-500/10 border-rose-500/20", label: "Questionável", icon: AlertTriangle },
  neutral: { cls: "text-blue-700 bg-blue-500/10 border-blue-500/20", label: "Neutro", icon: Info },
};

const FIELD_LABEL: Record<string, string> = {
  status: "Status da campanha",
  acosTarget: "ACOS-alvo",
  budget: "Orçamento diário",
  automaticBudget: "Orçamento automático",
  strategy: "Estratégia",
};

function AuditTab({ period }: { period: AdsPeriod }) {
  const q = trpc.ads.audit.useQuery({ days: Number(period) as 7 | 15 | 30 | 60 | 90 });

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <KpiSkeletonRow count={4} />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return <ErrorState message={q.error?.message} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  }

  const data = q.data;
  const changes = data.changes as AdsChangeEntry[];
  const managed = data.managedCampaigns as AdsManagedCampaign[];

  return (
    <div className="space-y-6">
      {/* Context banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] px-5 py-4">
        <ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
        <div className="text-sm">
          <p className="font-semibold text-violet-900">Auditoria da gestão da Mamba</p>
          <p className="text-muted-foreground">
            A partir do dia em que começamos a rastrear, o sistema fotografa as campanhas todos os
            dias e registra cada alteração feita na conta — com nosso veredito de coerência e o que
            faríamos diferente. Assim, ao fim dos 30 dias, a decisão de manter ou dispensar a
            assessoria será baseada em fatos.
          </p>
        </div>
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Dias monitorados"
          value={String(data.daysTracked)}
          icon={Clock}
          accent="violet"
          sublabel={data.trackingSince ? `Desde ${new Date(data.trackingSince + "T00:00:00-03:00").toLocaleDateString("pt-BR")}` : "Começa hoje"}
        />
        <KpiCard
          label="Mudanças detectadas"
          value={String(data.summary.totalChanges)}
          icon={History}
          accent="blue"
          sublabel="Alterações feitas na conta"
        />
        <KpiCard
          label="Decisões coerentes"
          value={String(data.summary.coherent)}
          icon={CheckCircle2}
          accent="emerald"
          sublabel="Alinhadas ao que faríamos"
        />
        <KpiCard
          label="Decisões questionáveis"
          value={String(data.summary.questionable)}
          icon={AlertTriangle}
          accent="amber"
          valueClassName={data.summary.questionable > 0 ? "text-rose-600" : undefined}
          sublabel="Mereceriam revisão"
        />
      </div>

      {/* Snapshot building notice when no prior day exists yet */}
      {data.snapshotDays <= 1 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-5 py-3.5 text-sm">
          <Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-600" />
          <p className="text-amber-800">
            A linha do tempo de mudanças começa a partir da segunda captura diária. Hoje gravamos a
            primeira fotografia das campanhas; a partir de amanhã, toda alteração da Mamba aparecerá
            aqui automaticamente. Abaixo, já mostramos nossa avaliação da configuração atual.
          </p>
        </div>
      )}

      {/* Change timeline */}
      <SectionCard
        title="Linha do tempo — o que a Mamba fez"
        description="Mudanças detectadas dia a dia, com nosso veredito e recomendação"
      >
        {changes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma mudança registrada ainda. Assim que a Mamba alterar uma campanha (orçamento,
            ACOS, status…), o evento aparecerá aqui com nossa análise.
          </p>
        ) : (
          <div className="space-y-3">
            {changes.map((ch) => {
              const vm = VERDICT_META[ch.verdict];
              const VIcon = vm.icon;
              return (
                <div key={ch.id} className={cn("rounded-xl border p-4", vm.cls)}>
                  <div className="flex flex-wrap items-center gap-2 text-foreground">
                    <span className="font-semibold">{ch.campaignName}</span>
                    <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", vm.cls)}>
                      <VIcon className="mr-1 h-3 w-3" />
                      {vm.label}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(ch.detectedDay + "T00:00:00-03:00").toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{FIELD_LABEL[ch.field] ?? ch.field}:</span>
                    <span className="rounded bg-background/60 px-1.5 py-0.5 font-medium line-through opacity-70">
                      {ch.oldValue ?? "—"}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="rounded bg-background/60 px-1.5 py-0.5 font-semibold">
                      {ch.newValue ?? "—"}
                    </span>
                  </div>
                  {ch.assessment && (
                    <p className="mt-2 text-sm text-foreground/80">{ch.assessment}</p>
                  )}
                  {ch.recommendation && (
                    <div className="mt-2 flex items-start gap-1.5 text-sm">
                      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>
                        <span className="font-medium">O que faríamos: </span>
                        <span className="text-foreground/80">{ch.recommendation}</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Our verdict on each current campaign config */}
      <SectionCard
        title="Nossa avaliação da configuração atual"
        description="Veredito próprio sobre cada campanha gerida hoje (somente leitura)"
      >
        {managed.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma campanha para avaliar.</p>
        ) : (
          <div className="space-y-3">
            {managed.map((c) => {
              const vm = VERDICT_META[c.ourVerdict];
              const VIcon = vm.icon;
              return (
                <div key={c.campaignId} className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{c.name}</span>
                    {c.managedByMamba && (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-violet-500/10 text-violet-700 border-violet-500/20">
                        Mamba
                      </Badge>
                    )}
                    <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", statusMeta(c.status).cls)}>
                      {statusMeta(c.status).label}
                    </Badge>
                    <Badge variant="outline" className={cn("ml-auto h-5 px-1.5 text-[10px]", vm.cls)}>
                      <VIcon className="mr-1 h-3 w-3" />
                      {vm.label}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <span>ACOS atual: <strong className={acosColor(c.metrics.acos, c.acosTarget)}>{c.metrics.acos ? formatRatePct(c.metrics.acos) : "—"}</strong></span>
                    <span>ACOS-alvo: <strong className="text-foreground">{c.acosTarget != null ? formatRatePct(c.acosTarget) : "—"}</strong></span>
                    <span>Orçam./dia: <strong className="text-foreground">{c.budget != null ? formatBRL(c.budget) : "—"}{c.automaticBudget ? " (auto)" : ""}</strong></span>
                    <span>Investido: <strong className="text-foreground">{formatBRL(c.metrics.cost)}</strong></span>
                  </div>
                  <p className="mt-2 text-sm text-foreground/80">{c.ourComment}</p>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
