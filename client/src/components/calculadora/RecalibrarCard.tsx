import { SlidersHorizontal, X, RotateCcw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ML_WEIGHT_LABELS } from "@shared/pricing";
import {
  autoFieldValues,
  type ActiveListingRow,
  type ListingOverrides,
} from "@shared/activeListings";

/**
 * Card de recalibragem — replica os campos da Calculadora de Precificação para
 * que o usuário ajuste os insumos (imposto, custo, comissão, frete, peso, etc.)
 * dos anúncios SELECIONADOS. Em lote (vários selecionados) aplica a todos; com um
 * único selecionado, vira ajuste fino daquele anúncio.
 *
 * Campos deixados em branco/"automático" usam o valor real do anúncio — e, quando
 * há exatamente UM anúncio selecionado, o card mostra qual valor automático está
 * sendo usado em cada campo, para o usuário decidir se troca para manual.
 */

export interface RecalibrarCardProps {
  /** Quantidade de anúncios atualmente selecionados. */
  selectedCount: number;
  /** Overrides correntes (aplicados aos selecionados). */
  value: ListingOverrides;
  /** Atualiza um campo do override (undefined = "usar valor real"). */
  onChange: (patch: ListingOverrides) => void;
  /** Limpa todos os overrides dos selecionados. */
  onClear: () => void;
  /** Fecha o card (desmarca tudo). */
  onClose: () => void;
  /** Imposto (%) corrente (default global). Editável aqui dentro. */
  taxPercent: number;
  /** Atualiza o imposto (%) global. */
  onTaxChange: (value: number) => void;
  /** Opções de imposto (%) do seletor. */
  taxOptions: number[];
  /**
   * Linha REAL do único anúncio selecionado (já recalculada) — usada para
   * mostrar os valores automáticos por campo. undefined em lote (>1 selecionado).
   */
  autoRow?: ActiveListingRow;
}

/** Converte string de input num número ou undefined (campo vazio = automático). */
function toNum(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Valor de exibição de um campo numérico de override. */
function numStr(v: number | undefined): string {
  return v == null ? "" : String(v);
}

const AUTO = "__auto__";

export default function RecalibrarCard({
  selectedCount,
  value,
  onChange,
  onClear,
  onClose,
  taxPercent,
  onTaxChange,
  taxOptions,
  autoRow,
}: RecalibrarCardProps) {
  const set = (patch: ListingOverrides) => onChange(patch);
  // Rótulos "auto: …" só fazem sentido com 1 anúncio selecionado.
  const auto = autoRow ? autoFieldValues(autoRow) : null;

  return (
    <div className="rounded-xl border border-sky-500/30 bg-sky-500/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/12 text-sky-600">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-base tracking-tight">
              Recalibrar como na calculadora
            </h3>
            <p className="text-xs text-muted-foreground">
              {selectedCount === 1
                ? "Ajuste fino deste anúncio. Em branco = usa o valor automático mostrado abaixo de cada campo."
                : `Aplicando a ${selectedCount} anúncios selecionados. Campos em branco usam o valor real de cada um.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClear}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Limpar ajustes
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {selectedCount === 1 && (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-sky-500/20 bg-sky-500/[0.06] px-3 py-2 text-xs text-sky-700">
          <Wand2 className="h-3.5 w-3.5 shrink-0" />
          <span>
            Os valores marcados como <strong>auto</strong> são os que o sistema está usando agora
            neste anúncio. Deixe em branco para mantê-los ou digite/selecione para sobrescrever.
          </span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
        {/* Imposto (%) — agora DENTRO do card, junto das demais opções */}
        <Field label="Imposto (%)" hint="aplica-se a todos os cálculos da tabela">
          <Select value={String(taxPercent)} onValueChange={(v) => onTaxChange(Number(v))}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {taxOptions.map((t) => (
                <SelectItem key={t} value={String(t)}>
                  {t.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* Custo (R$) — sobrescreve Baselinker */}
        <Field
          label="Custo do produto (R$)"
          auto={value.cost == null ? auto?.cost : undefined}
          fallbackHint="vazio = custo do Baselinker"
        >
          <Input
            inputMode="decimal"
            placeholder={auto ? `auto: ${auto.cost}` : "auto"}
            value={numStr(value.cost)}
            onChange={(e) => set({ cost: toNum(e.target.value) })}
          />
        </Field>

        {/* Comissão (%) */}
        <Field
          label="Comissão (%)"
          auto={value.commissionPercent == null ? auto?.commissionPercent : undefined}
          fallbackHint="vazio = padrão do tipo"
        >
          <Input
            inputMode="decimal"
            placeholder={auto ? `auto: ${auto.commissionPercent}` : "auto"}
            value={numStr(value.commissionPercent)}
            onChange={(e) => set({ commissionPercent: toNum(e.target.value) })}
          />
        </Field>

        {/* Tipo de anúncio */}
        <Field
          label="Tipo de anúncio"
          auto={value.mlListingType == null ? auto?.mlListingType : undefined}
        >
          <Select
            value={value.mlListingType ?? AUTO}
            onValueChange={(v) =>
              set({ mlListingType: v === AUTO ? undefined : (v as "classico" | "premium") })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO}>Automático</SelectItem>
              <SelectItem value="classico">Clássico</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {/* Logística */}
        <Field
          label="Logística"
          auto={value.mlLogisticType == null ? auto?.mlLogisticType : undefined}
        >
          <Select
            value={value.mlLogisticType ?? AUTO}
            onValueChange={(v) =>
              set({
                mlLogisticType:
                  v === AUTO ? undefined : (v as "padrao" | "full_super" | "cat_especial"),
              })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO}>Automático</SelectItem>
              <SelectItem value="padrao">Padrão (Clássico)</SelectItem>
              <SelectItem value="full_super">Full / Super</SelectItem>
              <SelectItem value="cat_especial">Categorias especiais</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {/* Peso (faixa) */}
        <Field
          label="Peso (faixa)"
          auto={value.weightIndex == null ? auto?.weight : undefined}
          fallbackHint="vazio = peso real do anúncio"
        >
          <Select
            value={value.weightIndex != null ? String(value.weightIndex) : AUTO}
            onValueChange={(v) => set({ weightIndex: v === AUTO ? undefined : Number(v) })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={AUTO}>Automático (real)</SelectItem>
              {ML_WEIGHT_LABELS.map((label, idx) => (
                <SelectItem key={idx} value={String(idx)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* Frete manual (R$) */}
        <Field
          label="Frete manual (R$)"
          auto={value.shippingCost == null ? auto?.shippingCost : undefined}
          fallbackHint="vazio = tabela por peso"
        >
          <Input
            inputMode="decimal"
            placeholder={auto ? `auto: ${auto.shippingCost}` : "auto"}
            value={numStr(value.shippingCost)}
            onChange={(e) => {
              const n = toNum(e.target.value);
              set({ shippingCost: n, manualShipping: n != null });
            }}
          />
        </Field>

        {/* Taxa fixa (R$) */}
        <Field
          label="Taxa fixa (R$)"
          auto={value.fixedFee == null ? auto?.fixedFee : undefined}
        >
          <Input
            inputMode="decimal"
            placeholder={auto ? `auto: ${auto.fixedFee}` : "auto"}
            value={numStr(value.fixedFee)}
            onChange={(e) => set({ fixedFee: toNum(e.target.value) })}
          />
        </Field>

        {/* TACoS / ADS (%) */}
        <Field label="TACoS / ADS (%)">
          <Input
            inputMode="decimal"
            placeholder="0"
            value={numStr(value.tacosPercent)}
            onChange={(e) => set({ tacosPercent: toNum(e.target.value) })}
          />
        </Field>

        {/* Afiliados (%) */}
        <Field label="Afiliados (%)">
          <Input
            inputMode="decimal"
            placeholder="0"
            value={numStr(value.affiliatePercent)}
            onChange={(e) => set({ affiliatePercent: toNum(e.target.value) })}
          />
        </Field>

        {/* Outros custos (R$) */}
        <Field label="Outros custos (R$)">
          <Input
            inputMode="decimal"
            placeholder="0"
            value={numStr(value.otherCostValue)}
            onChange={(e) => set({ otherCostValue: toNum(e.target.value) })}
          />
        </Field>
      </div>

      {/* Toggles */}
      <div className="mt-4 flex flex-wrap gap-6 border-t border-border pt-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={value.freeShippingFast ?? false}
            onCheckedChange={(c) => set({ freeShippingFast: c })}
          />
          Frete Grátis Rápido (FGR)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={value.highlightCampaign ?? false}
            onCheckedChange={(c) => set({ highlightCampaign: c })}
          />
          Campanha Destaque (+6 p.p. comissão)
        </label>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  auto,
  fallbackHint,
  children,
}: {
  label: string;
  /** Dica fixa exibida sempre. */
  hint?: string;
  /** Valor automático (real) — quando presente, exibido em destaque sob o campo. */
  auto?: string;
  /** Dica exibida quando NÃO há valor automático para mostrar. */
  fallbackHint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {auto ? (
        <p className="text-[11px] font-medium text-sky-600">auto: {auto}</p>
      ) : (
        (hint || fallbackHint) && (
          <p className="text-[11px] text-muted-foreground/80">{hint ?? fallbackHint}</p>
        )
      )}
    </div>
  );
}
