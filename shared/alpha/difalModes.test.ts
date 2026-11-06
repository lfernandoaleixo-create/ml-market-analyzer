import { describe, expect, it } from "vitest";
import {
  calculate,
  defaultInput,
  getDifalCost,
  money,
  solveTarget,
  type PricingInput,
} from "./pricing";

const makeInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  ...defaultInput,
  ...overrides,
});

const manualZeroShipping = (
  overrides: Partial<PricingInput> = {}
): PricingInput =>
  makeInput({
    operation: 0,
    packaging: 0,
    promotion: 0,
    taxFederal: 0,
    taxIcms: 0,
    weight: 0.5,
    shippingMode: "manual",
    manualShipping: 0,
    manualFixedFee: 0,
    manualFixedLimit: 0,
    ...overrides,
  });

function firstPassingCent(
  input: PricingInput,
  targetMargin: number,
  highCents: number
): number | null {
  for (let cents = 1; cents <= highCents; cents += 1) {
    const result = calculate(input, cents / 100);
    if (result.valid && result.margin + 1e-9 >= targetMargin) {
      return result.price;
    }
  }
  return null;
}

describe("modos de DIFAL", () => {
  it("usa percentual por padrão e aplica somente o modo selecionado", () => {
    expect(defaultInput.difalMode).toBe("percent");
    expect(defaultInput.taxDifalValue).toBe(0);

    const fixed = makeInput({
      price: 100,
      difalMode: "rs",
      taxDifal: 99,
      taxDifalValue: 10,
    });
    expect(getDifalCost(fixed)).toBe(10);
    expect(calculate(fixed, 100).taxes).toBe(16.15);

    const percentage = makeInput({
      price: 100,
      difalMode: "percent",
      taxDifal: 5,
      taxDifalValue: 999,
    });
    expect(getDifalCost(percentage)).toBe(5);
    expect(calculate(percentage, 100).taxes).toBe(11.15);
  });

  it("mantém o DIFAL em reais fixo em qualquer preço e não altera o frete", () => {
    const fixed = makeInput({
      difalMode: "rs",
      taxDifal: 99,
      taxDifalValue: 10,
      price: 100,
    });
    const at100 = calculate(fixed, 100);
    const at200 = calculate(fixed, 200);
    expect(at100.taxes).toBe(16.15);
    expect(at200.taxes).toBe(22.3);
    expect(money(at100.taxes - 10)).toBe(money((at200.taxes - 10) / 2));

    const withoutDifal = calculate(
      makeInput({ difalMode: "percent", taxDifal: 0, price: 100 }),
      100
    );
    expect(at100.shipping).toBe(withoutDifal.shipping);
    expect(at100.fixedFee).toBe(withoutDifal.fixedFee);
    expect(at100.commission).toBe(withoutDifal.commission);
  });

  it("preserva os dois campos ao alternar o modo e só aplica um deles", () => {
    const percentMode = makeInput({
      difalMode: "percent",
      taxDifal: 5,
      taxDifalValue: 999,
      price: 100,
    });
    const rsMode = { ...percentMode, difalMode: "rs" as const };

    expect(rsMode.taxDifal).toBe(5);
    expect(rsMode.taxDifalValue).toBe(999);
    expect(calculate(percentMode, 100).taxes).toBe(11.15);
    expect(calculate(rsMode, 100).taxes).toBe(999 + 6.15);
  });

  it("valida somente o DIFAL ativo, aceita zero e bloqueia modo inválido", () => {
    expect(
      calculate(
        makeInput({
          difalMode: "rs",
          taxDifal: Number.NaN,
          taxDifalValue: 0,
        })
      ).valid
    ).toBe(true);
    expect(
      calculate(
        makeInput({
          difalMode: "percent",
          taxDifal: 0,
          taxDifalValue: Number.POSITIVE_INFINITY,
        })
      ).valid
    ).toBe(true);

    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const fixed = calculate(
        makeInput({ difalMode: "rs", taxDifal: -1, taxDifalValue: value })
      );
      expect(fixed.valid).toBe(false);
      expect(fixed.error).toMatch(/DIFAL/i);

      const percentage = calculate(
        makeInput({ difalMode: "percent", taxDifal: value, taxDifalValue: -1 })
      );
      expect(percentage.valid).toBe(false);
      expect(percentage.error).toMatch(/DIFAL/i);
    }

    const invalidMode = calculate({
      ...makeInput({ taxDifal: 0, taxDifalValue: 0 }),
      difalMode: "cash" as unknown as PricingInput["difalMode"],
    });
    expect(invalidMode.valid).toBe(false);
    expect(invalidMode.error).toMatch(/modo.*DIFAL/i);
  });

  it("mantém o fallback percentual para entradas legadas sem modo ou valor", () => {
    const legacy = {
      ...makeInput({ price: 100, taxDifal: 5 }),
    } as Record<string, unknown>;
    delete legacy.difalMode;
    delete legacy.taxDifalValue;

    const result = calculate(legacy as unknown as PricingInput, 100);
    expect(result.valid).toBe(true);
    expect(result.taxes).toBe(11.15);
    expect(getDifalCost(legacy as unknown as PricingInput, 100)).toBe(5);

    const missingFixedValue = {
      ...makeInput({
        difalMode: "rs",
        taxDifal: 99,
        taxDifalValue: undefined,
      }),
    } as unknown as PricingInput;
    expect(calculate(missingFixedValue, 100).taxes).toBe(6.15);
    expect(getDifalCost(missingFixedValue, 100)).toBe(0);
  });

  it("encontra o primeiro centavo do solver com custo fixo DIFAL", () => {
    const input = manualZeroShipping({
      cost: 40,
      price: 1,
      difalMode: "rs",
      taxDifal: 99,
      taxDifalValue: 5,
      classicRate: 12,
    });
    const target = 15;
    const expected = firstPassingCent(input, target, 8_000);
    const solved = solveTarget(input, target);

    expect(expected).not.toBeNull();
    expect(solved.error).toBeUndefined();
    expect(solved.price).toBe(expected);
    expect(solved.result!.margin + 1e-9).toBeGreaterThanOrEqual(target);
  });

  it("inclui o custo fixo no solver ao cruzar R$79 e a troca de comissão em R$150", () => {
    const shippingBase = makeInput({
      cost: 40,
      operation: 0,
      packaging: 0,
      promotion: 0,
      taxFederal: 6.15,
      taxIcms: 0,
      taxDifal: 0,
      taxDifalValue: 5,
      difalMode: "percent",
      price: 1,
    });
    const withoutFixed = solveTarget(shippingBase, 15);
    const withFixed = solveTarget(
      {
        ...shippingBase,
        difalMode: "rs",
        taxDifal: 99,
        taxDifalValue: 5,
      },
      15
    );
    expect(withoutFixed.price).toBeLessThan(79);
    expect(withFixed.price).toBeGreaterThanOrEqual(79);
    expect(withFixed.price).toBeGreaterThan(withoutFixed.price!);
    expect(withFixed.result!.shipping).not.toBe(withoutFixed.result!.shipping);

    const categoryBase = manualZeroShipping({
      cost: 103,
      price: 1,
      categoryDiscountEligible: true,
      classicRate: 14,
      difalMode: "percent",
      taxDifal: 0,
      taxDifalValue: 5,
    });
    const withoutCategoryFixed = solveTarget(categoryBase, 15);
    const withCategoryFixed = solveTarget(
      {
        ...categoryBase,
        difalMode: "rs",
        taxDifal: 99,
        taxDifalValue: 5,
      },
      15
    );
    expect(withoutCategoryFixed.price).toBeLessThan(150);
    expect(withCategoryFixed.price).toBe(150);
    expect(withCategoryFixed.result!.rate).toBe(12);
    expect(withCategoryFixed.result!.margin + 1e-9).toBeGreaterThanOrEqual(15);
  });
});
