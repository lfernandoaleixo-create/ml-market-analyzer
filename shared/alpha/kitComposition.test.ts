import { describe, expect, it } from "vitest";
import {
  calculate,
  defaultInput,
  getAcquisition,
  solveTarget,
  type PricingInput,
} from "./pricing";
import {
  ensureKitItems,
  hydrateKitComposition,
  type KitItemWithSubtotal,
} from "./kitComposition";

const makeInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  ...defaultInput,
  ...overrides,
});

const kitInput = (overrides: Partial<PricingInput> = {}): PricingInput =>
  makeInput({
    productType: "kit",
    kitItems: [
      {
        id: "colar-1",
        description: "Colar",
        sku: "COLAR",
        quantity: 2,
        unitCost: 10.11,
      },
      {
        id: "veludo-1",
        description: "Caixa de veludo",
        sku: "VELUDO",
        quantity: 1,
        unitCost: 8.45,
      },
      {
        id: "brinco-1",
        description: "Brincos",
        sku: "",
        quantity: 3,
        unitCost: 4.07,
      },
    ],
    ...overrides,
  });

describe("composição de KIT", () => {
  it.each([NaN, -1, Infinity])(
    "Unidade ignora kg inativo %s, mas compra por kg continua bloqueando",
    productKg => {
      const input = makeInput({
        productType: "single",
        costMode: "unit",
        cost: 32,
        itemQuantity: 1,
        productKg,
      });
      expect(getAcquisition(input).errors).toEqual([]);
      expect(getAcquisition(input).total).toBe(32);
      expect(calculate(input).valid).toBe(true);
      expect(solveTarget(input, 20).price).not.toBeNull();
      expect(calculate({ ...input, costMode: "kg" }).valid).toBe(false);
    }
  );

  it("soma 2 colares, 1 caixa de veludo e 3 brincos sem multiplicar o KIT novamente", () => {
    const input = kitInput({
      price: 100,
      itemQuantity: 2,
      taxFederal: 0,
      taxIcms: 0,
      taxDifal: 0,
    });
    const acquisition = getAcquisition(input);
    const result = calculate(input);

    expect(acquisition.errors).toEqual([]);
    expect(acquisition.quantity).toBe(6);
    expect(acquisition.items.map(item => item.subtotal)).toEqual([
      20.22, 8.45, 12.21,
    ]);
    expect(acquisition.total).toBe(40.88);
    expect(result.valid).toBe(true);
    expect(result.productCost).toBe(acquisition.total);
    expect(result.productCost).not.toBe(acquisition.total * input.itemQuantity);
  });

  it("mantém a soma monetária exatamente igual aos subtotais exibidos", () => {
    const input = kitInput({
      kitItems: [
        {
          id: "fraction-1",
          description: "Item fracionado",
          sku: "",
          quantity: 3,
          unitCost: 0.005,
        },
        {
          id: "fraction-2",
          description: "Outro item",
          sku: "",
          quantity: 1,
          unitCost: 0.004,
        },
      ],
    });
    const acquisition = getAcquisition(input);
    const displayed = acquisition.items.reduce(
      (sum, item) => sum + item.subtotal,
      0
    );

    expect(acquisition.items.map(item => item.subtotal)).toEqual([0.02, 0]);
    expect(acquisition.total).toBe(displayed);
  });

  it("rejeita KIT vazio e linhas inválidas, mas não exige SKU", () => {
    const empty = getAcquisition(kitInput({ kitItems: [] }));
    const invalid = getAcquisition(
      kitInput({
        kitItems: [
          {
            id: "invalid-1",
            description: "   ",
            sku: "",
            quantity: 0,
            unitCost: Number.NaN,
          },
        ],
      })
    );

    expect(empty.errors.length).toBeGreaterThan(0);
    expect(invalid.errors).toHaveLength(3);
    expect(invalid.errors.join(" ")).toMatch(/descrição|quantidade|custo/i);
    expect(getAcquisition(kitInput()).errors).toEqual([]);
  });

  it("ignora custo, peso e quantidade single obsoletos quando o KIT é válido", () => {
    const input = kitInput({
      cost: -999,
      productKg: Number.NaN,
      itemQuantity: 0,
      price: 100,
      taxFederal: 0,
      taxIcms: 0,
      taxDifal: 0,
    });
    const result = calculate(input);

    expect(result.valid).toBe(true);
    expect(result.productCost).toBe(40.88);
  });

  it("preserva cálculo real/estimado e mantém frete, tributos e solver", () => {
    const estimated = kitInput({ calculationType: "estimated" });
    const real = { ...estimated, calculationType: "real" as const };
    const estimatedResult = calculate(estimated);
    const realResult = calculate(real);

    expect(realResult).toEqual(estimatedResult);
    expect(solveTarget(real, 20)).toEqual(solveTarget(estimated, 20));
    expect(realResult.shipping).toBe(estimatedResult.shipping);
    expect(realResult.taxes).toBe(estimatedResult.taxes);
  });

  it("hidrata KIT legado ausente com uma linha equivalente, sem arredondar custo unitário antes da aquisição", () => {
    const legacy = {
      ...makeInput({
        productType: "kit",
        description: "Kit antigo",
        productSku: "ITEM-ANTIGO",
        kitSku: "KIT-ANTIGO",
        costMode: "kg",
        cost: 1.2345,
        productKg: 0.75,
        itemQuantity: 3,
        category: "categoria antiga",
        price: 123.45,
      }),
    } as Omit<PricingInput, "kitItems"> & {
      kitItems?: PricingInput["kitItems"];
    };
    delete legacy.kitItems;
    const before = calculate({
      ...legacy,
      productType: "single",
    } as PricingInput);
    const hydrated = hydrateKitComposition(legacy as PricingInput);
    const after = calculate(hydrated);

    expect(hydrated.kitItems).toHaveLength(1);
    expect(hydrated.kitItems[0]).toMatchObject({
      description: "Kit antigo",
      sku: "",
      quantity: 3,
      unitCost: 1.2345 * 0.75,
    });
    expect(after.productCost).toBe(before.productCost);
    expect(after.productCost).toBe(2.78);
    expect(hydrated.category).toBe(legacy.category);
    expect(hydrated.price).toBe(legacy.price);
    expect(hydrated.productSku).toBe("ITEM-ANTIGO");
    expect(hydrated.kitSku).toBe("KIT-ANTIGO");
  });

  it("migra lista ausente no registro mesmo quando os padrões novos já incluem array vazio", () => {
    const input = makeInput({
      productType: "kit",
      cost: 14,
      itemQuantity: 10,
      description: "KIT antigo",
    });
    const migrated = hydrateKitComposition(input, undefined);
    expect(migrated.kitItems).toHaveLength(1);
    expect(getAcquisition(migrated).total).toBe(140);
    expect(hydrateKitComposition(input, []).kitItems).toEqual([]);
    expect(hydrateKitComposition(input).kitItems).toEqual([]);
  });

  it("mantém array vazio explícito e preserva linhas inválidas ao hidratar", () => {
    const input = makeInput({ productType: "kit" });
    const empty = hydrateKitComposition(input, []);
    const restored = hydrateKitComposition(input, [
      {
        id: "",
        description: 42,
        sku: undefined,
        quantity: "não é número",
        unitCost: "1,25",
      },
    ]);

    expect(empty.kitItems).toEqual([]);
    expect(restored.kitItems).toEqual([
      {
        id: "restored-1",
        description: "",
        sku: "",
        quantity: Number.NaN,
        unitCost: 1.25,
      },
    ]);
  });

  it("normaliza SKUs de cabeçalho e não repopula KIT vazio ao hidratar single", () => {
    const single = makeInput({
      productType: "single",
      productSku: 123 as unknown as string,
      kitSku: null as unknown as string,
      kitItems: [],
    });
    const hydrated = hydrateKitComposition(single, undefined);

    expect(hydrated.productSku).toBe("");
    expect(hydrated.kitSku).toBe("");
    expect(hydrated.kitItems).toEqual([]);
  });

  it("materializa linha apenas quando ensureKitItems é chamado explicitamente", () => {
    const input = makeInput({
      productType: "kit",
      productSku: "COMP-1",
      kitSku: "KIT-1",
      kitItems: [],
      description: "Componente",
      itemQuantity: 2,
      cost: 7.5,
    });
    const ensured = ensureKitItems(input);

    expect(ensured.kitItems).toHaveLength(1);
    expect(ensured.kitItems[0]).toMatchObject({
      description: "Componente",
      sku: "COMP-1",
      quantity: 2,
      unitCost: 7.5,
    });
    expect(ensured.kitSku).toBe("KIT-1");
    expect(ensureKitItems(ensured)).toBe(ensured);
  });

  it("expõe subtotais como itens de aquisição tipados", () => {
    const items: KitItemWithSubtotal[] = getAcquisition(kitInput()).items;
    expect(items.every(item => typeof item.subtotal === "number")).toBe(true);
  });
});
