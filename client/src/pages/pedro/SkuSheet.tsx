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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
};

const CADASTRADO_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  ATIVO: { bg: "color-mix(in oklch, #16a34a 14%, transparent)", text: "#16a34a", border: "color-mix(in oklch, #16a34a 35%, transparent)" },
  PENDENTE: { bg: "color-mix(in oklch, #ca8a04 16%, transparent)", text: "#a16207", border: "color-mix(in oklch, #ca8a04 35%, transparent)" },
  PAUSADO: { bg: "color-mix(in oklch, #0ea5e9 16%, transparent)", text: "#0284c7", border: "color-mix(in oklch, #0ea5e9 35%, transparent)" },
  EXCLUIDO: { bg: "color-mix(in oklch, #e11d48 14%, transparent)", text: "#e11d48", border: "color-mix(in oklch, #e11d48 35%, transparent)" },
};

export default function SkuSheet() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.skuSheet.list.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });
  const { data: categories } = trpc.skuSheet.categories.useQuery();
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Debounce de salvamento por campo para não disparar mutation a cada tecla.
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
        r.eanGtin.toLowerCase().includes(q),
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
              placeholder="Buscar produto, SKU, EAN…"
              className="h-9 pl-8 w-56"
            />
          </div>
          <Button size="sm" className="h-9" onClick={handleAdd} disabled={createMut.isPending}>
            <Plus className="w-4 h-4 mr-1.5" />
            Nova linha
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <Th className="sticky left-0 bg-muted/60 z-10 w-10">#</Th>
                <Th>Cadastrado ML</Th>
                <Th>Tipo SKU</Th>
                <Th>Categoria</Th>
                <Th>Subcategoria</Th>
                <Th className="w-10">Nº</Th>
                <Th className="min-w-[220px]">Produto</Th>
                <Th className="w-10">Nº</Th>
                <Th className="min-w-[200px]">Variante</Th>
                <Th>SKU</Th>
                <Th>Gerar SKU Kit?</Th>
                <Th>SKU Kit</Th>
                <Th>EAN/GTIN</Th>
                <Th>NCM</Th>
                <Th>GPC</Th>
                <Th>CEST</Th>
                <Th>Preço Clássico</Th>
                <Th>Preço Premium</Th>
                <Th>Preço Atacado</Th>
                <Th>Emb. Prof.</Th>
                <Th>Emb. Larg.</Th>
                <Th>Emb. Alt.</Th>
                <Th>Emb. Peso (kg)</Th>
                <Th className="min-w-[200px]">Características</Th>
                <Th className="w-12 text-center">Ações</Th>
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

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`text-left font-semibold px-3 py-2.5 whitespace-nowrap border-b border-border ${className}`}>{children}</th>;
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
  // Estado local controlado para digitação fluida; persiste com debounce.
  const [local, setLocal] = useState<SkuRow>(row);

  // Sincroniza quando a linha muda no servidor (ex.: outra aba) e não estamos editando.
  const rowRef = useRef(row);
  if (rowRef.current.id !== row.id) {
    rowRef.current = row;
    setLocal(row);
  }

  const set = (patch: Partial<SkuRow>) => setLocal((p) => ({ ...p, ...patch }));

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
      className="w-10 text-center bg-transparent px-1 py-1.5 rounded-md outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-sm font-semibold text-muted-foreground"
    />
  );

  const subcats = categories.find((c) => c.id === local.categoryId)?.children ?? [];
  const cadStyle = CADASTRADO_STYLE[local.cadastradoMl];

  return (
    <tr className="border-b border-border/60 hover:bg-muted/30 align-top">
      <td className="sticky left-0 bg-card z-10 px-3 py-2 text-xs text-muted-foreground font-medium border-r border-border/40">
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
          className="w-full rounded-md px-2 py-1.5 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
          style={
            cadStyle
              ? { background: cadStyle.bg, color: cadStyle.text, border: `1px solid ${cadStyle.border}` }
              : { background: "transparent", border: "1px solid var(--border)" }
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
      <td className="px-2 py-2 min-w-[170px]">
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
      <td className="px-2 py-2 min-w-[170px]">
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
      {/* Produto */}
      <td className="px-1 py-2">{text("produto", { className: "font-medium" })}</td>
      {/* Nº variante */}
      <td className="px-1 py-2 text-center">{numField("variantNumber")}</td>
      {/* Variante */}
      <td className="px-1 py-2">{text("variante")}</td>

      {/* SKU */}
      <td className="px-1 py-2">{text("sku")}</td>

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
      <td className="px-1 py-2">{text("skuKit")}</td>

      {/* EAN/GTIN */}
      <td className="px-1 py-2">{text("eanGtin")}</td>
      {/* NCM */}
      <td className="px-1 py-2">{text("ncm")}</td>
      {/* GPC */}
      <td className="px-1 py-2">{text("gpc")}</td>
      {/* CEST */}
      <td className="px-1 py-2">{text("cest")}</td>

      {/* Preços */}
      <td className="px-1 py-2">{text("precoClassico", { placeholder: "R$" })}</td>
      <td className="px-1 py-2">{text("precoPremium", { placeholder: "R$" })}</td>
      <td className="px-1 py-2">{text("precoAtacado", { placeholder: "R$" })}</td>

      {/* Embalagem */}
      <td className="px-1 py-2">{text("embProfundidade")}</td>
      <td className="px-1 py-2">{text("embLargura")}</td>
      <td className="px-1 py-2">{text("embAltura")}</td>
      <td className="px-1 py-2">{text("embPeso")}</td>

      {/* Características */}
      <td className="px-1 py-2">
        <textarea
          value={local.caracteristicas ?? ""}
          onChange={(e) => {
            set({ caracteristicas: e.target.value });
            onField(row.id, { caracteristicas: e.target.value }, "caracteristicas");
          }}
          rows={1}
          className="w-full bg-transparent px-2 py-1.5 rounded-md outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-sm resize-y min-h-[34px]"
        />
      </td>

      {/* Ações */}
      <td className="px-2 py-2 text-center">
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </td>
    </tr>
  );
}
