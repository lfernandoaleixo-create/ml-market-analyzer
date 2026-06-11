import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { ProductCell } from "@/components/account/ProductCell";
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
import { formatBRL, formatNumber, formatRatePct } from "@/lib/format";
import type { ListingRow, ListingStatus } from "@shared/account";
import {
  VISIT_BUCKETS,
  STOCK_BUCKETS,
  CONVERSION_BUCKETS,
  HEALTH_BUCKETS,
  bucketCounts,
  conversionPct,
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
  const [visitWindow, setVisitWindow] = useState<30 | 60 | 90>(30);
  const [filters, setFilters] = useState<ListingFilters>(emptyFilters);
  const [sortKey, setSortKey] = useState<SortKey>("visits");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const conn = trpc.account.connection.useQuery();
  const { data, isLoading, error, isFetching } = trpc.account.listings.useQuery(
    { lastDays: visitWindow },
    { enabled: conn.data?.connected === true },
  );

  const items = useMemo<ListingRow[]>(() => data?.items ?? [], [data]);

  const insights = useMemo(() => computeInsights(items), [items]);

  const visitDist = useMemo(() => bucketCounts(items, VISIT_BUCKETS, (r) => r.visits), [items]);
  const convDist = useMemo(
    () => bucketCounts(items, CONVERSION_BUCKETS, (r) => conversionPct(r)),
    [items],
  );
  const stockDist = useMemo(
    () => bucketCounts(items, STOCK_BUCKETS, (r) => r.availableQuantity),
    [items],
  );
  const healthDist = useMemo(
    () => bucketCounts(items, HEALTH_BUCKETS, (r) => r.health ?? null),
    [items],
  );

  const filtered = useMemo(() => filterListings(items, filters), [items, filters]);
  const sorted = useMemo(() => sortListings(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  // When an insight card is selected we surface the matching listings right
  // below the Oportunidades section (in addition to driving the full table).
  const selectedInsight = useMemo(
    () => (filters.insightId ? insights.find((i) => i.id === filters.insightId) ?? null : null),
    [filters.insightId, insights],
  );
  const insightRows = useMemo(
    () => (selectedInsight ? sortListings(selectedInsight.items, sortKey, sortDir) : []),
    [selectedInsight, sortKey, sortDir],
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
  if (error && !data) return <ErrorState message={error.message} />;

  const s = data?.summary;
  const availableTypes = Array.from(new Set(items.map((i) => i.listingType).filter(Boolean)));

  return (
    <PageShell>
      <PageHeader
        title="Meus anúncios"
        subtitle="Central analítica dos seus anúncios: cruze visitas, vendas, conversão, estoque e saúde para agir onde rende mais."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-secondary p-1">
              {([30, 60, 90] as const).map((w) => (
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
          </div>
        }
      />

      {s?.capped && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Mostrando os primeiros {formatNumber(s.total)} anúncios. Há mais itens na conta — em breve podemos paginar/expandir o limite.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard
          label="Ativos"
          value={isLoading ? "" : `${formatNumber(s?.active ?? 0)} / ${formatNumber(s?.total ?? 0)}`}
          loading={isLoading}
          icon={Package}
          accent="primary"
        />
        <KpiCard
          label={`Visitas (${visitWindow}d)`}
          value={isLoading ? "" : formatNumber(s?.totalVisits ?? 0)}
          loading={isLoading}
          icon={Eye}
          accent="blue"
        />
        <KpiCard
          label="Pausados"
          value={isLoading ? "" : formatNumber(s?.paused ?? 0)}
          loading={isLoading}
          icon={PauseCircle}
          accent="amber"
        />
        <KpiCard
          label="Sem vendas"
          value={isLoading ? "" : formatNumber(s?.stagnant ?? 0)}
          loading={isLoading}
          icon={AlertCircle}
          accent="rose"
          sublabel="com estoque parado"
        />
        <KpiCard
          label="Sem estoque"
          value={isLoading ? "" : formatNumber(s?.outOfStock ?? 0)}
          loading={isLoading}
          icon={Boxes}
          accent="orange"
        />
      </div>

      {/* Visits broken down by listing status */}
      <SectionCard
        title={`Visualizações por status (${visitWindow}d)`}
        description="Como as visitas do período se distribuem entre anúncios ativos, pausados e encerrados — e quantos ativos estão realmente recebendo tráfego."
      >
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard
            label="Visitas · ativos"
            value={isLoading ? "" : formatNumber(s?.visitsActive ?? 0)}
            loading={isLoading}
            icon={Eye}
            accent="emerald"
          />
          <KpiCard
            label="Visitas · pausados"
            value={isLoading ? "" : formatNumber(s?.visitsPaused ?? 0)}
            loading={isLoading}
            icon={PauseCircle}
            accent="amber"
          />
          <KpiCard
            label="Visitas · encerrados"
            value={isLoading ? "" : formatNumber(s?.visitsClosed ?? 0)}
            loading={isLoading}
            icon={XCircle}
            accent="rose"
          />
          <KpiCard
            label="Ativos com visitas"
            value={isLoading ? "" : formatNumber(s?.activeWithVisits ?? 0)}
            loading={isLoading}
            icon={PlayCircle}
            accent="blue"
            sublabel={isLoading ? undefined : `de ${formatNumber(s?.active ?? 0)} ativos`}
          />
          <KpiCard
            label="Ativos sem visitas"
            value={isLoading ? "" : formatNumber(s?.activeNoVisits ?? 0)}
            loading={isLoading}
            icon={EyeOff}
            accent="orange"
            sublabel="sem tráfego no período"
          />
          <KpiCard
            label="Média por ativo"
            value={isLoading ? "" : (s?.avgVisitsPerActive ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
            loading={isLoading}
            icon={Gauge}
            accent="violet"
            sublabel="visitas / anúncio ativo"
          />
        </div>
      </SectionCard>

      {/* Actionable insights */}
      <SectionCard
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
            <ListingsTable rows={insightRows} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
          )}
        </SectionCard>
      )}

      {/* Distribution by bands */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DistributionCard
          title={`Visitas por faixa (${visitWindow}d)`}
          buckets={VISIT_BUCKETS}
          counts={visitDist}
          loading={isLoading}
          activeIds={filters.visitBucketIds ?? []}
          onToggle={(id) => toggleArrayFilter("visitBucketIds", id)}
          accent="blue"
        />
        <DistributionCard
          title="Conversão por faixa"
          buckets={CONVERSION_BUCKETS}
          counts={convDist}
          loading={isLoading}
          activeIds={filters.conversionBucketIds ?? []}
          onToggle={(id) => toggleArrayFilter("conversionBucketIds", id)}
          accent="emerald"
        />
        <DistributionCard
          title="Estoque por faixa"
          buckets={STOCK_BUCKETS}
          counts={stockDist}
          loading={isLoading}
          activeIds={filters.stockBucketIds ?? []}
          onToggle={(id) => toggleArrayFilter("stockBucketIds", id)}
          accent="orange"
        />
        <DistributionCard
          title="Saúde do anúncio"
          buckets={HEALTH_BUCKETS}
          counts={healthDist}
          loading={isLoading}
          activeIds={filters.healthBucketIds ?? []}
          onToggle={(id) => toggleArrayFilter("healthBucketIds", id)}
          accent="violet"
        />
      </div>

      {/* List + filters */}
      <SectionCard
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
            <span className="text-xs text-muted-foreground">Preço</span>
            <Input
              type="number"
              inputMode="decimal"
              value={filters.priceMin ?? ""}
              onChange={(e) =>
                setFilters((p) => ({ ...p, priceMin: e.target.value === "" ? null : Number(e.target.value) }))
              }
              placeholder="mín"
              className="h-7 w-20 px-2 text-xs"
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
              className="h-7 w-20 px-2 text-xs"
            />
          </div>
          {activeFilterCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
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
          <ListingsTable rows={sorted} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
        )}
        {isFetching && !isLoading && (
          <p className="mt-3 text-center text-xs text-muted-foreground">Atualizando janela de {visitWindow} dias…</p>
        )}
      </SectionCard>
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
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
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

function ListingsTable({
  rows,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: ListingRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
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
            <SortableTh label="Conversão" k="conversion" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortableTh label="Saúde" k="health" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <th className="pb-2 pl-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.itemId} className="group">
              <td className="py-3 pr-3">
                <ProductCell title={r.title} thumbnail={r.thumbnail} permalink={r.permalink} titleClassName="max-w-[240px]" />
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
              <td className="px-3 text-right tabular-nums">{formatNumber(r.visits)}</td>
              <td className="px-3 text-right tabular-nums">{formatRatePct(r.conversion)}</td>
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
