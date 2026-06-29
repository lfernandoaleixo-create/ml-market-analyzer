import { useLocation } from "wouter";
import { useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Table2,
  Search,
  Palette,
  Check,
  Pencil,
  Columns3,
  X,
  Download,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportToExcel, exportToPdf, type ExportColumn } from "./sheetExport";
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
import {
  TIPO_SKU_OPTIONS,
  CADASTRADO_ML_OPTIONS,
  buildSku,
  buildSkuKit,
  resolveProductNumber,
} from "../../../../shared/skuSheet";
import SheetTabs from "./SheetTabs";

type SkuRow = {
  id: number;
  position: number;
  productNumber: number | null;
  variantNumber: number | null;
  cadastradoMl: string;
  tipoSku: string;
  categoryId: string | null;
  categoryName: string | null;
  subCategoryId: string | null;
  subCategoryName: string | null;
  produto: string;
  variante: string;
  sku: string;
  gerarSkuKit: boolean;
  skuKit: string;
  eanGtin: string;
  ncm: string;
  gpc: string;
  cest: string;
  precoClassico: string;
  precoPremium: string;
  precoAtacado: string;
  embProfundidade: string;
  embLargura: string;
  embAltura: string;
  embPeso: string;
  caracteristicas: string | null;
  rowColor: string;
  customValues: string | null;
};

type CustomColumn = {
  id: number;
  name: string;
  position: number;
};

type CategoryNode = { id: string; name: string; children: { id: string; name: string }[] };

/**
 * Binding com tudo que a planilha precisa do backend. Cada "dono" da planilha
 * (Planilha SKU ou Kits) cria suas próprias hooks tRPC e injeta aqui, de modo
 * que o MESMO componente visual sirva para os dois (mesmo layout/colunas),
 * apenas trocando a fonte de dados.
 */
export type SkuStyleBinding = {
  rows: SkuRow[] | undefined;
  isLoading: boolean;
  categories: CategoryNode[] | undefined;
  customColumns: CustomColumn[] | undefined;
  update: (input: { id: number } & Partial<SkuRow>) => void;
  create: (input: Partial<SkuRow>) => void;
  remove: (id: number) => void;
  createColumn: (name: string) => void;
  renameColumn: (id: number, name: string) => void;
  deleteColumn: (id: number) => void;
  setCustomValue: (rowId: number, columnId: number, value: string) => void;
  createPending: boolean;
};

export type SkuStyleSheetProps = {
  binding: SkuStyleBinding;
  title: string;
  subtitle: string;
  exportTitle: string;
  /** Ações extras no cabeçalho (ex.: botão Migrar para SKU). */
  headerExtra?: ReactNode;
};

/** Lê o JSON de valores personalizados de uma linha com segurança. */
function parseCustomValues(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const CADASTRADO_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  ATIVO: { bg: "color-mix(in oklch, #16a34a 14%, transparent)", text: "#15803d", border: "color-mix(in oklch, #16a34a 38%, transparent)" },
  PENDENTE: { bg: "color-mix(in oklch, #ca8a04 18%, transparent)", text: "#a16207", border: "color-mix(in oklch, #ca8a04 38%, transparent)" },
  PAUSADO: { bg: "color-mix(in oklch, #0ea5e9 18%, transparent)", text: "#0284c7", border: "color-mix(in oklch, #0ea5e9 38%, transparent)" },
  EXCLUIDO: { bg: "color-mix(in oklch, #e11d48 14%, transparent)", text: "#be123c", border: "color-mix(in oklch, #e11d48 38%, transparent)" },
};

// Paleta estilo Excel para colorir linhas. value vazio = sem cor.
const ROW_COLORS: { value: string; label: string; swatch: string; bg: string }[] = [
  { value: "", label: "Sem cor", swatch: "transparent", bg: "transparent" },
  { value: "red", label: "Vermelho", swatch: "#ef4444", bg: "color-mix(in oklch, #ef4444 12%, transparent)" },
  { value: "orange", label: "Laranja", swatch: "#f97316", bg: "color-mix(in oklch, #f97316 13%, transparent)" },
  { value: "yellow", label: "Amarelo", swatch: "#eab308", bg: "color-mix(in oklch, #eab308 16%, transparent)" },
  { value: "green", label: "Verde", swatch: "#22c55e", bg: "color-mix(in oklch, #22c55e 13%, transparent)" },
  { value: "teal", label: "Turquesa", swatch: "#14b8a6", bg: "color-mix(in oklch, #14b8a6 13%, transparent)" },
  { value: "blue", label: "Azul", swatch: "#3b82f6", bg: "color-mix(in oklch, #3b82f6 12%, transparent)" },
  { value: "purple", label: "Roxo", swatch: "#a855f7", bg: "color-mix(in oklch, #a855f7 12%, transparent)" },
  { value: "pink", label: "Rosa", swatch: "#ec4899", bg: "color-mix(in oklch, #ec4899 12%, transparent)" },
  { value: "gray", label: "Cinza", swatch: "#6b7280", bg: "color-mix(in oklch, #6b7280 14%, transparent)" },
];

const ROW_COLOR_MAP = Object.fromEntries(ROW_COLORS.map((c) => [c.value, c]));

export default function SkuStyleSheet({ binding, title, subtitle, exportTitle, headerExtra }: SkuStyleSheetProps) {
  const [, setLocation] = useLocation();
  const rows = binding.rows;
  const isLoading = binding.isLoading;
  const categories = binding.categories;
  const customColumns = binding.customColumns;
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  // Modal de edição da linha inteira.
  const [editRowId, setEditRowId] = useState<number | null>(null);
  // Painel de gerenciamento das colunas personalizadas.
  const [manageColumns, setManageColumns] = useState(false);
  const [deleteColumnId, setDeleteColumnId] = useState<number | null>(null);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Adaptadores: chamam o binding fornecido pelo dono da planilha.
  const updateMut = { mutate: (input: { id: number } & Partial<SkuRow>) => binding.update(input) };
  const createMut = { mutate: (input: Partial<SkuRow>) => binding.create(input), isPending: binding.createPending };
  const deleteMut = { mutate: ({ id }: { id: number }) => { binding.remove(id); setDeleteId(null); } };
  const createColMut = { mutate: ({ name }: { name: string }) => binding.createColumn(name), isPending: false };
  const renameColMut = { mutate: ({ id, name }: { id: number; name: string }) => binding.renameColumn(id, name) };
  const deleteColMut = { mutate: ({ id }: { id: number }) => { binding.deleteColumn(id); setDeleteColumnId(null); } };
  const setCustomValueMut = { mutate: ({ rowId, columnId, value }: { rowId: number; columnId: number; value: string }) => binding.setCustomValue(rowId, columnId, value) };

  const cols: CustomColumn[] = customColumns ?? [];
  const editingRow = (rows ?? []).find((r) => r.id === editRowId) ?? null;
  const deletingColumn = cols.find((c) => c.id === deleteColumnId) ?? null;

  // Salva (debounce) o valor de uma coluna personalizada por linha.
  const customSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveCustomValue = useCallback(
    (rowId: number, columnId: number, value: string, delay = 600) => {
      const key = `${rowId}:c${columnId}`;
      if (customSaveTimers.current[key]) clearTimeout(customSaveTimers.current[key]);
      customSaveTimers.current[key] = setTimeout(() => {
        setCustomValueMut.mutate({ rowId, columnId, value });
      }, delay);
    },
    [setCustomValueMut],
  );

  const scheduleSave = useCallback(
    (id: number, patch: Partial<SkuRow>, key: string, delay = 600) => {
      const timerKey = `${id}:${key}`;
      if (saveTimers.current[timerKey]) clearTimeout(saveTimers.current[timerKey]);
      saveTimers.current[timerKey] = setTimeout(() => {
        updateMut.mutate({ id, ...patch } as never);
      }, delay);
    },
    [updateMut],
  );

  const saveNow = useCallback(
    (id: number, patch: Partial<SkuRow>) => {
      updateMut.mutate({ id, ...patch } as never);
    },
    [updateMut],
  );

  const filtered = useMemo(() => {
    const list = rows ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (r) =>
        r.produto.toLowerCase().includes(q) ||
        r.variante.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.eanGtin.toLowerCase().includes(q) ||
        r.ncm.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const handleAdd = () => {
    const maxProduct = (rows ?? []).reduce((m, r) => Math.max(m, r.productNumber ?? 0), 0);
    createMut.mutate({ productNumber: maxProduct + 1, variantNumber: 1, tipoSku: "2" });
  };

  // Monta as colunas de exportação do SKU (fixas + personalizadas).
  const buildExportColumns = useCallback((): ExportColumn[] => {
    const tipoLabel = (v: string) =>
      TIPO_SKU_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "";
    const cadLabel = (v: string) =>
      CADASTRADO_ML_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "";
    const out: ExportColumn[] = [
      { label: "#", value: (_r, i) => String(i + 1) },
      { label: "Cadastrado ML", value: (r) => cadLabel(String(r.cadastradoMl ?? "")) },
      { label: "Tipo SKU", value: (r) => tipoLabel(String(r.tipoSku ?? "")) },
      { label: "Categoria", value: (r) => String(r.categoryName ?? "") },
      { label: "Subcategoria", value: (r) => String(r.subCategoryName ?? "") },
      { label: "Nº Produto", value: (r) => (r.productNumber == null ? "" : String(r.productNumber)) },
      { label: "Produto", value: (r) => String(r.produto ?? "") },
      { label: "Nº Variante", value: (r) => (r.variantNumber == null ? "" : String(r.variantNumber)) },
      { label: "Variante", value: (r) => String(r.variante ?? "") },
      { label: "SKU", value: (r) => String(r.sku ?? "") },
      { label: "Gerar Kit?", value: (r) => (r.gerarSkuKit ? "Sim" : "Não") },
      { label: "SKU Kit", value: (r) => String(r.skuKit ?? "") },
      { label: "EAN/GTIN", value: (r) => String(r.eanGtin ?? "") },
      { label: "NCM", value: (r) => String(r.ncm ?? "") },
      { label: "GPC", value: (r) => String(r.gpc ?? "") },
      { label: "CEST", value: (r) => String(r.cest ?? "") },
      { label: "Preço Clássico", value: (r) => String(r.precoClassico ?? "") },
      { label: "Preço Premium", value: (r) => String(r.precoPremium ?? "") },
      { label: "Preço Atacado", value: (r) => String(r.precoAtacado ?? "") },
      { label: "Emb. Prof.", value: (r) => String(r.embProfundidade ?? "") },
      { label: "Emb. Larg.", value: (r) => String(r.embLargura ?? "") },
      { label: "Emb. Alt.", value: (r) => String(r.embAltura ?? "") },
      { label: "Peso (kg)", value: (r) => String(r.embPeso ?? "") },
      { label: "Características", value: (r) => String(r.caracteristicas ?? "") },
    ];
    for (const cc of cols) {
      out.push({
        label: cc.name || "(sem nome)",
        value: (r) => parseCustomValues(r.customValues as string | null)[String(cc.id)] ?? "",
      });
    }
    return out;
  }, [cols]);

  const handleExportExcel = useCallback(() => {
    exportToExcel(exportTitle, buildExportColumns(), filtered as unknown as Record<string, unknown>[]);
    toast.success("Excel exportado.");
  }, [buildExportColumns, filtered, exportTitle]);

  const handleExportPdf = useCallback(() => {
    exportToPdf(exportTitle, buildExportColumns(), filtered as unknown as Record<string, unknown>[]);
    toast.success("PDF exportado.");
  }, [buildExportColumns, filtered, exportTitle]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const deletingRow = (rows ?? []).find((r) => r.id === deleteId);

  return (
    <div className="space-y-5">
      <SheetTabs />
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => setLocation("/pedro-timeline/timeline")}
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Voltar
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary/12 flex items-center justify-center">
              <Table2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-display font-semibold text-foreground leading-tight">{title}</h2>
              <p className="text-xs text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? "item" : "itens"} · {subtitle}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto, SKU, EAN, NCM…"
              className="h-9 pl-8 w-60"
            />
          </div>
          <Button size="sm" variant="outline" className="h-9 bg-card" onClick={() => setManageColumns(true)}>
            <Columns3 className="w-4 h-4 mr-1.5" />
            Colunas
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-9 bg-card">
                <Download className="w-4 h-4 mr-1.5" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportExcel}>
                <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" />
                Exportar Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf}>
                <FileText className="w-4 h-4 mr-2 text-red-600" />
                Exportar PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {headerExtra}
          <Button size="sm" className="h-9" onClick={handleAdd} disabled={createMut.isPending}>
            <Plus className="w-4 h-4 mr-1.5" />
            Nova linha
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        {/* zoom levemente reduzido p/ caber mais colunas e deixar as linhas mais baixas */}
        <div className="overflow-x-auto" style={{ zoom: 0.85 } as React.CSSProperties}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-white">
                <Th className="sticky left-0 z-20 w-12 text-center" style={{ background: "var(--sku-head)" }}>#</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[140px]">Cadastrado ML</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[120px]">Tipo SKU</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[180px]">Categoria</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[180px]">Subcategoria</Th>
                <Th style={{ background: "var(--sku-head)" }} className="w-10 text-center">Nº</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[280px]">Produto</Th>
                <Th style={{ background: "var(--sku-head)" }} className="w-10 text-center">Nº</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[240px]">Variante</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[120px]">SKU</Th>
                <Th style={{ background: "var(--sku-head)" }} className="text-center">Gerar Kit?</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[170px] whitespace-nowrap">SKU Kit</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[140px]">EAN/GTIN</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[110px]">NCM</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[90px]">GPC</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[90px]">CEST</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[110px]">Preço Clássico</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[110px]">Preço Premium</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[110px]">Preço Atacado</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[80px]">Emb. Prof.</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[80px]">Emb. Larg.</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[80px]">Emb. Alt.</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[90px]">Peso (kg)</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[220px]">Características</Th>
                {cols.map((c) => (
                  <Th key={c.id} style={{ background: "var(--sku-head)" }} className="min-w-[160px]">
                    {c.name || "(sem nome)"}
                  </Th>
                ))}
                <Th style={{ background: "var(--sku-head)" }} className="w-24 text-center sticky right-0 z-20">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <SkuRowEditor
                  key={row.id}
                  row={row as SkuRow}
                  index={idx}
                  categories={categories ?? []}
                  allRows={(rows ?? []) as SkuRow[]}
                  customColumns={cols}
                  onField={scheduleSave}
                  onFieldNow={saveNow}
                  onDelete={() => setDeleteId(row.id)}
                  onEdit={() => setEditRowId(row.id)}
                  onCustomValue={saveCustomValue}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={25 + cols.length} className="text-center py-12 text-muted-foreground">
                    {search ? "Nenhum item encontrado para a busca." : "Nenhum item ainda. Clique em “Nova linha”."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Estilos locais: cor do cabeçalho da planilha */}
      <style>{`:root { --sku-head: #0f3b4c; } .dark { --sku-head: #0b2d3a; }`}</style>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir linha?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingRow?.produto || "Esta linha"} {deletingRow?.variante ? `(${deletingRow.variante})` : ""} será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate({ id: deleteId })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: gerenciar colunas personalizadas */}
      <ManageColumnsDialog
        open={manageColumns}
        onOpenChange={setManageColumns}
        columns={cols}
        onCreate={(name) => createColMut.mutate({ name })}
        onRename={(id, name) => renameColMut.mutate({ id, name })}
        onAskDelete={(id) => setDeleteColumnId(id)}
        creating={createColMut.isPending}
      />

      {/* Modal: editar linha inteira */}
      <EditRowDialog
        key={editingRow?.id ?? "none"}
        row={editingRow}
        categories={categories ?? []}
        allRows={(rows ?? []) as SkuRow[]}
        customColumns={cols}
        onClose={() => setEditRowId(null)}
        onSave={(id, patch) => saveNow(id, patch)}
        onSaveCustom={(rowId, columnId, value) => setCustomValueMut.mutate({ rowId, columnId, value })}
      />

      {/* Confirmação: excluir coluna personalizada */}
      <AlertDialog open={deleteColumnId !== null} onOpenChange={(o) => !o && setDeleteColumnId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir coluna?</AlertDialogTitle>
            <AlertDialogDescription>
              A coluna “{deletingColumn?.name || "(sem nome)"}” e todos os valores preenchidos nela serão removidos de todas as linhas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteColumnId && deleteColMut.mutate({ id: deleteColumnId })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Th({
  children,
  className = "",
  style,
}: {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <th
      style={style}
      className={`text-left font-semibold px-3 py-3 align-middle whitespace-nowrap ${className}`}
    >
      {children}
    </th>
  );
}

// ─── Linha editável ──────────────────────────────────────────────────────────
type RowEditorProps = {
  row: SkuRow;
  index: number;
  categories: { id: string; name: string; children: { id: string; name: string }[] }[];
  allRows: SkuRow[];
  customColumns: CustomColumn[];
  onField: (id: number, patch: Partial<SkuRow>, key: string, delay?: number) => void;
  onFieldNow: (id: number, patch: Partial<SkuRow>) => void;
  onDelete: () => void;
  onEdit: () => void;
  onCustomValue: (rowId: number, columnId: number, value: string, delay?: number) => void;
};

function SkuRowEditor({ row, index, categories, allRows, customColumns, onField, onFieldNow, onDelete, onEdit, onCustomValue }: RowEditorProps) {
  const [local, setLocal] = useState<SkuRow>(row);

  const rowRef = useRef(row);
  if (rowRef.current.id !== row.id || rowRef.current.rowColor !== row.rowColor) {
    rowRef.current = row;
    // Mantém edições de texto em andamento, mas sincroniza a cor escolhida.
    setLocal((p) => ({ ...p, rowColor: row.rowColor }));
  }

  const set = (patch: Partial<SkuRow>) => setLocal((p) => ({ ...p, ...patch }));

  // Valores das colunas personalizadas desta linha (estado local p/ digitar sem travar).
  const [customVals, setCustomVals] = useState<Record<string, string>>(() => parseCustomValues(row.customValues));
  const customRef = useRef(row.customValues);
  if (customRef.current !== row.customValues) {
    customRef.current = row.customValues;
    setCustomVals(parseCustomValues(row.customValues));
  }

  // Recalcula SKU e SKU Kit a partir do estado resultante (após aplicar o patch).
  // Os campos SKU e SKU Kit são DERIVADOS automaticamente da regra:
  // SKU = [Nº TIPO]-[CATEGORIA abreviada]-[Nº produto]-[Nº variante]
  // SKU Kit = SKU + "-KITINS" (somente quando "Gerar Kit?" estiver marcado).
  const applyDerived = (patch: Partial<SkuRow>) => {
    const next = { ...local, ...patch };
    const sku = buildSku({
      tipoSku: next.tipoSku,
      categoryName: next.categoryName,
      productNumber: next.productNumber,
      variantNumber: next.variantNumber,
    });
    const skuKit = buildSkuKit(sku, next.gerarSkuKit);
    const full: Partial<SkuRow> = { ...patch, sku, skuKit };
    set(full);
    onFieldNow(row.id, full);
  };

  // Campo de texto multilinha (cresce conforme o conteúdo, sem cortar).
  const area = (
    field: keyof SkuRow,
    opts?: { className?: string; placeholder?: string; minWidth?: string },
  ) => (
    <textarea
      rows={1}
      value={(local[field] as string) ?? ""}
      onChange={(e) => {
        set({ [field]: e.target.value } as Partial<SkuRow>);
        onField(row.id, { [field]: e.target.value } as Partial<SkuRow>, String(field));
        autoGrow(e.target);
      }}
      ref={(el) => { if (el) autoGrow(el); }}
      placeholder={opts?.placeholder}
      className={`w-full bg-transparent px-2 py-1.5 rounded-md outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-sm resize-none leading-snug break-words whitespace-pre-wrap overflow-hidden ${opts?.className ?? ""}`}
      style={opts?.minWidth ? { minWidth: opts.minWidth } : undefined}
    />
  );

  // Campo do NOME do produto: ao terminar de digitar (blur) resolve o Nº do
  // produto automaticamente — reaproveita o Nº de um produto de mesmo nome ou
  // atribui o próximo da sequência. Em seguida recalcula o SKU.
  const resolveAndApplyProductNumber = (produto: string) => {
    const num = resolveProductNumber(
      allRows.map((r) => ({ id: r.id, produto: r.produto, productNumber: r.productNumber })),
      row.id,
      produto,
    );
    applyDerived({ produto, productNumber: num });
  };

  const productNameField = () => (
    <textarea
      rows={1}
      value={local.produto ?? ""}
      onChange={(e) => {
        set({ produto: e.target.value });
        onField(row.id, { produto: e.target.value }, "produto");
        autoGrow(e.target);
      }}
      onBlur={(e) => resolveAndApplyProductNumber(e.target.value)}
      ref={(el) => { if (el) autoGrow(el); }}
      placeholder="Nome do produto"
      className="w-full bg-transparent px-2 py-1.5 rounded-md outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-sm resize-none leading-snug break-words whitespace-pre-wrap overflow-hidden font-semibold text-foreground"
    />
  );

  // Campo de texto curto (1 linha, mas largura total da célula).
  const text = (field: keyof SkuRow, opts?: { className?: string; placeholder?: string }) => (
    <input
      value={(local[field] as string) ?? ""}
      onChange={(e) => {
        set({ [field]: e.target.value } as Partial<SkuRow>);
        onField(row.id, { [field]: e.target.value } as Partial<SkuRow>, String(field));
      }}
      placeholder={opts?.placeholder}
      className={`w-full bg-transparent px-2 py-1.5 rounded-md outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-sm ${opts?.className ?? ""}`}
    />
  );

  // Campo derivado (somente leitura): exibe valor calculado automaticamente.
  const derived = (field: "sku" | "skuKit") => {
    const val = (local[field] as string) ?? "";
    return (
      <div
        className={`w-full px-2 py-1.5 rounded-md font-mono text-xs select-all whitespace-nowrap ${
          val ? "text-foreground font-semibold" : "text-muted-foreground/50 italic"
        }`}
        title={val ? "Gerado automaticamente" : "Preencha Tipo, Categoria e números"}
      >
        {val || "auto"}
      </div>
    );
  };

  const numField = (field: "productNumber" | "variantNumber") => (
    <input
      value={(local[field] ?? "") as number | string}
      onChange={(e) => {
        const v = e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, ""));
        applyDerived({ [field]: v } as Partial<SkuRow>);
      }}
      className="w-9 text-center bg-transparent px-1 py-1.5 rounded-md outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-sm font-bold text-primary"
    />
  );

  // Nº do produto: derivado automaticamente do nome (somente leitura).
  const productNumberDisplay = () => (
    <div
      className={`w-9 mx-auto text-center px-1 py-1.5 text-sm font-bold ${
        local.productNumber != null ? "text-primary" : "text-muted-foreground/40 italic"
      }`}
      title="Definido automaticamente pelo nome do produto"
    >
      {local.productNumber ?? "—"}
    </div>
  );

  const subcats = categories.find((c) => c.id === local.categoryId)?.children ?? [];
  const cadStyle = CADASTRADO_STYLE[local.cadastradoMl];
  const colorBg = ROW_COLOR_MAP[local.rowColor]?.bg ?? "transparent";
  // Zebra apenas quando não há cor definida pelo usuário.
  const zebra = local.rowColor ? colorBg : index % 2 === 1 ? "color-mix(in oklch, var(--muted) 40%, transparent)" : "transparent";

  return (
    <tr className="border-b border-border/60 align-top transition-colors" style={{ background: zebra }}>
      <td
        className="sticky left-0 z-10 px-3 py-2 text-xs text-muted-foreground font-semibold border-r border-border/40 text-center"
        style={{ background: local.rowColor ? colorBg : "var(--card)" }}
      >
        {index + 1}
      </td>

      {/* Cadastrado ML */}
      <td className="px-2 py-2">
        <select
          value={local.cadastradoMl}
          onChange={(e) => {
            set({ cadastradoMl: e.target.value });
            onFieldNow(row.id, { cadastradoMl: e.target.value });
          }}
          className="w-full rounded-md px-2 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
          style={
            cadStyle
              ? { background: cadStyle.bg, color: cadStyle.text, border: `1px solid ${cadStyle.border}` }
              : { background: "var(--background)", border: "1px solid var(--border)" }
          }
        >
          <option value="">—</option>
          {CADASTRADO_ML_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </td>

      {/* Tipo SKU */}
      <td className="px-2 py-2">
        <select
          value={local.tipoSku}
          onChange={(e) => {
            applyDerived({ tipoSku: e.target.value });
          }}
          className="w-full rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer border border-border bg-background"
        >
          <option value="">—</option>
          {TIPO_SKU_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </td>

      {/* Categoria (cascata) */}
      <td className="px-2 py-2">
        <select
          value={local.categoryId ?? ""}
          onChange={(e) => {
            const cat = categories.find((c) => c.id === e.target.value);
            const patch: Partial<SkuRow> = {
              categoryId: cat?.id ?? null,
              categoryName: cat?.name ?? null,
              subCategoryId: null,
              subCategoryName: null,
            };
            applyDerived(patch);
          }}
          className="w-full rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer border border-border bg-background"
        >
          <option value="">— selecionar —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </td>

      {/* Subcategoria (limitada pela categoria) */}
      <td className="px-2 py-2">
        <select
          value={local.subCategoryId ?? ""}
          disabled={!local.categoryId}
          onChange={(e) => {
            const sub = subcats.find((s) => s.id === e.target.value);
            const patch: Partial<SkuRow> = {
              subCategoryId: sub?.id ?? null,
              subCategoryName: sub?.name ?? null,
            };
            set(patch);
            onFieldNow(row.id, patch);
          }}
          className="w-full rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer border border-border bg-background disabled:opacity-50"
        >
          <option value="">{local.categoryId ? "— selecionar —" : "escolha a categoria"}</option>
          {subcats.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </td>

      {/* Nº produto (derivado automaticamente do nome) */}
      <td className="px-1 py-2 text-center">{productNumberDisplay()}</td>
      {/* Produto (nome -> resolve Nº do produto no blur) */}
      <td className="px-1 py-2">{productNameField()}</td>
      {/* Nº variante */}
      <td className="px-1 py-2 text-center">{numField("variantNumber")}</td>
      {/* Variante (texto completo) */}
      <td className="px-1 py-2">{area("variante")}</td>

      {/* SKU (derivado automaticamente) */}
      <td className="px-1 py-2">{derived("sku")}</td>

      {/* Gerar SKU Kit? */}
      <td className="px-2 py-2 text-center">
        <input
          type="checkbox"
          checked={local.gerarSkuKit}
          onChange={(e) => {
            applyDerived({ gerarSkuKit: e.target.checked });
          }}
          className="w-4 h-4 accent-[var(--primary)] cursor-pointer"
        />
      </td>
      {/* SKU Kit (derivado automaticamente) */}
      <td className="px-1 py-2">{derived("skuKit")}</td>

      {/* EAN/GTIN */}
      <td className="px-1 py-2">{text("eanGtin", { className: "font-mono text-xs" })}</td>
      {/* NCM (texto completo) */}
      <td className="px-1 py-2">{area("ncm", { className: "font-mono text-xs" })}</td>
      {/* GPC */}
      <td className="px-1 py-2">{text("gpc", { className: "font-mono text-xs" })}</td>
      {/* CEST */}
      <td className="px-1 py-2">{text("cest", { className: "font-mono text-xs" })}</td>

      {/* Preços */}
      <td className="px-1 py-2">{text("precoClassico", { placeholder: "R$", className: "text-right tabular-nums" })}</td>
      <td className="px-1 py-2">{text("precoPremium", { placeholder: "R$", className: "text-right tabular-nums" })}</td>
      <td className="px-1 py-2">{text("precoAtacado", { placeholder: "R$", className: "text-right tabular-nums" })}</td>

      {/* Embalagem */}
      <td className="px-1 py-2">{text("embProfundidade", { className: "text-center tabular-nums" })}</td>
      <td className="px-1 py-2">{text("embLargura", { className: "text-center tabular-nums" })}</td>
      <td className="px-1 py-2">{text("embAltura", { className: "text-center tabular-nums" })}</td>
      <td className="px-1 py-2">{text("embPeso", { className: "text-center tabular-nums" })}</td>

      {/* Características (texto completo) */}
      <td className="px-1 py-2">{area("caracteristicas")}</td>

      {/* Colunas personalizadas (texto livre) */}
      {customColumns.map((c) => (
        <td key={c.id} className="px-1 py-2">
          <textarea
            rows={1}
            value={customVals[String(c.id)] ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setCustomVals((p) => ({ ...p, [String(c.id)]: v }));
              onCustomValue(row.id, c.id, v);
              autoGrow(e.target);
            }}
            ref={(el) => { if (el) autoGrow(el); }}
            className="w-full bg-transparent px-2 py-1.5 rounded-md outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-sm resize-none leading-snug break-words whitespace-pre-wrap overflow-hidden"
          />
        </td>
      ))}

      {/* Ações: editar + cor da linha + excluir */}
      <td className="px-2 py-2 sticky right-0 z-10" style={{ background: local.rowColor ? colorBg : "var(--card)" }}>
        <div className="flex items-center justify-center gap-0.5">
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Editar linha" onClick={onEdit}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Cor da linha"
              >
                <Palette className="w-4 h-4" style={{ color: ROW_COLOR_MAP[local.rowColor]?.swatch !== "transparent" ? ROW_COLOR_MAP[local.rowColor]?.swatch : undefined }} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="end">
              <p className="text-xs font-medium text-muted-foreground px-1 pb-1.5">Cor da linha</p>
              <div className="grid grid-cols-5 gap-1.5">
                {ROW_COLORS.map((c) => (
                  <button
                    key={c.value}
                    title={c.label}
                    onClick={() => {
                      set({ rowColor: c.value });
                      onFieldNow(row.id, { rowColor: c.value });
                    }}
                    className="w-7 h-7 rounded-md border border-border flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
                    style={{
                      background: c.value === "" ? "var(--background)" : c.swatch,
                    }}
                  >
                    {local.rowColor === c.value && (
                      <Check className={`w-4 h-4 ${c.value === "" || c.value === "yellow" ? "text-foreground" : "text-white"}`} />
                    )}
                    {c.value === "" && local.rowColor !== "" && (
                      <span className="text-[9px] text-muted-foreground">∅</span>
                    )}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// Ajusta a altura do textarea ao conteúdo, com um teto para manter as linhas
// compactas. Acima do teto, o campo ganha rolagem interna (o texto não é
// cortado — basta rolar ou abrir o modal de edição da linha).
const AUTO_GROW_MAX = 64; // px
function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  const next = Math.min(el.scrollHeight, AUTO_GROW_MAX);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > AUTO_GROW_MAX ? "auto" : "hidden";
}

// ─── Modal: gerenciar colunas personalizadas ────────────────────────────────
type ManageColumnsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: CustomColumn[];
  onCreate: (name: string) => void;
  onRename: (id: number, name: string) => void;
  onAskDelete: (id: number) => void;
  creating: boolean;
};

function ManageColumnsDialog({ open, onOpenChange, columns, onCreate, onRename, onAskDelete, creating }: ManageColumnsDialogProps) {
  const [newName, setNewName] = useState("");

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Colunas personalizadas</DialogTitle>
          <DialogDescription>
            Crie colunas extras de texto livre. Elas aparecem para todas as linhas da planilha.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Criar nova coluna */}
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              placeholder="Nome da nova coluna (ex.: Fornecedor)"
              className="flex-1"
            />
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1.5" />Criar</>}
            </Button>
          </div>

          {/* Lista de colunas existentes */}
          {columns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma coluna personalizada ainda.
            </p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {columns.map((c) => (
                <ColumnRow key={c.id} column={c} onRename={onRename} onAskDelete={onAskDelete} />
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="bg-card" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColumnRow({ column, onRename, onAskDelete }: { column: CustomColumn; onRename: (id: number, name: string) => void; onAskDelete: (id: number) => void; }) {
  const [name, setName] = useState(column.name);
  const nameRef = useRef(column.name);
  if (nameRef.current !== column.name) {
    nameRef.current = column.name;
    setName(column.name);
  }

  const commit = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== column.name) onRename(column.id, trimmed);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border p-2 bg-card">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="flex-1 h-9"
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9 text-destructive hover:text-destructive"
        title="Excluir coluna"
        onClick={() => onAskDelete(column.id)}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ─── Modal: editar linha inteira ────────────────────────────────────────────
type EditRowDialogProps = {
  row: SkuRow | null;
  categories: { id: string; name: string; children: { id: string; name: string }[] }[];
  allRows: SkuRow[];
  customColumns: CustomColumn[];
  onClose: () => void;
  onSave: (id: number, patch: Partial<SkuRow>) => void;
  onSaveCustom: (rowId: number, columnId: number, value: string) => void;
};

function EditRowDialog({ row, categories, allRows, customColumns, onClose, onSave, onSaveCustom }: EditRowDialogProps) {
  const [draft, setDraft] = useState<SkuRow | null>(row);
  const [customDraft, setCustomDraft] = useState<Record<string, string>>(() => parseCustomValues(row?.customValues));

  // Sincroniza quando abrir uma linha diferente (key no pai já remonta, mas garantimos).
  const idRef = useRef(row?.id ?? null);
  if (idRef.current !== (row?.id ?? null)) {
    idRef.current = row?.id ?? null;
    setDraft(row);
    setCustomDraft(parseCustomValues(row?.customValues));
  }

  if (!draft) return null;

  const upd = (patch: Partial<SkuRow>) => {
    setDraft((p) => {
      if (!p) return p;
      const next = { ...p, ...patch };
      // Recalcula SKU/SKU Kit derivados.
      const sku = buildSku({
        tipoSku: next.tipoSku,
        categoryName: next.categoryName,
        productNumber: next.productNumber,
        variantNumber: next.variantNumber,
      });
      return { ...next, sku, skuKit: buildSkuKit(sku, next.gerarSkuKit) };
    });
  };

  // Resolve o Nº do produto pelo nome (mesma regra da tabela).
  const onProductNameBlur = (produto: string) => {
    const num = resolveProductNumber(
      allRows.map((r) => ({ id: r.id, produto: r.produto, productNumber: r.productNumber })),
      draft.id,
      produto,
    );
    upd({ produto, productNumber: num });
  };

  const handleSave = () => {
    const patch: Partial<SkuRow> = {
      cadastradoMl: draft.cadastradoMl,
      tipoSku: draft.tipoSku,
      categoryId: draft.categoryId,
      categoryName: draft.categoryName,
      subCategoryId: draft.subCategoryId,
      subCategoryName: draft.subCategoryName,
      produto: draft.produto,
      productNumber: draft.productNumber,
      variante: draft.variante,
      variantNumber: draft.variantNumber,
      sku: draft.sku,
      gerarSkuKit: draft.gerarSkuKit,
      skuKit: draft.skuKit,
      eanGtin: draft.eanGtin,
      ncm: draft.ncm,
      gpc: draft.gpc,
      cest: draft.cest,
      precoClassico: draft.precoClassico,
      precoPremium: draft.precoPremium,
      precoAtacado: draft.precoAtacado,
      embProfundidade: draft.embProfundidade,
      embLargura: draft.embLargura,
      embAltura: draft.embAltura,
      embPeso: draft.embPeso,
      caracteristicas: draft.caracteristicas,
    };
    onSave(draft.id, patch);
    // Salva valores das colunas personalizadas alterados.
    const original = parseCustomValues(row?.customValues);
    for (const c of customColumns) {
      const key = String(c.id);
      const val = customDraft[key] ?? "";
      if (val !== (original[key] ?? "")) onSaveCustom(draft.id, c.id, val);
    }
    toast.success("Linha salva");
    onClose();
  };

  const subcats = categories.find((c) => c.id === draft.categoryId)?.children ?? [];

  const fieldText = (label: string, field: keyof SkuRow, opts?: { placeholder?: string; mono?: boolean }) => (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <Input
        value={(draft[field] as string) ?? ""}
        onChange={(e) => upd({ [field]: e.target.value } as Partial<SkuRow>)}
        placeholder={opts?.placeholder}
        className={opts?.mono ? "font-mono" : undefined}
      />
    </div>
  );

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Editar linha</DialogTitle>
          <DialogDescription>
            Os campos SKU, SKU Kit e Nº do produto são gerados automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-1">
          {/* Cadastrado ML */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Cadastrado ML</label>
            <select
              value={draft.cadastradoMl}
              onChange={(e) => upd({ cadastradoMl: e.target.value })}
              className="w-full rounded-md px-2 py-2 text-sm border border-border bg-background outline-none focus:ring-1 focus:ring-primary/40"
            >
              <option value="">—</option>
              {CADASTRADO_ML_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {/* Tipo SKU */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo SKU</label>
            <select
              value={draft.tipoSku}
              onChange={(e) => upd({ tipoSku: e.target.value })}
              className="w-full rounded-md px-2 py-2 text-sm border border-border bg-background outline-none focus:ring-1 focus:ring-primary/40"
            >
              <option value="">—</option>
              {TIPO_SKU_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {/* Categoria */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoria</label>
            <select
              value={draft.categoryId ?? ""}
              onChange={(e) => {
                const cat = categories.find((c) => c.id === e.target.value);
                upd({ categoryId: cat?.id ?? null, categoryName: cat?.name ?? null, subCategoryId: null, subCategoryName: null });
              }}
              className="w-full rounded-md px-2 py-2 text-sm border border-border bg-background outline-none focus:ring-1 focus:ring-primary/40"
            >
              <option value="">— selecionar —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {/* Subcategoria */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Subcategoria</label>
            <select
              value={draft.subCategoryId ?? ""}
              disabled={!draft.categoryId}
              onChange={(e) => {
                const sub = subcats.find((s) => s.id === e.target.value);
                upd({ subCategoryId: sub?.id ?? null, subCategoryName: sub?.name ?? null });
              }}
              className="w-full rounded-md px-2 py-2 text-sm border border-border bg-background outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
            >
              <option value="">{draft.categoryId ? "— selecionar —" : "escolha a categoria"}</option>
              {subcats.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {/* Produto (nome) */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Produto (nome)</label>
            <Input
              value={draft.produto}
              onChange={(e) => upd({ produto: e.target.value })}
              onBlur={(e) => onProductNameBlur(e.target.value)}
              placeholder="Nome do produto"
            />
          </div>
          {/* Variante */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Variante</label>
            <Input value={draft.variante} onChange={(e) => upd({ variante: e.target.value })} placeholder="Ex.: 12,5 CM - 100 UN" />
          </div>
          {/* Nº variante (editável) */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nº da variante</label>
            <Input
              value={draft.variantNumber ?? ""}
              onChange={(e) => upd({ variantNumber: e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")) })}
              inputMode="numeric"
            />
          </div>
          {/* Gerar Kit */}
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={draft.gerarSkuKit}
                onChange={(e) => upd({ gerarSkuKit: e.target.checked })}
                className="w-4 h-4 accent-[var(--primary)] cursor-pointer"
              />
              Gerar SKU Kit?
            </label>
          </div>

          {/* Derivados (somente leitura) */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nº do produto (auto)</label>
            <div className="w-full rounded-md px-3 py-2 text-sm bg-muted/50 border border-border font-bold text-primary">{draft.productNumber ?? "—"}</div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">SKU (auto)</label>
            <div className="w-full rounded-md px-3 py-2 text-sm bg-muted/50 border border-border font-mono font-semibold">{draft.sku || "auto"}</div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">SKU Kit (auto)</label>
            <div className="w-full rounded-md px-3 py-2 text-sm bg-muted/50 border border-border font-mono font-semibold whitespace-nowrap overflow-x-auto">{draft.skuKit || "auto"}</div>
          </div>

          {fieldText("EAN/GTIN", "eanGtin", { mono: true })}
          {fieldText("NCM", "ncm", { mono: true })}
          {fieldText("GPC", "gpc", { mono: true })}
          {fieldText("CEST", "cest", { mono: true })}
          {fieldText("Preço Clássico", "precoClassico", { placeholder: "R$" })}
          {fieldText("Preço Premium", "precoPremium", { placeholder: "R$" })}
          {fieldText("Preço Atacado", "precoAtacado", { placeholder: "R$" })}
          {fieldText("Emb. Profundidade", "embProfundidade")}
          {fieldText("Emb. Largura", "embLargura")}
          {fieldText("Emb. Altura", "embAltura")}
          {fieldText("Peso (kg)", "embPeso")}

          {/* Características */}
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Características</label>
            <Textarea
              value={draft.caracteristicas ?? ""}
              onChange={(e) => upd({ caracteristicas: e.target.value })}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Colunas personalizadas */}
          {customColumns.length > 0 && (
            <div className="sm:col-span-2 border-t border-border pt-3 mt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Colunas personalizadas</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {customColumns.map((c) => (
                  <div key={c.id}>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{c.name || "(sem nome)"}</label>
                    <Input
                      value={customDraft[String(c.id)] ?? ""}
                      onChange={(e) => setCustomDraft((p) => ({ ...p, [String(c.id)]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="bg-card" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
