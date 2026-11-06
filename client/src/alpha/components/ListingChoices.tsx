import type { PricingInput } from "@shared/alpha/pricing";
import { NumberField } from "./PricingFields";

export function ListingChoices({
  input,
  onSelect,
  onRate,
}: {
  input: PricingInput;
  onSelect: (value: "classic" | "premium") => void;
  onRate: (key: "classicRate" | "premiumRate", value: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3" aria-label="Tipo de anúncio">
      {(["classic", "premium"] as const).map(type => {
        const selected = input.listing === type;
        const label = type === "classic" ? "Clássico" : "Premium";
        return (
          <div
            key={type}
            className={`rounded-xl border-2 px-3 py-3 ${selected ? "border-[#74529b] bg-[#f4eefb]" : "border-[#e5deec] bg-white"}`}
          >
            <label className="mb-3 flex cursor-pointer items-center justify-between gap-2 font-semibold text-[#624783]">
              <span>{label}</span>
              <input
                type="radio"
                name="listing-type"
                aria-label={`Selecionar ${label}`}
                checked={selected}
                onChange={() => onSelect(type)}
                className="accent-[#725397]"
              />
            </label>
            <div
              className="[&_.field-label]:sr-only [&_input]:!bg-transparent [&_input]:!text-center [&_input]:!text-2xl [&_input]:!font-bold"
              title="Comissão informada para simulação. Os valores iniciais são 12% e 17%; confirme a taxa da sua categoria/conta antes de publicar. Edite a porcentagem aqui se necessário."
            >
              <NumberField
                label={`Comissão ${label}`}
                suffix="%"
                value={
                  type === "classic" ? input.classicRate : input.premiumRate
                }
                onChange={value =>
                  onRate(
                    type === "classic" ? "classicRate" : "premiumRate",
                    value
                  )
                }
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
