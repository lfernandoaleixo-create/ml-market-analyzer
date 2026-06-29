import { trpc } from "@/lib/trpc";
import GenericSheet, { type ColumnDef, type GenericRow, type SheetApi } from "./GenericSheet";

const COLUMNS: ColumnDef[] = [
  { field: "cadastradoMl", label: "Cadastrado ML", kind: "text", minWidth: "min-w-[120px]" },
  { field: "kit", label: "Kit", kind: "area", minWidth: "min-w-[280px]" },
  { field: "eanGtin", label: "EAN/GTIN", kind: "text", minWidth: "min-w-[140px]", mono: true },
  { field: "sku", label: "SKU", kind: "text", minWidth: "min-w-[170px]", mono: true },
  { field: "embalagem", label: "Embalagem", kind: "text", minWidth: "min-w-[130px]" },
  { field: "ncm", label: "NCM", kind: "text", minWidth: "min-w-[100px]", mono: true },
  { field: "precoClassico", label: "Preço Clássico", kind: "text", minWidth: "min-w-[110px]" },
  { field: "precoPremium", label: "Preço Premium", kind: "text", minWidth: "min-w-[110px]" },
  { field: "profundidade", label: "Profundidade", kind: "text", minWidth: "min-w-[90px]" },
  { field: "largura", label: "Largura", kind: "text", minWidth: "min-w-[80px]" },
  { field: "alturaComprimento", label: "Altura/Compr.", kind: "text", minWidth: "min-w-[90px]" },
  { field: "kg", label: "KG", kind: "text", minWidth: "min-w-[70px]" },
  { field: "categoria", label: "Categoria", kind: "text", minWidth: "min-w-[110px]" },
  { field: "dimensoesGs1", label: "Dimensões GS1", kind: "text", minWidth: "min-w-[100px]" },
  { field: "baseAjustado", label: "Base Ajustado", kind: "text", minWidth: "min-w-[100px]" },
  { field: "mlAjustado", label: "ML Ajustado", kind: "text", minWidth: "min-w-[100px]" },
  { field: "formadoPor", label: "Formado por", kind: "area", minWidth: "min-w-[220px]" },
  { field: "observacao", label: "Observação", kind: "area", minWidth: "min-w-[200px]" },
];

const SEARCH_FIELDS = ["kit", "sku", "eanGtin", "categoria", "formadoPor"];

export default function KitSheet() {
  const utils = trpc.useUtils();
  const rowsQuery = trpc.kitSheet.list.useQuery();
  const colsQuery = trpc.kitSheet.listCustomColumns.useQuery();

  const update = trpc.kitSheet.update.useMutation({
    onSuccess: () => utils.kitSheet.list.invalidate(),
  });
  const create = trpc.kitSheet.create.useMutation({
    onSuccess: () => utils.kitSheet.list.invalidate(),
  });
  const remove = trpc.kitSheet.delete.useMutation({
    onSuccess: () => utils.kitSheet.list.invalidate(),
  });
  const createColumn = trpc.kitSheet.createCustomColumn.useMutation({
    onSuccess: () => utils.kitSheet.listCustomColumns.invalidate(),
  });
  const renameColumn = trpc.kitSheet.renameCustomColumn.useMutation({
    onSuccess: () => utils.kitSheet.listCustomColumns.invalidate(),
  });
  const deleteColumn = trpc.kitSheet.deleteCustomColumn.useMutation({
    onSuccess: () => {
      utils.kitSheet.listCustomColumns.invalidate();
      utils.kitSheet.list.invalidate();
    },
  });
  const setCustomValue = trpc.kitSheet.setCustomValue.useMutation({
    onSuccess: () => utils.kitSheet.list.invalidate(),
  });

  const api: SheetApi = {
    rows: rowsQuery.data as GenericRow[] | undefined,
    isLoading: rowsQuery.isLoading,
    customColumns: colsQuery.data,
    invalidate: () => utils.kitSheet.list.invalidate(),
    invalidateColumns: () => utils.kitSheet.listCustomColumns.invalidate(),
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
      title="Kits"
      subtitle="composições de produtos"
      headColor="#0f3d3e"
      columns={COLUMNS}
      searchFields={SEARCH_FIELDS}
      backTo="/pedro-timeline"
      api={api}
    />
  );
}
