import { ProductImage } from "@/components/ProductImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  formatBRL,
  formatCompact,
  powerSellerLabel,
  reputationColor,
} from "@/lib/format";
import type { MlProduct } from "@shared/ml";
import { Check, ExternalLink, Plus, Star, Store, Truck } from "lucide-react";
import { toast } from "sonner";

type Props = {
  product: MlProduct;
  rank?: number;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  categoryId?: string;
  compact?: boolean;
};

export function ProductCard({ product, rank, selected, onToggleSelect, categoryId, compact }: Props) {
  const utils = trpc.useUtils();
  const monitored = trpc.monitor.list.useQuery();
  const isMonitored = (monitored.data ?? []).some((m) => m.mlItemId === product.id);

  const addMutation = trpc.monitor.add.useMutation({
    onSuccess: () => {
      utils.monitor.list.invalidate();
      toast.success("Produto adicionado ao monitoramento");
    },
    onError: (e) => toast.error(e.message),
  });

  // Availability flags: default to true (demo data) unless the provider
  // explicitly marks a field as unavailable (non-certified ML app limitation).
  const priceKnown = product.priceAvailable !== false && product.price > 0;
  const salesKnown = product.salesAvailable !== false;
  const ratingKnown = product.ratingAvailable !== false && product.rating > 0;

  return (
    <Card className="group relative overflow-hidden p-0 transition-all hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5">
      {rank != null && (
        <div className="absolute left-3 top-3 z-10 flex h-7 min-w-7 items-center justify-center rounded-full bg-background/90 px-2 text-sm font-display font-600 backdrop-blur">
          {rank}
        </div>
      )}
      {onToggleSelect && (
        <button
          onClick={() => onToggleSelect(product.id)}
          className={`absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border backdrop-blur transition-colors ${
            selected
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background/90 border-border hover:border-primary"
          }`}
          aria-label={selected ? "Remover da comparação" : "Adicionar à comparação"}
        >
          {selected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      )}

      <div className="aspect-square w-full overflow-hidden bg-muted/40">
        <ProductImage
          src={product.thumbnail}
          alt={product.title}
          className="h-full w-full rounded-none transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>

      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex flex-wrap gap-1.5">
          {product.freeShipping && (
            <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
              <Truck className="h-3 w-3" /> Frete grátis
            </Badge>
          )}
          {product.officialStore && (
            <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/10 text-primary">
              <Store className="h-3 w-3" /> Loja oficial
            </Badge>
          )}
        </div>

        <h3 className="line-clamp-2 min-h-10 text-sm font-medium leading-snug">{product.title}</h3>

        <div className="flex items-end justify-between">
          <div>
            {priceKnown ? (
              <>
                {product.priceIsFrom && (
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">A partir de</div>
                )}
                <div className="text-lg font-display font-600 tracking-tight">{formatBRL(product.price)}</div>
                {product.originalPrice && product.originalPrice > product.price && (
                  <div className="text-xs text-muted-foreground line-through">
                    {formatBRL(product.originalPrice)}
                  </div>
                )}
                {typeof product.offersCount === "number" && product.offersCount > 1 && (
                  <div className="text-[11px] text-muted-foreground">{product.offersCount} ofertas</div>
                )}
              </>
            ) : (
              <div className="space-y-0.5">
                <div className="text-sm font-display font-600 tracking-tight text-muted-foreground">
                  Preço sob consulta
                </div>
                <div className="text-[11px] text-muted-foreground/80">Sem oferta ativa no catálogo</div>
              </div>
            )}
          </div>
          {ratingKnown && (
            <div className="flex items-center gap-1 text-sm">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="font-medium">{product.rating.toFixed(1)}</span>
              <span className="text-xs text-muted-foreground">({formatCompact(product.reviewsCount)})</span>
            </div>
          )}
        </div>

        {!compact && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{salesKnown ? `${formatCompact(product.soldQuantity)} vendidos` : "Vendas —"}</span>
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${reputationColor(product.seller.reputationLevel)}`} />
              {powerSellerLabel(product.seller.powerSellerStatus) ?? product.seller.nickname}
            </span>
          </div>
        )}

        {!compact && !priceKnown && product.permalink && (
          <a
            href={product.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Ver preço no Mercado Livre
          </a>
        )}

        {!compact && (
          <Button
            variant={isMonitored ? "outline" : "secondary"}
            size="sm"
            className="mt-1 w-full"
            disabled={isMonitored || addMutation.isPending}
            onClick={() => addMutation.mutate({ itemId: product.id, categoryId })}
          >
            {isMonitored ? (
              <>
                <Check className="h-3.5 w-3.5" /> Monitorando
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" /> Monitorar
              </>
            )}
          </Button>
        )}
      </div>
    </Card>
  );
}
