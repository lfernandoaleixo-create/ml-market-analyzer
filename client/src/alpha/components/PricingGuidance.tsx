import { ArrowRight, Info } from "lucide-react";
import { FEDERAL_TAX_FIELDS, getFederalTaxRates } from "@shared/alpha/companyProfile";
import type { PricingInput } from "@shared/alpha/pricing";
import { money, percent } from "@/alpha/lib/format";
import { NumberField } from "./PricingFields";

export function EditableFederalTaxes({
  input,
  onChange,
  onReset,
}: {
  input: PricingInput;
  onChange: (
    key: (typeof FEDERAL_TAX_FIELDS)[number]["key"],
    value: number
  ) => void;
  onReset: () => void;
}) {
  const rates = getFederalTaxRates(input);
  return (
    <details className="editable-tax-profile rounded-xl border border-[#e5ddef] bg-[#faf8fc] p-3">
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs font-semibold text-[#634780]">
        <span>Tributos federais</span>
        <strong className="text-base">{percent(input.taxFederal)} ▾</strong>
      </summary>
      <div
        className="federal-tax-grid mt-3"
        aria-label="Impostos federais editáveis"
      >
        {FEDERAL_TAX_FIELDS.map(tax => (
          <NumberField
            key={tax.key}
            label={tax.label}
            value={rates[tax.key]}
            onChange={value => onChange(tax.key, value)}
            suffix="%"
          />
        ))}
      </div>
      <button
        type="button"
        className="link-button tax-reset-button"
        onClick={onReset}
      >
        Restaurar alíquotas iniciais
      </button>
    </details>
  );
}

export function PriceModeGuidance({
  mode,
  goal,
  suggestedPrice,
  onTarget,
}: {
  mode: "sale" | "target";
  goal: number;
  suggestedPrice: number | null;
  onTarget: () => void;
}) {
  return (
    <div className="callout purple price-mode-guidance">
      <Info size={13} aria-hidden="true" />
      <div>
        <strong>
          {mode === "sale"
            ? "Conferência opcional: o preço existente é mantido."
            : "Preço calculado pela margem: recálculo automático ativo."}
        </strong>
        <p>
          {mode === "sale"
            ? "A conferência recalcula lucro e custos de um preço existente. O fluxo principal calcula o preço de venda a partir dos custos e da margem, sem pedir um preço de venda."
            : "Você informa o custo e a margem, e a Alpha determina o preço. Peso, envio, comissão, impostos e demais despesas entram no recálculo. O envio só muda quando a faixa ou a regra aplicada muda."}
        </p>
        {suggestedPrice !== null && (
          <span>
            Preço sugerido para {percent(goal)} de margem:{" "}
            <strong>{money(suggestedPrice)}</strong>.
          </span>
        )}
        {mode === "sale" && (
          <button type="button" className="link-button" onClick={onTarget}>
            Calcular preço por margem{" "}
            <ArrowRight size={12} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
