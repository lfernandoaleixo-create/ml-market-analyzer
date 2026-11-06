import { useEffect, useRef, useState } from "react";
import type { PricingInput } from "@shared/alpha/pricing";
import { money } from "@/alpha/lib/format";
import { NumberField } from "./PricingFields";

const PRESETS = [2, 4, 6, 8];
export function AdvertisingSelect({
  input,
  onChange,
}: {
  input: PricingInput;
  onChange: (value: number) => void;
}) {
  const [custom, setCustom] = useState(!PRESETS.includes(input.ads));
  const localChange = useRef<number | null>(null);
  useEffect(() => {
    if (localChange.current === input.ads) {
      localChange.current = null;
    } else {
      setCustom(!PRESETS.includes(input.ads));
    }
  }, [input.ads, input.adsMode]);
  function change(value: number) {
    localChange.current = value;
    onChange(value);
  }
  const value =
    custom || !PRESETS.includes(input.ads) ? "custom" : String(input.ads);
  return (
    <div>
      <label className="field">
        <span className="field-label">Publicidade por venda</span>
        <select
          aria-label="Valor da publicidade por venda em reais"
          title="Custo fixo por venda ou KIT, aplicado uma única vez."
          value={value}
          onChange={event => {
            if (event.target.value === "custom") {
              setCustom(true);
            } else {
              setCustom(false);
              change(Number(event.target.value));
            }
          }}
        >
          {PRESETS.map(amount => (
            <option value={amount} key={amount}>
              {money(amount)}
            </option>
          ))}
          <option value="custom">Valor personalizado em R$</option>
        </select>
      </label>
      {value === "custom" && (
        <NumberField
          label="Publicidade personalizada por venda"
          value={input.ads}
          onChange={change}
          suffix="rs"
        />
      )}
    </div>
  );
}
