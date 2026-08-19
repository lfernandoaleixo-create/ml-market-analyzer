import { useLocation } from "wouter";
import { memo, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
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
  AlertTriangle,
  Wrench,
  Copy,
  Lock,
  LockOpen,
  History,
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
  resolveVariantNumber,
  isSkuDuplicate,
  analyzeDuplicates,
} from "../../../../shared/skuSheet";
import { trpc } from "@/lib/trpc";
import SheetTabs from "./SheetTabs";
import SkuVariationsPopover from "./SkuVariationsPopover";
// Popover abre com CLICK (não hover) para funcionar em produção e touch devices
import ColumnFilter from "./ColumnFilter";
import {
  type ColumnFilters,
  type FilterableColumn,
  buildOptions,
  applyColumnFilters,
  toggleFilterValue,
  clearColumnFilter,
  clearAllFilters,
  countActiveFilters,
} from "../../../../shared/skuFilters";

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
  mainMlb: string;
  mainDone: boolean;
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
  /** Corrige em massa quaisquer SKUs duplicados (recalcula variantes). Opcional. */
  repairAll?: () => void;
  repairPending?: boolean;
};

export type SkuStyleSheetProps = {
  binding: SkuStyleBinding;
  title: string;
  subtitle: string;
  exportTitle: string;
  /** Ações extras no cabeçalho (ex.: botão Migrar para SKU). */
  headerExtra?: ReactNode;
  /**
   * Quando definido, exibe uma coluna de checkboxes (1ª coluna) para seleção
   * de linhas. Usado pela aba Kits para migrar itens individualmente ou em
   * conjunto.
   */
  selection?: {
    selectedIds: number[];
    onToggle: (id: number) => void;
    onToggleAll: (ids: number[], checked: boolean) => void;
    renderBar?: (selectedIds: number[]) => ReactNode;
  };
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

export default function SkuStyleSheet({ binding, title, subtitle, exportTitle, headerExtra, selection }: SkuStyleSheetProps) {
  const [, setLocation] = useLocation();
  const rows = binding.rows;
  const isLoading = binding.isLoading;
  const categories = binding.categories;
  const customColumns = binding.customColumns;
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [deleteId, setDeleteId] = useState<number | null>(null);
  // Modal de edição da linha inteira.
  const [editRowId, setEditRowId] = useState<number | null>(null);
  // Painel de gerenciamento das colunas personalizadas.
  const [manageColumns, setManageColumns] = useState(false);
  const [deleteColumnId, setDeleteColumnId] = useState<number | null>(null);
  // Painel de histórico de alterações de SKU.
  const [showHistory, setShowHistory] = useState(false);

  // --- Bloqueio de edição por senha (linhas com SKU gerado) ---
  const [unlockedIds, setUnlockedIds] = useState<Set<number>>(new Set());
  const [unlockTarget, setUnlockTarget] = useState<number | null>(null); // id da linha pedindo desbloqueio
  const [unlockPwd, setUnlockPwd] = useState("");
  const verifyPwdMut = trpc.auth.verifyPassword.useMutation({
    onSuccess: () => {
      if (unlockTarget != null) {
        setUnlockedIds((prev) => new Set(prev).add(unlockTarget));
        toast.success("Linha desbloqueada para edição.");
      }
      setUnlockTarget(null);
      setUnlockPwd("");
    },
    onError: () => {
      toast.error("Senha incorreta.");
      setUnlockPwd("");
    },
  });
  const handleUnlockSubmit = () => {
    if (!unlockPwd.trim()) return;
    verifyPwdMut.mutate({ password: unlockPwd.trim() });
  };
  // Determina se uma linha está bloqueada: cadastro FINALIZADO (SKU gerado + variante
  // preenchida) e não desbloqueada nesta sessão. Enquanto a variante estiver vazia,
  // o cadastro ainda está em andamento e a linha permanece editável.
  const isRowLocked = useCallback(
    (row: SkuRow) =>
      !!row.sku && row.sku !== "" &&
      !!row.variante && row.variante.trim() !== "" &&
      !unlockedIds.has(row.id),
    [unlockedIds],
  );

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Mantém o binding mais recente numa ref para que os callbacks de salvamento
  // possam ter deps vazias (identidade estável entre renders). Isso é essencial
  // para o React.memo das linhas: se os callbacks mudassem a cada render, todas
  // as linhas re-renderizariam ao digitar em qualquer célula.
  const bindingRef = useRef(binding);
  bindingRef.current = binding;

  // Adaptadores: chamam o binding fornecido pelo dono da planilha.
  const updateMut = { mutate: (input: { id: number } & Partial<SkuRow>) => binding.update(input) };
  const createMut = { mutate: (input: Partial<SkuRow>) => binding.create(input), isPending: binding.createPending };
  const deleteMut = { mutate: ({ id }: { id: number }) => { binding.remove(id); setDeleteId(null); } };
  const createColMut = { mutate: ({ name }: { name: string }) => binding.createColumn(name), isPending: false };
  const renameColMut = { mutate: ({ id, name }: { id: number; name: string }) => binding.renameColumn(id, name) };
  const deleteColMut = { mutate: ({ id }: { id: number }) => { binding.deleteColumn(id); setDeleteColumnId(null); } };
  const setCustomValueMut = { mutate: ({ rowId, columnId, value }: { rowId: number; columnId: number; value: string }) => binding.setCustomValue(rowId, columnId, value) };

  const cols: CustomColumn[] = useMemo(() => customColumns ?? [], [customColumns]);
  const categoriesList = useMemo(() => categories ?? [], [categories]);
  const editingRow = (rows ?? []).find((r) => r.id === editRowId) ?? null;
  const deletingColumn = cols.find((c) => c.id === deleteColumnId) ?? null;

  // Salva (debounce) o valor de uma coluna personalizada por linha.
  const customSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveCustomValue = useCallback(
    (rowId: number, columnId: number, value: string, delay = 600) => {
      const key = `${rowId}:c${columnId}`;
      if (customSaveTimers.current[key]) clearTimeout(customSaveTimers.current[key]);
      customSaveTimers.current[key] = setTimeout(() => {
        bindingRef.current.setCustomValue(rowId, columnId, value);
      }, delay);
    },
    [],
  );

  const scheduleSave = useCallback(
    (id: number, patch: Partial<SkuRow>, key: string, delay = 600) => {
      const timerKey = `${id}:${key}`;
      if (saveTimers.current[timerKey]) clearTimeout(saveTimers.current[timerKey]);
      saveTimers.current[timerKey] = setTimeout(() => {
        bindingRef.current.update({ id, ...patch });
      }, delay);
    },
    [],
  );

  const saveNow = useCallback(
    (id: number, patch: Partial<SkuRow>) => {
      bindingRef.current.update({ id, ...patch });
    },
    [],
  );

  // Opções dos filtros = todos os valores presentes em cada coluna (calculadas
  // sobre TODAS as linhas, independentemente dos filtros/busca ativos, para que
  // o usuário sempre veja o leque completo de valores possíveis).
  const filterOptions = useMemo(() => {
    const list = (rows ?? []) as never[];
    const cols: FilterableColumn[] = [
      "cadastradoMl",
      "tipoSku",
      "categoryName",
      "subCategoryName",
      "produto",
    ];
    const out = {} as Record<FilterableColumn, { value: string; label: string }[]>;
    for (const c of cols) out[c] = buildOptions(list, c);
    return out;
  }, [rows]);

  const activeFilterCount = countActiveFilters(columnFilters);

  const handleToggleFilter = useCallback((column: FilterableColumn, value: string) => {
    setColumnFilters((prev) => toggleFilterValue(prev, column, value));
  }, []);
  const handleClearColumn = useCallback((column: FilterableColumn) => {
    setColumnFilters((prev) => clearColumnFilter(prev, column));
  }, []);
  const handleClearAll = useCallback(() => setColumnFilters(clearAllFilters()), []);

  const filtered = useMemo(() => {
    let list = rows ?? [];
    // 1) Filtros de coluna (multi-seleção).
    list = applyColumnFilters(list as never[], columnFilters) as typeof list;
    // 2) Busca livre por texto.
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.produto.toLowerCase().includes(q) ||
          r.variante.toLowerCase().includes(q) ||
          r.sku.toLowerCase().includes(q) ||
          r.eanGtin.toLowerCase().includes(q) ||
          r.ncm.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, search, columnFilters]);

  // Lista enxuta (apenas os campos usados p/ resolver Nº produto/variante).
  // Só muda quando um desses campos muda em alguma linha, evitando que a edição
  // de campos irrelevantes re-renderize todas as linhas via a prop `allRows`.
  const allRowsRef = useMemo(
    () =>
      (rows ?? []).map((r) => ({
        id: r.id,
        produto: r.produto,
        productNumber: r.productNumber,
        variantNumber: r.variantNumber,
        tipoSku: r.tipoSku,
        categoryName: r.categoryName,
      })),
    [rows],
  );

  // Análise de duplicidade em DOIS tipos (considera todas as linhas, não só as
  // filtradas, para o alerta ser sempre fiel):
  //   • identicalGroups → LINHA IDÊNTICA (erro do usuário): mesmo conteúdo.
  //   • skuCollisions   → SKU IGUAL gerado (erro do sistema): corrigível.
  const dupAnalysis = useMemo(
    () =>
      analyzeDuplicates(
        (rows ?? []).map((r) => ({
          id: r.id,
          position: r.position,
          tipoSku: r.tipoSku,
          categoryName: r.categoryName,
          produto: r.produto,
          variante: r.variante,
          productNumber: r.productNumber,
          variantNumber: r.variantNumber,
          sku: r.sku,
        })),
      ),
    [rows],
  );

  // Mapa id → tipo de problema, para destacar a linha com a cor certa.
  // 'identical' (âmbar/bloqueio) tem prioridade sobre 'collision' (vermelho).
  const rowProblem = useMemo(() => {
    const m = new Map<number, "identical" | "collision">();
    for (const g of dupAnalysis.skuCollisions) for (const id of g.ids) m.set(id, "collision");
    for (const g of dupAnalysis.identicalGroups) for (const id of g.ids) m.set(id, "identical");
    return m;
  }, [dupAnalysis]);

  const identicalCount = dupAnalysis.identicalGroups.length;
  const collisionCount = dupAnalysis.skuCollisions.reduce(
    (n, g) => n + Math.max(0, g.ids.length - 1),
    0,
  );

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
      { label: "#", value: (_r, i) => String(i + 1), pdfWidth: 0.5 },
      { label: "Status", value: (r) => cadLabel(String(r.cadastradoMl ?? "")), pdfWidth: 1.2 },
      { label: "Tipo", value: (r) => tipoLabel(String(r.tipoSku ?? "")), pdfWidth: 1.5 },
      { label: "Categoria", value: (r) => String(r.categoryName ?? ""), pdfWidth: 2.5 },
      { label: "Subcategoria", value: (r) => String(r.subCategoryName ?? ""), pdfWidth: 2.2 },
      { label: "Nº", value: (r) => (r.productNumber == null ? "" : String(r.productNumber)), pdfWidth: 0.5 },
      { label: "Produto", value: (r) => String(r.produto ?? ""), pdfWidth: 4.5 },
      { label: "Nº V", value: (r) => (r.variantNumber == null ? "" : String(r.variantNumber)), pdfWidth: 0.5 },
      { label: "Variante", value: (r) => String(r.variante ?? ""), pdfWidth: 3.5 },
      { label: "SKU", value: (r) => String(r.sku ?? ""), pdfWidth: 2.5 },
      { label: "Kit?", value: (r) => (r.gerarSkuKit ? "Sim" : "Não"), pdfWidth: 0.7 },
      { label: "SKU Kit Base", value: (r) => String(r.skuKit ?? ""), pdfWidth: 2.8 },
      { label: "EAN/GTIN", value: (r) => String(r.eanGtin ?? ""), pdfWidth: 2.2 },
      { label: "NCM", value: (r) => String(r.ncm ?? ""), pdfWidth: 1.6 },
      { label: "GPC", value: (r) => String(r.gpc ?? ""), pdfHide: true, pdfWidth: 1.5 },
      { label: "CEST", value: (r) => String(r.cest ?? ""), pdfHide: true, pdfWidth: 1.5 },
      { label: "P. Clássico", value: (r) => String(r.precoClassico ?? ""), pdfWidth: 1.3 },
      { label: "P. Premium", value: (r) => String(r.precoPremium ?? ""), pdfWidth: 1.3 },
      { label: "P. Atacado", value: (r) => String(r.precoAtacado ?? ""), pdfWidth: 1.3 },
      { label: "Prof.", value: (r) => String(r.embProfundidade ?? ""), pdfWidth: 0.8 },
      { label: "Larg.", value: (r) => String(r.embLargura ?? ""), pdfWidth: 0.8 },
      { label: "Alt.", value: (r) => String(r.embAltura ?? ""), pdfWidth: 0.8 },
      { label: "Peso", value: (r) => String(r.embPeso ?? ""), pdfWidth: 0.8 },
      { label: "Características", value: (r) => String(r.caracteristicas ?? ""), pdfWidth: 3.5 },
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
          {activeFilterCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 bg-card text-primary"
              onClick={handleClearAll}
            >
              <X className="w-4 h-4 mr-1.5" />
              Limpar filtros ({activeFilterCount})
            </Button>
          )}
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
          <Button size="sm" variant="outline" className="h-9 bg-card" onClick={() => setShowHistory(true)}>
            <History className="w-4 h-4 mr-1.5" />
            Histórico
          </Button>
          <Button size="sm" className="h-9" onClick={handleAdd} disabled={createMut.isPending}>
            <Plus className="w-4 h-4 mr-1.5" />
            Nova linha
          </Button>
        </div>
      </div>

      {/* ALERTA TIPO 1 — LINHA IDÊNTICA (erro de preenchimento do usuário).
          Duas ou mais linhas com o MESMO conteúdo (tipo + categoria + produto +
          variante). Não se corrige renumerando: é cadastro repetido de verdade, o
          usuário precisa remover/ajustar uma delas. Cor âmbar (atenção/bloqueio). */}
      {identicalCount > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-400/60 bg-amber-50 px-4 py-3 text-amber-900">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-semibold">
                {identicalCount === 1
                  ? "Linha idêntica detectada"
                  : `${identicalCount} conjuntos de linhas idênticas detectados`}
              </p>
              {dupAnalysis.identicalGroups.map((g) => (
                <p key={g.key} className="text-[13px] leading-snug">
                  As linhas <strong>{g.positions.join(", ")}</strong> têm os mesmos dados
                  idênticos cadastrados{g.produto ? <> (“{g.produto}”)</> : null} e gerariam um
                  SKU igual, o que não é permitido. Ajuste a variante ou remova a linha repetida.
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ALERTA TIPO 2 — SKU IGUAL GERADO (falha da geração automática).
          Linhas legitimamente diferentes que acabaram com o mesmo SKU. Corrigível
          automaticamente (renumera a variante). Cor vermelha. */}
      {collisionCount > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>
                {collisionCount} SKU{collisionCount > 1 ? "s" : ""} igual
                {collisionCount > 1 ? "is" : ""}
              </strong>{" "}
              gerado{collisionCount > 1 ? "s" : ""} para variações diferentes
              {dupAnalysis.skuCollisions.length > 0 && (
                <> (linhas {dupAnalysis.skuCollisions.flatMap((g) => g.positions).join(", ")})</>
              )}
              . Isso foi um erro na numeração automática. Clique para corrigir — cada variação
              recebe um número único.
            </span>
          </div>
          {binding.repairAll && (
            <Button
              size="sm"
              className="h-9 shrink-0 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => binding.repairAll?.()}
              disabled={binding.repairPending}
            >
              <Wrench className="mr-1.5 h-4 w-4" />
              {binding.repairPending ? "Corrigindo…" : "Corrigir automaticamente"}
            </Button>
          )}
        </div>
      )}

      {/* Barra de seleção (somente quando há itens marcados) */}
      {selection && selection.renderBar && selection.selectedIds.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">
            {selection.selectedIds.length}{" "}
            {selection.selectedIds.length === 1 ? "item selecionado" : "itens selecionados"}
          </span>
          <div className="flex items-center gap-2">{selection.renderBar(selection.selectedIds)}</div>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        {/*
          zoom levemente reduzido p/ caber mais colunas e deixar as linhas mais baixas.
          A rolagem (horizontal + vertical) acontece DENTRO deste contêiner para que o
          cabeçalho (thead sticky) permaneça fixo no topo ao rolar a lista, como
          "congelar painéis" no Excel. A altura usa a viewport para se adaptar à tela.
        */}
        <div className="overflow-auto max-h-[calc(100vh-220px)]" style={{ zoom: 0.85 } as React.CSSProperties}>
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-30">
              <tr className="text-[11px] uppercase tracking-wide text-white">
                {selection && (
                  <Th className="sticky left-0 z-20 w-10 text-center" style={{ background: "var(--sku-head)" }}>
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      className="h-4 w-4 cursor-pointer accent-primary align-middle"
                      checked={filtered.length > 0 && filtered.every((r) => selection.selectedIds.includes(r.id))}
                      ref={(el) => {
                        if (el) {
                          const some = filtered.some((r) => selection.selectedIds.includes(r.id));
                          const all = filtered.length > 0 && filtered.every((r) => selection.selectedIds.includes(r.id));
                          el.indeterminate = some && !all;
                        }
                      }}
                      onChange={(e) => selection.onToggleAll(filtered.map((r) => r.id), e.target.checked)}
                    />
                  </Th>
                )}
                <Th className={`sticky ${selection ? "left-10" : "left-0"} z-20 w-12 text-center`} style={{ background: "var(--sku-head)" }}>#</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[140px]">
                  <ColumnFilter
                    label="Cadastrado ML"
                    options={filterOptions.cadastradoMl}
                    selected={columnFilters.cadastradoMl ?? []}
                    onToggle={(v) => handleToggleFilter("cadastradoMl", v)}
                    onClear={() => handleClearColumn("cadastradoMl")}
                  />
                </Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[120px]">
                  <ColumnFilter
                    label="Tipo SKU"
                    options={filterOptions.tipoSku}
                    selected={columnFilters.tipoSku ?? []}
                    onToggle={(v) => handleToggleFilter("tipoSku", v)}
                    onClear={() => handleClearColumn("tipoSku")}
                  />
                </Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[180px]">
                  <ColumnFilter
                    label="Categoria"
                    options={filterOptions.categoryName}
                    selected={columnFilters.categoryName ?? []}
                    onToggle={(v) => handleToggleFilter("categoryName", v)}
                    onClear={() => handleClearColumn("categoryName")}
                    searchable
                  />
                </Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[180px]">
                  <ColumnFilter
                    label="Subcategoria"
                    options={filterOptions.subCategoryName}
                    selected={columnFilters.subCategoryName ?? []}
                    onToggle={(v) => handleToggleFilter("subCategoryName", v)}
                    onClear={() => handleClearColumn("subCategoryName")}
                    searchable
                  />
                </Th>
                <Th style={{ background: "var(--sku-head)" }} className="w-10 text-center">Nº</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[280px]">
                  <ColumnFilter
                    label="Produto"
                    options={filterOptions.produto}
                    selected={columnFilters.produto ?? []}
                    onToggle={(v) => handleToggleFilter("produto", v)}
                    onClear={() => handleClearColumn("produto")}
                    searchable
                  />
                </Th>
                <Th style={{ background: "var(--sku-head)" }} className="w-10 text-center">Nº</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[240px]">Variante</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[50px] text-center">SKU</Th>
                <Th style={{ background: "var(--sku-head)" }} className="text-center">Gerar Kit?</Th>
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[170px] whitespace-nowrap">SKU Kit Base</Th>

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
                  problemType={rowProblem.get(row.id) ?? null}
                  categories={categoriesList}
                  allRows={allRowsRef}
                  customColumns={cols}
                  onField={scheduleSave}
                  onFieldNow={saveNow}
                  onDelete={() => setDeleteId(row.id)}
                  onEdit={() => setEditRowId(row.id)}
                  onCustomValue={saveCustomValue}
                  isLocked={isRowLocked(row as SkuRow)}
                  onUnlock={() => setUnlockTarget(row.id)}
                  onRelock={() => setUnlockedIds(prev => { const next = new Set(prev); next.delete(row.id); return next; })}
                  selection={selection}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={(selection ? 26 : 25) + cols.length} className="text-center py-12 text-muted-foreground">
                    {search || activeFilterCount > 0 ? "Nenhum item encontrado para os filtros aplicados." : "Nenhum item ainda. Clique em “Nova linha”."}
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

      {/* Dialog: desbloquear linha (senha) */}
      <AlertDialog open={unlockTarget !== null} onOpenChange={(o) => { if (!o) { setUnlockTarget(null); setUnlockPwd(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-600" />
              Linha bloqueada
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta linha já possui um SKU gerado. Para editar, digite a senha de acesso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <input
              type="password"
              placeholder="Senha"
              value={unlockPwd}
              onChange={(e) => setUnlockPwd(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleUnlockSubmit(); }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleUnlockSubmit(); }} disabled={!unlockPwd.trim() || verifyPwdMut.isPending}>
              {verifyPwdMut.isPending ? "Verificando..." : "Desbloquear"}
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
        categories={categoriesList}
        allRows={allRowsRef}
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

      {/* Dialog: Histórico de alterações de SKU */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Histórico de Alterações de SKU
            </DialogTitle>
          </DialogHeader>
          <SkuChangeHistoryPanel />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Painel interno que busca e exibe o histórico de alterações de SKU. */
function SkuChangeHistoryPanel() {
  const { data: history, isLoading } = trpc.skuSheet.skuChangeHistory.useQuery({ limit: 100 });
  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!history || history.length === 0) return <p className="text-muted-foreground text-center py-8">Nenhuma alteração registrada ainda.</p>;
  return (
    <div className="overflow-y-auto flex-1 -mx-2 px-2">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background">
          <tr className="border-b">
            <th className="text-left py-2 px-2 font-semibold">Data/Hora</th>
            <th className="text-left py-2 px-2 font-semibold">Autorizado por</th>
            <th className="text-left py-2 px-2 font-semibold">Ação</th>
            <th className="text-left py-2 px-2 font-semibold">Descrição</th>
            <th className="text-center py-2 px-2 font-semibold">Linhas</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
              <td className="py-2 px-2 whitespace-nowrap text-muted-foreground">{new Date(Number(h.timestamp)).toLocaleString("pt-BR")}</td>
              <td className="py-2 px-2 font-medium">{h.authorizedBy}</td>
              <td className="py-2 px-2">{h.action}</td>
              <td className="py-2 px-2 max-w-[300px] truncate" title={h.description}>{h.description}</td>
              <td className="py-2 px-2 text-center">{h.affectedCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
// Versão enxuta das linhas usada apenas para resolver Nº do produto/variante.
// Passar somente estes campos (em vez de SkuRow[] completo) evita que a edição
// de campos irrelevantes (preço, EAN, etc.) recrie a referência e re-renderize
// todas as linhas — mantendo a planilha responsiva ao digitar.
type SkuRowRef = {
  id: number;
  produto: string | null;
  productNumber: number | null;
  variantNumber: number | null;
  tipoSku: string;
  categoryName: string | null;
};

type RowEditorProps = {
  row: SkuRow;
  index: number;
  problemType: "identical" | "collision" | null;
  categories: { id: string; name: string; children: { id: string; name: string }[] }[];
  allRows: SkuRowRef[];
  customColumns: CustomColumn[];
  onField: (id: number, patch: Partial<SkuRow>, key: string, delay?: number) => void;
  onFieldNow: (id: number, patch: Partial<SkuRow>) => void;
  onDelete: () => void;
  onEdit: () => void;
  onCustomValue: (rowId: number, columnId: number, value: string, delay?: number) => void;
  isLocked: boolean;
  onUnlock: () => void;
  onRelock: () => void;
  selection?: {
    selectedIds: number[];
    onToggle: (id: number) => void;
    onToggleAll: (ids: number[], checked: boolean) => void;
    renderBar?: (selectedIds: number[]) => ReactNode;
  };
};

function SkuRowEditorImpl({ row, index, problemType, categories, allRows, customColumns, onField, onFieldNow, onDelete, onEdit, onCustomValue, isLocked, onUnlock, onRelock, selection }: RowEditorProps) {
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
    const merged = { ...local, ...patch };
    // Garante que o Nº da variante seja único dentro do grupo (mesmo
    // tipo+categoria+Nº produto), evitando SKUs repetidos.
    const variantNumber = resolveVariantNumber(
      allRows.map((r) => ({
        id: r.id,
        tipoSku: r.tipoSku,
        categoryName: r.categoryName,
        productNumber: r.productNumber,
        variantNumber: r.variantNumber,
      })),
      row.id,
      {
        tipoSku: merged.tipoSku,
        categoryName: merged.categoryName,
        productNumber: merged.productNumber,
        variantNumber: merged.variantNumber,
      },
    );
    const next = { ...merged, variantNumber };
    const sku = buildSku({
      tipoSku: next.tipoSku,
      categoryName: next.categoryName,
      productNumber: next.productNumber,
      variantNumber: next.variantNumber,
    });
    const skuKit = buildSkuKit(sku, next.gerarSkuKit);
    const full: Partial<SkuRow> = { ...patch, variantNumber, sku, skuKit };
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
      disabled={isLocked}
      onChange={(e) => {
        set({ [field]: e.target.value } as Partial<SkuRow>);
        onField(row.id, { [field]: e.target.value } as Partial<SkuRow>, String(field));
        autoGrow(e.target);
      }}
      ref={(el) => { if (el) autoGrow(el); }}
      placeholder={opts?.placeholder}
      className={`w-full bg-transparent px-2 py-1.5 rounded-md outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-sm resize-none leading-snug break-words whitespace-pre-wrap overflow-hidden ${isLocked ? "opacity-60 cursor-not-allowed" : ""} ${opts?.className ?? ""}`}
      style={opts?.minWidth ? { minWidth: opts.minWidth } : undefined}
    />
  );

  // Campo do NOME do produto: ao terminar de digitar (blur) resolve o Nº do
  // produto automaticamente — reaproveita o Nº de um produto de mesmo nome ou
  // preserva o número existente. Só atribui max+1 para linhas NOVAS (sem número).
  const resolveAndApplyProductNumber = (produto: string) => {
    const num = resolveProductNumber(
      allRows.map((r) => ({ id: r.id, produto: r.produto ?? "", productNumber: r.productNumber })),
      row.id,
      produto,
      row.productNumber, // preserva o número existente se a linha já tem um
    );
    // applyDerived resolve automaticamente o Nº da variante para manter o SKU único.
    applyDerived({ produto, productNumber: num });
  };

  const productNameField = () => (
    <textarea
      rows={1}
      value={local.produto ?? ""}
      disabled={isLocked}
      onChange={(e) => {
        set({ produto: e.target.value });
        onField(row.id, { produto: e.target.value }, "produto");
        autoGrow(e.target);
      }}
      onBlur={(e) => resolveAndApplyProductNumber(e.target.value)}
      ref={(el) => { if (el) autoGrow(el); }}
      placeholder="Nome do produto"
      className={`w-full bg-transparent px-2 py-1.5 rounded-md outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-sm resize-none leading-snug break-words whitespace-pre-wrap overflow-hidden font-semibold text-foreground ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
    />
  );

  // Campo de texto curto (1 linha, mas largura total da célula).
  const text = (field: keyof SkuRow, opts?: { className?: string; placeholder?: string }) => (
    <input
      value={(local[field] as string) ?? ""}
      disabled={isLocked}
      onChange={(e) => {
        set({ [field]: e.target.value } as Partial<SkuRow>);
        onField(row.id, { [field]: e.target.value } as Partial<SkuRow>, String(field));
      }}
      placeholder={opts?.placeholder}
      className={`w-full bg-transparent px-2 py-1.5 rounded-md outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-sm ${isLocked ? "opacity-60 cursor-not-allowed" : ""} ${opts?.className ?? ""}`}
    />
  );

  // Campo derivado (somente leitura): exibe valor calculado automaticamente.
  const [copiedField, setCopiedField] = useState<"sku" | "skuKit" | null>(null);
  const copyToClipboard = (field: "sku" | "skuKit", value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const derived = (field: "sku" | "skuKit") => {
    const val = (local[field] as string) ?? "";
    // Somente o campo SKU (não o SKU Kit) sinaliza problema.
    const flag = field === "sku" && problemType != null && !!val;
    const isIdentical = flag && problemType === "identical";
    return (
      <div
        className={`w-full px-2 py-1.5 rounded-md font-mono text-xs whitespace-nowrap flex items-center gap-1 group/sku ${
          isIdentical
            ? "text-amber-700 font-bold ring-1 ring-amber-400/70 bg-amber-100"
            : flag
              ? "text-destructive font-bold ring-1 ring-destructive/60 bg-destructive/10"
              : val
                ? "text-foreground font-semibold"
                : "text-muted-foreground/50 italic"
        }`}
        title={
          isIdentical
            ? "LINHA IDÊNTICA: outra linha já tem estes mesmos dados. Ajuste a variante ou remova a linha repetida."
            : flag
              ? "SKU IGUAL gerado para variações diferentes. Use 'Corrigir automaticamente' no topo."
              : val
                ? undefined
                : "Preencha Tipo, Categoria e números"
        }
      >
        {flag && <AlertTriangle className="h-3 w-3 shrink-0" />}
        <span className="select-all">{val || "auto"}</span>
        {val && (
          <button
            type="button"
            onClick={() => copyToClipboard(field, val)}
            className="ml-auto shrink-0 opacity-0 group-hover/sku:opacity-100 transition-opacity duration-150 p-0.5 rounded hover:bg-muted"
            title="Copiar SKU"
          >
            {copiedField === field ? (
              <Check className="h-3 w-3 text-emerald-600" />
            ) : (
              <Copy className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        )}
      </div>
    );
  };

  const numField = (field: "productNumber" | "variantNumber") => (
    <input
      value={(local[field] ?? "") as number | string}
      disabled={isLocked}
      onChange={(e) => {
        const v = e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, ""));
        applyDerived({ [field]: v } as Partial<SkuRow>);
      }}
      className={`w-9 text-center bg-transparent px-1 py-1.5 rounded-md outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-sm font-bold text-primary ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
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
      {selection && (
        <td
          className="sticky left-0 z-10 px-2 py-2 border-r border-border/40 text-center"
          style={{ background: local.rowColor ? colorBg : "var(--card)" }}
        >
          <input
            type="checkbox"
            aria-label={`Selecionar linha ${index + 1}`}
            className="h-4 w-4 cursor-pointer accent-primary align-middle"
            checked={selection.selectedIds.includes(row.id)}
            onChange={() => selection.onToggle(row.id)}
          />
        </td>
      )}
      <td
        className={`sticky ${selection ? "left-10" : "left-0"} z-10 px-3 py-2 text-xs text-muted-foreground font-semibold border-r border-border/40 text-center`}
        style={{ background: local.rowColor ? colorBg : "var(--card)" }}
      >
        {index + 1}
      </td>

      {/* Cadastrado ML */}
      <td className="px-2 py-2">
        <select
          value={local.cadastradoMl}
          disabled={isLocked}
          onChange={(e) => {
            set({ cadastradoMl: e.target.value });
            onFieldNow(row.id, { cadastradoMl: e.target.value });
          }}
          className={`w-full rounded-md px-2 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-primary/40 ${isLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
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
          disabled={isLocked}
          onChange={(e) => {
            applyDerived({ tipoSku: e.target.value });
          }}
          className={`w-full rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/40 border border-border bg-background ${isLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
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
          disabled={isLocked}
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
          className={`w-full rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/40 border border-border bg-background ${isLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
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
          disabled={isLocked || !local.categoryId}
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

      {/* SKU — ícone clicável que abre popover com SKU principal + variações */}
      <td className="px-1 py-2">
        {(local.sku && local.sku !== "") ? (
          <SkuVariationsPopover skuRowId={row.id} baseSku={local.sku} eanGtin={local.eanGtin} mainMlb={local.mainMlb} mainDone={local.mainDone} onMainFieldChange={(field, value) => { const updated = { ...local, [field]: value }; setLocal(updated); onFieldNow(row.id, { [field]: value }); }}>
            <button
              type="button"
              className="flex items-center justify-center w-8 h-8 mx-auto rounded-md hover:bg-primary/10 transition-colors group/skuicon"
              title="Ver SKU e variações"
            >
              <svg className="h-5 w-5 text-primary group-hover/skuicon:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="8" width="16" height="13" rx="2" /><path d="M4 8l8-5 8 5" /><path d="M14 12l3-3m0 0l-3-3m3 3H9" /></svg>
            </button>
          </SkuVariationsPopover>
        ) : (
          <div className="flex items-center justify-center w-8 h-8 mx-auto opacity-30" title="Preencha Tipo, Categoria e números">
            <svg className="h-5 w-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="8" width="16" height="13" rx="2" /><path d="M4 8l8-5 8 5" /><path d="M14 12l3-3m0 0l-3-3m3 3H9" /></svg>
          </div>
        )}
      </td>

      {/* Gerar SKU Kit? */}
      <td className="px-2 py-2 text-center">
        <input
          type="checkbox"
          checked={local.gerarSkuKit}
          disabled={isLocked}
          onChange={(e) => {
            applyDerived({ gerarSkuKit: e.target.checked });
          }}
          className={`w-4 h-4 accent-[var(--primary)] ${isLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        />
      </td>
      {/* SKU Kit (derivado automaticamente) — apenas exibição, sem popover */}
      <td className="px-1 py-2">
        {derived("skuKit")}
      </td>


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
            disabled={isLocked}
            onChange={(e) => {
              const v = e.target.value;
              setCustomVals((p) => ({ ...p, [String(c.id)]: v }));
              onCustomValue(row.id, c.id, v);
              autoGrow(e.target);
            }}
            ref={(el) => { if (el) autoGrow(el); }}
            className={`w-full bg-transparent px-2 py-1.5 rounded-md outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-sm resize-none leading-snug break-words whitespace-pre-wrap overflow-hidden ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
          />
        </td>
      ))}

      {/* Ações: cadeado + editar + cor da linha + excluir */}
      <td className="px-2 py-2 sticky right-0 z-10" style={{ background: local.rowColor ? colorBg : "var(--card)" }}>
        <div className="flex items-center justify-center gap-0.5">
          {isLocked ? (
            <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600" title="Linha bloqueada — clique para desbloquear" onClick={onUnlock}>
              <Lock className="w-4 h-4" />
            </Button>
          ) : (row.sku && row.variante && row.variante.trim()) ? (
            <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" title="Clique para bloquear novamente" onClick={onRelock}>
              <LockOpen className="w-4 h-4" />
            </Button>
          ) : null}
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Editar linha" onClick={onEdit} disabled={isLocked}>
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
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete} disabled={isLocked}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// Memoiza a linha: só re-renderiza quando algo que afeta ESTA linha muda.
// As edições de texto são mantidas em estado local, então não dependemos de
// re-render por prop para refletir a digitação. `allRows` já é uma referência
// enxuta e estável (só muda quando id/produto/nº/tipo/categoria mudam).
const SkuRowEditor = memo(SkuRowEditorImpl, (prev, next) => {
  if (prev.row !== next.row) return false;
  if (prev.index !== next.index) return false;
  if (prev.problemType !== next.problemType) return false;
  if (prev.categories !== next.categories) return false;
  if (prev.allRows !== next.allRows) return false;
  if (prev.customColumns !== next.customColumns) return false;
  if (prev.onField !== next.onField) return false;
  if (prev.onFieldNow !== next.onFieldNow) return false;
  if (prev.onCustomValue !== next.onCustomValue) return false;
  if (prev.isLocked !== next.isLocked) return false;
  // Callbacks onDelete/onEdit/onUnlock são recriados a cada render do pai (closures por
  // row.id), mas seu efeito é idêntico enquanto row.id for o mesmo — ignorá-los
  // é seguro e evita re-render em massa ao editar qualquer célula.
  // Seleção: só importa se o estado de seleção DESTA linha mudou.
  const prevSel = prev.selection;
  const nextSel = next.selection;
  if (!!prevSel !== !!nextSel) return false;
  if (prevSel && nextSel) {
    const prevChecked = prevSel.selectedIds.includes(prev.row.id);
    const nextChecked = nextSel.selectedIds.includes(next.row.id);
    if (prevChecked !== nextChecked) return false;
  }
  return true;
});

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
  allRows: SkuRowRef[];
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
      const merged = { ...p, ...patch };
      // Garante Nº de variante único dentro do grupo (evita SKU repetido).
      const variantNumber = resolveVariantNumber(
        allRows.map((r) => ({
          id: r.id,
          tipoSku: r.tipoSku,
          categoryName: r.categoryName,
          productNumber: r.productNumber,
          variantNumber: r.variantNumber,
        })),
        p.id,
        {
          tipoSku: merged.tipoSku,
          categoryName: merged.categoryName,
          productNumber: merged.productNumber,
          variantNumber: merged.variantNumber,
        },
      );
      const next = { ...merged, variantNumber };
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
  // Preserva o número existente se a linha já tem um atribuído.
  const onProductNameBlur = (produto: string) => {
    const num = resolveProductNumber(
      allRows.map((r) => ({ id: r.id, produto: r.produto ?? "", productNumber: r.productNumber })),
      draft.id,
      produto,
      draft.productNumber, // preserva o número existente
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
