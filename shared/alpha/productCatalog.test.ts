import { describe, expect, it } from "vitest";
import {
  createCatalogProduct,
  filterCatalogProducts,
  parseCatalogProduct,
  parseCatalogProducts,
  serializeCatalogProduct,
  serializeCatalogProducts,
  updateCatalogProduct,
  type CatalogProductState,
  type ProductCatalogRecord,
} from "./productCatalog";
import {
  calculate,
  defaultInput,
  type PricingInput,
  type PricingResult,
} from "./pricing";

function input(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    ...structuredClone(defaultInput),
    ...overrides,
    kitItems: overrides.kitItems ?? structuredClone(defaultInput.kitItems),
  };
}

function state(
  overrides: Partial<CatalogProductState> = {}
): CatalogProductState {
  return {
    input: input(overrides.input as Partial<PricingInput> | undefined),
    goal: overrides.goal ?? 120,
    mode: overrides.mode ?? "target",
    categoryAnswer: overrides.categoryAnswer,
    result: overrides.result,
  };
}

function validResult(forInput: PricingInput = input()): PricingResult {
  const result = calculate(forInput);
  // The default fixture is a valid complete calculation; keeping this helper
  // explicit makes the ready/draft contract clear if pricing changes later.
  expect(result.valid).toBe(true);
  return result;
}

function create(overrides: Partial<CatalogProductState> = {}, options = {}) {
  return createCatalogProduct(state(overrides), {
    id: "catalog-1",
    now: "2026-01-01T00:00:00.000Z",
    ...options,
  });
}

describe("product catalog records", () => {
  it("accepts incomplete numeric inputs without inventing values", () => {
    const original = input({
      description: "Alpha",
      height: 0,
      cost: Number.NaN,
    });
    const record = create({ input: original, goal: Number.NaN });

    expect(record.input.description).toBe("Alpha");
    expect(record.input.height).toBe(0);
    expect(record.input.cost).toBeNaN();
    expect(record.goal).toBeNaN();
    expect(record.resultPrice).toBeNull();
    expect(record.status).toBe("draft");
    expect(record.input).not.toBe(original);
  });

  it("clones KIT rows, preserving NaN and legacy extra fields", () => {
    const rows = [
      {
        id: "component-1",
        description: "Coração Azul",
        name: "Nome legado",
        sku: "COMP-1",
        quantity: Number.NaN,
        unitCost: 4,
        legacyFlag: true,
      },
    ];
    const original = input({
      description: "Kit azul",
      productType: "kit",
      productSku: "hidden-single",
      kitSku: "KIT-AZUL",
      kitItems: rows,
    });
    const record = create({ input: original });

    expect(record.input.kitItems).toEqual(rows);
    expect(record.input.kitItems).not.toBe(rows);
    expect(record.input.kitItems[0]).not.toBe(rows[0]);
    expect(record.input.kitItems[0].quantity).toBeNaN();
    expect((record.input.kitItems[0] as (typeof rows)[number]).legacyFlag).toBe(
      true
    );

    rows[0].description = "mutated";
    expect(record.input.kitItems[0].description).toBe("Coração Azul");
  });

  it("round-trips non-finite values through a versioned envelope", () => {
    const original = create({
      input: input({
        description: "Numbers",
        cost: Number.NaN,
        height: Infinity,
        width: -Infinity,
      }),
      goal: Number.NaN,
    });
    const parsed = parseCatalogProducts(serializeCatalogProducts([original]));

    expect(parsed).toHaveLength(1);
    expect(parsed[0].input.cost).toBeNaN();
    expect(parsed[0].input.height).toBe(Infinity);
    expect(parsed[0].input.width).toBe(-Infinity);
    expect(parsed[0].goal).toBeNaN();
    expect(
      "missingNumericField" in
        (parsed[0].input as unknown as Record<string, unknown>)
    ).toBe(false);
  });

  it("rejects malformed JSON and invalid backup records clearly", () => {
    expect(() => parseCatalogProducts("not-json")).toThrow(
      /Invalid product catalog backup/i
    );
    expect(() =>
      parseCatalogProducts(JSON.stringify({ version: 1, records: [{}] }))
    ).toThrow(/Invalid product catalog backup/i);
    expect(() =>
      parseCatalogProducts(JSON.stringify({ version: 99, records: [] }))
    ).toThrow(/unsupported version/i);
  });

  it("supports a portable single-record adapter envelope", () => {
    const original = create({ input: input({ description: "Adapter" }) });
    const parsed = parseCatalogProduct(serializeCatalogProduct(original));
    expect(parsed).toEqual(original);
  });

  it("finds accented descriptions and KIT component SKU/name, but not hidden SKU", () => {
    const kit = create(
      {
        input: input({
          description: "Kit organizador",
          productType: "kit",
          productSku: "HIDDEN-SINGLE",
          kitSku: "ACTIVE-KIT",
          kitItems: [
            {
              id: "row-1",
              description: "Coração azul",
              name: "Nome legado",
              sku: "COMP-ÁGUA",
              quantity: 1,
              unitCost: 2,
            } as PricingInput["kitItems"][number] & { name: string },
          ],
        }),
      },
      { id: "kit", now: "2026-01-03T00:00:00.000Z" }
    );
    const single = create(
      {
        input: input({
          description: "Café",
          productSku: "ACTIVE-SINGLE",
          kitSku: "HIDDEN-KIT",
        }),
      },
      { id: "single", now: "2026-01-02T00:00:00.000Z" }
    );

    expect(
      filterCatalogProducts([single, kit], { query: "coracao" }).map(r => r.id)
    ).toEqual(["kit"]);
    expect(
      filterCatalogProducts([single, kit], { query: "comp-agua" }).map(
        r => r.id
      )
    ).toEqual(["kit"]);
    expect(
      filterCatalogProducts([single, kit], { query: "nome legado" }).map(
        r => r.id
      )
    ).toEqual(["kit"]);
    expect(
      filterCatalogProducts([single, kit], { query: "hidden-single" })
    ).toHaveLength(0);
    expect(
      filterCatalogProducts([single, kit], { query: "cafe" }).map(r => r.id)
    ).toEqual(["single"]);
    expect(filterCatalogProducts([single, kit]).map(r => r.id)).toEqual([
      "kit",
      "single",
    ]);
  });

  it("preserves update id/createdAt and does not mutate old or new input", () => {
    const oldInput = input({ description: "Old", kitItems: [] });
    const existing = create(
      { input: oldInput },
      { id: "stable-id", now: "2026-01-01T00:00:00.000Z" }
    );
    const nextInput = input({
      description: "New",
      kitItems: [
        { id: "x", description: "X", sku: "X", quantity: 1, unitCost: 1 },
      ],
    });
    const updated = updateCatalogProduct(
      existing,
      { input: nextInput, goal: 200, mode: "sale" },
      { now: "2026-01-04T00:00:00.000Z" }
    );

    expect(updated.id).toBe("stable-id");
    expect(updated.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(updated.updatedAt).toBe("2026-01-04T00:00:00.000Z");
    expect(updated.input.description).toBe("New");
    expect(existing.input.description).toBe("Old");
    expect(updated.input).not.toBe(nextInput);
    expect(updated.input.kitItems).not.toBe(nextInput.kitItems);
    nextInput.kitItems[0].description = "mutated";
    expect(updated.input.kitItems[0].description).toBe("X");
  });

  it("requires a trimmed description or active SKU, and ignores pricing completeness", () => {
    expect(() =>
      create({
        input: input({ description: "   ", productSku: "", kitSku: "" }),
      })
    ).toThrow(/identifying description or the active SKU/i);
    expect(() =>
      create({
        input: input({
          description: "   ",
          productSku: "",
          kitSku: "KIT-1",
          productType: "kit",
        }),
      })
    ).not.toThrow();
    expect(() =>
      create({
        input: input({
          description: "   ",
          productSku: "SKU-1",
          kitSku: "",
          productType: "single",
          cost: undefined,
          height: undefined,
        }),
      })
    ).not.toThrow();
  });

  it("is ready only for a valid positive numeric result; invalid result stays draft", () => {
    const completeInput = input();
    const ready = create({
      input: completeInput,
      result: validResult(completeInput),
    });
    const draft = create({
      input: completeInput,
      result: { ...validResult(completeInput), valid: false },
    });

    expect(ready.status).toBe("ready");
    expect(ready.resultPrice).toBeGreaterThan(0);
    expect(draft.status).toBe("draft");
    expect(draft.resultPrice).toBeNull();
  });

  it("filters by product type, calculation type, and status", () => {
    const ready = create(
      {
        input: input({ productType: "single", calculationType: "real" }),
        result: validResult(),
      },
      { id: "ready", now: "2026-01-03T00:00:00.000Z" }
    );
    const draft = create(
      {
        input: input({
          productType: "kit",
          calculationType: "estimated",
          kitSku: "KIT-1",
        }),
      },
      { id: "draft", now: "2026-01-02T00:00:00.000Z" }
    );

    expect(
      filterCatalogProducts([draft, ready], {
        productType: "single",
        calculationType: "real",
        status: "ready",
      }).map(r => r.id)
    ).toEqual(["ready"]);
    expect(
      filterCatalogProducts([draft, ready], {
        productType: "kit",
        status: "draft",
      }).map(r => r.id)
    ).toEqual(["draft"]);
  });
});

it("preserves textual category confidence used by the calculator", () => {
  const record = createCatalogProduct({
    input: input({ description: "Colar Alpha" }),
    goal: 10,
    mode: "target",
    categoryAnswer: {
      category: "Colares",
      categoryId: null,
      source: "ai",
      explanation: "A confirmar",
      confidence: "alta",
      alternatives: [],
    },
  });
  const restored = parseCatalogProducts(serializeCatalogProducts([record]))[0];
  expect(restored.categoryAnswer?.confidence).toBe("alta");
});
