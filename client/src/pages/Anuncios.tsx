import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { ProductCell } from "@/components/account/ProductCell";
import { TechSpecsCard } from "@/components/account/TechSpecsCard";
import { ActiveListingsCard } from "@/components/account/ActiveListingsCard";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatBRL,
  formatNumber,
  formatRatePct,
  formatCompact,
  isoToWeekdayLong,
  isoToWeekdayShort,
  isoToDayNum,
} from "@/lib/format";
import { computeVisitsTrendPct } from "@shared/visitsTrend";
import { exportListingsPdf } from "@/lib/exportListingsPdf";
import { toast } from "sonner";
import { DayAxisTick, dayAxisProps } from "@/components/charts/DayAxisTick";
import { VisitsEvolutionChart } from "@/components/charts/VisitsEvolutionChart";
import { DayVisitsBreakdownDialog } from "@/components/charts/DayVisitsBreakdownDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Area,
  ComposedChart,
  Line,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ListingRow, ListingStatus, VisitsDayPoint } from "@shared/account";
import {
  VISIT_BUCKETS,
  bucketCounts,
  computeInsights,
  filterListings,
  sortListings,
  listingsToCsv,
  type ListingFilters,
  type InsightId,
  type SortKey,
  type SortDir,
} from "@shared/listingsAnalytics";
import {
  Package,
  Eye,
  EyeOff,
  PlayCircle,
  XCircle,
  Gauge,
  PauseCircle,
  AlertCircle,
  Boxes,
  Download,
  FileText,
  Search as SearchIcon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  TrendingDown,
  PackageX,
  RefreshCw,
  Flame,
  Filter,
} from "lucide-react";

const STATUS_META: Record<ListingStatus, { label: string; className: string }> = {
  active: { label: "Ativo", className: "bg-emerald-500/12 text-emerald-700 border-emerald-500/20" },
  paused: { label: "Pausado", className: "bg-amber-500/12 text-amber-700 border-amber-500/20" },
  closed: { label: "Encerrado", className: "bg-muted text-muted-foreground border-border" },
  under_review: { label: "Em revisão", className: "bg-blue-500/12 text-blue-700 border-blue-500/20" },
  inactive: { label: "Inativo", className: "bg-muted text-muted-foreground border-border" },
};

const INSIGHT_ICON: Record<InsightId, typeof Flame> = {
  high_visits_low_conv: TrendingDown,
  no_sales_high_visits: AlertCircle,
  selling_low_stock: Flame,
  out_of_stock_active: PackageX,
  paused_with_sales: RefreshCw,
};

const INSIGHT_ACCENT: Record<InsightId, string> = {
  high_visits_low_conv: "border-amber-500/30 bg-amber-500/5 text-amber-700",
  no_sales_high_visits: "border-rose-500/30 bg-rose-500/5 text-rose-700",
  selling_low_stock: "border-orange-500/30 bg-orange-500/5 text-orange-700",
  out_of_stock_active: "border-red-500/30 bg-red-500/5 text-red-700",
  paused_with_sales: "border-blue-500/30 bg-blue-500/5 text-blue-700",
};

const STATUS_FILTERS: { key: ListingStatus; label: string }[] = [
  { key: "active", label: "Ativos" },
  { key: "paused", label: "Pausados" },
  { key: "closed", label: "Encerrados" },
];

const LISTING_TYPE_LABEL: Record<string, string> = {
  gold_pro: "Premium",
  gold_premium: "Premium",
  gold_special: "Clássico",
  gold: "Clássico",
  silver: "Básico",
  bronze: "Grátis",
  free: "Grátis",
};

function typeLabel(t: string): string {
  return LISTING_TYPE_LABEL[t] ?? (t || "—");
}

const emptyFilters: ListingFilters = {
  search: "",
  statuses: [],
  listingTypes: [],
  visitBucketIds: [],
  stockBucketIds: [],
  conversionBucketIds: [],
  healthBucketIds: [],
  freeShipping: null,
  insightId: null,
};

export default function Anuncios() {
  // Visits window in days. The Visits card reflects REAL visits over this
  // period (via ML's dated time_window endpoint, one item per request).
  const [visitWindow, setVisitWindow] = useState<7 | 30 | 90>(30);
  const [filters, setFilters] = useState<ListingFilters>(emptyFilters);
  const [sortKey, setSortKey] = useState<SortKey>("visits");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // Day picked on the VISITS chart -> opens the per-listing breakdown modal.
  const [visitsDay, setVisitsDay] = useState<string | null>(null);

  const conn = trpc.account.connection.useQuery();
  const { data, isLoading, error, isFetching, dataUpdatedAt, refetch } = trpc.account.listings.useQuery(
    { lastDays: visitWindow },
    {
      enabled: conn.data?.connected === true,
      // The per-item visits total is collected in the BACKGROUND and fills in
      // progressively. While it is still collecting, poll every 6s so the card
      // climbs to the real number on its own (no manual refresh needed). Once
      // every item has resolved, relax to the normal 5-min refresh.
      refetchInterval: (query) =>
        query.state.data?.summary?.visitsCollecting ? 6 * 1000 : 5 * 60 * 1000,
      refetchOnWindowFocus: true,
    },
  );
  // Daily visits chart via the dedicated NON-BLOCKING endpoint (background
  // collection + cheap cached read). Polled every 60s so it never freezes the
  // page on "Carregando as visitas".
  const visits = trpc.account.visitsSeries.useQuery(
    { days: visitWindow },
    {
      enabled: conn.data?.connected === true,
      // While the cold-start background collection is still running (pending),
      // poll quickly (4s) so the chart fills in within seconds; relax to 60s once
      // the data has landed.
      refetchInterval: (query) =>
        query.state.data?.pending ? 4 * 1000 : 60 * 1000,
      refetchOnWindowFocus: true,
    },
  );

  const items = useMemo<ListingRow[]>(() => data?.items ?? [], [data]);

  // Visitas DIÁRIAS por anúncio (hoje + 3 dias atrás) — endpoint dedicado e
  // não-bloqueante. Envia os itemIds da conta e devolve a série de 4 dias por
  // anúncio; faz poll enquanto o ML ainda está sendo coletado em background.
  // PERFORMANCE: a coleta de visitas no ML custa 1 requisição POR anúncio. O
  // usuário só se interessa pelas visitas dos anúncios ATIVOS, então coletamos
  // apenas esses — isso reduz bastante o volume de chamadas e acelera o
  // carregamento (pausados/encerrados são ignorados na coleta diária).
  const dailyItemIds = useMemo(
    () => items.filter((i) => i.status === "active").map((i) => i.itemId).filter(Boolean),
    [items],
  );
  const visitsDaily = trpc.account.visitsDaily.useQuery(
    { itemIds: dailyItemIds, days: 4 },
    {
      enabled: conn.data?.connected === true && dailyItemIds.length > 0,
      refetchInterval: (query) => (query.state.data?.collecting ? 5 * 1000 : 5 * 60 * 1000),
      refetchOnWindowFocus: true,
    },
  );
  // Mapa estável itemId -> série de 4 dias, consumido pela tabela.
  const dailyVisitsMap = useMemo<Record<string, VisitsDayPoint[]>>(
    () => visitsDaily.data?.items ?? {},
    [visitsDaily.data],
  );

  const insights = useMemo(() => computeInsights(items), [items]);

  const visitDist = useMemo(() => bucketCounts(items, VISIT_BUCKETS, (r) => r.visits), [items]);
  const visitsSeries = useMemo<VisitsDayPoint[]>(() => visits.data?.series ?? [], [visits.data]);

  // PRIMARY source for the hero "Visitas (Nd)" card: the aggregated active-items
  // series from the dedicated NON-BLOCKING endpoint. It lands in seconds, so the
  // card never freezes on "—" waiting for the slow per-item collector.
  const seriesTotalVisits = useMemo<number | null>(() => {
    if (!visitsSeries.length) return null;
    return visitsSeries.reduce((sum, p) => sum + (p.visits ?? 0), 0);
  }, [visitsSeries]);
  const seriesPending = visits.data?.pending === true;

  // Visits trend: compare the first vs. the second half of the window, ignoring
  // today (partial). Positive => visits are growing. Null when not enough data.
  const visitsTrendPct = useMemo<number | null>(
    () => computeVisitsTrendPct(visitsSeries, new Date().toISOString().slice(0, 10)),
    [visitsSeries],
  );

  const filtered = useMemo(() => filterListings(items, filters), [items, filters]);
  const sorted = useMemo(
    () => sortListings(filtered, sortKey, sortDir, dailyVisitsMap),
    [filtered, sortKey, sortDir, dailyVisitsMap],
  );

  // When an insight card is selected we surface the matching listings right
  // below the Oportunidades section (in addition to driving the full table).
  const selectedInsight = useMemo(
    () => (filters.insightId ? insights.find((i) => i.id === filters.insightId) ?? null : null),
    [filters.insightId, insights],
  );
  const insightRows = useMemo(
    () => (selectedInsight ? sortListings(selectedInsight.items, sortKey, sortDir, dailyVisitsMap) : []),
    [selectedInsight, sortKey, sortDir, dailyVisitsMap],
  );


  function toggleArrayFilter(key: keyof ListingFilters, value: string) {
    setFilters((prev) => {
      const arr = (prev[key] as string[] | undefined) ?? [];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...prev, [key]: next };
    });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function selectInsight(id: InsightId) {
    setFilters((prev) => ({
      ...emptyFilters,
      search: prev.search,
      insightId: prev.insightId === id ? null : id,
    }));
  }

  function exportCsv() {
    const csv = listingsToCsv(sorted);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meus-anuncios-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    // Monta um rótulo curto descrevendo os filtros aplicados, para o relatório.
    const parts: string[] = [];
    if (filters.statuses?.length) {
      const map: Record<string, string> = { active: "Ativos", paused: "Pausados", closed: "Encerrados" };
      parts.push(filters.statuses.map((s) => map[s] ?? s).join(", "));
    }
    if (filters.search?.trim()) parts.push(`Busca: “${filters.search.trim()}”`);
    if (filters.freeShipping === true) parts.push("Frete grátis");
    try {
      exportListingsPdf(sorted, {
        visitWindow,
        filtersLabel: parts.length ? parts.join(" · ") : "Todos os anúncios",
      });
    } catch (e) {
      toast.error(
        "Não foi possível abrir a janela de impressão. Verifique se o navegador está bloqueando pop-ups para este site.",
      );
    }
  }

  const activeFilterCount =
    (filters.statuses?.length ?? 0) +
    (filters.listingTypes?.length ?? 0) +
    (filters.visitBucketIds?.length ?? 0) +
    (filters.stockBucketIds?.length ?? 0) +
    (filters.conversionBucketIds?.length ?? 0) +
    (filters.healthBucketIds?.length ?? 0) +
    (filters.freeShipping != null ? 1 : 0) +
    (filters.priceMin != null || filters.priceMax != null ? 1 : 0) +
    (filters.insightId ? 1 : 0);

  if (conn.isLoading && conn.data === undefined) {
    return (
      <PageShell>
        <Skeleton className="h-9 w-64" />
        <KpiSkeletonRow count={4} />
      </PageShell>
    );
  }
  if (conn.data && conn.data.connected !== true && !conn.isFetching && !data) {
    return <NotConnected />;
  }
  if (error && !data)
    return <ErrorState onRetry={() => refetch()} retrying={isFetching} />;

  const s = data?.summary;
  const availableTypes = Array.from(new Set(items.map((i) => i.listingType).filter(Boolean)));

  // Visit data can be "pending": NOT A SINGLE item has resolved yet (cold start /
  // throttle). Only then do we hide the number behind a dash — it is NOT a real
  // zero. As soon as the background collector resolves the first item we show the
  // (growing) partial total instead, so the card is never frozen on "—".
  const visitsPending = !isLoading && s?.visitsPending === true;
  // Still collecting in the background (some items resolved, more on the way).
  // We keep the page polling and show a discreet progress hint, but DISPLAY the
  // partial number so the user sees it climbing toward the real total.
  const visitsCollecting = !isLoading && s?.visitsCollecting === true;
  // The hero "Visitas (Nd)" card is driven by the fast aggregated SERIES. It is
  // only truly "pending" (show a dash) when the series itself has not landed yet
  // AND there is no per-item fallback total. Once the series arrives we always
  // have a real number, so the card never stays frozen on "—".
  const heroVisitsValue = seriesTotalVisits ?? (visitsPending ? null : (s?.totalVisits ?? 0));
  const heroVisitsPending = heroVisitsValue == null && (seriesPending || visitsPending);
  const visitsResolved = s?.visitsResolved ?? 0;
  const visitsAttempted = s?.visitsAttempted ?? 0;
  const collectProgress =
    visitsAttempted > 0 ? `${formatNumber(visitsResolved)} de ${formatNumber(visitsAttempted)} anúncios` : "";
  const LOADING = "—";
  /** Show the real (or growing partial) number; a dash only on a cold start. */
  const visitVal = (n: number | undefined) =>
    isLoading ? "" : visitsPending ? LOADING : formatNumber(n ?? 0);

  return (
    <PageShell>
      <PageHeader
        title="Meus anúncios"
        subtitle="Central analítica dos seus anúncios: cruze visitas, vendas, conversão, estoque e saúde para agir onde rende mais."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-secondary p-1">
              {([7, 30, 90] as const).map((w) => (
                <Button
                  key={w}
                  size="sm"
                  variant={visitWindow === w ? "default" : "ghost"}
                  className="h-8 rounded-lg px-2.5 text-xs"
                  onClick={() => setVisitWindow(w)}
                  title={`Visitas reais dos últimos ${w} dias`}
                >
                  {w}d
                </Button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 bg-card"
              onClick={exportCsv}
              disabled={isLoading || sorted.length === 0}
            >
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 bg-card"
              onClick={exportPdf}
              disabled={isLoading || sorted.length === 0}
              title="Gerar PDF dos anúncios filtrados (com visitas)"
            >
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        }
      />

      {s?.capped && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Mostrando os primeiros {formatNumber(s.total)} anúncios. Há mais itens na conta — em breve podemos paginar/expandir o limite.
        </div>
      )}

      {heroVisitsPending && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 px-4 py-2.5 text-sm text-blue-700">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
            <span>
              {visitsPending ? (
                <>
                  As <strong>visitas</strong> estão sendo carregadas do Mercado Livre (o ML só permite consultar um anúncio por vez). Os demais dados já estão atualizados e o total de visitas vai aparecer em instantes. <strong>Isto não é zero de visitas</strong> — é carregamento.
                </>
              ) : (
                <>
                  Carregando as <strong>visitas</strong> do Mercado Livre — {collectProgress} já processados. O total acima vai subindo sozinho até concluir; não precisa atualizar.
                </>
              )}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 bg-card text-blue-700"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            {isFetching ? "Atualizando…" : "Atualizar agora"}
          </Button>
        </div>
      )}

      {/* KPIs do topo ocultados a pedido do usuário (23/06) */}

      {/* Card de anúncios ATIVOS (grid de cartões) ocultado a pedido do usuário (23/06) — manter apenas a Lista em planilha */}

            {/* List + filters — movida para o topo a pedido do usuário (23/06) */}
      <SectionCard
        collapsible
        defaultOpen
        title="Lista de anúncios"
        description={
          isLoading
            ? undefined
            : `${formatNumber(filtered.length)} de ${formatNumber(items.length)} anúncios`
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="relative w-44 md:w-64">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.search ?? ""}
                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                placeholder="Buscar por nome ou ID..."
                className="h-9 pl-9 pr-8"
              />
              {filters.search && (
                <button
                  onClick={() => setFilters((p) => ({ ...p, search: "" }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        }
      >
        {/* Filter chips */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              active={(filters.statuses ?? []).includes(f.key)}
              onClick={() => toggleArrayFilter("statuses", f.key)}
            >
              {f.label}
            </FilterChip>
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {availableTypes.map((t) => (
            <FilterChip
              key={t}
              active={(filters.listingTypes ?? []).includes(t)}
              onClick={() => toggleArrayFilter("listingTypes", t)}
            >
              {typeLabel(t)}
            </FilterChip>
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <FilterChip
            active={filters.freeShipping === true}
            onClick={() =>
              setFilters((p) => ({ ...p, freeShipping: p.freeShipping === true ? null : true }))
            }
          >
            Frete grátis
          </FilterChip>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Visualizações</span>
            <Select
              value={(filters.visitBucketIds && filters.visitBucketIds[0]) ?? "all"}
              onValueChange={(v) =>
                setFilters((p) => ({ ...p, visitBucketIds: v === "all" ? [] : [v] }))
              }
            >
              <SelectTrigger className="h-8 w-[150px] px-2.5 text-xs">
                <SelectValue placeholder="Todas as faixas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as faixas</SelectItem>
                {VISIT_BUCKETS.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Preço</span>
            <Input
              type="number"
              inputMode="decimal"
              value={filters.priceMin ?? ""}
              onChange={(e) =>
                setFilters((p) => ({ ...p, priceMin: e.target.value === "" ? null : Number(e.target.value) }))
              }
              placeholder="mín"
              className="h-8 w-20 px-2.5 text-xs"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="number"
              inputMode="decimal"
              value={filters.priceMax ?? ""}
              onChange={(e) =>
                setFilters((p) => ({ ...p, priceMax: e.target.value === "" ? null : Number(e.target.value) }))
              }
              placeholder="máx"
              className="h-8 w-20 px-2.5 text-xs"
            />
          </div>
          {activeFilterCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 px-2.5 text-xs text-muted-foreground"
              onClick={() => setFilters((p) => ({ ...emptyFilters, search: p.search }))}
            >
              <X className="h-3.5 w-3.5" /> Limpar filtros ({activeFilterCount})
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Filter className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Nenhum anúncio corresponde aos filtros atuais.
            </p>
          </div>
        ) : (
          <ListingsTable rows={sorted} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} dailyVisits={dailyVisitsMap} />
        )}
        {isFetching && !isLoading && (
          <p className="mt-3 text-center text-xs text-muted-foreground">Atualizando janela de {visitWindow} dias…</p>
        )}
      </SectionCard>


      {/* Visits broken down by listing status */}
      <SectionCard
        title={`Visualizações por status (${visitWindow}d)`}
        description="Como as visitas do período se distribuem entre anúncios ativos, pausados e encerrados — e quantos ativos estão realmente recebendo tráfego."
      >
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard
            label="Visitas · ativos"
            value={visitVal(s?.visitsActive)}
            loading={isLoading}
            icon={Eye}
            accent="emerald"
          />
          <KpiCard
            label="Visitas · pausados"
            value={visitVal(s?.visitsPaused)}
            loading={isLoading}
            icon={PauseCircle}
            accent="amber"
          />
          <KpiCard
            label="Visitas · encerrados"
            value={visitVal(s?.visitsClosed)}
            loading={isLoading}
            icon={XCircle}
            accent="rose"
          />
          <KpiCard
            label="Ativos com visitas"
            value={visitVal(s?.activeWithVisits)}
            loading={isLoading}
            icon={PlayCircle}
            accent="blue"
            sublabel={isLoading || visitsPending ? undefined : `de ${formatNumber(s?.active ?? 0)} ativos`}
          />
          <KpiCard
            label="Ativos sem visitas"
            value={visitVal(s?.activeNoVisits)}
            loading={isLoading}
            icon={EyeOff}
            accent="orange"
            sublabel={visitsPending ? undefined : "sem tráfego no período"}
          />
          <KpiCard
            label="Média por ativo"
            value={isLoading ? "" : visitsPending ? LOADING : (s?.avgVisitsPerActive ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
            loading={isLoading}
            icon={Gauge}
            accent="violet"
            sublabel="visitas / anúncio ativo"
          />
        </div>
      </SectionCard>

      {/* Active listings visits evolution — fixed 30-day window */}
      <SectionCard
        title="Evolução das visitas · anúncios ativos"
        description={`Total diário de visualizações agregado entre os anúncios ativos nos últimos ${visitWindow} dias (o dia de hoje é parcial e atualiza em tempo real).`}
        actions={
          <div className="flex items-center gap-2.5">
            {!isLoading && data?.stale ? (
              <span className="hidden items-center gap-1.5 text-xs text-amber-600 sm:inline-flex" title="O Mercado Livre estava congestionado; exibindo os últimos dados confirmados.">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {`Dados em cache · ${data?.asOf ? `de ${new Date(data.asOf).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "recentes"}`}
              </span>
            ) : !isLoading && dataUpdatedAt ? (
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                <span className={cn("h-1.5 w-1.5 rounded-full", isFetching ? "bg-amber-500 animate-pulse" : "bg-emerald-500")} />
                {isFetching ? "Atualizando…" : `Atualizado às ${new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
              </span>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 bg-card"
              onClick={() => refetch()}
              disabled={isLoading || isFetching}
              title="Buscar as visitas mais recentes agora"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              Atualizar agora
            </Button>
          </div>
        }
      >
        <VisitsEvolutionChart
          series={visitsSeries}
          loading={visits.isLoading}
          windowDays={visitWindow}
          pending={visits.data?.pending === true}
          onRetry={() => visits.refetch()}
          refreshing={visits.isFetching}
          onSelectDay={(d) => setVisitsDay(d)}
        />
      </SectionCard>

      <DayVisitsBreakdownDialog
        date={visitsDay}
        open={visitsDay !== null}
        onOpenChange={(o) => {
          if (!o) setVisitsDay(null);
        }}
      />

      {/* Raio-X da Ficha Técnica */}
      <TechSpecsCard connected={conn.data?.connected === true} />

      {/* Actionable insights */}
      <SectionCard
        collapsible
        defaultOpen
        title="Oportunidades e alertas"
        description="Cruzamentos de métricas que merecem ação. Clique num card para filtrar a lista por ele."
      >
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {insights.map((ins) => {
              const Icon = INSIGHT_ICON[ins.id];
              const active = filters.insightId === ins.id;
              return (
                <button
                  key={ins.id}
                  onClick={() => selectInsight(ins.id)}
                  className={cn(
                    "group flex h-full flex-col gap-1.5 rounded-xl border p-4 text-left transition-all",
                    "hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    INSIGHT_ACCENT[ins.id],
                    active && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                      <span className="text-sm font-semibold leading-tight">{ins.title}</span>
                    </div>
                    <span className="font-display text-xl leading-none tabular-nums">{ins.count}</span>
                  </div>
                  <p className="text-xs leading-snug text-muted-foreground">{ins.description}</p>
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Selected-insight result list — appears right below Oportunidades */}
      {selectedInsight && (
        <SectionCard
          title={`${selectedInsight.title} · ${formatNumber(selectedInsight.count)} anúncio${selectedInsight.count === 1 ? "" : "s"}`}
          description={selectedInsight.description}
          actions={
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => setFilters((p) => ({ ...p, insightId: null }))}
            >
              <X className="h-3.5 w-3.5" /> Fechar
            </Button>
          }
        >
          {insightRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Filter className="h-7 w-7 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum anúncio neste grupo no momento.</p>
            </div>
          ) : (
            <ListingsTable rows={insightRows} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} dailyVisits={dailyVisitsMap} />
          )}
        </SectionCard>
      )}

      {/* Distribution by bands */}
      <DistributionCard
        title={`Visitas por faixa (${visitWindow}d)`}
        buckets={VISIT_BUCKETS}
        counts={visitDist}
        loading={isLoading}
        activeIds={filters.visitBucketIds ?? []}
        onToggle={(id) => toggleArrayFilter("visitBucketIds", id)}
        accent="blue"
      />

    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Local presentational components
// ---------------------------------------------------------------------------

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30",
      )}
    >
      {children}
    </button>
  );
}

function DistributionCard({
  title,
  buckets,
  counts,
  loading,
  activeIds,
  onToggle,
  accent,
}: {
  title: string;
  buckets: { id: string; label: string }[];
  counts: Record<string, number>;
  loading?: boolean;
  activeIds: string[];
  onToggle: (id: string) => void;
  accent: "blue" | "emerald" | "orange" | "violet";
}) {
  const max = Math.max(1, ...buckets.map((b) => counts[b.id] ?? 0));
  const barColor: Record<string, string> = {
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    orange: "bg-orange-500",
    violet: "bg-violet-500",
  };
  return (
    <SectionCard title={title}>
      {loading ? (
        <div className="space-y-2">
          {buckets.map((b) => (
            <Skeleton key={b.id} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {buckets.map((b) => {
            const count = counts[b.id] ?? 0;
            const pct = (count / max) * 100;
            const active = activeIds.includes(b.id);
            return (
              <button
                key={b.id}
                onClick={() => onToggle(b.id)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-secondary",
                  active && "bg-secondary ring-1 ring-primary/40",
                )}
              >
                <span className="w-28 shrink-0 text-xs text-muted-foreground">{b.label}</span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <span
                    className={cn("absolute inset-y-0 left-0 rounded-full transition-all", barColor[accent])}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function SortableTh({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  className,
  align = "right",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  const Icon = active ? (sortDir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <th className={cn("pb-2 px-3 font-medium", align === "right" ? "text-right" : "text-left", className)}>
      <button
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

/**
 * Cabeçalho da coluna "Últimos dias": 3 mini-colunas (anteontem/ontem/hoje),
 * cada uma ordenável (setinha) pelo número de visitas daquele dia.
 */
function DailyHeader({
  dayLabels,
  sortKey,
  sortDir,
  onSort,
}: {
  dayLabels: { key: SortKey; label: string }[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  return (
    <th className="pb-2 px-3 text-center font-medium" title="Visitas por dia: hoje e os 3 dias anteriores (hoje ainda parcial). Clique em um dia para ordenar pelo maior/menor.">
      <div className="flex items-stretch justify-center gap-1">
        {dayLabels.map(({ key, label }) => {
          const active = sortKey === key;
          const Icon = active ? (sortDir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
          const isToday = label === "Hoje";
          return (
            <button
              key={key}
              onClick={() => onSort(key)}
              className={cn(
                "flex w-12 shrink-0 flex-col items-center justify-end gap-1 rounded-md py-1 transition-colors hover:text-foreground",
                active ? "bg-muted/60 text-foreground" : "text-muted-foreground",
                isToday && !active && "text-primary",
              )}
              title={`Ordenar por ${label}`}
            >
              <span className="whitespace-nowrap text-[10px] font-semibold uppercase leading-none tracking-tight">
                {label}
              </span>
              <Icon className="h-3 w-3" />
            </button>
          );
        })}
      </div>
    </th>
  );
}

/**
 * Célula "Últimos dias": mostra as visitas de anteontem, ontem e hoje (3 colunas
 * curtas) com a variação hoje-vs-ontem. A série recebida tem 4 pontos
 * (mais antigo -> hoje); usamos os 3 últimos na exibição e o 4º só daria contexto.
 * Hoje ainda é PARCIAL, por isso a variação é apenas um indicativo.
 */
function DailyVisitsCell({ series }: { series?: VisitsDayPoint[] }) {
  // Ainda coletando do ML (ou item sem dados): mostra placeholder discreto.
  if (!series || series.length === 0) {
    return (
      <div className="flex items-center justify-center">
        <span className="text-muted-foreground/40" title="Carregando as visitas por dia do Mercado Livre…">—</span>
      </div>
    );
  }
  // Exibe os 4 últimos dias (hoje + 3 anteriores).
  const visible = series.slice(-4);
  const todayKey = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <div className="flex items-center justify-center">
      <div className="flex items-stretch gap-1">
        {visible.map((p) => {
          const isToday = p.date === todayKey;
          return (
            <div
              key={p.date}
              className={cn(
                "flex w-12 shrink-0 flex-col items-center justify-center gap-1 rounded-md py-1",
                isToday && "bg-primary/5",
              )}
              title={`${isoToWeekdayLong(p.date)}${isToday ? " (hoje, parcial)" : ""}: ${formatNumber(p.visits)} visitas`}
            >
              <span
                className={cn(
                  "whitespace-nowrap text-[10px] uppercase leading-none tracking-tight",
                  isToday ? "font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                {isToday ? "Hoje" : `${isoToWeekdayShort(p.date)} ${isoToDayNum(p.date)}`}
              </span>
              <span
                className={cn(
                  "tabular-nums leading-none",
                  isToday ? "text-sm font-bold text-foreground" : "text-sm font-medium text-foreground/80",
                )}
              >
                {formatNumber(p.visits)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListingsTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  dailyVisits,
}: {
  rows: ListingRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  /** itemId -> série de 4 dias (mais antigo -> hoje). Vazio enquanto coleta. */
  dailyVisits: Record<string, VisitsDayPoint[]>;
}) {
  // Deriva os rótulos dos 4 dias (hoje + 3 anteriores) a partir da 1ª série disponível.
  const sampleSeries = useMemo(() => {
    for (const r of rows) {
      const s = dailyVisits[r.itemId];
      if (s && s.length > 0) return s.slice(-4);
    }
    return [] as VisitsDayPoint[];
  }, [rows, dailyVisits]);
  const todayKey = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // dayLabels alinhado às chaves de sort: day3=3 dias atrás ... day0=hoje.
  const dayLabels = useMemo(() => {
    // Garante 4 posições (mais antigo -> hoje) mesmo quando a série vier curta.
    const padded = sampleSeries.slice(-4);
    const labels: { key: SortKey; label: string }[] = [];
    const offsets: SortKey[] = ["day3", "day2", "day1", "day0"]; // posições 0..3 da janela de 4 dias
    for (let i = 0; i < 4; i++) {
      const p = padded[i];
      let label = "—";
      if (p) {
        label = p.date === todayKey ? "Hoje" : `${isoToWeekdayShort(p.date)} ${isoToDayNum(p.date)}`;
      }
      labels.push({ key: offsets[i], label });
    }
    return labels;
  }, [sampleSeries, todayKey]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <SortableTh label="Anúncio" k="title" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="pr-3" align="left" />
            <SortableTh label="Preço" k="price" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortableTh label="Estoque" k="availableQuantity" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortableTh label="Vendas" k="soldQuantity" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortableTh label="Visitas" k="visits" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <DailyHeader dayLabels={dayLabels} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortableTh label="Conversão" k="conversion" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortableTh label="Saúde" k="health" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <th className="pb-2 pl-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.itemId} className="group">
              <td className="py-3 pr-3">
                <ProductCell title={r.title} thumbnail={r.thumbnail} permalink={r.permalink} titleClassName="min-w-[220px]" clampTitle={false} />
              </td>
              <td className="px-3 text-right tabular-nums">{formatBRL(r.price)}</td>
              <td className="px-3 text-right tabular-nums">
                {r.availableQuantity === 0 ? (
                  <span className="text-rose-600 font-medium">0</span>
                ) : (
                  formatNumber(r.availableQuantity)
                )}
              </td>
              <td className="px-3 text-right tabular-nums">{formatNumber(r.soldQuantity)}</td>
              <td className="px-3 text-right tabular-nums">
                {r.visitsAvailable ? (
                  formatNumber(r.visits)
                ) : (
                  <span className="text-muted-foreground/50" title="Visitas ainda carregando do Mercado Livre">—</span>
                )}
              </td>
              <td className="px-3">
                <DailyVisitsCell series={dailyVisits[r.itemId]} />
              </td>
              <td className="px-3 text-right tabular-nums">
                {r.visitsAvailable ? (
                  formatRatePct(r.conversion)
                ) : (
                  <span className="text-muted-foreground/50">—</span>
                )}
              </td>
              <td className="px-3 text-right tabular-nums">
                <HealthDot health={r.health} />
              </td>
              <td className="pl-3">
                <Badge variant="outline" className={STATUS_META[r.status]?.className}>
                  {STATUS_META[r.status]?.label ?? r.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HealthDot({ health }: { health?: number | null }) {
  if (health == null) return <span className="text-muted-foreground/50">—</span>;
  const pct = Math.round(health * 100);
  const color =
    health >= 0.8 ? "bg-emerald-500" : health >= 0.5 ? "bg-amber-500" : "bg-rose-500";
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      {pct}%
    </span>
  );
}

