import type { PricingInput } from "@shared/alpha/pricing";
import { getWeightBandId, WEIGHT_BAND_OPTIONS } from "@shared/alpha/weightSelection";
import { NumberField } from "./PricingFields";

export function WeightInput({
  input,
  dimensionalWeight,
  onBand,
  onManual,
  onExact,
}: {
  input: PricingInput;
  dimensionalWeight: number;
  onBand: (id: string) => void;
  onManual: () => void;
  onExact: (value: number) => void;
}) {
  const byBand = input.weightInputMode === "band";
  return (
    <div
      className="weight-input"
      title={`Ao escolher faixa, usamos seu limite superior como estimativa. O frete usa o maior peso: físico ou volumétrico. Peso volumétrico atual: ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(dimensionalWeight)} kg.`}
    >
      <label className="field">
        <span className="field-label">Peso do pacote</span>
        <select
          aria-label="Escolher peso exato ou faixa de peso"
          value={byBand ? getWeightBandId(input.weight) : "exact"}
          onChange={event =>
            event.target.value === "exact"
              ? onManual()
              : onBand(event.target.value)
          }
        >
          <option value="exact">Digitar peso exato</option>
          {WEIGHT_BAND_OPTIONS.map(band => (
            <option key={band.id} value={band.id} disabled={!band.selectable}>
              {band.label}
            </option>
          ))}
        </select>
      </label>
      {!byBand && (
        <NumberField
          label="Peso do produto embalado"
          value={input.weight}
          onChange={onExact}
          suffix="kg"
        />
      )}
    </div>
  );
}
