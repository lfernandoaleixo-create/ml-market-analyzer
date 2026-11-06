import type { PricingInput } from "@shared/alpha/pricing";
import { NumberField, SelectField } from "./PricingFields";

export function StateTaxFields({
  input,
  onChange,
}: {
  input: PricingInput;
  onChange: <K extends keyof PricingInput>(
    key: K,
    value: PricingInput[K]
  ) => void;
}) {
  const outside = input.saleDestination === "outside";
  const amount = input.difalMode === "rs";
  return (
    <div className="mt-4">
      <SelectField
        label="Destino da venda"
        value={input.saleDestination}
        onChange={value =>
          onChange("saleDestination", value as "inside" | "outside")
        }
        options={[
          { value: "inside", label: "Dentro do estado" },
          { value: "outside", label: "Fora do estado" },
        ]}
      />
      <div className="field-row">
        <NumberField
          label="ICMS de venda"
          suffix="%"
          value={outside ? input.taxIcmsOutside : input.taxIcmsInside}
          onChange={value =>
            onChange(outside ? "taxIcmsOutside" : "taxIcmsInside", value)
          }
        />
        <NumberField
          label="ICMS de transferência"
          suffix="%"
          value={input.taxIcmsTransfer}
          onChange={value => onChange("taxIcmsTransfer", value)}
        />
      </div>
      {outside ? (
        <div className="rounded-xl border border-[#e5dcf0] bg-[#faf8fc] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#624783]">
              DIFAL · venda fora do estado
            </span>
            <select
              aria-label="Unidade do DIFAL"
              className="!min-h-0 !w-auto !rounded-md !px-2 !py-1 !text-xs"
              value={input.difalMode}
              onChange={e =>
                onChange("difalMode", e.target.value as "percent" | "rs")
              }
              title="O padrão confirmado é 16%. Você pode editar o percentual ou informar um valor fixo em reais; apenas a unidade escolhida entra no cálculo."
            >
              <option value="percent">%</option>
              <option value="rs">R$</option>
            </select>
          </div>
          <div className="[&_.field-label]:sr-only">
            <NumberField
              label="DIFAL"
              value={amount ? input.taxDifalValue : input.taxDifal}
              prefix={amount ? "R$" : undefined}
              suffix={amount ? undefined : "%"}
              onChange={value =>
                onChange(amount ? "taxDifalValue" : "taxDifal", value)
              }
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg bg-[#f6f4f8] px-3 py-2 text-xs text-[#706778]">
          <span>DIFAL · dentro do estado</span>
          <strong>0%</strong>
        </div>
      )}
    </div>
  );
}
