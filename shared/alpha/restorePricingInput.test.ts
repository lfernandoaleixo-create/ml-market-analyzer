import { describe, expect, it } from "vitest";
import { defaultInput } from "./pricing";
import { restorePricingInput } from "./restorePricingInput";
import { resolvePricingFlow } from "./pricingFlow";

describe("product drafts restore missing values", () => {
  it("keeps a missing height invalid instead of restoring a default", () => {
    const source = {
      ...defaultInput,
      packagingPreset: "p" as const,
      length: 20,
      width: 30,
      height: Number.NaN,
    };
    const restored = restorePricingInput(source, true, true);
    expect(restored.height).toBeNaN();
    expect(resolvePricingFlow(restored, "target", 20).result.valid).toBe(false);
  });
  it("does not replace an absent purchase cost with the initial example", () => {
    const source: Record<string, unknown> = {
      ...defaultInput,
      length: 20,
      width: 30,
      height: 5,
    };
    delete source.cost;
    const restored = restorePricingInput(source, true, true);
    expect(restored.cost).toBeNaN();
    expect(resolvePricingFlow(restored, "target", 20).result.valid).toBe(false);
  });
  it("restores SKU-only drafts with empty text and NaN for missing active numbers", () => {
    const source = {
      productType: "single",
      productSku: "SKU-ONLY",
      cost: Infinity,
      height: -Infinity,
    } as Record<string, unknown>;

    const restored = restorePricingInput(source, true, true);

    expect(restored.description).toBe("");
    expect(restored.productSku).toBe("SKU-ONLY");
    expect(restored.kitSku).toBe("");
    expect(restored.category).toBe("");
    for (const key of [
      "cost",
      "itemQuantity",
      "weight",
      "length",
      "width",
      "height",
    ] as const) {
      expect(restored[key]).toBeNaN();
    }
    expect(resolvePricingFlow(restored, "target", 20).result.valid).toBe(false);
  });
  it("preserves unknown KIT amounts and zero height", () => {
    const restored = restorePricingInput(
      {
        ...defaultInput,
        productType: "kit",
        kitSku: "KIT-1",
        length: 20,
        width: 30,
        height: 0,
        kitItems: [
          {
            id: "a",
            description: "Colar",
            sku: "C-1",
            quantity: 2,
            unitCost: Number.NaN,
          },
        ],
      },
      true,
      true
    );
    expect(restored.kitItems[0].unitCost).toBeNaN();
    expect(restored.height).toBe(0);
    expect(resolvePricingFlow(restored, "target", 20).result.valid).toBe(false);
  });
  it("keeps a matching preset with an unknown height", () => {
    const restored = restorePricingInput(
      {
        ...defaultInput,
        packagingPreset: "p",
        length: 20,
        width: 30,
        height: undefined,
      },
      true,
      true
    );

    expect(restored.packagingPreset).toBe("p");
    expect(restored.length).toBe(20);
    expect(restored.width).toBe(30);
    expect(restored.height).toBeNaN();
  });
  it("downgrades mismatched private preset coordinates to custom without rewriting them", () => {
    const source = {
      ...defaultInput,
      packagingPreset: "p" as const,
      length: 20,
      width: 15,
      height: 18,
    };
    const snapshot = structuredClone(source);

    const restored = restorePricingInput(source, true, true);

    expect(restored.packagingPreset).toBe("custom");
    expect(restored.length).toBe(20);
    expect(restored.width).toBe(15);
    expect(restored.height).toBe(18);
    expect(source).toEqual(snapshot);
  });
  it("keeps legacy preset normalization when incomplete preservation is disabled", () => {
    const restored = restorePricingInput(
      {
        ...defaultInput,
        packagingPreset: "p",
        length: 20,
        width: 15,
        height: 18,
      },
      true,
      false
    );

    expect(restored.packagingPreset).toBe("p");
    expect(restored.length).toBe(20);
    expect(restored.width).toBe(30);
    expect(restored.height).toBe(0);
  });
  it("does not invent a known quantity for a KIT with absent legacy fields", () => {
    const restored = restorePricingInput(
      { productType: "kit", kitSku: "KIT-UNKNOWN" },
      true,
      true
    );

    expect(restored.description).toBe("");
    expect(restored.kitItems).toHaveLength(1);
    expect(restored.kitItems[0].quantity).toBeNaN();
    expect(restored.kitItems[0].unitCost).toBeNaN();
  });
  it("keeps legacy normal restoration compatible", () => {
    expect(
      restorePricingInput({ ...defaultInput, cost: Number.NaN }).cost
    ).toBe(defaultInput.cost);
  });
  it("restores valid values and cloned component rows", () => {
    const original = {
      ...defaultInput,
      productType: "kit" as const,
      kitItems: [
        {
          id: "b",
          description: "Brinco",
          sku: "B-1",
          quantity: 3,
          unitCost: 4,
        },
      ],
      length: 20,
      width: 30,
      height: 5,
    };
    const result = restorePricingInput(original, true, true);
    expect(result.kitItems).toEqual(original.kitItems);
    expect(result.kitItems).not.toBe(original.kitItems);
    expect(result.height).toBe(5);
  });
});
