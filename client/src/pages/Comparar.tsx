import { CategorySelect } from "@/components/market/CategorySelect";
import { DataSourceBanner, EmptyState, PageContainer, PageHeader } from "@/components/market/Common";
import { ProductCard } from "@/components/market/ProductCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Crown, GitCompareArrows, Trophy, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function Comparar() {
  const [categoryId, setCategoryId] = useState<string>("MLB1051");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  const products = trpc.market.bestSellers.useQuery({ categoryId, limit: 18 });

  const toggle = (id: string) => {
    setComparing(false);
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) {
        toast.error("Você pode comparar até 4 produtos por vez.");
        return prev;
      }
      return [...prev, id];
    });
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Análise comparativa"
        title="Comparar produtos similares"
        description="Selecione de 2 a 4 produtos e veja, fator a fator, por que um anúncio vende mais que o outro: preço, frete, reputação, fotos, avaliações e posicionamento."
        actions={<CategorySelect value={categoryId} onChange={setCategoryId} />}
      />

      <DataSourceBanner />

      {/* Selection tray */}
      <Card className="sticky top-4 z-20 flex flex-wrap items-center gap-3 p-3 backdrop-blur">
        <span className="text-sm font-medium">
          Selecionados: <span className="text-primary">{selectedIds.length}</span>/4
        </span>
        <div className="flex flex-1 flex-wrap gap-2">
          {selectedIds.map((id) => {
            const p = products.data?.products.find((x) => x.id === id);
            return (
              <Badge key={id} variant="secondary" className="gap-1.5 py-1">
                <span className="max-w-32 truncate">{p?.title ?? id}</span>
                <button onClick={() => toggle(id)} aria-label="Remover">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
        <Button
          disabled={selectedIds.length < 2}
          onClick={() => setComparing(true)}
        >
          <GitCompareArrows className="h-4 w-4" /> Comparar
        </Button>
      </Card>

      {comparing && selectedIds.length >= 2 && (
        <ComparisonResultView itemIds={selectedIds} />
      )}

      {/* Picker grid */}
      <div>
        <h2 className="mb-3 font-display text-lg font-600">Escolha os produtos</h2>
        {products.isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {products.data?.products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                compact
                selected={selectedIds.includes(p.id)}
                onToggleSelect={toggle}
              />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function ComparisonResultView({ itemIds }: { itemIds: string[] }) {
  const memoIds = useMemo(() => itemIds, [itemIds.join(",")]);
  const { data, isLoading, error } = trpc.market.compare.useQuery({ itemIds: memoIds });

  if (isLoading) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }
  if (error || !data) {
    return (
      <EmptyState icon={GitCompareArrows} title="Não foi possível comparar" description={error?.message} />
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      {/* Header with winner */}
      <div className="border-b border-border bg-gradient-to-br from-primary/10 to-transparent p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Trophy className="h-4 w-4" /> Vencedor geral
        </div>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
      </div>

      {/* Product columns header */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="w-40 p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Fator
              </th>
              {data.products.map((p) => {
                const isWinner = p.id === data.overallWinnerId;
                return (
                  <th key={p.id} className="min-w-44 p-3 align-top">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="relative">
                        <img src={p.thumbnail} alt="" className="h-16 w-16 rounded-lg object-cover" />
                        {isWinner && (
                          <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                            <Crown className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs font-medium leading-snug">{p.title}</p>
                      <p className="text-sm font-display font-600">{formatBRL(p.price)}</p>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.factors.map((f) => (
              <tr key={f.key} className="border-b border-border/60 last:border-0">
                <td className="p-3 align-top">
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-snug">{f.explanation}</p>
                </td>
                {data.products.map((p) => {
                  const val = f.values[p.id];
                  const isWinner = p.id === f.winnerId;
                  return (
                    <td key={p.id} className="p-3 text-center align-middle">
                      <div
                        className={`mx-auto flex max-w-32 flex-col items-center gap-1 rounded-lg px-2 py-2 ${
                          isWinner ? "bg-primary/10 ring-1 ring-primary/30" : ""
                        }`}
                      >
                        <span className={`text-sm ${isWinner ? "font-semibold text-primary" : ""}`}>
                          {val?.raw ?? "—"}
                        </span>
                        {isWinner && (
                          <Badge variant="outline" className="h-5 border-primary/30 text-[10px] text-primary">
                            Melhor
                          </Badge>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
