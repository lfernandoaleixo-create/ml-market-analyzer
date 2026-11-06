import { describe, expect, it } from "vitest";
import { calculate, defaultInput, type PricingInput } from "./pricing";
import {
  getInterfaceMigrationNotice,
  isAutomaticShippingSupported,
  normalizeInterfaceInput,
  removedInputModes,
} from "./interfaceInput";

type InterfaceInput = PricingInput & {
  automaticShippingOnly: boolean;
  metadataLabel?: string;
};

const makeInput = (overrides: Partial<InterfaceInput> = {}): InterfaceInput =>
  ({
    ...defaultInput,
    automaticShippingOnly: true,
    ...overrides,
  }) as InterfaceInput;

describe("interface input normalization", () => {
  it("preserva a identidade de uma entrada já normalizada", () => {
    const input = makeInput({
      shippingMode: "auto",
      costMode: "unit",
      useDestinationTaxes: true,
      taxDifal: 16,
    });

    expect(normalizeInterfaceInput(input)).toBe(input);
  });

  it("converte custo por kg em custo por item e preserva quantidade", () => {
    const legacy = makeInput({
      costMode: "kg",
      cost: 12.5,
      productKg: 0.8,
      itemQuantity: 3,
      shippingMode: "auto",
    });
    const normalized = normalizeInterfaceInput(legacy) as InterfaceInput;

    expect(normalized).not.toBe(legacy);
    expect(normalized.costMode).toBe("unit");
    expect(normalized.cost).toBe(10);
    expect(normalized.productKg).toBe(1);
    expect(normalized.itemQuantity).toBe(3);
    expect(normalized.automaticShippingOnly).toBe(true);
    expect(calculate(normalized).productCost).toBe(
      calculate(legacy).productCost
    );
  });

  it("não arredonda o custo de cada item antes de multiplicar a quantidade", () => {
    const legacy = makeInput({
      costMode: "kg",
      cost: 31.1,
      productKg: 0.25,
      itemQuantity: 3,
    });
    const normalized = normalizeInterfaceInput(legacy);
    expect(normalized.cost).toBe(legacy.cost * legacy.productKg);
    expect(calculate(normalized).productCost).toBe(
      calculate(legacy).productCost
    );
  });

  it("ativa o modo automático ao normalizar entrada sem a flag nova", () => {
    const legacy = {
      ...defaultInput,
      automaticShippingOnly: false,
    } as InterfaceInput;

    const normalized = normalizeInterfaceInput(legacy) as InterfaceInput;

    expect(normalized).not.toBe(legacy);
    expect(normalized.automaticShippingOnly).toBe(true);
    expect(normalized.costMode).toBe("unit");
    expect(normalized.shippingMode).toBe("auto");
  });

  it("mantém campos fiscais, de pacote e metadados durante a migração", () => {
    const legacy = makeInput({
      costMode: "kg",
      cost: 9,
      productKg: 2,
      itemQuantity: 3,
      productSku: "PROD-LEGADO",
      kitSku: "KIT-LEGADO",
      productType: "kit",
      kitItems: [
        {
          id: "row-1",
          description: "Pote grande",
          sku: "POTE-G",
          quantity: 2,
          unitCost: 4.5,
        },
        {
          id: "row-2",
          description: "Pote pequeno",
          sku: "POTE-P",
          quantity: 1,
          unitCost: 2.25,
        },
      ],
      description: "Kit com etiqueta",
      category: "Casa",
      taxFederal: 6.15,
      taxPis: 0.9,
      taxCofins: 3.2,
      taxIrpj: 1.7,
      taxCsll: 1.1,
      taxIcms: 4,
      taxDifal: 2,
      difalMode: "rs",
      taxDifalValue: 8.75,
      weight: 0.7,
      weightExact: 0.7,
      length: 31,
      width: 22,
      height: 11,
      metadataLabel: "rascunho legado",
    });

    const normalized = normalizeInterfaceInput(legacy) as InterfaceInput;

    expect(normalized).toMatchObject({
      description: legacy.description,
      category: legacy.category,
      productSku: legacy.productSku,
      kitSku: legacy.kitSku,
      productType: legacy.productType,
      kitItems: legacy.kitItems,
      itemQuantity: legacy.itemQuantity,
      taxFederal: legacy.taxFederal,
      taxPis: legacy.taxPis,
      taxCofins: legacy.taxCofins,
      taxIrpj: legacy.taxIrpj,
      taxCsll: legacy.taxCsll,
      taxIcms: legacy.taxIcms,
      taxDifal: 16,
      difalMode: "percent",
      taxDifalValue: legacy.taxDifalValue,
      weight: legacy.weight,
      weightExact: legacy.weightExact,
      length: legacy.length,
      width: legacy.width,
      height: legacy.height,
      metadataLabel: legacy.metadataLabel,
    });
  });

  it("mantém bloqueáveis zero, negativos e NaN no custo por kg", () => {
    const cases = [
      { cost: 20, productKg: 0, expectsNaN: true },
      { cost: 20, productKg: -1, expectsNaN: true },
      { cost: Number.NaN, productKg: 2, expectsNaN: true },
      { cost: -20, productKg: 2, expectsNaN: false },
    ];

    for (const { cost, productKg, expectsNaN } of cases) {
      const normalized = normalizeInterfaceInput(
        makeInput({ costMode: "kg", cost, productKg })
      );

      expect(Number.isNaN(normalized.cost)).toBe(expectsNaN);
      expect(calculate(normalized).valid).toBe(false);
    }
  });

  it("troca frete manual por automático e deixa o motor usar a tabela elegível", () => {
    const legacy = makeInput({
      shippingMode: "manual",
      manualShipping: 99.99,
      manualFixedFee: 7,
      manualFixedLimit: 200,
      price: 100,
      weight: 0.5,
    });
    const normalized = normalizeInterfaceInput(legacy) as InterfaceInput;
    const result = calculate(normalized);

    expect(isAutomaticShippingSupported(normalized)).toBe(true);
    expect(normalized.shippingMode).toBe("auto");
    expect(normalized.manualShipping).toBe(legacy.manualShipping);
    expect(normalized.manualFixedFee).toBe(legacy.manualFixedFee);
    expect(result.valid).toBe(true);
    expect(result.fixedFee).toBe(0);
    expect(result.shipping).not.toBe(legacy.manualShipping);
  });

  it("normaliza condição usada sem mutar o perfil bruto salvo", () => {
    const rawSaved = makeInput({ condition: "used" });

    expect(isAutomaticShippingSupported(rawSaved)).toBe(false);

    const normalized = normalizeInterfaceInput(rawSaved) as InterfaceInput;

    expect(normalized).not.toBe(rawSaved);
    expect(rawSaved.condition).toBe("used");
    expect(normalized.condition).toBe("new");
    expect(isAutomaticShippingSupported(normalized)).toBe(true);
  });

  it("aplica a tabela de suporte sem alterar perfil", () => {
    const cases = [
      ["green", "new", "agency", true],
      ["new", "new", "collection", true],
      ["green", "new", "full", true],
      ["yellow", "new", "agency", false],
      ["red", "new", "collection", false],
      ["green", "new", "flex", false],
      ["green", "new", "other", false],
      ["green", "used", "agency", false],
    ] as const;

    for (const [reputation, condition, logistic, supported] of cases) {
      expect(
        isAutomaticShippingSupported(
          makeInput({ reputation, condition, logistic })
        )
      ).toBe(supported);
    }
  });

  it("preserva frete manual em perfil sem tabela, sem declarar cotação automática", () => {
    const legacy = makeInput({
      reputation: "yellow",
      shippingMode: "manual",
      manualShipping: 21.3,
    });
    const normalized = normalizeInterfaceInput(legacy);

    expect(isAutomaticShippingSupported(normalized)).toBe(false);
    expect(normalized.shippingMode).toBe("auto");
    expect(normalized.manualShipping).toBe(21.3);
  });

  it("detecta modos removidos e produz avisos somente nas transições", () => {
    const legacy = makeInput({
      costMode: "kg",
      productKg: 2,
      shippingMode: "manual",
      condition: "used",
    });
    const normalized = normalizeInterfaceInput(legacy);
    const costOnly = normalizeInterfaceInput(
      makeInput({ costMode: "kg", productKg: 2, shippingMode: "auto" })
    );
    const shippingOnly = normalizeInterfaceInput(
      makeInput({ costMode: "unit", shippingMode: "manual" })
    );

    expect(removedInputModes(legacy)).toBe(true);
    expect(removedInputModes(normalized)).toBe(false);
    expect(getInterfaceMigrationNotice(legacy, normalized)).toMatch(
      /custo por quilo.*custo por item.*frete informado.*modo manual.*automático/i
    );
    expect(getInterfaceMigrationNotice(legacy, costOnly)).toMatch(
      /custo por quilo.*custo por item/i
    );
    expect(getInterfaceMigrationNotice(legacy, shippingOnly)).toMatch(
      /frete informado.*modo manual.*automático/i
    );
    expect(getInterfaceMigrationNotice(legacy, normalized)).toMatch(
      /condição.*alterada para Novo.*tabela de frete automático/i
    );
    expect(getInterfaceMigrationNotice(normalized, normalized)).toBeNull();
  });

  it("avisa quando uma condição usada é convertida para Novo", () => {
    const used = makeInput({ condition: "used" });
    const normalized = normalizeInterfaceInput(used);

    expect(removedInputModes(used)).toBe(true);
    expect(removedInputModes(normalized)).toBe(false);
    expect(getInterfaceMigrationNotice(used, normalized)).toBe(
      "A condição do produto foi alterada para Novo para usar a tabela de frete automático."
    );
    expect(getInterfaceMigrationNotice(normalized, normalized)).toBeNull();
  });
});
