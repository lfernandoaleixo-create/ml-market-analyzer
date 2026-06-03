import { CategorySelect } from "@/components/market/CategorySelect";
import { DataSourceBanner, EmptyState, PageContainer, PageHeader } from "@/components/market/Common";
import { ProductCard } from "@/components/market/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Search as SearchIcon, SearchX } from "lucide-react";
import { useState } from "react";

type SortBy = "relevance" | "sales" | "price_asc" | "price_desc" | "rating";

export default function Buscar() {
  const [keywordInput, setKeywordInput] = useState("");
  const [query, setQuery] = useState<{ keyword?: string; categoryId?: string }>({});
  const [categoryId, setCategoryId] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortBy>("relevance");

  const search = trpc.market.search.useQuery(
    {
      keyword: query.keyword,
      categoryId: query.categoryId === "all" ? undefined : query.categoryId,
      sortBy,
      limit: 30,
    },
    { enabled: query.keyword !== undefined || query.categoryId !== undefined },
  );

  const submit = () => {
    setQuery({
      keyword: keywordInput.trim() || undefined,
      categoryId: categoryId === "all" ? undefined : categoryId,
    });
  };

  const hasSearched = query.keyword !== undefined || query.categoryId !== undefined;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Pesquisa"
        title="Buscar produtos"
        description="Pesquise por palavra-chave e/ou categoria. Os resultados trazem preço, avaliações, volume de vendas e dados do vendedor."
      />

      <DataSourceBanner />

      {/* Search bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Ex.: fone bluetooth, air fryer, tênis de corrida..."
            className="pl-9"
          />
        </div>
        <CategorySelect value={categoryId} onChange={setCategoryId} includeAll />
        <Button onClick={submit} className="sm:w-auto">
          <SearchIcon className="h-4 w-4" /> Buscar
        </Button>
      </div>

      {hasSearched && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {search.isLoading
              ? "Buscando..."
              : `${search.data?.products.length ?? 0} resultados exibidos`}
          </p>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevância</SelectItem>
              <SelectItem value="sales">Mais vendidos</SelectItem>
              <SelectItem value="price_asc">Menor preço</SelectItem>
              <SelectItem value="price_desc">Maior preço</SelectItem>
              <SelectItem value="rating">Melhor avaliação</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {!hasSearched ? (
        <EmptyState
          icon={SearchIcon}
          title="Comece sua pesquisa"
          description="Digite uma palavra-chave ou escolha uma categoria para ver os produtos e suas métricas."
        />
      ) : search.isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-80 w-full rounded-xl" />
          ))}
        </div>
      ) : (search.data?.products.length ?? 0) === 0 ? (
        <EmptyState icon={SearchX} title="Nenhum produto encontrado" description="Tente outra palavra-chave ou categoria." />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {search.data?.products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              categoryId={query.categoryId === "all" ? undefined : query.categoryId}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
