import { useEffect, useMemo, useState } from "react";
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
import { formatBRL, formatUSD, formatCNY } from "@/lib/format";
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
  RefreshCw,
  Plus,
  X,
  Save,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  PackageCheck,
} from "lucide-react";

const LOGISTIC_LABEL: Record<MlLogisticType, string> = {
  padrao: "Padrão",
  full_super: "Full Super",
  cat_especial: "Cat. Especiais",
};

/** Margens sugeridas iniciais. */
const DEFAULT_MARGINS = [15, 20, 30];

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

  // Parâmetros de custo (mesma régua da calculadora)
  const [taxPercent, setTaxPercent] = useState(0);
  const [tacosPercent, setTacosPercent] = useState(0);
  const [affiliatePercent, setAffiliatePercent] = useState(0);
  const [marketplace, setMarketplace] = useState<Marketplace>("mercado_livre");
  const [listingType, setListingType] = useState<MlListingType>("classico");
  const [commissionPercent, setCommissionPercent] = useState(
    defaultCommission("mercado_livre", "classico"),
  );
  const [commissionTouched, setCommissionTouched] = useState(false);
  const [fixedFee, setFixedFee] = useState(defaultFixedFee("mercado_livre"));
  const [shippingCost, setShippingCost] = useState(0);
  const [logisticType, setLogisticType] = useState<MlLogisticType>("padrao");
  const [freeShippingFast, setFreeShippingFast] = useState(false);
  const [highlightCampaign, setHighlightCampaign] = useState(false);
  const [weightIndex, setWeightIndex] = useState(0);
  const [reputation, setReputation] = useState<MlReputation>("verde");
  const [manualShipping, setManualShipping] = useState(false);

  // Câmbio
  const fx = trpc.pricing.fxRate.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  const [usdToBrl, setUsdToBrl] = useState(0);
  const [rateTouched, setRateTouched] = useState(false);
  const [cnyToBrl, setCnyToBrl] = useState(0);
  const [cnyTouched, setCnyTouched] = useState(false);

  // Quando a cotação chega (e o usuário não editou manualmente), aplica.
  useEffect(() => {
    if (fx.data?.usdToBrl && !rateTouched) {
      setUsdToBrl(Number(fx.data.usdToBrl.toFixed(4)));
    }
  }, [fx.data?.usdToBrl, rateTouched]);

  useEffect(() => {
    if (fx.data?.cnyToBrl && !cnyTouched) {
      setCnyToBrl(Number(fx.data.cnyToBrl.toFixed(4)));
    }
  }, [fx.data?.cnyToBrl, cnyTouched]);

  const autoFees = marketplace !== "outro";

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
      highlightCampaign,
      weightIndex,
      reputation,
      manualShipping,
      sellingPrice,
      promoPercent: 0,
    }),
    [
      name, sku, marketplace, listingType, taxPercent, tacosPercent, affiliatePercent,
      commissionPercent, fixedFee, shippingCost, autoFees, logisticType, freeShippingFast,
      highlightCampaign, weightIndex, reputation, manualShipping, sellingPrice,
    ],
  );

  const sortedMargins = useMemo(() => [...margins].sort((a, b) => a - b), [margins]);

  const result = useMemo(
    () => calculateTargetCost(input, sellingPrice, sortedMargins, usdToBrl, cnyToBrl),
    [input, sellingPrice, sortedMargins, usdToBrl, cnyToBrl],
  );

  const utils = trpc.useUtils();
  const saveMutation = trpc.pricing.history.save.useMutation({
    onSuccess: () => {
      toast.success("Simulação salva no histórico.");
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
      toast.error(result.error || "Preencha o preço de venda e a cotação.");
      return;
    }
    saveMutation.mutate({
      productName: name.trim(),
      sku: sku.trim() || undefined,
      notes: notes.trim() || undefined,
      sellingPrice,
      usdToBrl,
      cnyToBrl: cnyToBrl || undefined,
      margins: sortedMargins,
      params: {
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
        highlightCampaign,
        weightIndex,
        weightLabel: ML_WEIGHT_LABELS[weightIndex],
        reputation,
        manualShipping,
        autoFees,
      },
      results: result.perMargin.map((p) => ({
        marginPct: p.marginPct,
        productCostBRL: p.productCostBRL,
        productCostUSD: p.productCostUSD,
        productCostCNY: p.productCostCNY,
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
        <SectionCard title="Produto e preço de venda">
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
                  SKU
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
            <p className="text-[11px] text-muted-foreground">
              Informe por quanto você quer vender. Descontamos impostos, comissão e toda a logística
              do ML e a margem escolhida — o que sobra é o máximo que você pode pagar pelo produto.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Margens de lucro a testar">
          <div className="space-y-3">
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

        {/* Conversor de câmbio (USD e RMB) */}
        <SectionCard
          title="Câmbio em tempo real (USD e RMB)"
          actions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setRateTouched(false);
                setCnyTouched(false);
                fx.refetch();
              }}
              disabled={fx.isFetching}
            >
              <RefreshCw className={cn("h-4 w-4", fx.isFetching && "animate-spin")} />
              Atualizar
            </Button>
          }
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <NumField
                id="ca-rate"
                label="Dólar (R$ por US$ 1,00)"
                prefix="R$"
                step="0.0001"
                value={usdToBrl}
                onChange={(n) => {
                  setRateTouched(true);
                  setUsdToBrl(n);
                }}
              />
              <NumField
                id="ca-rate-cny"
                label="Yuan/RMB (R$ por ¥ 1,00)"
                prefix="R$"
                step="0.0001"
                value={cnyToBrl}
                onChange={(n) => {
                  setCnyTouched(true);
                  setCnyToBrl(n);
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {fx.isLoading
                ? "Buscando cotações em tempo real…"
                : fx.data
                  ? `Cotações ${fx.data.source === "fallback" ? "estimadas" : "em tempo real"} · atualizadas às ${new Date(
                      fx.data.fetchedAt,
                    ).toLocaleTimeString("pt-BR")}`
                  : "Não foi possível buscar as cotações — informe manualmente."}
              {(rateTouched || cnyTouched) && " · valores editados manualmente"}
            </p>
            {/* Conversor de três moedas */}
            <TriConverter usdToBrl={usdToBrl} cnyToBrl={cnyToBrl} />
          </div>
        </SectionCard>

        <SectionCard title="Impostos e taxas">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumField id="ca-tax" label="Impostos" suffix="%" step="0.1" value={taxPercent} onChange={setTaxPercent} />
            <NumField id="ca-tacos" label="TACoS / ADS" suffix="%" step="0.1" value={tacosPercent} onChange={setTacosPercent} />
            <NumField id="ca-aff" label="Afiliados" suffix="%" step="0.1" value={affiliatePercent} onChange={setAffiliatePercent} />
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
          title="Quanto posso pagar pelo produto"
          actions={
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!result.valid || saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Salvando…" : "Salvar no histórico"}
            </Button>
          }
        >
          {!hasPrice ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <PackageCheck className="h-6 w-6" />
              </div>
              <p className="max-w-xs text-sm text-muted-foreground">
                Informe o preço de venda para descobrir, em cada margem, o custo máximo do produto
                em reais e em dólar.
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
                    "rounded-xl border p-4 transition-colors",
                    p.feasible ? "border-border bg-card" : "border-destructive/30 bg-destructive/5",
                  )}
                >
                  <div className="flex items-center justify-between">
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
                    <span className="text-[11px] text-muted-foreground">
                      Lucro: {formatBRL(p.netProfitBRL)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Custo máx. (R$)</p>
                      <p className={cn("font-display text-lg tabular-nums", !p.feasible && "text-destructive")}>
                        {formatBRL(p.productCostBRL)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Custo máx. (US$)</p>
                      <p className={cn("font-display text-lg tabular-nums", !p.feasible && "text-destructive")}>
                        {formatUSD(p.productCostUSD)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Custo máx. (¥)</p>
                      <p className={cn("font-display text-lg tabular-nums", !p.feasible && "text-destructive")}>
                        {p.productCostCNY != null ? formatCNY(p.productCostCNY) : "—"}
                      </p>
                    </div>
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
                Em seguida descontamos a margem escolhida de cada cenário acima. Cotações usadas:{" "}
                R$ {usdToBrl.toFixed(4)}/US$ 1,00{cnyToBrl > 0 ? ` · R$ ${cnyToBrl.toFixed(4)}/¥ 1,00` : ""}.
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

/**
 * Conversor de três moedas. O usuário digita um valor e escolhe a moeda de
 * origem; mostramos a conversão nas outras duas em tempo real (via BRL).
 */
function TriConverter({ usdToBrl, cnyToBrl }: { usdToBrl: number; cnyToBrl: number }) {
  const [amount, setAmount] = useState(1);
  const [base, setBase] = useState<"BRL" | "USD" | "CNY">("USD");

  // Converte o valor digitado (na moeda base) para BRL.
  const inBrl =
    base === "BRL"
      ? amount
      : base === "USD"
        ? usdToBrl > 0
          ? amount * usdToBrl
          : null
        : cnyToBrl > 0
          ? amount * cnyToBrl
          : null;

  const brl = inBrl;
  const usd = inBrl != null && usdToBrl > 0 ? inBrl / usdToBrl : null;
  const cny = inBrl != null && cnyToBrl > 0 ? inBrl / cnyToBrl : null;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">Conversor rápido</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={amount !== 0 ? amount : ""}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            className="h-9 tabular-nums"
          />
        </div>
        <Select value={base} onValueChange={(v) => setBase(v as "BRL" | "USD" | "CNY")}>
          <SelectTrigger className="h-9 w-24 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BRL">R$ (BRL)</SelectItem>
            <SelectItem value="USD">US$ (USD)</SelectItem>
            <SelectItem value="CNY">¥ (RMB)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-0.5">
        <ConvCell label="R$" value={base === "BRL" ? null : brl != null ? formatBRL(brl) : "—"} active={base === "BRL"} />
        <ConvCell label="US$" value={base === "USD" ? null : usd != null ? formatUSD(usd) : "—"} active={base === "USD"} />
        <ConvCell label="¥" value={base === "CNY" ? null : cny != null ? formatCNY(cny) : "—"} active={base === "CNY"} />
      </div>
    </div>
  );
}

function ConvCell({ label, value, active }: { label: string; value: string | null; active: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5",
        active ? "border-primary/40 bg-primary/10" : "border-border bg-background",
      )}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm tabular-nums">{active ? "(origem)" : value}</p>
    </div>
  );
}
