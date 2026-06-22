import { useMemo, useState, type ReactNode } from "react";
import { SectionCard } from "@/components/account/AccountUI";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Search, Trash2, History, Table2, Package, RefreshCw } from "lucide-react";

type MarginResult = {
  marginPct: number;
  productCostBRL: number;
  productCostUSD?: number;
  netProfitBRL: number;
  feasible: boolean;
};

type Params = {
  hasTts?: boolean;
  taxPercent?: number;
  commissionPercent?: number;
  weightLabel?: string;
  listingType?: string;
  freeShippingFast?: boolean;
  shippingCost?: number;
};

type Row = {
  id: number;
  productName: string;
  sku: string | null;
  notes: string | null;
  sellingPrice: number;
  createdAt: string | Date;
  results: MarginResult[];
  params: Params;
};

/** Cada salvamento vira uma "variação" (uma coluna na planilha do produto). */
type Variation = {
  id: number;
  createdAt: string | Date;
  sellingPrice: number;
  params: Params;
  results: MarginResult[];
};

/** Um produto agrupa várias variações (colunas). */
type ProductGroup = {
  key: string;
  productName: string;
  sku: string | null;
  notes: string | null;
  variations: Variation[];
};

const LISTING_LABEL: Record<string, string> = {
  classico: "Clássico",
  premium: "Premium",
};

export default function HistoricoPrecos() {
  const [query, setQuery] = useState("");
  const [toDelete, setToDelete] = useState<{ id: number; name: string } | null>(null);

  const list = trpc.pricing.history.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const utils = trpc.useUtils();

  const deleteMutation = trpc.pricing.history.delete.useMutation({
    onSuccess: () => {
      toast.success("Variação removida da planilha.");
      utils.pricing.history.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Não foi possível remover."),
    onSettled: () => setToDelete(null),
  });

  const [togglingId, setTogglingId] = useState<number | null>(null);
  const toggleRegime = trpc.pricing.history.toggleRegime.useMutation({
    onMutate: (vars) => setTogglingId(vars.id),
    onSuccess: (res) => {
      toast.success(
        res.params?.hasTts ? "Alterado para COM TTS (14%)." : "Alterado para SEM TTS (24%).",
      );
      utils.pricing.history.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Não foi possível alternar o regime."),
    onSettled: () => setTogglingId(null),
  });

  const rows = (list.data ?? []) as Row[];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.productName.toLowerCase().includes(q) ||
        (r.sku ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  // Agrupa por produto: identifica pelo SKU (quando houver), senão pelo nome.
  // Cada salvamento daquele produto vira uma coluna de variação.
  const groups = useMemo<ProductGroup[]>(() => {
    const map = new Map<string, ProductGroup>();
    for (const r of filtered) {
      const key = (r.sku && r.sku.trim())
        ? `sku:${r.sku.trim().toLowerCase()}`
        : `name:${r.productName.trim().toLowerCase()}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          productName: r.productName,
          sku: r.sku,
          notes: r.notes,
          variations: [],
        };
        map.set(key, g);
      }
      g.variations.push({
        id: r.id,
        createdAt: r.createdAt,
        sellingPrice: r.sellingPrice,
        params: (r.params as Params) ?? {},
        results: (r.results as MarginResult[]) ?? [],
      });
    }
    // Ordena variações por data (mais antiga primeiro → "Variação 1, 2, 3…")
    // e produtos pela variação mais recente.
    const arr = Array.from(map.values());
    for (const g of arr) {
      g.variations.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }
    arr.sort((a, b) => {
      const la = Math.max(...a.variations.map((v) => new Date(v.createdAt).getTime()));
      const lb = Math.max(...b.variations.map((v) => new Date(v.createdAt).getTime()));
      return lb - la;
    });
    return arr;
  }, [filtered]);

  const totalVariations = filtered.length;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Planilha de pesquisas"
        description="Cada produto vira uma planilha. Cada vez que você fixa uma simulação (mudando margem, frete, peso ou regime), acrescentamos uma coluna de variação naquele produto — comparando lado a lado o preço a pagar para a Matriz."
        actions={
          <div className="relative w-56 max-w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou SKU…"
              className="pl-9"
            />
          </div>
        }
        bodyClassName="p-0"
      >
        {list.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <History className="h-6 w-6" />
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              {rows.length === 0
                ? 'Nenhuma pesquisa fixada ainda. Na aba “Preço a ser pago para a Matriz”, calcule e clique em “Fixar no histórico”.'
                : "Nenhum produto corresponde à sua busca."}
            </p>
          </div>
        ) : (
          <div className="space-y-8 p-5">
            {groups.map((g) => (
              <ProductSpreadsheet
                key={g.key}
                group={g}
                onDelete={(id, name) => setToDelete({ id, name })}
                onToggleRegime={(id) => toggleRegime.mutate({ id })}
                togglingId={togglingId}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {totalVariations > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Table2 className="h-3.5 w-3.5" />
          {groups.length} produto{groups.length !== 1 ? "s" : ""} ·{" "}
          {totalVariations} variaç{totalVariations !== 1 ? "ões" : "ão"} no total.
          Cada coluna é uma simulação salva; valores em vermelho indicam margem inviável no preço informado.
        </p>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir variação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta coluna de variação de <strong>{toDelete?.name}</strong> será removida da
              planilha. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && deleteMutation.mutate({ id: toDelete.id })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Planilha de um único produto: linhas = atributos/margens, colunas = variações. */
function ProductSpreadsheet({
  group,
  onDelete,
  onToggleRegime,
  togglingId,
}: {
  group: ProductGroup;
  onDelete: (id: number, name: string) => void;
  onToggleRegime: (id: number) => void;
  togglingId: number | null;
}) {
  // União ordenada de todas as margens testadas nas variações deste produto.
  const marginRows = useMemo(() => {
    const set = new Set<number>();
    for (const v of group.variations) {
      for (const x of v.results) set.add(x.marginPct);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [group]);

  function costFor(results: MarginResult[], marginPct: number): MarginResult | null {
    return results.find((x) => x.marginPct === marginPct) ?? null;
  }

  function regimeLabel(p: Params): string {
    if (p.hasTts === undefined) return "—";
    const base = p.hasTts ? "COM TTS" : "SEM TTS";
    return p.taxPercent != null ? `${base} · ${p.taxPercent}%` : base;
  }

  function shippingLabel(p: Params): string {
    if (p.freeShippingFast) return "Frete grátis";
    if (p.shippingCost && p.shippingCost > 0) return formatBRL(p.shippingCost);
    return "Sem frete";
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {/* Cabeçalho do produto */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Package className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold">{group.productName}</p>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {group.sku ? (
              <Badge variant="outline" className="rounded-md bg-card text-[10px]">
                SKU {group.sku}
              </Badge>
            ) : (
              <span>sem SKU</span>
            )}
            <span>·</span>
            <span>
              {group.variations.length} variaç{group.variations.length !== 1 ? "ões" : "ão"}
            </span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-card text-left">
              <th className="sticky left-0 z-10 min-w-[150px] bg-card px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Parâmetro
              </th>
              {group.variations.map((v, i) => (
                <th
                  key={v.id}
                  className="min-w-[140px] whitespace-nowrap px-3 py-2.5 text-right align-bottom"
                >
                  <div className="flex flex-col items-end gap-1">
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      Variação {i + 1}
                    </span>
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {formatDateTime(new Date(v.createdAt).getTime())}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onDelete(v.id, group.productName)}
                      aria-label={`Excluir variação ${i + 1} de ${group.productName}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-[13px]">
            <AttrRow
              label="Preço de venda (ML)"
              variations={group.variations}
              render={(v) => (
                <span className="font-medium tabular-nums">{formatBRL(v.sellingPrice)}</span>
              )}
            />
            <AttrRow
              label="Regime (clique p/ alternar)"
              variations={group.variations}
              render={(v) => {
                const isTts = v.params.hasTts !== false;
                const busy = togglingId === v.id;
                return (
                  <button
                    type="button"
                    disabled={busy || v.params.hasTts === undefined}
                    onClick={() => onToggleRegime(v.id)}
                    title="Alternar COM TTS (14%) / SEM TTS (24%)"
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      isTts
                        ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                        : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100",
                      (busy || v.params.hasTts === undefined) && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} />
                    {regimeLabel(v.params)}
                  </button>
                );
              }}
            />
            <AttrRow
              label="Anúncio / Comissão"
              variations={group.variations}
              render={(v) => (
                <span className="text-muted-foreground">
                  {v.params.listingType ? LISTING_LABEL[v.params.listingType] ?? v.params.listingType : "—"}
                  {v.params.commissionPercent != null ? ` · ${v.params.commissionPercent}%` : ""}
                </span>
              )}
            />
            <AttrRow
              label="Peso"
              variations={group.variations}
              render={(v) => <span className="text-muted-foreground">{v.params.weightLabel ?? "—"}</span>}
            />
            <AttrRow
              label="Frete"
              variations={group.variations}
              render={(v) => <span className="text-muted-foreground">{shippingLabel(v.params)}</span>}
            />

            {/* Separador antes das margens */}
            <tr>
              <td
                colSpan={group.variations.length + 1}
                className="border-y border-border bg-muted/30 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Preço a pagar para a Matriz (por margem)
              </td>
            </tr>

            {marginRows.map((m) => (
              <tr key={m} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                <td className="sticky left-0 z-10 bg-card px-4 py-2.5 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Margem {m}%
                  </span>
                </td>
                {group.variations.map((v) => {
                  const cell = costFor(v.results, m);
                  return (
                    <td key={v.id} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                      {cell ? (
                        <span className={cn("font-semibold", !cell.feasible && "text-destructive")}>
                          {formatBRL(cell.productCostBRL)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Linha de atributo (label fixo + uma célula por variação). */
function AttrRow({
  label,
  variations,
  render,
}: {
  label: string;
  variations: Variation[];
  render: (v: Variation) => ReactNode;
}) {
  return (
    <tr className="border-b border-border/40 hover:bg-muted/10">
      <td className="sticky left-0 z-10 bg-card px-4 py-2.5 text-[12px] text-muted-foreground">
        {label}
      </td>
      {variations.map((v) => (
        <td key={v.id} className="whitespace-nowrap px-3 py-2.5 text-right">
          {render(v)}
        </td>
      ))}
    </tr>
  );
}
