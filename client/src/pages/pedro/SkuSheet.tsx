import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import SkuStyleSheet, { type SkuStyleBinding } from "./SkuStyleSheet";

/**
 * Planilha SKU: cadastro central de SKUs. Usa o componente visual compartilhado
 * SkuStyleSheet, ligado ao router tRPC `skuSheet`.
 */
export default function SkuSheet() {
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.skuSheet.list.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });
  const { data: categories } = trpc.skuSheet.categories.useQuery();
  const { data: customColumns } = trpc.skuSheet.listCustomColumns.useQuery();

  const updateMut = trpc.skuSheet.update.useMutation({
    onSuccess: () => utils.skuSheet.list.invalidate(),
    onError: () => toast.error("Não foi possível salvar a alteração"),
  });
  const createMut = trpc.skuSheet.create.useMutation({
    onSuccess: () => {
      utils.skuSheet.list.invalidate();
      toast.success("Linha adicionada");
    },
    onError: () => toast.error("Não foi possível adicionar a linha"),
  });
  const deleteMut = trpc.skuSheet.delete.useMutation({
    onSuccess: () => {
      utils.skuSheet.list.invalidate();
      toast.success("Linha excluída");
    },
    onError: () => toast.error("Não foi possível excluir"),
  });
  const createColMut = trpc.skuSheet.createCustomColumn.useMutation({
    onSuccess: () => {
      utils.skuSheet.listCustomColumns.invalidate();
      toast.success("Coluna criada");
    },
    onError: () => toast.error("Não foi possível criar a coluna"),
  });
  const renameColMut = trpc.skuSheet.renameCustomColumn.useMutation({
    onSuccess: () => utils.skuSheet.listCustomColumns.invalidate(),
    onError: () => toast.error("Não foi possível renomear a coluna"),
  });
  const deleteColMut = trpc.skuSheet.deleteCustomColumn.useMutation({
    onSuccess: () => {
      utils.skuSheet.listCustomColumns.invalidate();
      utils.skuSheet.list.invalidate();
      toast.success("Coluna excluída");
    },
    onError: () => toast.error("Não foi possível excluir a coluna"),
  });
  const setCustomValueMut = trpc.skuSheet.setCustomValue.useMutation({
    onSuccess: () => utils.skuSheet.list.invalidate(),
    onError: () => toast.error("Não foi possível salvar o valor"),
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

  return (
    <SkuStyleSheet
      binding={binding}
      title="Planilha SKU"
      subtitle="cadastro central de SKUs"
      exportTitle="Planilha SKU"
    />
  );
}
