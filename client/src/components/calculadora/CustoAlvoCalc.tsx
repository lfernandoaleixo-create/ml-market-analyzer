import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SectionCard } from "@/components/account/AccountUI";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ML_WEIGHT_LABELS,
  computeMatrixRow,
  type MlListingType,
  type MatrixTtsRegime,
  type MatrixGlobalSettings,
} from "@shared/pricing";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  X,
  Sparkles,
  Pencil,
  Trash2,
  Check,
  Table2,
} from "lucide-react";

/* ------------------------------- helpers UI ------------------------------- */

/** Input numérico com prevenção de scroll wheel (corrige bug R$100→99,99). */
function MoneyInput({
  value,
  onChange,
  placeholder = "0,00",
  prefix = "R$",
  className,
  autoFocus,
  onEnter,
}: {
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
  prefix?: string;
  className?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {prefix}
        </span>
      )}
      <Input
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        autoFocus={autoFocus}
        value={value !== 0 ? value : ""}
        placeholder={placeholder}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        className={cn("tabular-nums", prefix ? "pl-9" : "", className)}
      />
    </div>
  );
}

/** Botão de segmento compacto para a barra de controles globais. */
function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-all active:scale-[0.97]",
        active
          ? "bg-primary/12 text-primary shadow-sm"
          : "text-muted-foreground hover:bg-muted/60",
      )}
    >
      {children}
    </button>
  );
}

/* --------------------------------- tipos ---------------------------------- */

type Cell = { marginPct: number; sellingPrice: number; valid: boolean; error?: string };
type Row = {
  id: number;
  name: string;
  sku: string | null;
  anchorPrice: number;
  anchorMarginPct: number;
  weightIndex: number;
  matrixCost: number;
  cells: Cell[];
  sortOrder: number;
};
type Settings = {
  ttsRegime: MatrixTtsRegime;
  listingType: MlListingType;
  tacosPercent: number;
  affiliatePercent: number;
  freeShipping: boolean;
  anchorMarginPct: number;
  margins: number[];
};

/* ------------------------------ componente -------------------------------- */

export default function CustoAlvoCalc() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.pricing.spreadsheet.list.useQuery();

  const settings = data?.settings;
  const rows = useMemo(() => data?.rows ?? [], [data]);

  /* ----- mutations ----- */
  const upsertSettings = trpc.pricing.spreadsheet.updateSettings.useMutation({
    onSuccess: () => utils.pricing.spreadsheet.list.invalidate(),
    onError: (e) => toast.error(e.message || "Não foi possível atualizar."),
  });
  const upsertProduct = trpc.pricing.spreadsheet.upsert.useMutation({
    onSuccess: () => {
      utils.pricing.spreadsheet.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Não foi possível salvar o produto."),
  });
  const deleteProduct = trpc.pricing.spreadsheet.delete.useMutation({
    onSuccess: () => utils.pricing.spreadsheet.list.invalidate(),
    onError: (e) => toast.error(e.message || "Não foi possível excluir."),
  });

  /* ----- form: novo produto ----- */
  const [newName, setNewName] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newPrice, setNewPrice] = useState(0);
  const [newWeight, setNewWeight] = useState(0);

  function addProduct() {
    const name = newName.trim();
    if (!name) {
      toast.error("Informe o nome do produto.");
      return;
    }
    if (newPrice <= 0) {
      toast.error("Informe o preço de venda com a margem âncora.");
      return;
    }
    upsertProduct.mutate(
      { name, sku: newSku.trim() || undefined, anchorPrice: newPrice, weightIndex: newWeight },
      {
        onSuccess: () => {
          toast.success(`"${name}" adicionado à planilha.`);
          setNewName("");
          setNewSku("");
          setNewPrice(0);
          setNewWeight(0);
        },
      },
    );
  }

  /* ----- coluna variável (ajuste em tempo real) ----- */
  const [varMargin, setVarMargin] = useState(45);

  // Margens base fixas para todos os produtos (não removíveis).
  const anchor = 20;
  const margins = [20, 15, 25, 30, 35, 40];

  const regimeSemTts = settings?.ttsRegime === "sem_tts";
  const isPremium = settings?.listingType === "premium";

  /* Barra de controles globais — fica fixa (sticky) dentro do card da planilha. */
  const controlsBar = (
    <div className="sticky top-2 z-30 mb-4 rounded-xl border border-border bg-card/95 px-3 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Regime TTS */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Regime</span>
            <div className="flex rounded-lg border border-border p-0.5">
              <SegBtn active={!regimeSemTts} onClick={() => upsertSettings.mutate({ ttsRegime: "com_tts" })}>
                <Sparkles className={cn("h-3.5 w-3.5", !regimeSemTts ? "text-primary" : "text-muted-foreground")} />
                COM TTS <span className="opacity-70">14%</span>
              </SegBtn>
              <SegBtn active={regimeSemTts} onClick={() => upsertSettings.mutate({ ttsRegime: "sem_tts" })}>
                SEM TTS <span className="opacity-70">24%</span>
              </SegBtn>
            </div>
          </div>

          {/* Tipo de anúncio */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Anúncio</span>
            <div className="flex rounded-lg border border-border p-0.5">
              <SegBtn active={!isPremium} onClick={() => upsertSettings.mutate({ listingType: "classico" })}>
                Clássico <span className="opacity-70">12%</span>
              </SegBtn>
              <SegBtn active={isPremium} onClick={() => upsertSettings.mutate({ listingType: "premium" })}>
                Premium <span className="opacity-70">17%</span>
              </SegBtn>
            </div>
          </div>

          <div className="hidden h-6 w-px bg-border sm:block" />

          {/* TACoS */}
          <label className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">TACoS</span>
            <div className="relative w-16">
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={0}
                value={settings ? settings.tacosPercent : ""}
                onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                onChange={(e) => upsertSettings.mutate({ tacosPercent: parseFloat(e.target.value) || 0 })}
                className="h-8 pr-5 text-sm tabular-nums"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </label>

          {/* Afiliados */}
          <label className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Afiliados</span>
            <div className="relative w-16">
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={0}
                value={settings ? settings.affiliatePercent : ""}
                onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                onChange={(e) => upsertSettings.mutate({ affiliatePercent: parseFloat(e.target.value) || 0 })}
                className="h-8 pr-5 text-sm tabular-nums"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </label>

          {/* Frete grátis */}
          <label className="flex items-center gap-2">
            <Switch
              checked={settings?.freeShipping ?? true}
              onCheckedChange={(v) => upsertSettings.mutate({ freeShipping: v })}
            />
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Frete grátis</span>
          </label>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ----------------------- ADICIONAR PRODUTO ----------------------- */}
      <SectionCard
        title="Adicionar produto"
        description="Cada produto é uma linha. Informe o preço de venda no ML que produz a margem âncora; o sistema deriva o custo fixo da Matriz e calcula o preço para as demais margens. Nomes não podem se repetir."
      >
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="np-name" className="text-xs font-medium text-muted-foreground">Nome do produto</Label>
            <Input
              id="np-name"
              value={newName}
              placeholder="Ex.: Barraca Camping 4P"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addProduct()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-sku" className="text-xs font-medium text-muted-foreground">
              SKU <span className="text-muted-foreground/60">(opcional)</span>
            </Label>
            <Input
              id="np-sku"
              value={newSku}
              placeholder="Opcional"
              onChange={(e) => setNewSku(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addProduct()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Preço @{anchor}%</Label>
            <MoneyInput value={newPrice} onChange={setNewPrice} onEnter={addProduct} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Peso (frete)</Label>
            <Select value={String(newWeight)} onValueChange={(v) => setNewWeight(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ML_WEIGHT_LABELS.map((label, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={addProduct} disabled={upsertProduct.isPending} className="h-10">
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </div>
      </SectionCard>

      {/* ----------------------------- PLANILHA ----------------------------- */}
      <SectionCard
        title="Planilha de preços por margem"
        description="Para cada produto, o preço de venda no ML necessário para atingir cada margem, mantendo fixo o custo a pagar à Matriz. A coluna âncora é o preço que você informou."
      >
        {/* Barra de controles globais (regime/anúncio/TACoS/afiliados/frete) — sticky */}
        {controlsBar}

        {/* Colunas fixas + coluna variável */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Colunas fixas:</span>
          {margins.map((m) => (
            <span
              key={m}
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium",
                m === anchor
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-primary/30 bg-primary/10 text-primary",
              )}
            >
              {m}%{m === anchor && " (âncora)"}
            </span>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          <label className="inline-flex items-center gap-2 rounded-full border border-amber-400/60 bg-amber-50 px-3 py-1">
            <span className="text-xs font-semibold text-amber-700">Coluna variável</span>
            <div className="relative w-24">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={95}
                step="0.5"
                value={Number.isFinite(varMargin) ? varMargin : ""}
                onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVarMargin(Number.isFinite(v) ? Math.min(95, Math.max(0, v)) : 0);
                }}
                className="h-7 border-amber-300 bg-white pl-3 pr-7 text-sm font-semibold tabular-nums"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-amber-600">%</span>
            </div>
          </label>
          <span className="text-[11px] text-muted-foreground">— ajuste em tempo real</span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Carregando planilha…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Table2 className="h-6 w-6" />
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Sua planilha está vazia. Adicione um produto acima com o preço de venda na margem âncora ({anchor}%)
              para começar.
            </p>
          </div>
        ) : (
          <SpreadsheetTable
            rows={rows as Row[]}
            margins={margins}
            anchor={anchor}
            varMargin={varMargin}
            settings={settings}
            onEdit={(id, patch) => upsertProduct.mutate({ id, ...patch })}
            onDelete={(id) => deleteProduct.mutate({ id })}
          />
        )}
      </SectionCard>
    </div>
  );
}

/* --------------------------- tabela da planilha --------------------------- */

function SpreadsheetTable({
  rows,
  margins,
  anchor,
  varMargin,
  settings,
  onEdit,
  onDelete,
}: {
  rows: Row[];
  margins: number[];
  anchor: number;
  varMargin: number;
  settings?: Settings;
  onEdit: (id: number, patch: { name: string; sku?: string; anchorPrice: number; weightIndex: number }) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[24%] min-w-[180px]" />
          <col className="w-[12%]" />
          {margins.map((m) => (
            <col key={m} />
          ))}
          <col />
          <col className="w-[64px]" />
        </colgroup>
        <thead>
          <tr className="bg-muted/50">
            <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2.5 text-left text-xs font-semibold">
              Produto
            </th>
            <th className="border-l border-border px-2 py-2.5 text-right text-xs font-semibold">
              <span className="block leading-tight">Pagar à Matriz</span>
              <span className="block text-[9px] font-normal text-muted-foreground">custo fixo</span>
            </th>
            {margins.map((m) => (
              <th
                key={m}
                className={cn(
                  "border-l border-border px-2 py-2.5 text-right text-xs font-semibold",
                  m === anchor && "bg-primary/10 text-primary",
                )}
              >
                <span className="block leading-tight">{m}%</span>
                <span className="block text-[9px] font-normal text-muted-foreground">
                  {m === anchor ? "informado" : "venda"}
                </span>
              </th>
            ))}
            <th className="border-l border-amber-200 bg-amber-50 px-2 py-2.5 text-right text-xs font-semibold text-amber-700">
              <span className="block leading-tight">{varMargin}%</span>
              <span className="block text-[9px] font-normal text-amber-600">variável</span>
            </th>
            <th className="border-l border-border px-1 py-2.5 text-center text-xs font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ProductRow
              key={row.id}
              row={row}
              margins={margins}
              anchor={anchor}
              varMargin={varMargin}
              settings={settings}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductRow({
  row,
  margins,
  anchor,
  varMargin,
  settings,
  onEdit,
  onDelete,
}: {
  row: Row;
  margins: number[];
  anchor: number;
  varMargin: number;
  settings?: Settings;
  onEdit: (id: number, patch: { name: string; sku?: string; anchorPrice: number; weightIndex: number }) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [sku, setSku] = useState(row.sku ?? "");
  const [price, setPrice] = useState(row.anchorPrice);
  const [weight, setWeight] = useState(row.weightIndex);

  // Mantém os campos em sincronia quando a linha muda externamente (recalcule global).
  useEffect(() => {
    if (!editing) {
      setName(row.name);
      setSku(row.sku ?? "");
      setPrice(row.anchorPrice);
      setWeight(row.weightIndex);
    }
  }, [row.name, row.sku, row.anchorPrice, row.weightIndex, editing]);

  function save() {
    if (!name.trim()) {
      toast.error("O nome não pode ficar vazio.");
      return;
    }
    if (price <= 0) {
      toast.error("Informe um preço válido.");
      return;
    }
    onEdit(row.id, { name: name.trim(), sku: sku.trim() || undefined, anchorPrice: price, weightIndex: weight });
    setEditing(false);
  }

  const cellByMargin = (m: number) => row.cells.find((c) => Math.abs(c.marginPct - m) < 1e-9);
  const feasible = row.matrixCost > 0;

  // Coluna variável: recalculada no cliente em tempo real (sem ida ao servidor).
  const varCell = useMemo(() => {
    if (!settings) return null;
    const globals: MatrixGlobalSettings = {
      ttsRegime: settings.ttsRegime,
      listingType: settings.listingType,
      tacosPercent: settings.tacosPercent,
      affiliatePercent: settings.affiliatePercent,
      freeShipping: settings.freeShipping,
    };
    const res = computeMatrixRow(globals, row.weightIndex, row.anchorPrice, row.anchorMarginPct, [varMargin]);
    return res.cells[0] ?? null;
  }, [settings, row.weightIndex, row.anchorPrice, row.anchorMarginPct, varMargin]);

  if (editing) {
    return (
      <tr className="border-t border-border bg-primary/5">
        <td className="sticky left-0 z-10 bg-primary/5 px-3 py-2.5">
          <div className="space-y-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="h-8" />
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU (opcional)" className="h-8" />
            <Select value={String(weight)} onValueChange={(v) => setWeight(Number(v))}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ML_WEIGHT_LABELS.map((label, i) => (
                  <SelectItem key={i} value={String(i)}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </td>
        <td className="border-l border-border px-2 py-2.5 text-right" colSpan={1}>
          <MoneyInput value={price} onChange={setPrice} prefix="" className="h-8 text-right" onEnter={save} />
          <span className="mt-1 block text-[10px] text-muted-foreground">preço @{anchor}%</span>
        </td>
        <td className="border-l border-border px-2 py-2.5 text-center text-[11px] text-muted-foreground" colSpan={margins.length + 1}>
          Edite o preço âncora e o peso; os preços por margem são recalculados ao salvar.
        </td>
        <td className="border-l border-border px-1 py-2.5">
          <div className="flex items-center justify-center gap-0.5">
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={save}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border transition-colors odd:bg-muted/20 hover:bg-muted/40">
      <td className="sticky left-0 z-10 bg-inherit px-3 py-2.5 align-top">
        <p className="text-sm font-medium leading-snug break-words">{row.name}</p>
        <p className="text-[10px] leading-tight text-muted-foreground break-words">
          {row.sku ? `SKU ${row.sku} · ` : ""}
          {ML_WEIGHT_LABELS[row.weightIndex]}
        </p>
      </td>
      <td className="border-l border-border px-2 py-2.5 text-right">
        {feasible ? (
          <span className="text-sm font-semibold tabular-nums">{formatBRL(row.matrixCost)}</span>
        ) : (
          <span className="text-[11px] text-destructive">inviável</span>
        )}
      </td>
      {margins.map((m) => {
        const cell = cellByMargin(m);
        const isAnchor = m === anchor;
        const ok = cell?.valid ?? false;
        return (
          <td
            key={m}
            className={cn(
              "border-l border-border px-2 py-2.5 text-right text-sm tabular-nums",
              isAnchor && "bg-primary/5",
            )}
          >
            {ok ? (
              <span className={cn("font-medium", isAnchor && "text-primary")}>
                {formatBRL(cell!.sellingPrice)}
              </span>
            ) : (
              <span className="text-[11px] text-destructive">—</span>
            )}
          </td>
        );
      })}
      <td className="border-l border-amber-200 bg-amber-50/60 px-2 py-2.5 text-right text-sm tabular-nums">
        {varCell && varCell.valid ? (
          <span className="font-semibold text-amber-700">{formatBRL(varCell.sellingPrice)}</span>
        ) : (
          <span className="text-[11px] text-destructive">—</span>
        )}
      </td>
      <td className="border-l border-border px-1 py-2.5 align-top">
        <div className="flex items-center justify-center gap-0.5">
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)} title="Editar">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                title="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir “{row.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação remove o produto da planilha permanentemente. Não é possível desfazer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => onDelete(row.id)}
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </td>
    </tr>
  );
}
