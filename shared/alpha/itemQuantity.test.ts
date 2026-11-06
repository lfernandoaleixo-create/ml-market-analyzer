import { describe, expect, it } from "vitest";
import { calculate, defaultInput, solveTarget, type PricingInput } from "./pricing";

const makeInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  ...defaultInput,
  ...overrides,
});

const manualInput = (overrides: Partial<PricingInput> = {}): PricingInput =>
  makeInput({
    cost: 20,
    operation: 3,
    packaging: 4,
    promotion: 5,
    adsMode: "rs",
    ads: 2,
    taxFederal: 0,
    taxIcms: 0,
    taxDifal: 0,
    price: 100,
    weight: 0,
    length: 0,
    width: 0,
    height: 0,
    shippingMode: "manual",
    manualShipping: 7.25,
    manualFixedFee: 0,
    manualFixedLimit: 0,
    ...overrides,
  });

describe("item quantity", () => {
  it("mantém a quantidade 1 como composição-base", () => {
    const result = calculate(manualInput({ itemQuantity: 1 }));

    expect(result.valid).toBe(true);
    expect(result.productCost).toBe(20);
  });

  it("duplica somente o custo do produto, sem multiplicar custos por anúncio", () => {
    const one = calculate(manualInput({ itemQuantity: 1 }));
    const two = calculate(manualInput({ itemQuantity: 2 }));

    expect(one.valid).toBe(true);
    expect(two.valid).toBe(true);
    expect(two.productCost).toBe(one.productCost * 2);
    expect(two.operation).toBe(one.operation);
    expect(two.packaging).toBe(one.packaging);
    expect(two.promotion).toBe(one.promotion);
    expect(two.ads).toBe(one.ads);
    expect(two.shipping).toBe(one.shipping);
    expect(two.fixedFee).toBe(one.fixedFee);
    expect(two.commission).toBe(one.commission);
    expect(two.taxes).toBe(one.taxes);
  });

  it("multiplica custo por kg por quantidade de peças", () => {
    const result = calculate(
      manualInput({ costMode: "kg", cost: 20, productKg: 0.5, itemQuantity: 3 })
    );

    expect(result.valid).toBe(true);
    expect(result.productCost).toBe(30);
  });

  it("eleva o preço-alvo para duas peças e preserva a margem", () => {
    const one = solveTarget(manualInput({ itemQuantity: 1 }), 20);
    const two = solveTarget(manualInput({ itemQuantity: 2 }), 20);

    expect(one.price).not.toBeNull();
    expect(two.price).not.toBeNull();
    expect(two.price!).toBeGreaterThan(one.price!);
    expect(two.result!.margin + 1e-9).toBeGreaterThanOrEqual(20);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "bloqueia quantidade inválida %s com mensagem específica",
    itemQuantity => {
      const result = calculate(manualInput({ itemQuantity }));

      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        "Quantidade de itens inválida: informe um número inteiro maior que zero."
      );
    }
  );

  it("usa uma peça para perfil legado sem itemQuantity", () => {
    const legacy = { ...manualInput() } as Partial<PricingInput> &
      Record<string, unknown>;
    delete legacy.itemQuantity;

    const result = calculate(legacy as PricingInput);

    expect(result.valid).toBe(true);
    expect(result.productCost).toBe(20);
  });
});
