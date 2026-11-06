import { describe, expect, it } from "vitest";
import { calculate, defaultInput, type PricingInput } from "./pricing";
import {
  getPackagingPreset,
  type PackagingPresetId,
} from "./packagingCatalog";
import {
  applyPackagingSelection,
  normalizePackagingDimensions,
} from "./packagingSelection";

const makeInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  ...defaultInput,
  ...overrides,
});

describe("seleção de embalagem", () => {
  it.each<Exclude<PackagingPresetId, "custom">>(["p", "m", "g", "gg"])(
    "aplica os dois lados cadastrados para %s sem inferir disponibilidade",
    id => {
      const input = makeInput({
        packagingPreset: "custom",
        length: 18,
        width: 14,
        height: 18,
      });
      const preset = getPackagingPreset(id);
      expect(preset).not.toBeNull();
      if (!preset) throw new Error(`Preset ausente no teste: ${id}`);

      const selected = applyPackagingSelection(input, id);

      expect(selected.packagingPreset).toBe(id);
      expect(selected.length).toBe(preset.sideA);
      expect(selected.width).toBe(preset.sideB);
      expect(selected.height).toBe(0);
    }
  );

  it("limpa a altura ao trocar de id e preserva os demais campos por spread", () => {
    const input = makeInput({
      packagingPreset: "p",
      length: 20,
      width: 30,
      height: 9,
      weight: 0.263,
      cost: 88,
      packaging: 4.5,
      itemQuantity: 3,
      taxPis: 0.65,
      taxCofins: 3.2,
      taxIrpj: 1.5,
      taxCsll: 1.1,
      taxIcms: 4,
      taxDifal: 2,
      difalMode: "rs",
      taxDifalValue: 4.2,
    });

    const selected = applyPackagingSelection(input, "g");

    expect(selected).toEqual({
      ...input,
      packagingPreset: "g",
      length: 40,
      width: 60,
      height: 0,
    });
    expect(selected.weight).toBe(input.weight);
    expect(selected.cost).toBe(input.cost);
    expect(selected.packaging).toBe(input.packaging);
    expect(selected.itemQuantity).toBe(input.itemQuantity);
    expect(selected.difalMode).toBe(input.difalMode);
    expect(selected.taxDifalValue).toBe(input.taxDifalValue);
  });

  it("não limpa a altura ao selecionar novamente o mesmo id com lados coerentes", () => {
    const input = makeInput({
      packagingPreset: "p",
      length: 20,
      width: 30,
      height: 9,
    });

    expect(applyPackagingSelection(input, "p")).toBe(input);
  });

  it("retorna custom mantendo as dimensões manuais", () => {
    const input = makeInput({
      packagingPreset: "p",
      length: 17,
      width: 14,
      height: 8,
    });

    expect(applyPackagingSelection(input, "custom")).toEqual({
      ...input,
      packagingPreset: "custom",
    });
  });
});

describe("normalização de dimensões de embalagem", () => {
  it("corrige dimensões legadas incoerentes e mantém o id do preset", () => {
    const legacy = makeInput({
      packagingPreset: "p",
      length: 20,
      width: 15,
      height: 10,
    });

    expect(normalizePackagingDimensions(legacy)).toEqual({
      ...legacy,
      packagingPreset: "p",
      length: 20,
      width: 30,
      height: 0,
    });
  });

  it("preserva a mesma referência quando os lados já são coerentes", () => {
    const input = makeInput({
      packagingPreset: "p",
      length: 20,
      width: 30,
      height: 10,
    });

    expect(normalizePackagingDimensions(input)).toBe(input);
  });

  it("preserva a mesma referência para custom ou id inexistente", () => {
    const custom = makeInput({
      packagingPreset: "custom",
      length: 20,
      width: 15,
      height: 10,
    });
    const unknown = {
      ...custom,
      packagingPreset: "unknown" as PackagingPresetId,
    };

    expect(normalizePackagingDimensions(custom)).toBe(custom);
    expect(normalizePackagingDimensions(unknown)).toBe(unknown);
  });
});

describe("efeito explícito das dimensões na validação e no frete", () => {
  it("mantém seleção sem altura inválida e, com altura positiva, calcula peso dimensional", () => {
    const base = makeInput({
      packagingPreset: "custom",
      weight: 0.5,
      length: 20,
      width: 15,
      height: 10,
      price: 99.9,
    });
    const selectedWithoutHeight = applyPackagingSelection(base, "g");
    const invalid = calculate(selectedWithoutHeight);

    expect(selectedWithoutHeight.height).toBe(0);
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toMatch(/dimensões parciais/i);

    const selectedWithHeight = { ...selectedWithoutHeight, height: 10 };
    const valid = calculate(selectedWithHeight);
    const baseResult = calculate(base);

    expect(valid.valid).toBe(true);
    expect(valid.dimensionalWeight).toBe(4);
    expect(valid.weightUsed).toBeGreaterThan(baseResult.weightUsed);
    expect(valid.shipping).toBeGreaterThan(baseResult.shipping);
  });
});
