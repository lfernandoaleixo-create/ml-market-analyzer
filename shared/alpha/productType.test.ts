import { describe, expect, it } from "vitest";
import {
  calculate,
  defaultInput,
  solveTarget,
  type PricingInput,
} from "./pricing";
import {
  getProductType,
  normalizeProductIdentification,
} from "./productIdentification";

const makeInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  ...defaultInput,
  ...overrides,
});

describe("identificação do produto", () => {
  it("usa single como tipo padrão", () => {
    expect(defaultInput.productType).toBe("single");
  });

  it("mantém o cálculo quando as linhas do KIT equivalem à aquisição single", () => {
    const single = makeInput({
      productType: "single",
      itemQuantity: 2,
      calculationType: "real",
      cost: 47.35,
    });
    const kit = {
      ...single,
      productType: "kit" as const,
      kitItems: [
        {
          id: "equivalent-1",
          description: single.description,
          sku: "",
          quantity: single.itemQuantity,
          unitCost: single.cost,
        },
      ],
    };

    const singleResult = calculate(single);
    const kitResult = calculate(kit);
    expect(kitResult).toEqual(singleResult);
    expect(kitResult.price).toBe(singleResult.price);
    expect(kitResult.taxes).toBe(singleResult.taxes);
    expect(kitResult.weightUsed).toBe(singleResult.weightUsed);
    expect(kitResult.dimensionalWeight).toBe(singleResult.dimensionalWeight);
    expect(kit.itemQuantity).toBe(2);
    expect(kit.productType).toBe("kit");
    expect(kit.calculationType).toBe("real");
    expect(kit.cost).toBe(single.cost);
  });

  it("mantém a igualdade de solveTarget entre single e KIT equivalente", () => {
    const single = makeInput({
      productType: "single",
      itemQuantity: 3,
      calculationType: "real",
      costMode: "kg",
      cost: 18.4,
      productKg: 0.75,
    });
    const kit = {
      ...single,
      productType: "kit" as const,
      kitItems: [
        {
          id: "equivalent-1",
          description: single.description,
          sku: "",
          quantity: single.itemQuantity,
          unitCost: single.cost * single.productKg,
        },
      ],
    };

    const singleTarget = solveTarget(single, 20);
    const kitTarget = solveTarget(kit, 20);
    expect(kitTarget).toEqual(singleTarget);
    expect(kitTarget.price).toBe(singleTarget.price);
    expect(kitTarget.result?.taxes).toBe(singleTarget.result?.taxes);
    expect(kitTarget.result?.weightUsed).toBe(singleTarget.result?.weightUsed);
    expect(kitTarget.result?.dimensionalWeight).toBe(
      singleTarget.result?.dimensionalWeight
    );
    expect(kit.itemQuantity).toBe(3);
    expect(kit.productType).toBe("kit");
    expect(kit.cost).toBe(single.cost);
  });

  it("preserva tipos explícitos e infere kit só para quantidade inteira finita maior que um", () => {
    expect(getProductType("single", 3)).toBe("single");
    expect(getProductType("kit", 1)).toBe("kit");
    expect(getProductType(undefined, 2)).toBe("kit");
    expect(getProductType("outro", 2)).toBe("kit");
    expect(getProductType(undefined, 1)).toBe("single");
    expect(getProductType(undefined, 2.5)).toBe("single");
    expect(getProductType(undefined, Number.NaN)).toBe("single");
    expect(getProductType(undefined, Number.POSITIVE_INFINITY)).toBe("single");
    expect(getProductType(undefined, "2")).toBe("single");
  });

  it("normaliza entrada legada sem mudar outros dados", () => {
    const legacy = {
      ...makeInput({ itemQuantity: 3 }),
    } as Partial<PricingInput> & Record<string, unknown>;
    delete legacy.productType;

    const normalized = normalizeProductIdentification(legacy as PricingInput);
    expect(normalized).toMatchObject({
      ...legacy,
      productType: "kit",
    });
    expect(normalized.itemQuantity).toBe(3);
    expect(normalized.cost).toBe(defaultInput.cost);
    expect(normalized).not.toBe(legacy);
  });
});
