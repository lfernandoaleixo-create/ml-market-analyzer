import { useEffect, useMemo, useRef, useState } from "react";
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
  type MlListingType,
  type MatrixTtsRegime,
} from "@shared/pricing";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  /* ----- adicionar margem (coluna) ----- */
  const [newMargin, setNewMargin] = useState("");
  function addMargin() {
    const v = parseFloat(newMargin.replace(",", "."));
    if (!settings) return;
    if (!Number.isFinite(v) || v < 0 || v > 95) {
      toast.error("Margem inválida (0 a 95%).");
      return;
    }
    if (settings.margins.includes(v)) {
      setNewMargin("");
      return;
    }
    upsertSettings.mutate({ margins: [...settings.margins, v] });
    setNewMargin("");
  }
  function removeMargin(m: number) {
    if (!settings) return;
    if (m === settings.anchorMarginPct) {
      toast.error("A coluna âncora não pode ser removida.");
      return;
    }
    upsertSettings.mutate({ margins: settings.margins.filter((x) => x !== m) });
  }

  const anchor = settings?.anchorMarginPct ?? 20;
  const margins = settings?.margins ?? [20, 15, 25, 30, 35, 40];

  return (
    <div className="space-y-6">
      {/* ----------------------- CONTROLES GLOBAIS ----------------------- */}
      <SectionCard
        title="Controles globais"
        description="Estes ajustes valem para TODOS os produtos da planilha de uma vez. Você informa, por produto, o preço de venda no ML que dá a margem âncora; calculamos o preço a pagar à Matriz e o preço de venda necessário para cada outra margem."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Regime TTS */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Regime tributário</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => upsertSettings.mutate({ ttsRegime: "com_tts" })}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-all active:scale-[0.99]",
                  settings?.ttsRegime !== "sem_tts"
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className={cn("h-4 w-4", settings?.ttsRegime !== "sem_tts" ? "text-primary" : "text-muted-foreground")} />
                  COM TTS
                </span>
                <span className="text-[11px] text-muted-foreground">Impostos 14%</span>
              </button>
              <button
                type="button"
                onClick={() => upsertSettings.mutate({ ttsRegime: "sem_tts" })}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-all active:scale-[0.99]",
                  settings?.ttsRegime === "sem_tts"
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <span className="text-sm font-semibold">SEM TTS</span>
                <span className="text-[11px] text-muted-foreground">Impostos 24%</span>
              </button>
            </div>
          </div>

          {/* Tipo de anúncio */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Tipo de anúncio</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => upsertSettings.mutate({ listingType: "classico" })}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-all active:scale-[0.99]",
                  settings?.listingType !== "premium"
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <span className="text-sm font-semibold">Clássico</span>
                <span className="text-[11px] text-muted-foreground">Comissão 12%</span>
              </button>
              <button
                type="button"
                onClick={() => upsertSettings.mutate({ listingType: "premium" })}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-all active:scale-[0.99]",
                  settings?.listingType === "premium"
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <span className="text-sm font-semibold">Premium</span>
                <span className="text-[11px] text-muted-foreground">Comissão 17%</span>
              </button>
            </div>
          </div>

          {/* TACoS / Afiliados / Frete grátis */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">TACoS / ADS</Label>
              <div className="relative">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={0}
                  value={settings ? settings.tacosPercent : ""}
                  onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                  onChange={(e) =>
                    upsertSettings.mutate({ tacosPercent: parseFloat(e.target.value) || 0 })
                  }
                  className="pr-7 tabular-nums"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Afiliados</Label>
              <div className="relative">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={0}
                  value={settings ? settings.affiliatePercent : ""}
                  onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                  onChange={(e) =>
                    upsertSettings.mutate({ affiliatePercent: parseFloat(e.target.value) || 0 })
                  }
                  className="pr-7 tabular-nums"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
            </div>
          </div>

          <div className="flex items-end">
            <label className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm">
              <span>
                Frete grátis (full/flex)
                <span className="block text-[11px] text-muted-foreground">Debita o frete do vendedor</span>
              </span>
              <Switch
                checked={settings?.freeShipping ?? true}
                onCheckedChange={(v) => upsertSettings.mutate({ freeShipping: v })}
              />
            </label>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-[11px] text-muted-foreground">
          Régua atual: <span className="font-medium text-foreground">{settings?.ttsRegime === "sem_tts" ? "SEM TTS (24%)" : "COM TTS (14%)"}</span>
          {" · "}
          <span className="font-medium text-foreground">{settings?.listingType === "premium" ? "Premium (17%)" : "Clássico (12%)"}</span>
          {" · "}TACoS {settings?.tacosPercent ?? 3}% · Afiliados {settings?.affiliatePercent ?? 0}% · âncora {anchor}%
        </div>
      </SectionCard>

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
        {/* Gerenciar colunas (margens) */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Margens (colunas):</span>
          {margins.map((m) => (
            <span
              key={m}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
                m === anchor
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-primary/30 bg-primary/10 text-primary",
              )}
            >
              {m}%{m === anchor && " (âncora)"}
              {m !== anchor && (
                <button
                  type="button"
                  onClick={() => removeMargin(m)}
                  className="rounded-full p-0.5 text-primary/70 transition-colors hover:bg-primary/20 hover:text-primary"
                  aria-label={`Remover margem ${m}%`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          <div className="relative w-24">
            <Input
              type="number"
              min={0}
              max={95}
              value={newMargin}
              placeholder="Ex.: 45"
              onChange={(e) => setNewMargin(e.target.value)}
              onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addMargin();
                }
              }}
              className="h-8 pr-6 text-sm tabular-nums"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 bg-card" onClick={addMargin}>
            <Plus className="h-3.5 w-3.5" />
            Coluna
          </Button>
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
  onEdit,
  onDelete,
}: {
  rows: Row[];
  margins: number[];
  anchor: number;
  onEdit: (id: number, patch: { name: string; sku?: string; anchorPrice: number; weightIndex: number }) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="sticky left-0 z-10 min-w-[220px] bg-muted/50 px-4 py-3 text-left font-semibold">
              Produto
            </th>
            <th className="min-w-[120px] px-4 py-3 text-right font-semibold">
              <span className="block">Pagar à Matriz</span>
              <span className="block text-[10px] font-normal text-muted-foreground">custo fixo</span>
            </th>
            {margins.map((m) => (
              <th
                key={m}
                className={cn(
                  "min-w-[110px] px-4 py-3 text-right font-semibold",
                  m === anchor && "bg-primary/10 text-primary",
                )}
              >
                <span className="block">Margem {m}%</span>
                <span className="block text-[10px] font-normal text-muted-foreground">
                  {m === anchor ? "preço informado" : "preço de venda"}
                </span>
              </th>
            ))}
            <th className="min-w-[90px] px-4 py-3 text-center font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ProductRow
              key={row.id}
              row={row}
              margins={margins}
              anchor={anchor}
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
  onEdit,
  onDelete,
}: {
  row: Row;
  margins: number[];
  anchor: number;
  onEdit: (id: number, patch: { name: string; sku?: string; anchorPrice: number; weightIndex: number }) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [sku, setSku] = useState(row.sku ?? "");
  const [price, setPrice] = useState(row.anchorPrice);
  const [weight, setWeight] = useState(row.weightIndex);
  const [confirmDel, setConfirmDel] = useState(false);
  const confirmRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function handleDelete() {
    if (confirmDel) {
      if (confirmRef.current) clearTimeout(confirmRef.current);
      onDelete(row.id);
      return;
    }
    setConfirmDel(true);
    confirmRef.current = setTimeout(() => setConfirmDel(false), 3000);
  }

  const cellByMargin = (m: number) => row.cells.find((c) => Math.abs(c.marginPct - m) < 1e-9);
  const feasible = row.matrixCost > 0;

  if (editing) {
    return (
      <tr className="border-t border-border bg-primary/5">
        <td className="sticky left-0 z-10 bg-primary/5 px-4 py-3">
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
        <td className="px-4 py-3 text-right" colSpan={1}>
          <MoneyInput value={price} onChange={setPrice} prefix="" className="h-8 text-right" onEnter={save} />
          <span className="mt-1 block text-[10px] text-muted-foreground">preço @{anchor}%</span>
        </td>
        <td className="px-4 py-3 text-center text-xs text-muted-foreground" colSpan={margins.length}>
          Edite o preço âncora e o peso; os preços por margem são recalculados ao salvar.
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-center gap-1">
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" onClick={save}>
              <Check className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border transition-colors hover:bg-muted/30">
      <td className="sticky left-0 z-10 bg-card px-4 py-3">
        <p className="font-medium leading-tight">{row.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {row.sku ? `SKU ${row.sku} · ` : ""}
          {ML_WEIGHT_LABELS[row.weightIndex]}
        </p>
      </td>
      <td className="px-4 py-3 text-right">
        {feasible ? (
          <span className="font-display text-base font-semibold tabular-nums">{formatBRL(row.matrixCost)}</span>
        ) : (
          <span className="text-xs text-destructive">inviável</span>
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
              "px-4 py-3 text-right tabular-nums",
              isAnchor && "bg-primary/5",
            )}
          >
            {ok ? (
              <span className={cn("font-medium", isAnchor && "text-primary")}>
                {formatBRL(cell!.sellingPrice)}
              </span>
            ) : (
              <span className="text-xs text-destructive">—</span>
            )}
          </td>
        );
      })}
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-1">
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn("h-8 w-8", confirmDel ? "text-destructive" : "text-muted-foreground")}
            onClick={handleDelete}
            title={confirmDel ? "Clique de novo para confirmar" : "Excluir"}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
