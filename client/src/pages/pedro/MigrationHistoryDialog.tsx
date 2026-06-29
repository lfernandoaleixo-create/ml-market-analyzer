import { useMemo } from "react";
import { ArrowRight, History, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Histórico de Migração: lista tudo que saiu da aba Kits e foi para a Planilha
 * SKU, desde a criação. Cada item mostra o produto/SKU, quem migrou e quando.
 */
export default function MigrationHistoryDialog({ open, onOpenChange }: Props) {
  const { data, isLoading } = trpc.kitSheet.migrationHistory.useQuery(undefined, {
    enabled: open,
  });

  const items = useMemo(() => data ?? [], [data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Histórico de Migração
          </DialogTitle>
          <DialogDescription>
            Registro de todas as linhas que saíram de <strong>Kits</strong> e foram movidas para a{" "}
            <strong>Planilha SKU</strong>, desde a criação.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Nenhuma migração registrada ainda. Quando você usar o botão{" "}
            <strong>Migrar para SKU</strong>, cada linha movida aparecerá aqui.
          </div>
        ) : (
          <div className="space-y-2 py-1">
            <p className="text-xs text-muted-foreground px-1">
              {items.length} {items.length === 1 ? "registro" : "registros"}
            </p>
            {items.map((it) => (
              <div
                key={it.id}
                className="rounded-lg border border-border bg-card p-3 flex items-start gap-3"
              >
                <div className="mt-0.5 w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <ArrowRight className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground break-words">
                      {it.label || "(sem nome)"}
                    </span>
                    {it.sku && (
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {it.sku}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>Kits → Planilha SKU</span>
                    <span>{new Date(it.migratedAt).toLocaleString("pt-BR")}</span>
                    {it.migratedByName && <span>por {it.migratedByName}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
