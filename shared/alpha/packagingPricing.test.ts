import { describe, expect, it } from "vitest";
import { calculate, defaultInput, solveTarget } from "./pricing";
import type { PackagingPresetId } from "./packagingCatalog";

const measuredPackage = {
  ...defaultInput,
  weight: 0.263,
  length: 18,
  width: 14,
  height: 18,
  taxIcms: 4,
  taxDifal: 1,
};

describe("embalagem de referência não é medida do frete", () => {
  it.each<PackagingPresetId>(["p", "m", "g", "gg"])(
    "mantém peso, cubagem, impostos, frete e preço por margem ao selecionar %s",
    packagingPreset => {
      const selected = { ...measuredPackage, packagingPreset };
      expect(calculate(selected)).toEqual(calculate(measuredPackage));
      expect(solveTarget(selected, 20)).toEqual(
        solveTarget(measuredPackage, 20)
      );
      expect(selected.weight).toBe(0.263);
      expect([selected.length, selected.width, selected.height]).toEqual([
        18, 14, 18,
      ]);
      expect(selected.packaging).toBe(measuredPackage.packaging);
      expect(selected.taxFederal).toBe(measuredPackage.taxFederal);
      expect(selected.taxIcms).toBe(4);
      expect(selected.taxDifal).toBe(1);
    }
  );

  it("não torna dimensões parciais válidas apenas por selecionar P", () => {
    const selected = {
      ...measuredPackage,
      packagingPreset: "p" as const,
      height: 0,
    };
    expect(calculate(selected).valid).toBe(false);
    expect(solveTarget(selected, 20).price).toBeNull();
  });
});
