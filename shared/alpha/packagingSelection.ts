import type { PricingInput } from "./pricing";
import {
  getPackagingPreset,
  type PackagingPresetId,
} from "./packagingCatalog";

/**
 * Aplica uma escolha explícita de embalagem ao input.
 *
 * O catálogo fornece somente os dois lados da referência. A altura continua
 * sendo uma medida física do pacote final e, por isso, é limpa ao trocar para
 * uma referência cujas dimensões ainda não foram confirmadas.
 */
export function applyPackagingSelection(
  input: PricingInput,
  id: PackagingPresetId
): PricingInput {
  if (id === "custom") {
    return { ...input, packagingPreset: "custom" };
  }

  const preset = getPackagingPreset(id);
  if (!preset) return input;

  if (
    input.packagingPreset === id &&
    input.length === preset.sideA &&
    input.width === preset.sideB
  ) {
    return input;
  }

  return {
    ...input,
    packagingPreset: id,
    length: preset.sideA,
    width: preset.sideB,
    height: 0,
  };
}

/**
 * Normaliza dimensões legadas quando um preset cadastrado foi persistido com
 * medidas que não correspondem à referência atual.
 */
export function normalizePackagingDimensions(input: PricingInput): PricingInput {
  const preset = getPackagingPreset(input.packagingPreset);
  if (!preset) return input;

  if (input.length === preset.sideA && input.width === preset.sideB) {
    return input;
  }

  return {
    ...input,
    packagingPreset: input.packagingPreset,
    length: preset.sideA,
    width: preset.sideB,
    height: 0,
  };
}
