import { CategorySelect } from "@/components/market/CategorySelect";
import { DataSourceBanner, PageContainer, PageHeader, ScoreRing } from "@/components/market/Common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, verdictMeta } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import type { PotentialAnalysis } from "@shared/ml";
import { Info, Sparkles, TrendingUp } from "lucide-react";
import { useState } from "react";

export default function Oportunidades() {
  const [categoryId, setCategoryId] = useState<string>("MLB1051");
  const [selected, setSelected] = useState<PotentialAnalysis | null>(null);

  const { data, isLoading } = trpc.market.opportunities.useQuery({ categoryId, limit: 18 });

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Baseado em dados reais"
        title="Oportunidades de venda"
        description="Produtos mais bem posicionados na categoria, classificados por um índice composto a partir de dados reais da API. Clique em qualquer item para ver exatamente por que ele foi destacado."
        actions={<CategorySelect value={categoryId} onChange={setCategoryId} />}
      />

      <DataSourceBanner />

      {/* Methodology explainer */}
      <Card className="border-primary/20 bg-primary/5 p-5">
        <div className="flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Info className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <h3 className="font-medium">Como calculamos o potencial</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              O índice usa <strong>apenas fatores reais</strong> retornados pela API: <strong>preço competitivo</strong>{" "}
              frente à categoria, <strong>presença nos mais vendidos</strong> (posição real),{" "}
              <strong>reputação do vendedor</strong> e <strong>frete grátis + qualidade do anúncio</strong>.{" "}
              A avaliação só entra quando a nota está realmente disponível. Não usamos estimativas
              inventadas de crescimento. Abra o detalhe para ver cada fator explicado.
            </p>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data?.analyses.map((a) => {
            const meta = verdictMeta(a.verdict);
            return (
              <Card
                key={a.product.id}
                className="cursor-pointer p-4 transition-all hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5"
                onClick={() => setSelected(a)}
              >
                <div className="flex items-start gap-3">
                  <ScoreRing score={a.potentialScore} />
                  <div className="min-w-0 flex-1">
                    <Badge variant="outline" className={`mb-1.5 ${meta.className}`}>
                      {meta.label}
                    </Badge>
                    <p className="line-clamp-2 text-sm font-medium leading-snug">{a.product.title}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <img src={a.product.thumbnail} alt="" className="h-12 w-12 rounded-md object-cover" />
                  <div className="grid flex-1 grid-cols-2 gap-x-2 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Preço</span>
                    <span className="text-right font-medium">
                      {a.product.priceAvailable === false ? "Sob consulta" : formatBRL(a.product.price)}
                    </span>
                    <span className="text-muted-foreground">Mais vendidos</span>
                    <span className="text-right font-medium">
                      {a.product.catalogPosition ? `#${a.product.catalogPosition}` : "—"}
                    </span>
                    <span className="text-muted-foreground">Frete grátis</span>
                    <span className="text-right font-medium">{a.product.freeShipping ? "Sim" : "Não"}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <PotentialDialog analysis={selected} onClose={() => setSelected(null)} />
    </PageContainer>
  );
}

function PotentialDialog({
  analysis,
  onClose,
}: {
  analysis: PotentialAnalysis | null;
  onClose: () => void;
}) {
  if (!analysis) return null;
  const meta = verdictMeta(analysis.verdict);
  return (
    <Dialog open={!!analysis} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6 text-left font-display">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <span className="line-clamp-2">{analysis.product.title}</span>
          </DialogTitle>
          <DialogDescription className="text-left">
            Análise detalhada do potencial de curto prazo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/30 p-4">
          <ScoreRing score={analysis.potentialScore} size={72} />
          <div>
            <Badge variant="outline" className={meta.className}>
              {meta.label}
            </Badge>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Índice composto de <strong className="text-foreground">{Math.round(analysis.potentialScore)}/100</strong>,
              calculado a partir dos fatores abaixo.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {analysis.factors.map((f) => (
            <div key={f.key} className="rounded-lg border border-border/70 p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  <span className="text-sm font-medium">{f.label}</span>
                  <span className="text-xs text-muted-foreground">peso {Math.round(f.weight * 100)}%</span>
                </div>
                <span className="text-sm font-display font-600">{Math.round(f.score)}</span>
              </div>
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${f.score}%` }} />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{f.explanation}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" asChild>
            <a href={analysis.product.permalink} target="_blank" rel="noreferrer">
              Ver anúncio
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
