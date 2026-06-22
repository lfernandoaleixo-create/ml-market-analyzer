import { useMemo, useState } from "react";
import { SectionCard } from "@/components/account/AccountUI";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  calculateTargetCost,
  defaultCommission,
  defaultFixedFee,
  ML_WEIGHT_LABELS,
  type Marketplace,
  type MlListingType,
  type MlLogisticType,
  type MlReputation,
  type PricingInput,
} from "@shared/pricing";
import {
  Plus,
  X,
  Save,
  CheckCircle2,
  AlertTriangle,
  PackageCheck,
  Sparkles,
} from "lucide-react";

const LOGISTIC_LABEL: Record<MlLogisticType, string> = {
  padrao: "Padrão",
  full_super: "Full Super",
  cat_especial: "Cat. Especiais",
};

/** Margens sugeridas iniciais. */
const DEFAULT_MARGINS = [20, 30, 40];

/** Alíquota de impostos por regime de TTS (Tratamento Tributário). */
const TTS_TAX_PERCENT = 14;
const NO_TTS_TAX_PERCENT = 24;

/** Defaults editáveis solicitados pelo Fernando. */
const DEFAULT_TACOS = 3;
const DEFAULT_AFFILIATE = 0;

/** Campo numérico com prefixo/sufixo (mesmo visual da calculadora). */
function NumField({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = "0.01",
  placeholder = "0,00",
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {prefix}
          </span>
        )}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={0}
          value={value !== 0 ? value : ""}
          placeholder={placeholder}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className={cn("tabular-nums", prefix ? "pl-9" : "", suffix ? "pr-8" : "")}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export default function CustoAlvoCalc() {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [notes, setNotes] = useState("");
  const [sellingPrice, setSellingPrice] = useState(0);
  const [margins, setMargins] = useState<number[]>(DEFAULT_MARGINS);
  const [newMargin, setNewMargin] = useState("");

  // Regime tributário: COM TTS (14%) por padrão; SEM TTS (24%).
  const [hasTts, setHasTts] = useState(true);
  const [taxTouched, setTaxTouched] = useState(false);
  const [taxPercent, setTaxPercent] = useState(TTS_TAX_PERCENT);

  // Demais parâmetros (defaults editáveis).
  const [tacosPercent, setTacosPercent] = useState(DEFAULT_TACOS);
  const [affiliatePercent, setAffiliatePercent] = useState(DEFAULT_AFFILIATE);
  const [marketplace, setMarketplace] = useState<Marketplace>("mercado_livre");
  const [listingType, setListingType] = useState<MlListingType>("classico");
  const [commissionPercent, setCommissionPercent] = useState(
    defaultCommission("mercado_livre", "classico"),
  );
  const [commissionTouched, setCommissionTouched] = useState(false);
  const [fixedFee, setFixedFee] = useState(defaultFixedFee("mercado_livre"));
  const [shippingCost, setShippingCost] = useState(0);
  const [logisticType, setLogisticType] = useState<MlLogisticType>("padrao");
  const [freeShippingFast, setFreeShippingFast] = useState(true);
  const [weightIndex, setWeightIndex] = useState(0);
  const [reputation, setReputation] = useState<MlReputation>("verde");
  const [manualShipping, setManualShipping] = useState(false);

  const autoFees = marketplace !== "outro";

  /** Alterna COM/SEM TTS e aplica a alíquota correspondente (se não editada à mão). */
  function toggleTts(next: boolean) {
    setHasTts(next);
    if (!taxTouched) {
      setTaxPercent(next ? TTS_TAX_PERCENT : NO_TTS_TAX_PERCENT);
    }
  }

  function applyMarketplace(mk: Marketplace, lt: MlListingType) {
    setMarketplace(mk);
    setListingType(lt);
    if (!commissionTouched) setCommissionPercent(defaultCommission(mk, lt));
    setFixedFee(defaultFixedFee(mk));
    if (mk === "outro") setManualShipping(false);
  }

  const input: PricingInput = useMemo(
    () => ({
      name,
      sku,
      mode: "preco_para_margem",
      marketplace,
      mlListingType: listingType,
      desiredMargin: 0,
      productCost: 0,
      taxPercent,
      tacosPercent,
      affiliatePercent,
      otherCostKind: "reais",
      otherCostValue: 0,
      commissionPercent,
      fixedFee,
      shippingCost,
      autoFees,
      mlLogisticType: logisticType,
      freeShippingFast,
      highlightCampaign: false,
      weightIndex,
      reputation,
      manualShipping,
      sellingPrice,
      promoPercent: 0,
    }),
    [
      name, sku, marketplace, listingType, taxPercent, tacosPercent, affiliatePercent,
      commissionPercent, fixedFee, shippingCost, autoFees, logisticType, freeShippingFast,
      weightIndex, reputation, manualShipping, sellingPrice,
    ],
  );

  const sortedMargins = useMemo(() => [...margins].sort((a, b) => a - b), [margins]);

  // Cálculo em R$ (a cotação é irrelevante aqui — passamos 1 só para validar).
  const result = useMemo(
    () => calculateTargetCost(input, sellingPrice, sortedMargins, 1),
    [input, sellingPrice, sortedMargins],
  );

  const utils = trpc.useUtils();
  const saveMutation = trpc.pricing.history.save.useMutation({
    onSuccess: () => {
      toast.success("Pesquisa fixada no histórico (planilha).");
      utils.pricing.history.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Não foi possível salvar."),
  });

  function addMargin() {
    const v = parseFloat(newMargin.replace(",", "."));
    if (!Number.isFinite(v) || v < 0 || v > 100) return;
    if (margins.includes(v)) {
      setNewMargin("");
      return;
    }
    setMargins((prev) => [...prev, v]);
    setNewMargin("");
  }

  function removeMargin(m: number) {
    setMargins((prev) => (prev.length > 1 ? prev.filter((x) => x !== m) : prev));
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error("Informe o nome do produto para salvar.");
      return;
    }
    if (!result.valid) {
      toast.error(result.error || "Preencha o preço de venda.");
      return;
    }
    saveMutation.mutate({
      productName: name.trim(),
      sku: sku.trim() || undefined,
      notes: notes.trim() || undefined,
      sellingPrice,
      usdToBrl: 1, // não usado neste fluxo (mantido por compatibilidade do schema)
      margins: sortedMargins,
      params: {
        hasTts,
        taxPercent,
        tacosPercent,
        affiliatePercent,
        marketplace,
        listingType,
        commissionPercent: result.commissionUsed,
        fixedFee: result.fixedFeeUsed,
        shippingCost: result.shippingUsed,
        logisticType,
        freeShippingFast,
        weightIndex,
        weightLabel: ML_WEIGHT_LABELS[weightIndex],
        reputation,
        manualShipping,
        autoFees,
      },
      results: result.perMargin.map((p) => ({
        marginPct: p.marginPct,
        productCostBRL: p.productCostBRL,
        productCostUSD: 0,
        netProfitBRL: p.netProfitBRL,
        feasible: p.feasible,
      })),
    });
  }

  const hasPrice = sellingPrice > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ----------------------------- ENTRADAS ----------------------------- */}
      <div className="space-y-6">
        <SectionCard
          title="Produto e preço de venda"
          description="Você informa por quanto quer vender no Mercado Livre. Descontando comissão, impostos, ADS e a logística do ML — e a margem desejada — calculamos quanto a sua filial (ML) pode pagar à Matriz (loja no Brasil que te abastece) por cada produto."
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ca-name" className="text-xs font-medium text-muted-foreground">
                  Nome do produto
                </Label>
                <Input
                  id="ca-name"
                  value={name}
                  placeholder="Ex.: Fone Bluetooth XYZ"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ca-sku" className="text-xs font-medium text-muted-foreground">
                  SKU <span className="text-muted-foreground/60">(opcional)</span>
                </Label>
                <Input
                  id="ca-sku"
                  value={sku}
                  placeholder="Opcional"
                  onChange={(e) => setSku(e.target.value)}
                />
              </div>
            </div>
            <NumField
              id="ca-price"
              label="Preço de venda no Mercado Livre"
              prefix="R$"
              value={sellingPrice}
              onChange={setSellingPrice}
            />
          </div>
        </SectionCard>

        {/* Regime tributário com alternador COM/SEM TTS */}
        <SectionCard
          title="Regime tributário (TTS)"
          description="COM TTS seus impostos são 14%. SEM TTS são 24%. Você pode ajustar a alíquota manualmente, se precisar."
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => toggleTts(true)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-all active:scale-[0.99]",
                  hasTts
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className={cn("h-4 w-4", hasTts ? "text-primary" : "text-muted-foreground")} />
                  COM TTS
                </span>
                <span className="text-[11px] text-muted-foreground">Impostos 14%</span>
              </button>
              <button
                type="button"
                onClick={() => toggleTts(false)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-all active:scale-[0.99]",
                  !hasTts
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <span className="text-sm font-semibold">SEM TTS</span>
                <span className="text-[11px] text-muted-foreground">Impostos 24%</span>
              </button>
            </div>
            <NumField
              id="ca-tax"
              label="Impostos aplicados"
              suffix="%"
              step="0.1"
              value={taxPercent}
              onChange={(n) => {
                setTaxTouched(true);
                setTaxPercent(n);
              }}
            />
            {taxTouched && (
              <button
                type="button"
                onClick={() => {
                  setTaxTouched(false);
                  setTaxPercent(hasTts ? TTS_TAX_PERCENT : NO_TTS_TAX_PERCENT);
                }}
                className="text-[11px] text-primary hover:underline"
              >
                Voltar ao padrão do regime ({hasTts ? "14%" : "24%"})
              </button>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Margens de lucro a testar">
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Cada margem vira uma coluna na planilha do histórico. Adicione quantas quiser.
            </p>
            <div className="flex flex-wrap gap-2">
              {sortedMargins.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                >
                  {m}%
                  <button
                    type="button"
                    onClick={() => removeMargin(m)}
                    className="rounded-full p-0.5 text-primary/70 transition-colors hover:bg-primary/20 hover:text-primary"
                    aria-label={`Remover margem ${m}%`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-28">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={newMargin}
                  placeholder="Ex.: 25"
                  onChange={(e) => setNewMargin(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addMargin();
                    }
                  }}
                  className="pr-7 tabular-nums"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
              <Button type="button" variant="outline" size="sm" className="bg-card" onClick={addMargin}>
                <Plus className="h-4 w-4" />
                Adicionar margem
              </Button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Custos de venda (editáveis)">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumField id="ca-tacos" label="TACoS / ADS" suffix="%" step="0.1" value={tacosPercent} onChange={setTacosPercent} />
            <NumField id="ca-aff" label="Afiliados + outros" suffix="%" step="0.1" value={affiliatePercent} onChange={setAffiliatePercent} />
            {marketplace === "outro" && (
              <NumField id="ca-comm-o" label="Comissão" suffix="%" step="0.1" value={commissionPercent} onChange={(n) => { setCommissionTouched(true); setCommissionPercent(n); }} />
            )}
          </div>
        </SectionCard>

        <SectionCard title="Marketplace e logística">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Canal de venda</Label>
                <Select value={marketplace} onValueChange={(v) => applyMarketplace(v as Marketplace, listingType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mercado_livre">Mercado Livre</SelectItem>
                    <SelectItem value="shopee">Shopee</SelectItem>
                    <SelectItem value="outro">Outro marketplace</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {marketplace === "mercado_livre" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Tipo de anúncio</Label>
                  <Select value={listingType} onValueChange={(v) => applyMarketplace(marketplace, v as MlListingType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classico">Clássico (12%)</SelectItem>
                      <SelectItem value="premium">Premium (17%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {marketplace === "mercado_livre" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Logística</Label>
                    <Select value={logisticType} onValueChange={(v) => setLogisticType(v as MlLogisticType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(LOGISTIC_LABEL) as MlLogisticType[]).map((k) => (
                          <SelectItem key={k} value={k}>{LOGISTIC_LABEL[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Faixa de peso</Label>
                    <Select value={String(weightIndex)} onValueChange={(v) => setWeightIndex(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        {ML_WEIGHT_LABELS.map((label, i) => (
                          <SelectItem key={i} value={String(i)}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Reputação</Label>
                    <Select value={reputation} onValueChange={(v) => setReputation(v as MlReputation)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="verde">Verde</SelectItem>
                        <SelectItem value="amarela">Amarela/outras</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col justify-end gap-2 pb-1">
                    <label className="flex items-center justify-between text-xs text-muted-foreground">
                      Frete grátis (full/flex)
                      <Switch checked={freeShippingFast} onCheckedChange={setFreeShippingFast} />
                    </label>
                    <label className="flex items-center justify-between text-xs text-muted-foreground">
                      Frete manual
                      <Switch checked={manualShipping} onCheckedChange={setManualShipping} />
                    </label>
                  </div>
                </div>
              </>
            )}

            {(manualShipping || marketplace === "outro") && (
              <NumField id="ca-ship" label="Frete (R$)" prefix="R$" value={shippingCost} onChange={setShippingCost} />
            )}
            {marketplace === "outro" && (
              <NumField id="ca-fixed" label="Taxa fixa (R$)" prefix="R$" value={fixedFee} onChange={setFixedFee} />
            )}
          </div>
        </SectionCard>
      </div>

      {/* ----------------------------- RESULTADOS ----------------------------- */}
      <div className="space-y-6">
        <SectionCard
          title="Preço a ser pago para a Matriz"
          description="O máximo que sua filial (ML) pode pagar à Matriz, por margem desejada. Sem impostos de importação ou navegação — só a régua do Mercado Livre."
          actions={
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!result.valid || saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Salvando…" : "Fixar no histórico"}
            </Button>
          }
        >
          {!hasPrice ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <PackageCheck className="h-6 w-6" />
              </div>
              <p className="max-w-xs text-sm text-muted-foreground">
                Informe o preço de venda para descobrir, em cada margem, o preço máximo a pagar
                para a Matriz (em R$).
              </p>
            </div>
          ) : !result.valid ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {result.error}
            </div>
          ) : (
            <div className="space-y-3">
              {result.perMargin.map((p) => (
                <div
                  key={p.marginPct}
                  className={cn(
                    "flex items-center justify-between rounded-xl border p-4 transition-colors",
                    p.feasible ? "border-border bg-card" : "border-destructive/30 bg-destructive/5",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={p.feasible ? "default" : "destructive"} className="rounded-md">
                      Margem {p.marginPct}%
                    </Badge>
                    {p.feasible ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> viável
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" /> inviável neste preço
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pagar à Matriz</p>
                    <p className={cn("font-display text-xl tabular-nums", !p.feasible && "text-destructive")}>
                      {formatBRL(p.productCostBRL)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {hasPrice && result.valid && (
          <SectionCard title="Como chegamos nesse valor">
            <div className="space-y-2 text-sm">
              <Row label="Preço de venda" value={formatBRL(result.sellingPrice)} strong />
              {result.variableDeductions.map((d) => (
                <Row
                  key={d.key}
                  label={`${d.label}${d.percent ? ` (${d.percent}%)` : ""}`}
                  value={`− ${formatBRL(d.amount)}`}
                  muted
                />
              ))}
              {result.fixedDeductions
                .filter((d) => d.amount > 0)
                .map((d) => (
                  <Row key={d.key} label={d.label} value={`− ${formatBRL(d.amount)}`} muted />
                ))}
              <div className="border-t border-border pt-2 text-[11px] text-muted-foreground">
                Em seguida descontamos a margem escolhida de cada cenário acima. Regime:{" "}
                <span className="font-medium text-foreground">{hasTts ? "COM TTS (14%)" : "SEM TTS (24%)"}</span>.
              </div>
            </div>
          </SectionCard>
        )}

        <SectionCard title="Observações (opcional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anote o fornecedor, condições, prazos… (salvo junto no histórico)"
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </SectionCard>
      </div>
    </div>
  );
}

/** Linha simples label/valor. */
function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn(muted ? "text-muted-foreground" : "")}>{label}</span>
      <span className={cn("tabular-nums", strong && "font-semibold")}>{value}</span>
    </div>
  );
}
