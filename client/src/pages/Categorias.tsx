import { ProductImage } from "@/components/ProductImage";
import { DataSourceBanner, PageContainer, PageHeader } from "@/components/market/Common";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Flame, Layers, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import type { MlCategory, MlTrend } from "@shared/ml";

export default function Categorias() {
  const categories = trpc.market.categories.useQuery();
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeCategory = categories.data?.find((c: MlCategory) => c.id === activeId) ?? categories.data?.[0];
  const effectiveId = activeId ?? activeCategory?.id;

  const trends = trpc.market.trends.useQuery(
    { categoryId: effectiveId },
    { enabled: !!effectiveId },
  );
  const featured = trpc.market.bestSellers.useQuery(
    { categoryId: effectiveId, limit: 6 },
    { enabled: !!effectiveId },
  );

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Navegação por mercado"
        title="Categorias do Mercado Livre"
        description="Explore todas as categorias, veja o índice de demanda de cada uma e mergulhe nas tendências e produtos em destaque."
      />

      <DataSourceBanner />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Category list */}
        <div className="space-y-2">
          {categories.isLoading
            ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
            : categories.data?.map((c: MlCategory) => {
                const isActive = c.id === effectiveId;
                return (
                  <Card
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={`cursor-pointer p-4 transition-all hover:shadow-md ${
                      isActive ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                          isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Layers className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Explorar tendências e destaques
                        </p>
                      </div>
                      <div className="text-right" title="Índice de referência para priorizar a exploração — não é a contagem real de anúncios do Mercado Livre.">
                        <div className="font-display text-lg font-600">{c.demandIndex}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">interesse</div>
                      </div>
                    </div>
                  </Card>
                );
              })}
        </div>

        {/* Detail */}
        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-600">
                Termos em alta {activeCategory ? `· ${activeCategory.name}` : ""}
              </h2>
            </div>
            {trends.isLoading ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {trends.data?.map((t: MlTrend) => (
                  <div
                    key={t.keyword}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
                  >
                    <span className="truncate text-sm capitalize">{t.keyword}</span>
                    <span
                      className={`flex items-center gap-1 text-xs font-medium ${
                        t.changePercent >= 0 ? "text-emerald-500" : "text-red-500"
                      }`}
                    >
                      {t.changePercent >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {t.changePercent >= 0 ? "+" : ""}
                      {t.changePercent.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Flame className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-600">Produtos em destaque</h2>
            </div>
            {featured.isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {featured.data?.products.slice(0, 6).map((p) => (
                  <a
                    key={p.id}
                    href={p.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-lg border border-border/70 p-2.5 transition-colors hover:bg-accent/40"
                  >
                    <ProductImage src={p.thumbnail} alt={p.title} className="h-12 w-12" />
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-xs font-medium leading-snug">{p.title}</p>
                      <p className="mt-1 text-sm font-medium">{formatBRL(p.price)}</p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
