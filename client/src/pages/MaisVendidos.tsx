import { CategorySelect } from "@/components/market/CategorySelect";
import { DataSourceBanner, PageContainer, PageHeader } from "@/components/market/Common";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatBRL,
  formatCompact,
  powerSellerLabel,
  reputationColor,
} from "@/lib/format";
import { trpc } from "@/lib/trpc";
import type { MlProduct } from "@shared/ml";
import { Star, Truck } from "lucide-react";
import { useMemo, useState } from "react";

type SortBy = "sales" | "price_asc" | "price_desc" | "rating";

export default function MaisVendidos() {
  const [categoryId, setCategoryId] = useState<string>("MLB1051");
  const [sortBy, setSortBy] = useState<SortBy>("sales");

  const { data, isLoading } = trpc.market.bestSellers.useQuery({ categoryId, limit: 30, sortBy });

  const products: MlProduct[] = useMemo(() => [...(data?.products ?? [])], [data]);

  const maxSold = Math.max(1, ...products.map((p) => p.soldQuantity));

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Ranking"
        title="Produtos mais vendidos"
        description="Os líderes de venda por categoria. Ordene por volume de vendas, preço ou avaliação para entender quem domina cada nicho."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CategorySelect value={categoryId} onChange={setCategoryId} />
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Mais vendidos</SelectItem>
                <SelectItem value="price_asc">Menor preço</SelectItem>
                <SelectItem value="price_desc">Maior preço</SelectItem>
                <SelectItem value="rating">Melhor avaliação</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <DataSourceBanner />

      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-b border-border bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:grid-cols-[2.5rem_1fr_8rem_10rem_7rem]">
          <span>#</span>
          <span>Produto</span>
          <span className="hidden text-right sm:block">Preço</span>
          <span className="hidden sm:block">Volume de vendas</span>
          <span className="text-right">Avaliação</span>
        </div>

        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="px-4 py-3">
                <Skeleton className="h-12 w-full" />
              </div>
            ))
          : products.map((p, i) => (
              <div
                key={p.id}
                className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-b border-border/60 px-4 py-3 transition-colors last:border-0 hover:bg-accent/30 sm:grid-cols-[2.5rem_1fr_8rem_10rem_7rem]"
              >
                <span className="font-display text-lg font-600 text-muted-foreground">{i + 1}</span>

                <div className="flex min-w-0 items-center gap-3">
                  <img src={p.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className={`h-2 w-2 rounded-full ${reputationColor(p.seller.reputationLevel)}`} />
                        {powerSellerLabel(p.seller.powerSellerStatus) ?? p.seller.nickname}
                      </span>
                      {p.freeShipping && (
                        <Badge variant="outline" className="h-5 gap-1 border-emerald-500/30 text-emerald-500">
                          <Truck className="h-3 w-3" /> Grátis
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="hidden text-right text-sm font-medium sm:block">
                  {p.priceAvailable !== false && p.price > 0 ? (
                    formatBRL(p.price)
                  ) : (
                    <span className="text-xs text-muted-foreground">Sob consulta</span>
                  )}
                </div>

                <div className="hidden sm:block">
                  {p.salesAvailable !== false ? (
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(p.soldQuantity / maxSold) * 100}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-xs text-muted-foreground">
                        {formatCompact(p.soldQuantity)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>

                {p.ratingAvailable !== false && p.rating > 0 ? (
                  <div className="flex items-center justify-end gap-1 text-sm">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-medium">{p.rating.toFixed(1)}</span>
                  </div>
                ) : (
                  <div className="text-right text-sm text-muted-foreground">—</div>
                )}
              </div>
            ))}
      </Card>
    </PageContainer>
  );
}
