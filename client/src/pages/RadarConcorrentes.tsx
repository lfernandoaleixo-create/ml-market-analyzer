import { EmptyState, PageContainer, PageHeader } from "@/components/market/Common";
import { RadarBanner } from "@/components/competitors/RadarBanner";
import { SourcesPanel } from "@/components/competitors/SourcesPanel";
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
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function RadarConcorrentes() {
  const [, setLocation] = useLocation();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState<string | null>(null);

  const sources = trpc.competitors.sourcesStatus.useQuery();
  const anyConfigured = (sources.data?.configuredCount ?? 0) > 0;

  const search = trpc.competitors.searchMulti.useQuery(
    { query: query ?? "" },
    { enabled: anyConfigured && !!query && query.length >= 2, retry: false },
  );

  const submit = () => {
    const q = input.trim();
    if (q.length >= 2) setQuery(q);
  };

  const result = search.data;
  const competitors = result?.competitors ?? [];

  // Transient upstream failure across all configured sources → friendly notice.
  const isUpstreamHiccup = search.error?.data?.code === "BAD_GATEWAY";
  const isNotConfigured = search.error?.data?.code === "PRECONDITION_FAILED";

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Inteligência competitiva"
        title="Radar de concorrentes"
        description="Busque por qualquer produto ou categoria e veja os concorrentes mais fortes do mercado. Os dados são triangulados entre múltiplas fontes independentes: quando elas concordam, a confiança é alta; quando divergem, mostramos isso com transparência."
      />

      <RadarBanner />

      {/* Multi-source health panel */}
      {sources.isLoading ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : sources.data ? (
        <SourcesPanel
          sources={sources.data.sources}
          configuredCount={sources.data.configuredCount}
        />
      ) : null}

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
            disabled={!anyConfigured}
          />
        </div>
        <Button
          onClick={submit}
          disabled={!anyConfigured || input.trim().length < 2}
          className="sm:w-auto"
        >
          <SearchIcon className="h-4 w-4" /> Buscar concorrentes
        </Button>
      </div>

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
      ) : !query ? (
        <EmptyState
          icon={RadarIcon}
          title="Comece uma varredura"
          description="Digite um produto ou categoria para mapear os concorrentes mais fortes daquele mercado."
        />
      ) : search.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : search.error ? (
        isUpstreamHiccup ? (
          <EmptyState
            icon={ServerCrash}
            title="Fontes de dados temporariamente instáveis"
            description="As fontes de dados de concorrentes estão com instabilidade momentânea e não responderam agora. Isso é temporário e não afeta a sua conta nem os seus créditos. Aguarde alguns minutos e tente novamente."
            action={
              <Button
                variant="outline"
                onClick={() => search.refetch()}
                disabled={search.isFetching}
              >
                <RefreshCw className={`h-4 w-4 ${search.isFetching ? "animate-spin" : ""}`} />
                Tentar novamente
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
        ) : (
          <EmptyState
            icon={SearchX}
            title="Não foi possível buscar"
            description={search.error.message}
          />
        )
      ) : competitors.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nenhum concorrente encontrado"
          description="Tente outro termo de busca."
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {competitors.length} concorrentes para “{query}”, ordenados por força de mercado
            </p>
            {result?.triangulated && (
              <Badge
                variant="outline"
                className="shrink-0 gap-1 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700"
              >
                <Layers className="h-3 w-3" /> Dados triangulados
              </Badge>
            )}
          </div>
          <div className="space-y-2">
            {competitors.map((c, i) => (
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
        </div>
      )}
    </PageContainer>
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
