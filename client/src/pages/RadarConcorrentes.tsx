import { EmptyState, PageContainer, PageHeader } from "@/components/market/Common";
import { RadarBanner } from "@/components/competitors/RadarBanner";
import { SourcesPanel } from "@/components/competitors/SourcesPanel";
import { UsagePanel } from "@/components/competitors/UsagePanel";
import { SweepScheduleCard } from "@/components/competitors/SweepScheduleCard";
import { ConsensusBadge } from "@/components/competitors/ConsensusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { trpc } from "@/lib/trpc";
import { formatBRL, formatCompact } from "@/lib/format";
import { SOURCE_LABELS } from "@shared/sources";
import type {
  UnifiedCompetitor,
  FieldConsensus,
  SourceId,
  SourceStatus,
} from "@shared/sources";
import {
  Radar as RadarIcon,
  Search as SearchIcon,
  SearchX,
  Star,
  ExternalLink,
  Microscope,
  Lock,
  ServerCrash,
  RefreshCw,
  ChevronDown,
  Layers,
  History,
  Loader2,
  Database,
  BadgeCheck,
  Zap,
  Ticket,
  Megaphone,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { SegmentFilterBar } from "@/components/competitors/SegmentFilterBar";
import {
  applyFilters,
  countBySegment,
  EMPTY_FILTERS,
  noFiltersActive,
  type SegmentFilters,
  type SegmentKey,
} from "@shared/competitorFilters";
import {
  sortCompetitors,
  DEFAULT_SORT,
  type SortKey,
} from "@shared/competitorSort";

export default function RadarConcorrentes() {
  const [, setLocation] = useLocation();
  const [input, setInput] = useState("");
  // The id of the search we are currently tracking (polling) on screen.
  const [searchId, setSearchId] = useState<number | null>(null);
  // Whether the active search came straight from cache (no new collection).
  const [fromCache, setFromCache] = useState(false);
  // Active segment filters (Loja oficial / FULL / Cupom / Patrocinado).
  const [filters, setFilters] = useState<SegmentFilters>(EMPTY_FILTERS);
  // Result ordering (applied AFTER filtering).
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);

  const sources = trpc.competitors.sourcesStatus.useQuery();
  const anyConfigured = (sources.data?.configuredCount ?? 0) > 0;

  const utils = trpc.useUtils();

  const recent = trpc.competitors.recentSearches.useQuery(
    { limit: 12 },
    { enabled: anyConfigured },
  );

  // Consumption panel: per-source quota + the user's search counts. Refetched
  // when the window regains focus so the "tank" stays reasonably fresh.
  const usage = trpc.competitors.usageStatus.useQuery(undefined, {
    enabled: anyConfigured,
    staleTime: 60_000,
  });

  const startSearch = trpc.competitors.startSearch.useMutation();

  // Poll the tracked search until it settles (done/failed).
  const detail = trpc.competitors.getSearch.useQuery(
    { id: searchId ?? 0, includeResults: true },
    {
      enabled: searchId !== null,
      // Keep polling every 3s while the collection is still in progress.
      refetchInterval: (q) => {
        const s = q.state.data?.status;
        return s === "pending" || s === "running" ? 3000 : false;
      },
      retry: false,
    },
  );

  const view = detail.data;
  const competitors = view?.competitors ?? [];

  // Per-segment counts over the FULL list + the list after applying filters.
  // Memoized so unstable references don't re-trigger work every render.
  const segmentCounts = useMemo(() => countBySegment(competitors), [competitors]);
  const filteredCompetitors = useMemo(
    () => applyFilters(competitors, filters),
    [competitors, filters],
  );
  // Filter first, then order — a transparent, deterministic pipeline.
  const visibleCompetitors = useMemo(
    () => sortCompetitors(filteredCompetitors, sort),
    [filteredCompetitors, sort],
  );
  const filtersActive = !noFiltersActive(filters);

  // Reset filters whenever we switch to a different search, so a leftover
  // filter from a previous term doesn't silently hide the new results.
  useEffect(() => {
    setFilters(EMPTY_FILTERS);
    setSort(DEFAULT_SORT);
  }, [searchId]);

  const toggleFilter = (key: SegmentKey) =>
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  const clearFilters = () => setFilters(EMPTY_FILTERS);
  const isCollecting =
    view?.status === "pending" || view?.status === "running";
  const isDone = view?.status === "done";
  const isFailed = view?.status === "failed";

  const isNotConfigured =
    startSearch.error?.data?.code === "PRECONDITION_FAILED";

  const runSearch = async (term: string, refresh = false) => {
    const q = term.trim();
    if (q.length < 2) return;
    setInput(q);
    try {
      const res = await startSearch.mutateAsync({ query: q, refresh });
      setSearchId(res.id);
      setFromCache(res.cached);
      // React immediately and keep the recent list in sync.
      await utils.competitors.getSearch.invalidate({ id: res.id });
      utils.competitors.recentSearches.invalidate();
    } catch {
      // Errors surface through startSearch.error below.
    }
  };

  const submit = () => runSearch(input);
  const refresh = () => {
    if (view) runSearch(view.query, true);
  };

  // When a tracked collection finishes, refresh the recent list exactly once
  // per status transition (side-effect must live in an effect, not render).
  const lastSettledRef = useRef<string>("");
  useEffect(() => {
    if (!view) return;
    if (view.status !== "done" && view.status !== "failed") return;
    const key = `${view.id}:${view.status}`;
    if (lastSettledRef.current === key) return;
    lastSettledRef.current = key;
    utils.competitors.recentSearches.invalidate();
    // A finished collection consumes paid-source credits and bumps the daily
    // search count, so refresh the consumption panel too.
    utils.competitors.usageStatus.invalidate();
  }, [view, utils]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Inteligência competitiva"
        title="Radar de concorrentes"
        description="Busque por qualquer produto ou categoria e veja os concorrentes mais fortes do mercado. A coleta roda em segundo plano e os dados são triangulados entre fontes independentes: quando elas concordam, a confiança é alta; quando divergem, mostramos isso com transparência. Buscas recentes ficam em cache por algumas horas."
      />

      <RadarBanner />

      {/* Multi-source health panel (live, project-wide) */}
      {sources.isLoading ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : sources.data ? (
        <SourcesPanel
          sources={sources.data.sources}
          configuredCount={sources.data.configuredCount}
        />
      ) : null}

      {/* Consumption & limits (paid-source quota + this user's search counts) */}
      {anyConfigured && (
        <UsagePanel data={usage.data} isLoading={usage.isLoading} />
      )}
      {anyConfigured && <SweepScheduleCard />}

      {/* Search bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Ex.: shampoo antiqueda, smartwatch, cadeira gamer..."
            className="pl-9"
            disabled={!anyConfigured || startSearch.isPending}
          />
        </div>
        <Button
          onClick={submit}
          disabled={
            !anyConfigured || input.trim().length < 2 || startSearch.isPending
          }
          className="sm:w-auto"
        >
          {startSearch.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SearchIcon className="h-4 w-4" />
          )}
          Buscar concorrentes
        </Button>
      </div>

      {/* Recent searches */}
      {anyConfigured && (recent.data?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Buscas recentes
          </div>
          <div className="flex flex-wrap gap-2">
            {recent.data!.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setInput(r.query);
                  setSearchId(r.id);
                  setFromCache(true);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors hover:bg-accent ${
                  searchId === r.id ? "border-primary/40 bg-primary/5" : ""
                }`}
              >
                <span className="max-w-[12rem] truncate">{r.query}</span>
                {r.status === "done" ? (
                  <span className="text-[10px] text-muted-foreground">
                    {r.resultCount}
                  </span>
                ) : r.status === "failed" ? (
                  <span className="text-[10px] text-destructive">falhou</span>
                ) : (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* States */}
      {sources.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : !anyConfigured ? (
        <EmptyState
          icon={Lock}
          title="Nenhuma fonte de dados configurada ainda"
          description="Este módulo usa serviços de dados independentes, totalmente isolados da sua conta do Mercado Livre. Assim que ao menos uma chave de acesso for adicionada nas configurações do projeto, a busca fica disponível — e a precisão aumenta conforme mais fontes são ativadas."
          action={
            <Button variant="outline" onClick={() => setLocation("/configuracoes")}>
              Ver configurações
            </Button>
          }
        />
      ) : isNotConfigured ? (
        <EmptyState
          icon={Lock}
          title="Nenhuma fonte configurada"
          description="Adicione ao menos uma chave de acesso nas configurações do projeto para habilitar a busca."
          action={
            <Button variant="outline" onClick={() => setLocation("/configuracoes")}>
              Ver configurações
            </Button>
          }
        />
      ) : searchId === null ? (
        <EmptyState
          icon={RadarIcon}
          title="Comece uma varredura"
          description="Digite um produto ou categoria para mapear os concorrentes mais fortes daquele mercado. A coleta roda em segundo plano e costuma levar de 30 a 60 segundos na primeira vez; depois fica em cache."
        />
      ) : detail.isLoading && !view ? (
        <CollectingState query={input} note="Carregando…" />
      ) : isCollecting ? (
        <CollectingState
          query={view!.query}
          note="As fontes estão sendo consultadas em paralelo. Isso costuma levar de 30 a 60 segundos. Você pode aguardar nesta tela — o resultado aparece automaticamente assim que a primeira fonte confiável responde."
        />
      ) : isFailed ? (
        <EmptyState
          icon={ServerCrash}
          title="Não foi possível concluir a coleta"
          description={
            view?.errorNote ||
            "As fontes de dados ficaram temporariamente instáveis e não responderam agora. Isso é temporário, não afeta a sua conta nem os seus créditos. Tente novamente em instantes."
          }
          action={
            <Button
              variant="outline"
              onClick={refresh}
              disabled={startSearch.isPending}
            >
              <RefreshCw
                className={`h-4 w-4 ${startSearch.isPending ? "animate-spin" : ""}`}
              />
              Tentar novamente
            </Button>
          }
        />
      ) : isDone && competitors.length === 0 ? (
        <div className="space-y-3">
          <ResultToolbar
            view={view!}
            fromCache={fromCache}
            onRefresh={refresh}
            refreshing={startSearch.isPending}
          />
          <EmptyState
            icon={SearchX}
            title="Nenhum concorrente encontrado"
            description="Nenhuma fonte retornou produtos para este termo. Tente outra palavra-chave ou atualize a busca."
          />
        </div>
      ) : isDone ? (
        <div className="space-y-3">
          <ResultToolbar
            view={view!}
            fromCache={fromCache}
            onRefresh={refresh}
            refreshing={startSearch.isPending}
          />
          {view!.sourcesUsed && view!.sourcesUsed.length > 0 && (
            <SearchSourcesSummary sources={view!.sourcesUsed} />
          )}
          {competitors.length > 0 && (
            <SegmentFilterBar
              filters={filters}
              counts={segmentCounts}
              matched={filteredCompetitors.length}
              total={competitors.length}
              onToggle={toggleFilter}
              onClear={clearFilters}
              sort={sort}
              onSortChange={setSort}
            />
          )}
          {filtersActive && filteredCompetitors.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nenhum concorrente neste segmento"
              description="Nenhum concorrente desta busca combina com os filtros selecionados. Ajuste ou limpe os filtros para ver mais resultados."
            />
          ) : (
            <div className="space-y-2">
              {visibleCompetitors.map((c, i) => (
                <CompetitorRow
                  key={`${c.matchKey}-${i}`}
                  rank={i + 1}
                  competitor={c}
                  onDiagnose={() =>
                    c.url &&
                    setLocation(`/diagnostico?url=${encodeURIComponent(c.url)}`)
                  }
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </PageContainer>
  );
}

/**
 * Compact, honest summary of which sources actually contributed to THIS search
 * (snapshotted at collection time), distinct from the live project-wide panel.
 */
function SearchSourcesSummary({ sources }: { sources: SourceStatus[] }) {
  const meta = (s: SourceStatus) => {
    if (!s.configured)
      return { label: "não configurada", cls: "text-muted-foreground", dot: "bg-muted-foreground/40" };
    switch (s.health) {
      case "ok":
        return { label: "contribuiu", cls: "text-emerald-700", dot: "bg-emerald-500" };
      case "upstream":
        return { label: "instável", cls: "text-amber-700", dot: "bg-amber-500" };
      case "auth":
        return { label: "credencial", cls: "text-red-700", dot: "bg-red-500" };
      case "unconfigured":
        return { label: "não configurada", cls: "text-muted-foreground", dot: "bg-muted-foreground/40" };
      default:
        return { label: "sem dados", cls: "text-muted-foreground", dot: "bg-muted-foreground/40" };
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-muted/30 px-3 py-2 text-[11px]">
      <span className="font-medium text-muted-foreground">Fontes desta busca:</span>
      {sources.map((s) => {
        const m = meta(s);
        return (
          <span key={s.id} className={`inline-flex items-center gap-1.5 ${m.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
            {s.label} · {m.label}
          </span>
        );
      })}
    </div>
  );
}

/** Toolbar above results: count, triangulation, cache badge + refresh. */
function ResultToolbar({
  view,
  fromCache,
  onRefresh,
  refreshing,
}: {
  view: {
    query: string;
    resultCount: number;
    triangulated: boolean;
    stale: boolean;
    finishedAt: number | null;
  };
  fromCache: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {view.resultCount} concorrentes para “{view.query}”, ordenados por força
          de mercado
        </p>
        {view.triangulated && (
          <Badge
            variant="outline"
            className="shrink-0 gap-1 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700"
          >
            <Layers className="h-3 w-3" /> Dados triangulados
          </Badge>
        )}
        {fromCache && (
          <Badge
            variant="outline"
            className="shrink-0 gap-1 text-xs text-muted-foreground"
          >
            <Database className="h-3 w-3" />
            {view.stale ? "Cache (desatualizado)" : "Resultado em cache"}
          </Badge>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 gap-1.5"
        onClick={onRefresh}
        disabled={refreshing}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        Atualizar
      </Button>
    </div>
  );
}

/** "Collecting in background" state with an animated skeleton list. */
function CollectingState({ query, note }: { query: string; note: string }) {
  return (
    <div className="space-y-4">
      <Card className="flex items-start gap-3 border-primary/20 bg-primary/5 p-4">
        <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">
            Coletando concorrentes para “{query}”…
          </p>
          <p className="text-xs text-muted-foreground">{note}</p>
        </div>
      </Card>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function CompetitorRow({
  rank,
  competitor,
  onDiagnose,
}: {
  rank: number;
  competitor: UnifiedCompetitor;
  onDiagnose: () => void;
}) {
  const c = competitor;
  const [open, setOpen] = useState(false);

  const price = c.price.value;
  const listing = c.listingPrice.value;
  const rating = c.rating.value;
  const totalRatings = c.totalRatings.value;

  return (
    <Card className="p-3 transition-all hover:shadow-md">
      <div className="flex items-center gap-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-display font-600 text-muted-foreground">
          {rank}
        </div>
        {c.thumbnail ? (
          <img
            src={c.thumbnail}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg bg-secondary object-cover"
          />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-lg bg-secondary" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{c.name}</p>
            <ConsensusBadge level={c.overallConsensus} short />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {c.brand.value && (
              <span className="uppercase tracking-wide">{c.brand.value}</span>
            )}
            {rating !== null && (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {rating.toFixed(1)}
                {totalRatings !== null && (
                  <span className="text-muted-foreground/80">
                    ({formatCompact(totalRatings)})
                  </span>
                )}
              </span>
            )}
            {c.url && (
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Ver no ML <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <AttributeBadges c={c} />
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-base font-600 tabular-nums">
            {price !== null ? formatBRL(price) : "Sob consulta"}
          </p>
          {listing !== null && price !== null && listing > price && (
            <p className="text-xs text-muted-foreground line-through">
              {formatBRL(listing)}
            </p>
          )}
        </div>
        {c.url && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5"
            onClick={onDiagnose}
          >
            <Microscope className="h-3.5 w-3.5" /> Diagnosticar
          </Button>
        )}
      </div>

      {/* Per-source detail */}
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {c.sources.map((s) => (
              <Badge
                key={s}
                variant="outline"
                className="text-[10px] font-normal text-muted-foreground"
              >
                {SOURCE_LABELS[s]}
              </Badge>
            ))}
          </div>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground"
            >
              Ver detalhes
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="space-y-2 pt-2">
          <FieldDetail label="Preço" field={c.price} format={(v) => formatBRL(v)} />
          <FieldDetail
            label="Preço de tabela"
            field={c.listingPrice}
            format={(v) => formatBRL(v)}
          />
          <FieldDetail
            label="Avaliação"
            field={c.rating}
            format={(v) => v.toFixed(1)}
          />
          <FieldDetail
            label="Nº de avaliações"
            field={c.totalRatings}
            format={(v) => formatCompact(v)}
          />
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/**
 * Compact row of honest attribute badges. Only renders a badge when the
 * triangulated consensus value is explicitly true (null/false are hidden so we
 * never imply a signal the sources didn't actually report).
 */
function AttributeBadges({ c }: { c: UnifiedCompetitor }) {
  const items: { show: boolean; icon: typeof BadgeCheck; label: string; cls: string }[] = [
    {
      show: c.officialStore?.value === true,
      icon: BadgeCheck,
      label: "Loja oficial",
      cls: "text-blue-600 border-blue-200 bg-blue-50",
    },
    {
      show: c.fulfillment?.value === true,
      icon: Zap,
      label: "FULL",
      cls: "text-emerald-700 border-emerald-200 bg-emerald-50",
    },
    {
      show: c.hasCoupon?.value === true,
      icon: Ticket,
      label: "Cupom",
      cls: "text-rose-600 border-rose-200 bg-rose-50",
    },
    {
      show: c.sponsored?.value === true,
      icon: Megaphone,
      label: "Patrocinado",
      cls: "text-amber-700 border-amber-200 bg-amber-50",
    },
  ];
  const visible = items.filter((i) => i.show);
  if (visible.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {visible.map((i) => (
        <span
          key={i.label}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${i.cls}`}
        >
          <i.icon className="h-3 w-3" />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function FieldDetail({
  label,
  field,
  format,
}: {
  label: string;
  field: FieldConsensus<number>;
  format: (v: number) => string;
}) {
  if (field.reportingCount === 0) return null;
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            {field.value !== null ? format(field.value) : "—"}
          </span>
          <ConsensusBadge level={field.consensus} short />
        </div>
      </div>
      {field.contributions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {field.contributions.map((ct, idx) => (
            <span key={`${ct.source}-${idx}`} className="tabular-nums">
              {sourceShort(ct.source)}: {format(ct.value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function sourceShort(s: SourceId): string {
  switch (s) {
    case "official":
      return "API ML";
    case "unwrangle":
      return "Unwrangle";
    case "oxylabs":
      return "Oxylabs";
    case "scrapingbee":
      return "ScrapingBee";
  }
}
