import { describe, expect, it } from "vitest";
import {
  calculate,
  defaultInput,
  getDifalTax,
  getStateTaxRates,
  solveTarget,
  type PricingInput,
} from "./pricing";

const makeInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  ...defaultInput,
  taxFederal: 0,
  operation: 0,
  packaging: 0,
  promotion: 0,
  ads: 0,
  reservePercent: 0,
  weight: 0.5,
  shippingMode: "manual",
  manualShipping: 0,
  manualFixedFee: 0,
  manualFixedLimit: 0,
  useDestinationTaxes: true,
  ...overrides,
});

describe("taxas por destino", () => {
  it("mantém o contrato legado quando a flag nova está desligada", () => {
    expect(
      getStateTaxRates({
        ...defaultInput,
        useDestinationTaxes: false,
        taxIcms: 4,
        taxDifal: 2,
        difalMode: "percent",
      })
    ).toEqual({
      icmsSale: 4,
      icmsTransfer: 0,
      difalPercent: 2,
      difalFixed: 0,
    });

    expect(
      getStateTaxRates({
        ...defaultInput,
        useDestinationTaxes: false,
        taxIcms: 4,
        taxDifal: 99,
        difalMode: "rs",
        taxDifalValue: 8,
      })
    ).toEqual({
      icmsSale: 4,
      icmsTransfer: 0,
      difalPercent: 0,
      difalFixed: 8,
    });
  });

  it("aplica venda interna sem DIFAL e venda externa com os quatro componentes", () => {
    const inside = makeInput({ saleDestination: "inside", taxDifal: 16 });
    const outside = makeInput({ saleDestination: "outside", taxDifal: 16 });

    expect(getStateTaxRates(inside)).toEqual({
      icmsSale: 6,
      icmsTransfer: 1.5,
      difalPercent: 0,
      difalFixed: 0,
    });
    expect(getStateTaxRates(outside)).toEqual({
      icmsSale: 1.3,
      icmsTransfer: 1.5,
      difalPercent: 16,
      difalFixed: 0,
    });
    expect(calculate(inside, 100).taxes).toBe(7.5);
    expect(calculate(outside, 100).taxes).toBe(18.8);
  });

  it("respeita o modo privado de DIFAL fixo somente fora do estado", () => {
    const outside = makeInput({
      saleDestination: "outside",
      difalMode: "rs",
      taxDifal: 999,
      taxDifalValue: 10,
    });
    const inside = { ...outside, saleDestination: "inside" as const };

    expect(getDifalTax(outside, 100)).toBe(10);
    expect(getDifalTax(inside, 100)).toBe(0);
    expect(
      getDifalTax(
        { ...inside, difalMode: "percent", taxDifal: Number.NaN },
        Number.NaN
      )
    ).toBe(0);
    expect(calculate(outside, 100).taxes).toBe(12.8);
    expect(calculate(inside, 100).taxes).toBe(7.5);
  });

  it("valida somente taxas ativas e aceita zero", () => {
    const insideWithInactiveGarbage = makeInput({
      saleDestination: "inside",
      taxIcmsInside: 0,
      taxIcmsOutside: Number.NaN,
      taxDifal: Number.NaN,
      taxDifalValue: Number.NaN,
      taxIcms: Number.NaN,
    });
    expect(calculate(insideWithInactiveGarbage, 100).valid).toBe(true);

    const outsideWithInactiveGarbage = makeInput({
      saleDestination: "outside",
      taxIcmsInside: Number.NaN,
      taxIcmsOutside: 0,
      taxDifal: 0,
      taxDifalValue: Number.NaN,
      taxIcms: Number.NaN,
    });
    expect(calculate(outsideWithInactiveGarbage, 100).valid).toBe(true);

    expect(
      calculate(makeInput({ taxIcmsInside: Number.NaN }), 100).valid
    ).toBe(false);
    expect(
      calculate(
        makeInput({ saleDestination: "outside", taxIcmsOutside: Number.NaN }),
        100
      ).valid
    ).toBe(false);
    expect(
      calculate(makeInput({ taxIcmsTransfer: Number.NaN }), 100).valid
    ).toBe(false);
  });

  it("considera o DIFAL percentual no solver e o fixo uma vez", () => {
    const base = makeInput({
      saleDestination: "outside",
      cost: 20,
      classicRate: 10,
      price: 1,
      taxIcmsOutside: 0,
      taxIcmsTransfer: 0,
      taxDifal: 0,
    });
    const withoutDifal = solveTarget(base, 20);
    const withPercent = solveTarget({ ...base, taxDifal: 16 }, 20);
    const withFixed = solveTarget(
      {
        ...base,
        difalMode: "rs",
        taxDifal: 99,
        taxDifalValue: 10,
      },
      20
    );

    expect(withoutDifal.price).not.toBeNull();
    expect(withPercent.price).not.toBeNull();
    expect(withFixed.price).not.toBeNull();
    expect(withPercent.price!).toBeGreaterThan(withoutDifal.price!);
    expect(withFixed.price!).toBeGreaterThan(withoutDifal.price!);
    expect(withFixed.result!.taxes).toBe(10);
    expect(withFixed.result!.margin + 1e-9).toBeGreaterThanOrEqual(20);
  });

  it("não multiplica tributos adicionais pela quantidade de um kit", () => {
    const input = makeInput({
      productType: "kit",
      kitItems: [
        {
          id: "a",
          description: "Peça A",
          sku: "A",
          quantity: 2,
          unitCost: 5,
        },
      ],
      saleDestination: "outside",
      price: 100,
      taxDifal: 16,
    });
    const result = calculate(input, 100);

    expect(result.valid).toBe(true);
    expect(result.taxes).toBe(18.8);
  });
});
