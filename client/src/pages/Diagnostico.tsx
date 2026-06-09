import { EmptyState, PageContainer, PageHeader } from "@/components/market/Common";
import { RadarBanner } from "@/components/competitors/RadarBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { reputationLabel, powerSellerLabel } from "@/lib/format";
import type {
  CompetitorDiagnosis,
  DiagnosisFactor,
  FactorAdvantage,
  FactorImpact,
  MyListingBaseline,
} from "@shared/competitors";
import {
  Microscope,
  Lock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  HelpCircle,
  ServerCrash,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

const IMPACT_META: Record<FactorImpact, { label: string; className: string }> = {
  high: { label: "Alto impacto", className: "bg-rose-500/12 text-rose-700 border-rose-500/20" },
  medium: { label: "Médio impacto", className: "bg-amber-500/12 text-amber-700 border-amber-500/20" },
  low: { label: "Baixo impacto", className: "bg-muted text-muted-foreground border-border" },
};

const ADVANTAGE_META: Record<
  FactorAdvantage,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  mine: { label: "Você ganha", icon: CheckCircle2, className: "text-emerald-600" },
  theirs: { label: "Concorrente ganha", icon: AlertTriangle, className: "text-rose-600" },
  tie: { label: "Empate", icon: MinusCircle, className: "text-muted-foreground" },
  unknown: { label: "Sem dados", icon: HelpCircle, className: "text-muted-foreground" },
};

export default function Diagnostico() {
  const [, setLocation] = useLocation();
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [myItemId, setMyItemId] = useState<string>("");
  const [result, setResult] = useState<CompetitorDiagnosis | null>(null);

  const status = trpc.competitors.status.useQuery();
  const configured = status.data?.configured === true;

  const conn = trpc.account.connection.useQuery();
  const connected = conn.data?.connected === true;

  const listings = trpc.account.listings.useQuery(
    { lastDays: 30 },
    { enabled: connected },
  );
  const reputation = trpc.account.reputation.useQuery(undefined, { enabled: connected });

  // Prefill competitor URL from query string (?url=...).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get("url");
    if (url) setCompetitorUrl(url);
  }, []);

  const myReputationLabel = useMemo(() => {
    const r = reputation.data;
    if (!r) return null;
    return powerSellerLabel(r.powerSellerStatus) ?? (r.levelId ? reputationLabel(r.levelId) : null);
  }, [reputation.data]);

  const selectedListing = useMemo(
    () => (listings.data?.items ?? []).find((l) => l.itemId === myItemId) ?? null,
    [listings.data, myItemId],
  );

  const diagnose = trpc.competitors.diagnose.useMutation({
    onSuccess: (data) => setResult(data ?? null),
  });

  const runDiagnosis = () => {
    if (!competitorUrl.trim()) return;
    const baseline: MyListingBaseline = selectedListing
      ? {
          title: selectedListing.title,
          price: selectedListing.price ?? null,
          soldQuantity: selectedListing.soldQuantity ?? null,
          reputationLabel: myReputationLabel,
          hasFull: selectedListing.listingType?.toLowerCase().includes("full") ? true : null,
          hasFreeInstallments: null,
          photosCount: null,
          rating: null,
          totalRatings: null,
        }
      : {
          title: "Meu anúncio",
          price: null,
          soldQuantity: null,
          reputationLabel: myReputationLabel,
          hasFull: null,
          hasFreeInstallments: null,
          photosCount: null,
          rating: null,
          totalRatings: null,
        };
    diagnose.mutate({ competitorUrl: competitorUrl.trim(), myListing: baseline });
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Diagnóstico competitivo"
        title="Por que ele vende mais?"
        description="Compare o seu anúncio com o de um concorrente, fator a fator — preço, reputação, prova social, logística (Full), parcelamento e fotos — e receba recomendações práticas."
        actions={
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLocation("/radar")}>
            <ArrowLeft className="h-4 w-4" /> Voltar ao radar
          </Button>
        }
      />

      <RadarBanner />

      {status.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : !configured ? (
        <EmptyState
          icon={Lock}
          title="Inteligência de concorrentes ainda não configurada"
          description="Assim que a chave do serviço de dados independente for adicionada, o diagnóstico fica disponível. Sua conta do Mercado Livre nunca é usada aqui."
          action={
            <Button variant="outline" onClick={() => setLocation("/configuracoes")}>
              Ver configurações
            </Button>
          }
        />
      ) : (
        <>
          {/* Inputs */}
          <Card className="space-y-4 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Meu anúncio (opcional)
                </label>
                {connected ? (
                  <Select value={myItemId} onValueChange={setMyItemId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um anúncio seu" />
                    </SelectTrigger>
                    <SelectContent>
                      {(listings.data?.items ?? []).map((l) => (
                        <SelectItem key={l.itemId} value={l.itemId}>
                          {l.title.length > 48 ? l.title.slice(0, 48) + "…" : l.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Conecte sua conta para comparar com um anúncio seu. Você ainda pode analisar o
                    concorrente isoladamente.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  URL do concorrente no Mercado Livre
                </label>
                <Input
                  value={competitorUrl}
                  onChange={(e) => setCompetitorUrl(e.target.value)}
                  placeholder="https://www.mercadolivre.com.br/..."
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={runDiagnosis}
                disabled={!competitorUrl.trim() || diagnose.isPending}
                className="gap-1.5"
              >
                <Microscope className="h-4 w-4" />
                {diagnose.isPending ? "Analisando..." : "Rodar diagnóstico"}
              </Button>
            </div>
          </Card>

          {diagnose.isPending ? (
            <Skeleton className="h-80 w-full rounded-xl" />
          ) : diagnose.error ? (
            diagnose.error.data?.code === "BAD_GATEWAY" ? (
              <EmptyState
                icon={ServerCrash}
                title="Serviço de dados temporariamente instável"
                description="O provedor de dados de concorrentes está com instabilidade momentânea e não respondeu agora. Isso é temporário e não afeta a sua conta nem os seus créditos. Aguarde alguns minutos e rode o diagnóstico novamente."
                action={
                  <Button
                    variant="outline"
                    onClick={runDiagnosis}
                    disabled={diagnose.isPending}
                    className="gap-1.5"
                  >
                    <RefreshCw className={`h-4 w-4 ${diagnose.isPending ? "animate-spin" : ""}`} />
                    Tentar novamente
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={AlertTriangle}
                title="Não foi possível diagnosticar"
                description={diagnose.error.message}
              />
            )
          ) : result ? (
            <DiagnosisResult result={result} />
          ) : (
            <EmptyState
              icon={Microscope}
              title="Pronto para analisar"
              description="Cole a URL de um concorrente (e, opcionalmente, escolha um anúncio seu) e rode o diagnóstico."
            />
          )}
        </>
      )}
    </PageContainer>
  );
}

function DiagnosisResult({ result }: { result: CompetitorDiagnosis }) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card className="space-y-2 border-l-4 border-l-primary p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Microscope className="h-4 w-4" /> Diagnóstico
        </div>
        <p className="text-sm leading-relaxed">{result.summary}</p>
      </Card>

      {/* Header: my listing vs competitor */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Meu anúncio
          </p>
          <p className="mt-1 line-clamp-2 text-sm font-medium">{result.myListing.title}</p>
        </Card>
        <Card className="flex gap-3 p-4">
          {result.competitor.image && (
            <img
              src={result.competitor.image}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover bg-secondary"
            />
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Concorrente
            </p>
            <p className="mt-1 line-clamp-2 text-sm font-medium">{result.competitor.name}</p>
          </div>
        </Card>
      </div>

      {/* Factor-by-factor */}
      <Card className="overflow-hidden p-0">
        <div className="divide-y divide-border/60">
          {result.factors.map((f) => (
            <FactorRow key={f.factor} factor={f} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function FactorRow({ factor }: { factor: DiagnosisFactor }) {
  const adv = ADVANTAGE_META[factor.advantage];
  const impact = IMPACT_META[factor.impact];
  const AdvIcon = adv.icon;
  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{factor.factor}</span>
          <Badge variant="outline" className={`h-5 text-[10px] ${impact.className}`}>
            {impact.label}
          </Badge>
        </div>
        <div className={`inline-flex items-center gap-1.5 text-xs font-medium ${adv.className}`}>
          <AdvIcon className="h-3.5 w-3.5" /> {adv.label}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-secondary/60 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Meu anúncio</p>
          <p
            className={`text-sm ${factor.advantage === "mine" ? "font-semibold text-emerald-700" : ""}`}
          >
            {factor.myValue}
          </p>
        </div>
        <div className="rounded-lg bg-secondary/60 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Concorrente</p>
          <p
            className={`text-sm ${factor.advantage === "theirs" ? "font-semibold text-rose-700" : ""}`}
          >
            {factor.competitorValue}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="leading-snug">{factor.recommendation}</span>
      </div>
    </div>
  );
}
