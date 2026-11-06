import { describe, expect, it } from "vitest";
import {
  calculate,
  defaultInput,
  getCommissionRate,
  solveTarget,
  type Listing,
  type PricingInput,
} from "./pricing";

const makeInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  ...defaultInput,
  ...overrides,
});

const manualZeroShipping = (overrides: Partial<PricingInput> = {}) =>
  makeInput({
    cost: 0,
    operation: 0,
    packaging: 0,
    promotion: 0,
    taxFederal: 0,
    taxIcms: 0,
    taxDifal: 0,
    weight: 0,
    length: 0,
    width: 0,
    height: 0,
    shippingMode: "manual",
    manualShipping: 0,
    manualFixedFee: 0,
    manualFixedLimit: 0,
    ...overrides,
  });

function bruteWindow(
  input: PricingInput,
  targetMargin: number,
  lowCents: number,
  highCents: number,
  listing?: Listing
): number | null {
  for (let cents = lowCents; cents <= highCents; cents += 1) {
    const result = calculate(input, cents / 100, listing);
    if (result.valid && result.margin + 1e-9 >= targetMargin) {
      return result.price;
    }
  }
  return null;
}

describe("desconto de comissão por categoria", () => {
  it("mantém o default desligado e aplica limites inclusivos só quando elegível", () => {
    const base = makeInput({
      categoryDiscountEligible: false,
      classicRate: 14,
      premiumRate: 19,
    });
    expect(defaultInput.categoryDiscountEligible).toBe(false);
    for (const listing of ["classic", "premium"] as const) {
      for (const price of [149.99, 150, 700, 700.01]) {
        expect(getCommissionRate(base, price, listing)).toBe(
          listing === "classic" ? 14 : 19
        );
      }
    }

    const eligible = { ...base, categoryDiscountEligible: true };
    expect(getCommissionRate(eligible, 149.99, "classic")).toBe(14);
    expect(getCommissionRate(eligible, 150, "classic")).toBe(12);
    expect(getCommissionRate(eligible, 700, "classic")).toBe(12);
    expect(getCommissionRate(eligible, 700.01, "classic")).toBe(14);
    expect(getCommissionRate(eligible, 150, "premium")).toBe(15);
    expect(getCommissionRate(eligible, 700, "premium")).toBe(15);
    expect(getCommissionRate(eligible, 700.01, "premium")).toBe(19);
  });

  it("usa preço override arredondado para a taxa efetiva e comissão", () => {
    const input = manualZeroShipping({
      categoryDiscountEligible: true,
      classicRate: 14,
      premiumRate: 19,
      price: 98.94,
    });
    const classic = calculate(input, 149.996, "classic");
    const premium = calculate(input, 150, "premium");

    expect(classic.price).toBe(150);
    expect(classic.rate).toBe(12);
    expect(classic.commission).toBe(18);
    expect(premium.rate).toBe(15);
    expect(premium.commission).toBe(22.5);
    expect(classic.warnings.join(" ")).toMatch(/2 pontos percentuais/i);
    expect(classic.warnings.join(" ")).not.toMatch(/redução relativa/i);
  });

  it("aceita campo legado ausente como false, mas valida valor não booleano", () => {
    const legacy = {
      ...manualZeroShipping(),
      categoryDiscountEligible: undefined,
    };
    expect(calculate(legacy as unknown as PricingInput, 150).rate).toBe(
      legacy.classicRate
    );

    const invalid = {
      ...manualZeroShipping(),
      categoryDiscountEligible: "true",
    } as unknown as PricingInput;
    const result = calculate(invalid, 150);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/elegibilidade.*inválida/i);
  });

  it("resolve o menor centavo na entrada da faixa de R$150", () => {
    const input = manualZeroShipping({
      categoryDiscountEligible: true,
      cost: 100,
      classicRate: 14,
      price: 1,
    });
    const target = 20;
    const expected = bruteWindow(input, target, 14_000, 16_000);
    const solved = solveTarget(input, target, "classic");

    expect(expected).toBe(150);
    expect(solved.price).toBe(expected);
    expect(solved.result?.rate).toBe(12);
    expect(solved.result?.margin).toBeGreaterThanOrEqual(target);
  });

  it("resolve o menor centavo na saída da faixa de R$700", () => {
    const input = manualZeroShipping({
      categoryDiscountEligible: true,
      cost: 476,
      classicRate: 14,
      price: 1,
    });
    const target = 20;
    const expected = bruteWindow(input, target, 69_500, 70_100);
    const solved = solveTarget(input, target, "classic");

    expect(expected).toBe(700);
    expect(solved.price).toBe(expected);
    expect(solved.result?.rate).toBe(12);
    expect(
      calculate(input, (solved.price ?? 0) + 0.01, "classic").margin
    ).toBeLessThan(target);
  });

  it("não rejeita solver quando a taxa base passa de 100%, mas a faixa reduzida é viável", () => {
    const input = manualZeroShipping({
      categoryDiscountEligible: true,
      cost: 1,
      classicRate: 99,
      taxFederal: 2,
      price: 1,
    });
    const solved = solveTarget(input, 0, "classic");

    expect(solved.price).not.toBeNull();
    expect(solved.result?.price).toBeGreaterThanOrEqual(150);
    expect(solved.result?.rate).toBe(97);
  });
});
