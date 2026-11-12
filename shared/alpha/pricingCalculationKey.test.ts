import { describe, expect, it } from "vitest";
import {
  calculate,
  defaultInput,
  solveTarget,
  type PricingInput,
} from "./pricing";
import { pricingCalculationKey } from "./pricingCalculationKey";

const kit: PricingInput = {
  ...defaultInput,
  productType: "kit",
  kitItems: [
    {
      id: "item-1",
      description: "Colar",
      sku: "COL-1",
      quantity: 2,
      unitCost: 12.5,
    },
  ],
};

describe("Assinatura exclusivamente computacional da Alpha", () => {
  it("muda nomes/SKUs superiores sem mudar a assinatura ou resultados reais do motor", () => {
    for (const original of [
      defaultInput,
      kit,
      { ...defaultInput, categoryDiscountEligible: true },
    ]) {
      const renamed = {
        ...original,
        description: "Texto novo",
        category: "Outra descrição de categoria",
        productSku: "SKU-NOVO",
        kitSku: "KIT-NOVO",
      };
      expect(pricingCalculationKey(renamed)).toBe(
        pricingCalculationKey(original)
      );
      expect(calculate(renamed)).toEqual(calculate(original));
      expect(solveTarget(renamed, 20)).toEqual(solveTarget(original, 20));
    }
  });

  it.each([
    ["cost", 70],
    ["length", 99],
    ["width", 27],
    ["height", 24],
    ["weight", 5],
    ["taxFederal", 18],
    ["taxPis", 2],
    ["taxDifal", 8],
    ["taxDifalValue", 14],
    ["useDestinationTaxes", true],
    ["categoryDiscountEligible", true],
    ["classicRate", 18],
    ["premiumRate", 21],
    ["price", 250],
    ["listing", "premium"],
    ["shippingMode", "rapid"],
    ["productType", "kit"],
    ["itemQuantity", 3],
    ["ads", 10],
    ["operation", 7],
    ["packaging", 4],
  ] as const)("não ignora mudança do parâmetro %s", (key, value) => {
    expect(pricingCalculationKey({ ...defaultInput, [key]: value })).not.toBe(
      pricingCalculationKey(defaultInput)
    );
  });

  it("distingue NaN, infinito, null e números válidos, inclusive dentro de kits", () => {
    const values = [NaN, Infinity, -Infinity, null, 0, 32];
    expect(
      new Set(
        values.map(cost =>
          pricingCalculationKey({ ...defaultInput, cost } as PricingInput)
        )
      ).size
    ).toBe(values.length);
    expect(
      new Set(
        values.map(unitCost =>
          pricingCalculationKey({
            ...kit,
            kitItems: [{ ...kit.kitItems[0], unitCost }],
          } as PricingInput)
        )
      ).size
    ).toBe(values.length);
  });

  it("digitar nome/SKU de um item já descrito preserva os resultados do motor", () => {
    const renamed = {
      ...kit,
      kitItems: [
        {
          ...kit.kitItems[0],
          description: "Colar coração prata",
          sku: "2-JOIAS-15-03",
        },
      ],
    };
    expect(pricingCalculationKey(renamed)).toBe(pricingCalculationKey(kit));
    expect(calculate(renamed)).toEqual(calculate(kit));
    expect(solveTarget(renamed, 20)).toEqual(solveTarget(kit, 20));
  });

  it("kit vazio/descrição em branco/custos ou quantidades alterados invalidam a assinatura", () => {
    for (const changes of [
      { kitItems: [] },
      { kitItems: [{ ...kit.kitItems[0], description: " " }] },
      { kitItems: [{ ...kit.kitItems[0], unitCost: 50 }] },
      { kitItems: [{ ...kit.kitItems[0], quantity: 3 }] },
    ])
      expect(pricingCalculationKey({ ...kit, ...changes })).not.toBe(
        pricingCalculationKey(kit)
      );
    expect(
      solveTarget(
        { ...kit, kitItems: [{ ...kit.kitItems[0], description: " " }] },
        20
      ).result
    ).toBeNull();
  });

  it("não altera a entrada ou os rótulos usados no catálogo/PDF", () => {
    const item = Object.freeze({ ...kit.kitItems[0] });
    const original = Object.freeze({
      ...kit,
      kitItems: Object.freeze([item]),
    }) as unknown as PricingInput;
    const before = JSON.stringify(original);
    pricingCalculationKey(original);
    expect(JSON.stringify(original)).toBe(before);
    expect(original.kitItems[0].description).toBe("Colar");
    expect(original.kitItems[0].sku).toBe("COL-1");
  });
});
