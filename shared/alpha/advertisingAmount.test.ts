import { describe, expect, it } from "vitest";
import {
  calculate,
  defaultInput,
  solveTarget,
  type PricingInput,
} from "./pricing";
import {
  normalizeInterfaceInput,
  getInterfaceMigrationNotice,
} from "./interfaceInput";
import { restorePricingInput } from "./restorePricingInput";

function current(overrides: Partial<PricingInput> = {}): PricingInput {
  return normalizeInterfaceInput({
    ...defaultInput,
    adsMode: "rs",
    ads: 4,
    length: 20,
    width: 15,
    height: 5,
    weight: 0.5,
    ...overrides,
  });
}

describe("publicidade fixa em reais por venda", () => {
  it.each([2, 4, 6, 8, 0, 3.75])("cobra R$%s em preços diferentes", amount => {
    const input = current({ ads: amount });
    const first = calculate(input, 77);
    const second = calculate(input, 150);
    expect(first.valid).toBe(true);
    expect(second.valid).toBe(true);
    expect(first.ads).toBe(amount);
    expect(second.ads).toBe(amount);
  });

  it("usa a publicidade uma vez no preço-alvo e no cálculo inverso", () => {
    const input = current({ ads: 6 });
    const target = solveTarget(input, 20);
    expect(target.result?.valid).toBe(true);
    expect(target.result?.ads).toBe(6);
    expect(target.result!.margin).toBeGreaterThanOrEqual(20);
    const adjusted = calculate(input, target.price! - 3);
    expect(adjusted.ads).toBe(6);
    expect(adjusted.margin).toBeLessThan(target.result!.margin);
  });

  it("não multiplica publicidade pela quantidade de peças do KIT", () => {
    const input = current({
      productType: "kit",
      kitItems: [
        {
          id: "one",
          description: "Colares",
          sku: "COL",
          quantity: 10,
          unitCost: 2,
        },
      ],
      itemQuantity: 10,
      ads: 8,
    });
    expect(calculate(input, 150).ads).toBe(8);
  });

  it("corrige a unidade na interface mantendo o valor e o snapshot original", () => {
    const original = { ...current(), adsMode: "percent" as const, ads: 3.75 };
    const copy = structuredClone(original);
    const normalized = normalizeInterfaceInput(original);
    expect(normalized.adsMode).toBe("rs");
    expect(normalized.ads).toBe(3.75);
    expect(original).toEqual(copy);
    expect(getInterfaceMigrationNotice(original, normalized)).toMatch(
      /reais por venda/i
    );
    expect(restorePricingInput(original).adsMode).toBe("rs");
    expect(restorePricingInput(original, false).adsMode).toBe("percent");
  });

  it("não preenche uma publicidade ausente em produto incompleto", () => {
    const raw = { ...current(), ads: undefined };
    const restored = restorePricingInput(raw, true, true);
    expect(restored.adsMode).toBe("rs");
    expect(Number.isNaN(restored.ads)).toBe(true);
    expect(calculate(restored, 100).valid).toBe(false);
  });

  it.each([Number.NaN, -1])(
    "bloqueia publicidade inválida em reais: %s",
    ads => {
      expect(calculate(current({ ads }), 100).valid).toBe(false);
    }
  );
});
