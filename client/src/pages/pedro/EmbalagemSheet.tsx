import { trpc } from "@/lib/trpc";
import GenericSheet, { type ColumnDef, type GenericRow, type SheetApi } from "./GenericSheet";
import SheetTabs from "./SheetTabs";

const COLUMNS: ColumnDef[] = [
  { field: "produto", label: "Produto", kind: "area", minWidth: "min-w-[240px]" },
  { field: "eanGtin", label: "EAN/GTIN", kind: "text", minWidth: "min-w-[140px]", mono: true },
  { field: "sku", label: "SKU", kind: "text", minWidth: "min-w-[200px]", mono: true },
  { field: "embalagem", label: "Embalagem", kind: "text", minWidth: "min-w-[130px]" },
  { field: "ncm", label: "NCM", kind: "text", minWidth: "min-w-[100px]", mono: true },
  { field: "gpc", label: "GPC", kind: "text", minWidth: "min-w-[100px]", mono: true },
  { field: "cest", label: "CEST", kind: "text", minWidth: "min-w-[90px]", mono: true },
  { field: "precoClassico", label: "Preço Clássico", kind: "text", minWidth: "min-w-[110px]" },
  { field: "precoPremium", label: "Preço Premium", kind: "text", minWidth: "min-w-[110px]" },
  { field: "altura", label: "Altura", kind: "text", minWidth: "min-w-[100px]" },
  { field: "largura", label: "Largura", kind: "text", minWidth: "min-w-[100px]" },
  { field: "comprimento", label: "Comprimento", kind: "text", minWidth: "min-w-[120px]" },
  { field: "kg", label: "KG", kind: "text", minWidth: "min-w-[90px]" },
  { field: "categoria", label: "Categoria", kind: "text", minWidth: "min-w-[110px]" },
  { field: "observacao", label: "Observação", kind: "area", minWidth: "min-w-[200px]" },
];

const SEARCH_FIELDS = ["produto", "sku", "eanGtin", "categoria"];

export default function EmbalagemSheet() {
  const utils = trpc.useUtils();
  const rowsQuery = trpc.embalagemSheet.list.useQuery();
  const colsQuery = trpc.embalagemSheet.listCustomColumns.useQuery();

  const update = trpc.embalagemSheet.update.useMutation({
    onSuccess: () => utils.embalagemSheet.list.invalidate(),
  });
  const create = trpc.embalagemSheet.create.useMutation({
    onSuccess: () => utils.embalagemSheet.list.invalidate(),
  });
  const remove = trpc.embalagemSheet.delete.useMutation({
    onSuccess: () => utils.embalagemSheet.list.invalidate(),
  });
  const createColumn = trpc.embalagemSheet.createCustomColumn.useMutation({
    onSuccess: () => utils.embalagemSheet.listCustomColumns.invalidate(),
  });
  const renameColumn = trpc.embalagemSheet.renameCustomColumn.useMutation({
    onSuccess: () => utils.embalagemSheet.listCustomColumns.invalidate(),
  });
  const deleteColumn = trpc.embalagemSheet.deleteCustomColumn.useMutation({
    onSuccess: () => {
      utils.embalagemSheet.listCustomColumns.invalidate();
      utils.embalagemSheet.list.invalidate();
    },
  });
  const setCustomValue = trpc.embalagemSheet.setCustomValue.useMutation({
    onSuccess: () => utils.embalagemSheet.list.invalidate(),
  });

  const api: SheetApi = {
    rows: rowsQuery.data as GenericRow[] | undefined,
    isLoading: rowsQuery.isLoading,
    customColumns: colsQuery.data,
    invalidate: () => utils.embalagemSheet.list.invalidate(),
    invalidateColumns: () => utils.embalagemSheet.listCustomColumns.invalidate(),
    update: (input) => update.mutate(input as never),
    create: (input) => create.mutate(input as never),
    remove: (id) => remove.mutate({ id }),
    createColumn: (name) => createColumn.mutate({ name }),
    renameColumn: (id, name) => renameColumn.mutate({ id, name }),
    deleteColumn: (id) => deleteColumn.mutate({ id }),
    setCustomValue: (rowId, columnId, value) => setCustomValue.mutate({ rowId, columnId, value }),
    creatingColumn: createColumn.isPending,
  };

  return (
    <GenericSheet
      title="Embalagens"
      subtitle="materiais de embalagem"
      headColor="#1e3a5f"
      columns={COLUMNS}
      searchFields={SEARCH_FIELDS}
      backTo="/pedro-timeline"
      tabsSlot={<SheetTabs />}
      api={api}
    />
  );
}
