import { useMemo, useState } from "react";
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
import { Search, Trash2, History, Table2 } from "lucide-react";

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
      toast.success("Linha removida da planilha.");
      utils.pricing.history.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Não foi possível remover."),
    onSettled: () => setToDelete(null),
  });

  const rows = list.data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.productName.toLowerCase().includes(q) ||
        (r.sku ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  // Conjunto ordenado de TODAS as margens que aparecem em qualquer linha — vira
  // as colunas dinâmicas da planilha (ex.: 20% / 30% / 40%).
  const marginColumns = useMemo(() => {
    const set = new Set<number>();
    for (const r of filtered) {
      for (const x of (r.results as MarginResult[]) ?? []) set.add(x.marginPct);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [filtered]);

  /** Acessa o custo de uma margem específica de uma linha (ou null se não testada). */
  function costFor(results: MarginResult[], marginPct: number): MarginResult | null {
    return results.find((x) => x.marginPct === marginPct) ?? null;
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Planilha de pesquisas"
        description="Cada pesquisa que você fixar vira uma linha. As margens testadas viram colunas — o valor em cada célula é o preço máximo a pagar para a Matriz naquela margem."
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
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <History className="h-6 w-6" />
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              {rows.length === 0
                ? 'Nenhuma pesquisa fixada ainda. Na aba “Preço a ser pago para a Matriz”, calcule e clique em “Fixar no histórico”.'
                : "Nenhuma linha corresponde à sua busca."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="sticky left-0 z-10 bg-muted/40 px-4 py-3 font-semibold">Produto</th>
                  <th className="px-3 py-3 font-semibold">SKU</th>
                  <th className="px-3 py-3 font-semibold">Data</th>
                  <th className="px-3 py-3 font-semibold">Regime</th>
                  <th className="px-3 py-3 text-right font-semibold">Preço de venda</th>
                  {marginColumns.map((m) => (
                    <th key={m} className="whitespace-nowrap px-3 py-3 text-right font-semibold text-primary">
                      Matriz · {m}%
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const results = (r.results as MarginResult[]) ?? [];
                  const params = (r.params as Params) ?? {};
                  const tts = params.hasTts;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border/60 transition-colors hover:bg-muted/20"
                    >
                      <td className="sticky left-0 z-10 max-w-[220px] bg-card px-4 py-3 font-medium">
                        <span className="line-clamp-2">{r.productName}</span>
                        {r.notes && (
                          <span className="mt-0.5 line-clamp-1 text-[11px] font-normal text-muted-foreground">
                            {r.notes}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {r.sku ? (
                          <Badge variant="outline" className="rounded-md bg-muted/40 text-[10px]">
                            {r.sku}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[12px] text-muted-foreground">
                        {formatDateTime(new Date(r.createdAt).getTime())}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {tts === undefined ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={cn(
                              "rounded-md px-2 py-0.5 text-[11px] font-medium",
                              tts ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-600",
                            )}
                          >
                            {tts ? "COM TTS" : "SEM TTS"}
                            {params.taxPercent != null ? ` · ${params.taxPercent}%` : ""}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">
                        {formatBRL(r.sellingPrice)}
                      </td>
                      {marginColumns.map((m) => {
                        const cell = costFor(results, m);
                        return (
                          <td key={m} className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                            {cell ? (
                              <span
                                className={cn(
                                  "font-semibold",
                                  !cell.feasible && "text-destructive",
                                )}
                              >
                                {formatBRL(cell.productCostBRL)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setToDelete({ id: r.id, name: r.productName })}
                          aria-label={`Excluir ${r.productName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {filtered.length > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Table2 className="h-3.5 w-3.5" />
          {filtered.length} linha{filtered.length !== 1 ? "s" : ""} ·{" "}
          {marginColumns.length} coluna{marginColumns.length !== 1 ? "s" : ""} de margem.
          Células em vermelho indicam que a margem não cabe no preço de venda informado.
        </p>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir linha?</AlertDialogTitle>
            <AlertDialogDescription>
              A linha de <strong>{toDelete?.name}</strong> será removida da planilha. Esta ação
              não pode ser desfeita.
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
