import { useLocation } from "wouter";
import { useMemo, useRef, useState, useCallback } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Tipos genéricos ─────────────────────────────────────────────────────────

/** Uma linha genérica: campos dinâmicos + metadados fixos. */
export type GenericRow = {
  id: number;
  position: number;
  rowColor: string;
  customValues: string | null;
  [key: string]: unknown;
};

export type CustomColumn = { id: number; name: string; position: number };

/** Definição de uma coluna fixa da planilha. */
export type ColumnDef = {
  /** Nome do campo no objeto da linha (ex.: "sku"). */
  field: string;
  /** Rótulo exibido no cabeçalho. */
  label: string;
  /** Tipo de input. "area" = textarea multilinha; "text" = input curto. */
  kind?: "text" | "area";
  /** Largura mínima da coluna (classe Tailwind, ex.: "min-w-[180px]"). */
  minWidth?: string;
  /** Classe extra aplicada ao input. */
  className?: string;
  /** Placeholder do campo. */
  placeholder?: string;
  /** Mono (fonte monoespaçada) para campos como EAN/SKU/NCM. */
  mono?: boolean;
};

/** Conjunto de mutations/queries tRPC (já instanciados pela aba específica). */
export type SheetApi = {
  rows: GenericRow[] | undefined;
  isLoading: boolean;
  customColumns: CustomColumn[] | undefined;
  invalidate: () => void;
  invalidateColumns: () => void;
  update: (input: { id: number } & Record<string, unknown>) => void;
  create: (input: Record<string, unknown>) => void;
  remove: (id: number) => void;
  createColumn: (name: string) => void;
  renameColumn: (id: number, name: string) => void;
  deleteColumn: (id: number) => void;
  setCustomValue: (rowId: number, columnId: number, value: string) => void;
  creatingColumn: boolean;
};

export type GenericSheetProps = {
  title: string;
  subtitle: string;
  /** Cor do cabeçalho da tabela (CSS color). */
  headColor: string;
  /** Definição das colunas fixas, na ordem de exibição. */
  columns: ColumnDef[];
  /** Campos usados pela busca (subset de columns.field). */
  searchFields: string[];
  /** Rota de retorno do botão Voltar. */
  backTo: string;
  api: SheetApi;
};

// ─── Paleta de cores das linhas (estilo Excel) ───────────────────────────────
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

function parseCustomValues(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function GenericSheet({
  title,
  subtitle,
  headColor,
  columns,
  searchFields,
  backTo,
  api,
}: GenericSheetProps) {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editRowId, setEditRowId] = useState<number | null>(null);
  const [manageColumns, setManageColumns] = useState(false);
  const [deleteColumnId, setDeleteColumnId] = useState<number | null>(null);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const customSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const cols: CustomColumn[] = api.customColumns ?? [];
  const rows = api.rows ?? [];
  const editingRow = rows.find((r) => r.id === editRowId) ?? null;
  const deletingColumn = cols.find((c) => c.id === deleteColumnId) ?? null;
  const deletingRow = rows.find((r) => r.id === deleteId);

  const scheduleSave = useCallback(
    (id: number, patch: Record<string, unknown>, key: string, delay = 600) => {
      const timerKey = `${id}:${key}`;
      if (saveTimers.current[timerKey]) clearTimeout(saveTimers.current[timerKey]);
      saveTimers.current[timerKey] = setTimeout(() => {
        api.update({ id, ...patch });
      }, delay);
    },
    [api],
  );

  const saveNow = useCallback(
    (id: number, patch: Record<string, unknown>) => api.update({ id, ...patch }),
    [api],
  );

  const saveCustomValue = useCallback(
    (rowId: number, columnId: number, value: string, delay = 600) => {
      const key = `${rowId}:c${columnId}`;
      if (customSaveTimers.current[key]) clearTimeout(customSaveTimers.current[key]);
      customSaveTimers.current[key] = setTimeout(() => {
        api.setCustomValue(rowId, columnId, value);
      }, delay);
    },
    [api],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      searchFields.some((f) => String(r[f] ?? "").toLowerCase().includes(q)),
    );
  }, [rows, search, searchFields]);

  const handleAdd = () => api.create({});

  if (api.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-9" onClick={() => setLocation(backTo)}>
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
              placeholder="Buscar…"
              className="h-9 pl-8 w-60"
            />
          </div>
          <Button size="sm" variant="outline" className="h-9 bg-card" onClick={() => setManageColumns(true)}>
            <Columns3 className="w-4 h-4 mr-1.5" />
            Colunas
          </Button>
          <Button size="sm" className="h-9" onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-1.5" />
            Nova linha
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-white">
                <Th className="sticky left-0 z-20 w-12 text-center" style={{ background: headColor }}>#</Th>
                {columns.map((c) => (
                  <Th key={c.field} style={{ background: headColor }} className={c.minWidth ?? "min-w-[140px]"}>
                    {c.label}
                  </Th>
                ))}
                {cols.map((c) => (
                  <Th key={c.id} style={{ background: headColor }} className="min-w-[160px]">
                    {c.name || "(sem nome)"}
                  </Th>
                ))}
                <Th style={{ background: headColor }} className="w-24 text-center sticky right-0 z-20">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <GenericRowEditor
                  key={row.id}
                  row={row}
                  index={idx}
                  columns={columns}
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
                  <td colSpan={2 + columns.length + cols.length} className="text-center py-12 text-muted-foreground">
                    {search ? "Nenhum item encontrado para a busca." : "Nenhum item ainda. Clique em “Nova linha”."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir linha?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta linha será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) {
                  api.remove(deleteId);
                  setDeleteId(null);
                }
              }}
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
        onCreate={(name) => api.createColumn(name)}
        onRename={(id, name) => api.renameColumn(id, name)}
        onAskDelete={(id) => setDeleteColumnId(id)}
        creating={api.creatingColumn}
      />

      {/* Modal: editar linha inteira */}
      <EditRowDialog
        key={editingRow?.id ?? "none"}
        row={editingRow}
        columns={columns}
        customColumns={cols}
        onClose={() => setEditRowId(null)}
        onSave={(id, patch) => saveNow(id, patch)}
        onSaveCustom={(rowId, columnId, value) => api.setCustomValue(rowId, columnId, value)}
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
              onClick={() => {
                if (deleteColumnId) {
                  api.deleteColumn(deleteColumnId);
                  setDeleteColumnId(null);
                }
              }}
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
  row: GenericRow;
  index: number;
  columns: ColumnDef[];
  customColumns: CustomColumn[];
  onField: (id: number, patch: Record<string, unknown>, key: string, delay?: number) => void;
  onFieldNow: (id: number, patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onEdit: () => void;
  onCustomValue: (rowId: number, columnId: number, value: string, delay?: number) => void;
};

function GenericRowEditor({ row, index, columns, customColumns, onField, onFieldNow, onDelete, onEdit, onCustomValue }: RowEditorProps) {
  const [local, setLocal] = useState<GenericRow>(row);
  const rowRef = useRef(row);
  if (rowRef.current.id !== row.id || rowRef.current.rowColor !== row.rowColor) {
    rowRef.current = row;
    setLocal((p) => ({ ...p, rowColor: row.rowColor }));
  }

  const set = (patch: Record<string, unknown>) => setLocal((p) => ({ ...p, ...patch }));

  const [customVals, setCustomVals] = useState<Record<string, string>>(() => parseCustomValues(row.customValues));
  const customRef = useRef(row.customValues);
  if (customRef.current !== row.customValues) {
    customRef.current = row.customValues;
    setCustomVals(parseCustomValues(row.customValues));
  }

  const renderCell = (c: ColumnDef) => {
    const cls = `${c.mono ? "font-mono text-xs" : ""} ${c.className ?? ""}`;
    if (c.kind === "text") {
      return (
        <input
          value={(local[c.field] as string) ?? ""}
          onChange={(e) => {
            set({ [c.field]: e.target.value });
            onField(row.id, { [c.field]: e.target.value }, c.field);
          }}
          placeholder={c.placeholder}
          className={`w-full bg-transparent px-2 py-1.5 rounded-md outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-sm ${cls}`}
        />
      );
    }
    return (
      <textarea
        rows={1}
        value={(local[c.field] as string) ?? ""}
        onChange={(e) => {
          set({ [c.field]: e.target.value });
          onField(row.id, { [c.field]: e.target.value }, c.field);
          autoGrow(e.target);
        }}
        ref={(el) => { if (el) autoGrow(el); }}
        placeholder={c.placeholder}
        className={`w-full bg-transparent px-2 py-1.5 rounded-md outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-sm resize-none leading-snug break-words whitespace-pre-wrap overflow-hidden ${cls}`}
      />
    );
  };

  const colorBg = ROW_COLOR_MAP[local.rowColor]?.bg ?? "transparent";
  const zebra = local.rowColor ? colorBg : index % 2 === 1 ? "color-mix(in oklch, var(--muted) 40%, transparent)" : "transparent";

  return (
    <tr className="border-b border-border/60 align-top transition-colors" style={{ background: zebra }}>
      <td
        className="sticky left-0 z-10 px-3 py-2 text-xs text-muted-foreground font-semibold border-r border-border/40 text-center"
        style={{ background: local.rowColor ? colorBg : "var(--card)" }}
      >
        {index + 1}
      </td>

      {columns.map((c) => (
        <td key={c.field} className="px-1 py-2">{renderCell(c)}</td>
      ))}

      {/* Colunas personalizadas */}
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

      {/* Ações */}
      <td className="px-2 py-2 sticky right-0 z-10" style={{ background: local.rowColor ? colorBg : "var(--card)" }}>
        <div className="flex items-center justify-center gap-0.5">
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Editar linha" onClick={onEdit}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" title="Cor da linha">
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
                    style={{ background: c.value === "" ? "var(--background)" : c.swatch }}
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
          {columns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma coluna personalizada ainda.</p>
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
      <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive hover:text-destructive" title="Excluir coluna" onClick={() => onAskDelete(column.id)}>
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ─── Modal: editar linha inteira ────────────────────────────────────────────
type EditRowDialogProps = {
  row: GenericRow | null;
  columns: ColumnDef[];
  customColumns: CustomColumn[];
  onClose: () => void;
  onSave: (id: number, patch: Record<string, unknown>) => void;
  onSaveCustom: (rowId: number, columnId: number, value: string) => void;
};

function EditRowDialog({ row, columns, customColumns, onClose, onSave, onSaveCustom }: EditRowDialogProps) {
  const [draft, setDraft] = useState<GenericRow | null>(row);
  const [customDraft, setCustomDraft] = useState<Record<string, string>>(() => parseCustomValues(row?.customValues));
  const idRef = useRef(row?.id ?? null);
  if (idRef.current !== (row?.id ?? null)) {
    idRef.current = row?.id ?? null;
    setDraft(row);
    setCustomDraft(parseCustomValues(row?.customValues));
  }
  if (!draft) return null;

  const upd = (patch: Record<string, unknown>) => setDraft((p) => (p ? { ...p, ...patch } : p));

  const handleSave = () => {
    const patch: Record<string, unknown> = {};
    for (const c of columns) patch[c.field] = draft[c.field];
    onSave(draft.id, patch);
    const original = parseCustomValues(row?.customValues);
    for (const c of customColumns) {
      const key = String(c.id);
      const val = customDraft[key] ?? "";
      if (val !== (original[key] ?? "")) onSaveCustom(draft.id, c.id, val);
    }
    toast.success("Linha salva");
    onClose();
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Editar linha</DialogTitle>
          <DialogDescription>Edite os campos abaixo. As alterações são salvas ao clicar em Salvar.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-1">
          {columns.map((c) => (
            <div key={c.field} className={c.kind === "area" ? "sm:col-span-2" : ""}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{c.label}</label>
              {c.kind === "area" ? (
                <Textarea
                  value={(draft[c.field] as string) ?? ""}
                  onChange={(e) => upd({ [c.field]: e.target.value })}
                  rows={3}
                  className="resize-none"
                  placeholder={c.placeholder}
                />
              ) : (
                <Input
                  value={(draft[c.field] as string) ?? ""}
                  onChange={(e) => upd({ [c.field]: e.target.value })}
                  placeholder={c.placeholder}
                  className={c.mono ? "font-mono" : undefined}
                />
              )}
            </div>
          ))}
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
