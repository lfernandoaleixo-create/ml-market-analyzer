import { EmptyState, PageContainer, PageHeader } from "@/components/market/Common";
import { RadarBanner } from "@/components/competitors/RadarBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { formatBRL, formatCompact } from "@/lib/format";
import type { Competitor } from "@shared/competitors";
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
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function RadarConcorrentes() {
  const [, setLocation] = useLocation();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState<string | null>(null);

  const status = trpc.competitors.status.useQuery();
  const configured = status.data?.configured === true;

  const search = trpc.competitors.search.useQuery(
    { query: query ?? "", page: 1 },
    { enabled: configured && !!query && query.length >= 2, retry: false },
  );

  const submit = () => {
    const q = input.trim();
    if (q.length >= 2) setQuery(q);
  };

  const results = search.data?.results ?? [];

  // The third-party provider (Unwrangle) occasionally returns a transient
  // upstream/parser failure (mapped to BAD_GATEWAY on the server). When that
  // happens we show a friendly "provider unstable" notice instead of a raw
  // technical error, with a one-click retry.
  const isUpstreamHiccup = search.error?.data?.code === "BAD_GATEWAY";

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Inteligência competitiva"
        title="Radar de concorrentes"
        description="Busque ativamente por qualquer produto ou categoria e veja os concorrentes ordenados por força de mercado (prova social e avaliações). Vá além do que aparece na tela: descubra quem realmente domina a busca."
      />

      <RadarBanner />

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
            disabled={!configured}
          />
        </div>
        <Button onClick={submit} disabled={!configured || input.trim().length < 2} className="sm:w-auto">
          <SearchIcon className="h-4 w-4" /> Buscar concorrentes
        </Button>
      </div>

      {/* Not configured state */}
      {status.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : !configured ? (
        <EmptyState
          icon={Lock}
          title="Inteligência de concorrentes ainda não configurada"
          description="Este módulo usa um serviço de dados independente, totalmente isolado da sua conta do Mercado Livre. Assim que a chave de acesso for adicionada nas configurações do projeto, a busca fica disponível."
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
            title="Serviço de dados temporariamente instável"
            description="O provedor de dados de concorrentes está com instabilidade momentânea e não respondeu agora. Isso é temporário e não afeta a sua conta nem os seus créditos. Aguarde alguns minutos e tente novamente."
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
        ) : (
          <EmptyState
            icon={SearchX}
            title="Não foi possível buscar"
            description={search.error.message}
          />
        )
      ) : results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nenhum concorrente encontrado"
          description="Tente outro termo de busca."
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {results.length} concorrentes para “{query}”, ordenados por força de mercado
            </p>
            {typeof search.data?.remainingCredits === "number" && (
              <Badge variant="outline" className="shrink-0 text-xs">
                Créditos restantes: {formatCompact(search.data.remainingCredits)}
              </Badge>
            )}
          </div>
          <div className="space-y-2">
            {results.map((c, i) => (
              <CompetitorRow
                key={`${c.url}-${i}`}
                rank={i + 1}
                competitor={c}
                onDiagnose={() =>
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
  competitor: Competitor;
  onDiagnose: () => void;
}) {
  const c = competitor;
  return (
    <Card className="flex items-center gap-4 p-3 transition-all hover:shadow-md">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-display font-600 text-muted-foreground">
        {rank}
      </div>
      {c.thumbnail ? (
        <img
          src={c.thumbnail}
          alt=""
          className="h-14 w-14 shrink-0 rounded-lg object-cover bg-secondary"
        />
      ) : (
        <div className="h-14 w-14 shrink-0 rounded-lg bg-secondary" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{c.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {c.brand && <span className="uppercase tracking-wide">{c.brand}</span>}
          {c.rating !== null && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {c.rating.toFixed(1)}
              {c.totalRatings !== null && (
                <span className="text-muted-foreground/80">({formatCompact(c.totalRatings)})</span>
              )}
            </span>
          )}
          <a
            href={c.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Ver no ML <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-display text-base font-600 tabular-nums">
          {c.price !== null ? formatBRL(c.price) : "Sob consulta"}
        </p>
        {c.listingPrice !== null && c.price !== null && c.listingPrice > c.price && (
          <p className="text-xs text-muted-foreground line-through">{formatBRL(c.listingPrice)}</p>
        )}
      </div>
      <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={onDiagnose}>
        <Microscope className="h-3.5 w-3.5" /> Diagnosticar
      </Button>
    </Card>
  );
}
