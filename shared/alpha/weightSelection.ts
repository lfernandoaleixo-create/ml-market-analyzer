import { SHIPPING_WEIGHTS } from "./tariffs";
import type { PricingInput } from "./pricing";

export interface WeightBandOption {
  id: string;
  lower: number;
  upper: number;
  label: string;
  selectable: boolean;
}

function formatWeight(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export const WEIGHT_BAND_OPTIONS: readonly WeightBandOption[] =
  SHIPPING_WEIGHTS.map((upper, index) => {
    const lower = index === 0 ? 0 : SHIPPING_WEIGHTS[index - 1];
    const selectable = Number.isFinite(upper);
    const label = !selectable
      ? `Mais de ${formatWeight(lower)} kg — informar peso exato`
      : index === 0
        ? `Até ${formatWeight(upper)} kg`
        : `Mais de ${formatWeight(lower)} até ${formatWeight(upper)} kg`;

    return {
      id: String(index),
      lower,
      upper,
      label,
      selectable,
    };
  });

function exactWeightForBand(input: PricingInput): number {
  return input.weightInputMode === "band"
    ? typeof input.weightExact === "number"
      ? input.weightExact
      : Number.NaN
    : input.weight;
}

export function getWeightBandId(weight: number): string {
  if (!Number.isFinite(weight) || weight < 0) return "";

  const option = WEIGHT_BAND_OPTIONS.find(
    ({ upper }) => Number.isFinite(upper) && weight <= upper
  );
  return option?.id ?? "";
}

export function selectWeightBand(
  input: PricingInput,
  id: string
): PricingInput {
  const option = WEIGHT_BAND_OPTIONS.find(candidate => candidate.id === id);
  if (!option || !option.selectable || !Number.isFinite(option.upper)) {
    throw new RangeError("A faixa de peso selecionada não é válida.");
  }

  return {
    ...input,
    weight: option.upper,
    weightInputMode: "band",
    weightExact: exactWeightForBand(input),
  };
}

export function restoreExactWeight(input: PricingInput): PricingInput {
  const weight = exactWeightForBand(input);
  return {
    ...input,
    weightInputMode: "exact",
    weight,
    weightExact: weight,
  };
}

export function setExactWeight(
  input: PricingInput,
  value: number
): PricingInput {
  return {
    ...input,
    weight: value,
    weightInputMode: "exact",
    weightExact: value,
  };
}

function isCoherentBandWeight(input: PricingInput): boolean {
  return (
    Number.isFinite(input.weight) &&
    WEIGHT_BAND_OPTIONS.some(
      option =>
        option.selectable &&
        Number.isFinite(option.upper) &&
        option.upper === input.weight
    )
  );
}

export function normalizeWeightEntry(input: PricingInput): PricingInput {
  if (input.weightInputMode === "band" && isCoherentBandWeight(input)) {
    return input;
  }

  if (
    input.weightInputMode === "exact" &&
    Object.is(input.weightExact, input.weight)
  ) {
    return input;
  }

  return {
    ...input,
    weightInputMode: "exact",
    weightExact: input.weight,
  };
}
