import { useMemo, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { SectionCard } from "@/components/account/AccountUI";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBRL, formatNumber } from "@/lib/format";
import type { ListingRow } from "@shared/account";
import { selectActiveListings } from "@shared/listingsAnalytics";
import {
  PlayCircle,
  Search as SearchIcon,
  X,
  Eye,
  Boxes,
  ShoppingBag,
  ExternalLink,
  Truck,
} from "lucide-react";

const LISTING_TYPE_LABEL: Record<string, string> = {
  gold_pro: "Premium",
  gold_premium: "Premium",
  gold_special: "Clássico",
  gold: "Clássico",
  silver: "Básico",
  bronze: "Grátis",
  free: "Grátis",
};

function typeLabel(t: string): string {
  return LISTING_TYPE_LABEL[t] ?? (t || "—");
}

/**
 * Card dedicado que mostra SOMENTE os anúncios com status ativo, em formato de
 * grid de cartões (foto, título, tipo, preço, estoque, vendas e visitas). Tem
 * busca interna por nome/ID e contador. Reaproveita o mesmo `ListingRow` da
 * página de Meus anúncios — não faz request próprio, recebe os itens prontos.
 */
export function ActiveListingsCard({
  items,
  loading,
  visitWindow,
}: {
  items: ListingRow[];
  loading?: boolean;
  /** Janela (dias) das visitas, só para rotular o campo. */
  visitWindow: number;
}) {
  const [search, setSearch] = useState("");

  // Apenas anúncios ativos (sem busca) — para o contador "de N".
  const active = useMemo(() => selectActiveListings(items), [items]);
  // Ativos + busca interna por título ou MLB.
  const filtered = useMemo(() => selectActiveListings(items, search), [items, search]);

  return (
    <SectionCard
      collapsible
      defaultOpen
      title="Anúncios ativos"
      description={
        loading
          ? undefined
          : `${formatNumber(filtered.length)} de ${formatNumber(active.length)} anúncios ativos`
      }
      actions={
        <div className="relative w-44 md:w-64">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ativo por nome ou ID..."
            className="h-9 pl-9 pr-8"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      }
    >
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <PlayCircle className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Nenhum anúncio ativo na conta no momento.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <SearchIcon className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Nenhum anúncio ativo corresponde à busca “{search}”.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <ActiveCard key={r.itemId} row={r} visitWindow={visitWindow} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function ActiveCard({ row, visitWindow }: { row: ListingRow; visitWindow: number }) {
  const card = (
    <div
      className={cn(
        "group flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-3.5 transition-all",
        "hover:border-primary/40 hover:shadow-sm",
      )}
    >
      <div className="flex items-start gap-3">
        <ProductImage
          src={row.thumbnail ?? undefined}
          alt={row.title}
          className="h-14 w-14 shrink-0 rounded-lg ring-1 ring-border"
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-tight">{row.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="border-emerald-500/20 bg-emerald-500/12 text-emerald-700"
            >
              <PlayCircle className="mr-1 h-3 w-3" /> Ativo
            </Badge>
            <Badge variant="secondary" className="font-normal">
              {typeLabel(row.listingType)}
            </Badge>
            {row.freeShipping && (
              <Badge variant="outline" className="gap-1 font-normal text-sky-600">
                <Truck className="h-3 w-3" /> Frete grátis
              </Badge>
            )}
          </div>
        </div>
        {row.permalink && (
          <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
        )}
      </div>

      <div className="mt-auto grid grid-cols-4 gap-2 border-t border-border pt-3 text-center">
        <Metric label="Preço" value={formatBRL(row.price)} />
        <Metric
          icon={Boxes}
          label="Estoque"
          value={
            row.availableQuantity === 0 ? (
              <span className="text-rose-600">0</span>
            ) : (
              formatNumber(row.availableQuantity)
            )
          }
        />
        <Metric icon={ShoppingBag} label="Vendas" value={formatNumber(row.soldQuantity)} />
        <Metric
          icon={Eye}
          label={`Visitas ${visitWindow}d`}
          value={
            row.visitsAvailable ? (
              formatNumber(row.visits)
            ) : (
              <span className="text-xs italic text-muted-foreground" title="Visitas carregando do Mercado Livre">
                …
              </span>
            )
          }
        />
      </div>
    </div>
  );

  if (!row.permalink) return card;
  return (
    <a
      href={row.permalink}
      target="_blank"
      rel="noopener noreferrer"
      title="Ver anúncio no Mercado Livre"
      className="block outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-xl"
    >
      {card}
    </a>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: typeof Eye;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
