import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import SkuStyleSheet, { type SkuStyleBinding } from "./SkuStyleSheet";

/**
 * Planilha SKU: cadastro central de SKUs. Usa o componente visual compartilhado
 * SkuStyleSheet, ligado ao router tRPC `skuSheet`.
 *
 * PERFORMANCE: edições de célula (update / setCustomValue) aplicam a alteração
 * DIRETAMENTE no cache do React Query (update otimista), SEM refetch da lista
 * inteira. Isso mantém a digitação instantânea mesmo com muitas linhas. Apenas
 * operações que mudam a composição da lista (create/delete/colunas) invalidam.
 */
type SkuRowCache = {
  id: number;
  customValues?: string | null;
  [key: string]: unknown;
};

export default function SkuSheet() {
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.skuSheet.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const { data: categories } = trpc.skuSheet.categories.useQuery();
  const { data: customColumns } = trpc.skuSheet.listCustomColumns.useQuery();

  // Aplica um patch em uma linha diretamente no cache (sem refetch).
  const patchRowInCache = (id: number, patch: Record<string, unknown>) => {
    utils.skuSheet.list.setData(undefined, (prev) => {
      if (!prev) return prev;
      return (prev as SkuRowCache[]).map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      ) as never;
    });
  };

  const updateMut = trpc.skuSheet.update.useMutation({
    // Sem onSuccess->invalidate: a tela já refletiu via patch otimista.
    onError: () => {
      toast.error("Não foi possível salvar a alteração");
      utils.skuSheet.list.invalidate();
    },
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
    onError: () => {
      toast.error("Não foi possível salvar o valor");
      utils.skuSheet.list.invalidate();
    },
  });

  const binding: SkuStyleBinding = {
    rows: rows as SkuStyleBinding["rows"],
    isLoading,
    categories: categories as SkuStyleBinding["categories"],
    customColumns,
    update: (input) => {
      const { id, ...patch } = input as { id: number } & Record<string, unknown>;
      patchRowInCache(id, patch); // reflete na hora
      updateMut.mutate(input as never); // persiste em background
    },
    create: (input) => createMut.mutate(input as never),
    remove: (id) => deleteMut.mutate({ id }),
    createColumn: (name) => createColMut.mutate({ name }),
    renameColumn: (id, name) => renameColMut.mutate({ id, name }),
    deleteColumn: (id) => deleteColMut.mutate({ id }),
    setCustomValue: (rowId, columnId, value) => {
      // Atualiza o JSON de customValues no cache antes de persistir.
      utils.skuSheet.list.setData(undefined, (prev) => {
        if (!prev) return prev;
        return (prev as SkuRowCache[]).map((r) => {
          if (r.id !== rowId) return r;
          let parsed: Record<string, string> = {};
          try {
            parsed = r.customValues ? (JSON.parse(r.customValues) as Record<string, string>) : {};
          } catch {
            parsed = {};
          }
          parsed[String(columnId)] = value;
          return { ...r, customValues: JSON.stringify(parsed) };
        }) as never;
      });
      setCustomValueMut.mutate({ rowId, columnId, value });
    },
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
