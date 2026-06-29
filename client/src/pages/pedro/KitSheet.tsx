import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowRightLeft, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import SkuStyleSheet, { type SkuStyleBinding } from "./SkuStyleSheet";
import MigrationHistoryDialog from "./MigrationHistoryDialog";

/**
 * Planilha de Kits: mesmo formato/colunas da Planilha SKU, ligada ao router
 * `kitSheet`. Inclui o botão "Migrar para SKU" (move TODAS as linhas de Kits
 * para a Planilha SKU) e acesso ao Histórico de Migração.
 */
export default function KitSheet() {
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.kitSheet.list.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });
  // Reaproveita a árvore de categorias do ML (mesma do SKU).
  const { data: categories } = trpc.skuSheet.categories.useQuery();
  const { data: customColumns } = trpc.kitSheet.listCustomColumns.useQuery();

  const [confirmMigrate, setConfirmMigrate] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const updateMut = trpc.kitSheet.update.useMutation({
    onSuccess: () => utils.kitSheet.list.invalidate(),
    onError: () => toast.error("Não foi possível salvar a alteração"),
  });
  const createMut = trpc.kitSheet.create.useMutation({
    onSuccess: () => {
      utils.kitSheet.list.invalidate();
      toast.success("Linha adicionada");
    },
    onError: () => toast.error("Não foi possível adicionar a linha"),
  });
  const deleteMut = trpc.kitSheet.delete.useMutation({
    onSuccess: () => {
      utils.kitSheet.list.invalidate();
      toast.success("Linha excluída");
    },
    onError: () => toast.error("Não foi possível excluir"),
  });
  const createColMut = trpc.kitSheet.createCustomColumn.useMutation({
    onSuccess: () => {
      utils.kitSheet.listCustomColumns.invalidate();
      toast.success("Coluna criada");
    },
    onError: () => toast.error("Não foi possível criar a coluna"),
  });
  const renameColMut = trpc.kitSheet.renameCustomColumn.useMutation({
    onSuccess: () => utils.kitSheet.listCustomColumns.invalidate(),
    onError: () => toast.error("Não foi possível renomear a coluna"),
  });
  const deleteColMut = trpc.kitSheet.deleteCustomColumn.useMutation({
    onSuccess: () => {
      utils.kitSheet.listCustomColumns.invalidate();
      utils.kitSheet.list.invalidate();
      toast.success("Coluna excluída");
    },
    onError: () => toast.error("Não foi possível excluir a coluna"),
  });
  const setCustomValueMut = trpc.kitSheet.setCustomValue.useMutation({
    onSuccess: () => utils.kitSheet.list.invalidate(),
    onError: () => toast.error("Não foi possível salvar o valor"),
  });

  const migrateMut = trpc.kitSheet.migrateToSku.useMutation({
    onSuccess: (res) => {
      utils.kitSheet.list.invalidate();
      utils.skuSheet.list.invalidate();
      utils.kitSheet.migrationHistory.invalidate();
      setConfirmMigrate(false);
      toast.success(
        `${res.migratedCount} ${res.migratedCount === 1 ? "linha movida" : "linhas movidas"} para a Planilha SKU.`,
      );
    },
    onError: () => toast.error("Não foi possível migrar as linhas"),
  });

  const binding: SkuStyleBinding = {
    rows: rows as SkuStyleBinding["rows"],
    isLoading,
    categories: categories as SkuStyleBinding["categories"],
    customColumns,
    update: (input) => updateMut.mutate(input as never),
    create: (input) => createMut.mutate(input as never),
    remove: (id) => deleteMut.mutate({ id }),
    createColumn: (name) => createColMut.mutate({ name }),
    renameColumn: (id, name) => renameColMut.mutate({ id, name }),
    deleteColumn: (id) => deleteColMut.mutate({ id }),
    setCustomValue: (rowId, columnId, value) => setCustomValueMut.mutate({ rowId, columnId, value }),
    createPending: createMut.isPending,
  };

  const rowCount = rows?.length ?? 0;

  const headerExtra = (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-9 bg-card"
        onClick={() => setHistoryOpen(true)}
      >
        <History className="w-4 h-4 mr-1.5" />
        Histórico
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-9 bg-card text-primary border-primary/40 hover:bg-primary/5"
        onClick={() => setConfirmMigrate(true)}
        disabled={migrateMut.isPending || rowCount === 0}
      >
        {migrateMut.isPending ? (
          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
        ) : (
          <ArrowRightLeft className="w-4 h-4 mr-1.5" />
        )}
        Migrar para SKU
      </Button>
    </>
  );

  return (
    <>
      <SkuStyleSheet
        binding={binding}
        title="Kits"
        subtitle="composições de produtos"
        exportTitle="Kits"
        headerExtra={headerExtra}
      />

      {/* Confirmação da migração (MOVE todas as linhas) */}
      <AlertDialog open={confirmMigrate} onOpenChange={(o) => !o && setConfirmMigrate(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Migrar Kits para a Planilha SKU?</AlertDialogTitle>
            <AlertDialogDescription>
              {rowCount} {rowCount === 1 ? "linha será movida" : "linhas serão movidas"} desta aba
              Kits para a Planilha SKU, com todo o preenchimento e formatação. As linhas
              <strong> saem da aba Kits</strong> e passam a viver na Planilha SKU. Cada movimentação
              fica registrada no Histórico de Migração. Esta ação não pode ser desfeita
              automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => migrateMut.mutate({})}>
              Migrar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MigrationHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </>
  );
}
