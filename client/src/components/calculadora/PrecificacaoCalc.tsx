import { useMemo, useState } from "react";
import { SectionCard } from "@/components/account/AccountUI";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
} from "recharts";
import {
  calculatePricing,
  defaultCommission,
  defaultFixedFee,
  ML_WEIGHT_LABELS,
  type Marketplace,
  type MlListingType,
  type MlLogisticType,
  type MlReputation,
  type PricingInput,
  type PricingMode,
  type OtherCostKind,
} from "@shared/pricing";
import { ChevronDown, Tag, Lock } from "lucide-react";

const LOGISTIC_LABEL: Record<MlLogisticType, string> = {
  padrao: "Padrão",
  full_super: "Full Super",
  cat_especial: "Cat. Especiais",
};

/** Paleta para o donut de distribuição da receita. */
const SHARE_COLORS = [
  "#10b981", // margem (emerald)
  "#6366f1",
  "#0ea5e9",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#ef4444",
];

/** Campo monetário/numérico com prefixo opcional. */
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
          value={Number.isFinite(value) && value !== 0 ? value : value === 0 ? "" : ""}
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

const MODE_LABEL: Record<PricingMode, string> = {
  custo_para_preco: "Custo → Preço",
  preco_para_margem: "Preço → Margem",
};

export default function PrecificacaoCalc() {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [mode, setMode] = useState<PricingMode>("custo_para_preco");
  const [marketplace, setMarketplace] = useState<Marketplace>("mercado_livre");
  const [listingType, setListingType] = useState<MlListingType>("classico");
  const [desiredMargin, setDesiredMargin] = useState(20);
  const [productCost, setProductCost] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [tacosPercent, setTacosPercent] = useState(0);
  const [affiliatePercent, setAffiliatePercent] = useState(0);
  const [otherCostKind, setOtherCostKind] = useState<OtherCostKind>("reais");
  const [otherCostValue, setOtherCostValue] = useState(0);
  const [commissionPercent, setCommissionPercent] = useState(
    defaultCommission("mercado_livre", "classico"),
  );
  const [commissionTouched, setCommissionTouched] = useState(false);
  const [fixedFee, setFixedFee] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  // Auto-alimentação (Mercado Livre)
  const [logisticType, setLogisticType] = useState<MlLogisticType>("padrao");
  const [freeShippingFast, setFreeShippingFast] = useState(false);
  const [highlightCampaign, setHighlightCampaign] = useState(false);
  const [weightIndex, setWeightIndex] = useState(0);
  const [reputation, setReputation] = useState<MlReputation>("verde");
  const [manualShipping, setManualShipping] = useState(false);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [promoPercent, setPromoPercent] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [hideZeros, setHideZeros] = useState(true);

  // autoFees: no ML e na Shopee, taxa fixa e frete são derivados automaticamente.
  const autoFees = marketplace !== "outro";

  // Atualiza a comissão/taxa fixa padrão quando troca canal/tipo (se o usuário não editou).
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
      mode,
      marketplace,
      mlListingType: listingType,
      desiredMargin,
      productCost,
      taxPercent,
      tacosPercent,
      affiliatePercent,
      otherCostKind,
      otherCostValue,
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
      promoPercent,
    }),
    [
      name, sku, mode, marketplace, listingType, desiredMargin, productCost,
      taxPercent, tacosPercent, affiliatePercent, otherCostKind, otherCostValue,
      commissionPercent, fixedFee, shippingCost, autoFees, logisticType,
      freeShippingFast, highlightCampaign, weightIndex, reputation, manualShipping,
      sellingPrice, promoPercent,
    ],
  );

  const result = useMemo(() => calculatePricing(input), [input]);

  const hasInput = mode === "custo_para_preco" ? productCost > 0 : sellingPrice > 0;

  const donutData = result.revenueShare.filter((s) => (hideZeros ? s.amount > 0 : true));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ----------------------------- ENTRADAS ----------------------------- */}
      <div className="space-y-6">
        <SectionCard title="Custos base do produto">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-name" className="text-xs font-medium text-muted-foreground">
                  Nome do produto
                </Label>
                <Input
                  id="p-name"
                  value={name}
                  placeholder="Ex.: Fone Bluetooth XYZ"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-sku" className="text-xs font-medium text-muted-foreground">
                  SKU
                </Label>
                <Input
                  id="p-sku"
                  value={sku}
                  placeholder="Opcional"
                  onChange={(e) => setSku(e.target.value)}
                />
              </div>
            </div>

            {/* Modo de cálculo */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Modo de cálculo</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(MODE_LABEL) as PricingMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm transition-colors",
                      mode === m
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {mode === "custo_para_preco"
                  ? "Informe seus custos e a margem desejada para ver o preço de venda ideal."
                  : "Informe o preço de venda para descobrir a margem real que sobra."}
              </p>
            </div>

            <NumField
              id="p-cost"
              label="Custo do produto"
              prefix="R$"
              value={productCost}
              onChange={setProductCost}
            />

            {mode === "preco_para_margem" && (
              <NumField
                id="p-price"
                label="Preço de venda praticado"
                prefix="R$"
                value={sellingPrice}
                onChange={setSellingPrice}
              />
            )}
          </div>
        </SectionCard>

        {mode === "custo_para_preco" && (
          <SectionCard title="Margem de lucro desejada">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Margem sobre o preço</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={desiredMargin}
                    onChange={(e) => setDesiredMargin(parseFloat(e.target.value) || 0)}
                    className="h-8 w-20 text-right tabular-nums"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <Slider
                value={[Math.min(desiredMargin, 50)]}
                min={0}
                max={50}
                step={1}
                onValueChange={(v) => setDesiredMargin(v[0])}
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
              </div>
            </div>
          </SectionCard>
        )}

        <SectionCard title="Custos e taxas (%)">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumField id="p-tax" label="Impostos" suffix="%" step="0.1" value={taxPercent} onChange={setTaxPercent} />
            <NumField id="p-tacos" label="TACoS / ADS" suffix="%" step="0.1" value={tacosPercent} onChange={setTacosPercent} />
            <NumField id="p-aff" label="Afiliados" suffix="%" step="0.1" value={affiliatePercent} onChange={setAffiliatePercent} />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">Outros custos</Label>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className={otherCostKind === "reais" ? "text-foreground" : ""}>R$</span>
                  <Switch
                    checked={otherCostKind === "percent"}
                    onCheckedChange={(c) => setOtherCostKind(c ? "percent" : "reais")}
                  />
                  <span className={otherCostKind === "percent" ? "text-foreground" : ""}>%</span>
                </div>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {otherCostKind === "reais" ? "R$" : ""}
                </span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={otherCostValue || ""}
                  placeholder="0,00"
                  onChange={(e) => setOtherCostValue(parseFloat(e.target.value) || 0)}
                  className={cn("tabular-nums", otherCostKind === "reais" ? "pl-9" : "pr-8")}
                />
                {otherCostKind === "percent" && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Marketplace">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Canal de venda</Label>
                <Select
                  value={marketplace}
                  onValueChange={(v) => applyMarketplace(v as Marketplace, listingType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                  <Select
                    value={listingType}
                    onValueChange={(v) => applyMarketplace(marketplace, v as MlListingType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classico">Clássico (12%)</SelectItem>
                      <SelectItem value="premium">Premium (17%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Opções logísticas do Mercado Livre (alimentam frete automaticamente) */}
            {marketplace === "mercado_livre" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Modelo logístico</Label>
                    <Select value={logisticType} onValueChange={(v) => setLogisticType(v as MlLogisticType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="padrao">{LOGISTIC_LABEL.padrao}</SelectItem>
                        <SelectItem value="full_super">{LOGISTIC_LABEL.full_super}</SelectItem>
                        <SelectItem value="cat_especial">{LOGISTIC_LABEL.cat_especial}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Peso do produto embalado</Label>
                    <Select value={String(weightIndex)} onValueChange={(v) => setWeightIndex(Number(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {ML_WEIGHT_LABELS.map((lbl, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {lbl}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {logisticType === "cat_especial" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Reputação do vendedor</Label>
                    <Select value={reputation} onValueChange={(v) => setReputation(v as MlReputation)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="verde">Verde (boa)</SelectItem>
                        <SelectItem value="amarela">Amarela (regular)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <span>Frete Grátis Rápido (FGR)</span>
                    <Switch checked={freeShippingFast} onCheckedChange={setFreeShippingFast} />
                  </label>
                  <label className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <span>Campanhas Destaque (+6%)</span>
                    <Switch checked={highlightCampaign} onCheckedChange={setHighlightCampaign} />
                  </label>
                </div>
              </>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Comissão</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    step="0.1"
                    value={commissionPercent || ""}
                    placeholder="0"
                    onChange={(e) => {
                      setCommissionTouched(true);
                      setCommissionPercent(parseFloat(e.target.value) || 0);
                    }}
                    className="pr-8 tabular-nums"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
                {highlightCampaign && (
                  <p className="text-[11px] text-muted-foreground">
                    Efetiva: <strong className="tabular-nums">{result.commissionUsed.toFixed(1)}%</strong> (com campanha)
                  </p>
                )}
              </div>

              {/* Taxa fixa: auto no ML (=0) / editável nos demais */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Taxa fixa</Label>
                {autoFees && marketplace === "mercado_livre" ? (
                  <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-sm tabular-nums text-muted-foreground">
                    <Lock className="h-3.5 w-3.5" />
                    {formatBRL(result.fixedFeeUsed)}
                  </div>
                ) : (
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={fixedFee || ""}
                      placeholder="0,00"
                      onChange={(e) => setFixedFee(parseFloat(e.target.value) || 0)}
                      className="pl-9 tabular-nums"
                    />
                  </div>
                )}
              </div>

              {/* Frete: auto por tabela no ML (com opção manual) / editável nos demais */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">Frete</Label>
                  {marketplace === "mercado_livre" && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      Manual
                      <Switch checked={manualShipping} onCheckedChange={setManualShipping} />
                    </span>
                  )}
                </div>
                {marketplace === "mercado_livre" && !manualShipping ? (
                  <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-sm tabular-nums text-muted-foreground">
                    <Lock className="h-3.5 w-3.5" />
                    {formatBRL(result.shippingUsed)}
                  </div>
                ) : (
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={shippingCost || ""}
                      placeholder="0,00"
                      onChange={(e) => setShippingCost(parseFloat(e.target.value) || 0)}
                      className="pl-9 tabular-nums"
                    />
                  </div>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {marketplace === "mercado_livre"
                ? "No Mercado Livre, a taxa fixa e o frete são preenchidos automaticamente conforme o tipo de anúncio, modelo logístico, FGR, peso e a faixa de preço (tabelas oficiais). Ative “Manual” para informar o frete à mão."
                : "Os valores de comissão, taxa fixa e frete são editáveis conforme as regras do seu canal."}
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Promoção (opcional)">
          <NumField
            id="p-promo"
            label="Desconto promocional sobre o preço"
            suffix="%"
            step="1"
            value={promoPercent}
            onChange={setPromoPercent}
          />
        </SectionCard>
      </div>

      {/* ----------------------------- RESULTADOS ----------------------------- */}
      <div className="space-y-6">
        {!hasInput ? (
          <SectionCard title="Resultados">
            <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Tag className="h-7 w-7" />
              </div>
              <p className="max-w-xs text-sm text-muted-foreground">
                {mode === "custo_para_preco"
                  ? "Informe o custo do produto para ver o preço de venda ideal."
                  : "Informe o preço de venda para ver a margem real."}
              </p>
            </div>
          </SectionCard>
        ) : !result.valid ? (
          <SectionCard title="Resultados">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              {result.error}
            </div>
          </SectionCard>
        ) : (
          <>
            {/* Destaque do preço/margem */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2 rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wider opacity-80">
                  {mode === "custo_para_preco" ? "Preço de venda sugerido" : "Preço informado"}
                </p>
                <p className="mt-1 font-display text-3xl tracking-tight tabular-nums">
                  {formatBRL(result.price)}
                </p>
                {promoPercent > 0 && (
                  <p className="mt-1 text-sm opacity-90">
                    Com promoção de {promoPercent}%:{" "}
                    <strong className="tabular-nums">{formatBRL(result.promoPrice)}</strong>
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Margem de contribuição
                </p>
                <p
                  className={cn(
                    "mt-1 font-display text-2xl tracking-tight tabular-nums",
                    result.contributionMargin < 0 ? "text-rose-600" : "text-emerald-600",
                  )}
                >
                  {formatBRL(result.contributionMargin)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  {result.contributionMarginPct.toFixed(1)}% do preço
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Custo total (break-even)</p>
                <p className="mt-1 font-display text-xl tabular-nums">{formatBRL(result.breakEven)}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Abaixo deste preço a venda dá prejuízo.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Custos variáveis</p>
                <p className="mt-1 font-display text-xl tabular-nums">
                  {result.variableCostPct.toFixed(1)}%
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Comissão + impostos + ADS + afiliados (sobre o preço).
                </p>
              </div>
            </div>

            {/* Donut distribuição da receita */}
            <SectionCard title="Distribuição da receita">
              <div className="grid items-center gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="amount"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={78}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {donutData.map((_, i) => (
                          <Cell key={i} fill={SHARE_COLORS[i % SHARE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RTooltip
                        formatter={(v: number, _n, p) => [
                          `${formatBRL(v)} (${(p.payload as { percent: number }).percent.toFixed(1)}%)`,
                          (p.payload as { label: string }).label,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-1.5">
                  {donutData.map((s, i) => (
                    <li key={s.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: SHARE_COLORS[i % SHARE_COLORS.length] }}
                        />
                        {s.label}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatBRL(s.amount)} · {s.percent.toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </SectionCard>

            {/* Detalhamento expansível */}
            <div className="rounded-2xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setShowDetail((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm font-medium"
              >
                Ver detalhamento do cálculo
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", showDetail ? "rotate-0" : "-rotate-90")}
                />
              </button>
              {showDetail && (
                <div className="space-y-4 border-t border-border px-5 py-4">
                  <label className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
                    Ocultar itens zerados
                    <Switch checked={hideZeros} onCheckedChange={setHideZeros} />
                  </label>

                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Custos fixos (R$)
                    </p>
                    <ul className="space-y-1 text-sm">
                      {result.fixedItems
                        .filter((it) => (hideZeros ? it.amount > 0 : true))
                        .map((it) => (
                          <li key={it.key} className="flex justify-between">
                            <span className="text-muted-foreground">{it.label}</span>
                            <span className="tabular-nums">{formatBRL(it.amount)}</span>
                          </li>
                        ))}
                      <li className="flex justify-between border-t border-border pt-1 font-medium">
                        <span>Total fixo</span>
                        <span className="tabular-nums">{formatBRL(result.fixedTotal)}</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Custos variáveis (% do preço)
                    </p>
                    <ul className="space-y-1 text-sm">
                      {mode === "custo_para_preco" && (
                        <li className="flex justify-between">
                          <span className="text-muted-foreground">Margem desejada ({desiredMargin}%)</span>
                          <span className="tabular-nums">{formatBRL(result.contributionMargin)}</span>
                        </li>
                      )}
                      {result.variableItems
                        .filter((it) => (hideZeros ? (it.percent ?? 0) > 0 : true))
                        .map((it) => (
                          <li key={it.key} className="flex justify-between">
                            <span className="text-muted-foreground">
                              {it.label} ({(it.percent ?? 0).toFixed(1)}%)
                            </span>
                            <span className="tabular-nums">{formatBRL(it.amount)}</span>
                          </li>
                        ))}
                    </ul>
                  </div>

                  <div className="rounded-lg bg-muted/40 p-3">
                    <ul className="space-y-1 text-sm">
                      <li className="flex justify-between">
                        <span className="text-muted-foreground">Custo total (break-even)</span>
                        <span className="tabular-nums">{formatBRL(result.breakEven)}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-muted-foreground">Margem de contribuição</span>
                        <span className="tabular-nums">{formatBRL(result.contributionMargin)}</span>
                      </li>
                      <li className="flex justify-between font-semibold">
                        <span>Preço de venda</span>
                        <span className="tabular-nums">{formatBRL(result.price)}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              Estimativa de gestão para apoiar a decisão de preço. Comissões, taxas e frete reais do
              Mercado Livre variam por categoria e faixa de preço — ajuste os campos conforme o seu anúncio.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
