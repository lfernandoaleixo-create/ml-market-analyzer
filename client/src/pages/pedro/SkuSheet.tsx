import { trpc } from "@/lib/trpc";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  TIPO_SKU_OPTIONS,
  CADASTRADO_ML_OPTIONS,
} from "../../../../shared/skuSheet";

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
};

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

export default function SkuSheet() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.skuSheet.list.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });
  const { data: categories } = trpc.skuSheet.categories.useQuery();
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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
      setDeleteId(null);
      toast.success("Linha excluída");
    },
    onError: () => toast.error("Não foi possível excluir"),
  });

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
              <h2 className="text-xl font-display font-semibold text-foreground leading-tight">Planilha SKU</h2>
              <p className="text-xs text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? "item" : "itens"} · cadastro central de SKUs
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
          <Button size="sm" className="h-9" onClick={handleAdd} disabled={createMut.isPending}>
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
                <Th style={{ background: "var(--sku-head)" }} className="min-w-[120px]">SKU Kit</Th>
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
                <Th style={{ background: "var(--sku-head)" }} className="w-20 text-center sticky right-0 z-20">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <SkuRowEditor
                  key={row.id}
                  row={row as SkuRow}
                  index={idx}
                  categories={categories ?? []}
                  onField={scheduleSave}
                  onFieldNow={saveNow}
                  onDelete={() => setDeleteId(row.id)}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={25} className="text-center py-12 text-muted-foreground">
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
  onField: (id: number, patch: Partial<SkuRow>, key: string, delay?: number) => void;
  onFieldNow: (id: number, patch: Partial<SkuRow>) => void;
  onDelete: () => void;
};

function SkuRowEditor({ row, index, categories, onField, onFieldNow, onDelete }: RowEditorProps) {
  const [local, setLocal] = useState<SkuRow>(row);

  const rowRef = useRef(row);
  if (rowRef.current.id !== row.id || rowRef.current.rowColor !== row.rowColor) {
    rowRef.current = row;
    // Mantém edições de texto em andamento, mas sincroniza a cor escolhida.
    setLocal((p) => ({ ...p, rowColor: row.rowColor }));
  }

  const set = (patch: Partial<SkuRow>) => setLocal((p) => ({ ...p, ...patch }));

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

  const numField = (field: "productNumber" | "variantNumber") => (
    <input
      value={(local[field] ?? "") as number | string}
      onChange={(e) => {
        const v = e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, ""));
        set({ [field]: v } as Partial<SkuRow>);
        onField(row.id, { [field]: v } as Partial<SkuRow>, String(field));
      }}
      className="w-9 text-center bg-transparent px-1 py-1.5 rounded-md outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-sm font-bold text-primary"
    />
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
            set({ tipoSku: e.target.value });
            onFieldNow(row.id, { tipoSku: e.target.value });
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
            set(patch);
            onFieldNow(row.id, patch);
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

      {/* Nº produto */}
      <td className="px-1 py-2 text-center">{numField("productNumber")}</td>
      {/* Produto (texto completo) */}
      <td className="px-1 py-2">{area("produto", { className: "font-semibold text-foreground" })}</td>
      {/* Nº variante */}
      <td className="px-1 py-2 text-center">{numField("variantNumber")}</td>
      {/* Variante (texto completo) */}
      <td className="px-1 py-2">{area("variante")}</td>

      {/* SKU */}
      <td className="px-1 py-2">{text("sku", { className: "font-mono text-xs" })}</td>

      {/* Gerar SKU Kit? */}
      <td className="px-2 py-2 text-center">
        <input
          type="checkbox"
          checked={local.gerarSkuKit}
          onChange={(e) => {
            set({ gerarSkuKit: e.target.checked });
            onFieldNow(row.id, { gerarSkuKit: e.target.checked });
          }}
          className="w-4 h-4 accent-[var(--primary)] cursor-pointer"
        />
      </td>
      {/* SKU Kit */}
      <td className="px-1 py-2">{text("skuKit", { className: "font-mono text-xs" })}</td>

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

      {/* Ações: cor da linha + excluir */}
      <td className="px-2 py-2 sticky right-0 z-10" style={{ background: local.rowColor ? colorBg : "var(--card)" }}>
        <div className="flex items-center justify-center gap-0.5">
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

// Ajusta a altura do textarea ao conteúdo (sem cortar texto).
function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
