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
import { formatBRL, formatUSD, formatCNY, formatDateTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Search,
  Trash2,
  ChevronDown,
  History,
  CheckCircle2,
  AlertTriangle,
  Tag,
  CalendarDays,
} from "lucide-react";

type MarginResult = {
  marginPct: number;
  productCostBRL: number;
  productCostUSD: number;
  productCostCNY?: number;
  netProfitBRL: number;
  feasible: boolean;
};

export default function HistoricoPrecos() {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<{ id: number; name: string } | null>(null);

  const list = trpc.pricing.history.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const utils = trpc.useUtils();

  const deleteMutation = trpc.pricing.history.delete.useMutation({
    onSuccess: () => {
      toast.success("Registro removido do histórico.");
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

  return (
    <div className="space-y-6">
      <SectionCard
        title="Histórico de simulações"
        description="Cada simulação de custo-alvo que você salvar fica registrada aqui — ideal para consultar nas reuniões."
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
      >
        {list.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/50" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <History className="h-6 w-6" />
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              {rows.length === 0
                ? "Nenhuma simulação salva ainda. Na aba “Custo-alvo (China)”, calcule e clique em “Salvar no histórico”."
                : "Nenhum registro corresponde à sua busca."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const isOpen = openId === r.id;
              const results = (r.results as MarginResult[]) ?? [];
              const bestFeasible = results.filter((x) => x.feasible);
              return (
                <div
                  key={r.id}
                  className="overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-sm"
                >
                  {/* Cabeçalho clicável */}
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : r.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Tag className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{r.productName}</p>
                        {r.sku && (
                          <Badge variant="outline" className="shrink-0 rounded-md bg-muted/40 text-[10px]">
                            {r.sku}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {formatDateTime(new Date(r.createdAt).getTime())}
                        </span>
                        <span>
                          Venda: <span className="font-medium text-foreground">{formatBRL(r.sellingPrice)}</span>
                        </span>
                        <span>
                          {results.length} margem{results.length !== 1 ? "s" : ""}
                          {bestFeasible.length < results.length &&
                            ` · ${bestFeasible.length} viáve${bestFeasible.length === 1 ? "l" : "is"}`}
                        </span>
                      </div>
                    </div>
                    {/* Resumo de chips de margem */}
                    <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                      {results.slice(0, 3).map((x) => (
                        <span
                          key={x.marginPct}
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums",
                            x.feasible
                              ? "bg-primary/10 text-primary"
                              : "bg-destructive/10 text-destructive",
                          )}
                        >
                          {x.marginPct}%
                        </span>
                      ))}
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>

                  {/* Detalhe expandido */}
                  {isOpen && (
                    <div className="border-t border-border bg-muted/20 px-4 py-4">
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {results.map((x) => (
                          <div
                            key={x.marginPct}
                            className={cn(
                              "rounded-lg border p-3",
                              x.feasible ? "border-border bg-card" : "border-destructive/30 bg-destructive/5",
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <Badge variant={x.feasible ? "default" : "destructive"} className="rounded-md">
                                Margem {x.marginPct}%
                              </Badge>
                              {x.feasible ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-destructive" />
                              )}
                            </div>
                            <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                              Quanto posso pagar
                            </p>
                            <p className={cn("font-display text-lg tabular-nums", !x.feasible && "text-destructive")}>
                              {formatBRL(x.productCostBRL)}
                            </p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {formatUSD(x.productCostUSD)}
                              {x.productCostCNY != null ? ` · ${formatCNY(x.productCostCNY)}` : ""}
                            </p>
                          </div>
                        ))}
                      </div>

                      {r.notes && (
                        <div className="mt-3 rounded-lg border border-border bg-card p-3 text-sm">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Observações</p>
                          <p className="mt-0.5 whitespace-pre-wrap">{r.notes}</p>
                        </div>
                      )}

                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-[11px] text-muted-foreground">
                          Cotação salva: R$ {r.usdToBrl.toFixed(4)}/US$
                          {r.cnyToBrl ? ` · R$ ${r.cnyToBrl.toFixed(4)}/¥` : ""}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setToDelete({ id: r.id, name: r.productName })}
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro de <strong>{toDelete?.name}</strong> será removido do histórico. Esta ação
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
