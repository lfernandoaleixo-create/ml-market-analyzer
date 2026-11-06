import { describe, expect, it } from "vitest";
import {
  applyCompanyTax,
  FEDERAL_TAX_FIELDS,
  FEDERAL_TAX_RATE,
  FEDERAL_TAXES,
  getFederalTaxRates,
  resetCompanyTax,
  sumFederalTaxRates,
} from "./companyProfile";
import { calculate, defaultInput, solveTarget, type PricingInput } from "./pricing";

describe("company profile", () => {
  it("preserva as alíquotas federais legadas e expõe os campos editáveis", () => {
    expect(FEDERAL_TAXES).toEqual([
      { label: "PIS", rate: 0.65 },
      { label: "COFINS", rate: 3 },
      { label: "IRPJ", rate: 1.5 },
      { label: "CSLL", rate: 1 },
    ]);

    expect(FEDERAL_TAX_FIELDS).toEqual([
      { key: "taxPis", label: "PIS", rate: 0.65 },
      { key: "taxCofins", label: "COFINS", rate: 3 },
      { key: "taxIrpj", label: "IRPJ", rate: 1.5 },
      { key: "taxCsll", label: "CSLL", rate: 1 },
    ]);
    expect(sumFederalTaxRates(getFederalTaxRates(defaultInput))).toBe(6.15);
    expect(FEDERAL_TAX_RATE).toBe(6.15);
  });

  it("mantém a composição padrão dos quatro campos e do agregado", () => {
    expect({
      taxPis: defaultInput.taxPis,
      taxCofins: defaultInput.taxCofins,
      taxIrpj: defaultInput.taxIrpj,
      taxCsll: defaultInput.taxCsll,
      taxFederal: defaultInput.taxFederal,
    }).toEqual({
      taxPis: 0.65,
      taxCofins: 3,
      taxIrpj: 1.5,
      taxCsll: 1,
      taxFederal: 6.15,
    });
  });

  it("permite editar PIS, recalcula o agregado e preserva os demais custos", () => {
    const input: PricingInput = {
      ...defaultInput,
      taxFederal: 0,
      taxPis: 1.65,
      taxIcms: 4.5,
      taxDifal: 2.25,
      operation: 8.75,
      packaging: 6.25,
    };
    const before = { ...input };
    const applied = applyCompanyTax(input);

    expect(applied).toEqual({
      ...input,
      taxFederal: 7.15,
    });
    expect(applied.taxFederal).toBe(7.15);
    expect(applied.taxIcms).toBe(4.5);
    expect(applied.taxDifal).toBe(2.25);
    expect(applied.operation).toBe(8.75);
    expect(applied.packaging).toBe(6.25);
    expect(applied).not.toBe(input);
    expect(input).toEqual(before);
  });

  it("aceita zero em todos os tributos federais", () => {
    const applied = applyCompanyTax({
      ...defaultInput,
      taxPis: 0,
      taxCofins: 0,
      taxIrpj: 0,
      taxCsll: 0,
    });

    expect(applied.taxFederal).toBe(0);
    expect(calculate({ ...applied, price: 100, taxIcms: 0, taxDifal: 0 }).taxes).toBe(0);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "bloqueia taxa federal inválida %s sem mascarar o valor",
    value => {
      const applied = applyCompanyTax({ ...defaultInput, taxPis: value });

      expect(applied.taxPis).toBe(value);
      expect(Number.isNaN(applied.taxFederal)).toBe(true);
      expect(calculate(applied).valid).toBe(false);
      expect(calculate(applied).error).toBe("taxa federal inválido.");
    }
  );

  it("preenche apenas campos fiscais ausentes em perfil legado", () => {
    const legacy = { ...defaultInput } as Partial<PricingInput> &
      Record<string, unknown>;
    delete legacy.taxPis;
    delete legacy.taxCofins;
    delete legacy.taxIrpj;
    delete legacy.taxCsll;

    expect(getFederalTaxRates(legacy)).toEqual({
      taxPis: 0.65,
      taxCofins: 3,
      taxIrpj: 1.5,
      taxCsll: 1,
    });
    expect(applyCompanyTax(legacy as PricingInput)).toMatchObject({
      taxPis: 0.65,
      taxCofins: 3,
      taxIrpj: 1.5,
      taxCsll: 1,
      taxFederal: 6.15,
    });
  });

  it("reseta explicitamente somente os tributos federais", () => {
    const changed = applyCompanyTax({
      ...defaultInput,
      taxPis: 1.65,
      taxCofins: 0,
      taxIrpj: 2,
      taxCsll: 0.5,
      taxIcms: 4.5,
      taxDifal: 2.25,
      operation: 9,
    });
    const before = { ...changed };
    const reset = resetCompanyTax(changed);

    expect(reset).toEqual({
      ...changed,
      taxPis: 0.65,
      taxCofins: 3,
      taxIrpj: 1.5,
      taxCsll: 1,
      taxFederal: 6.15,
    });
    expect(reset.taxIcms).toBe(4.5);
    expect(reset.taxDifal).toBe(2.25);
    expect(reset.operation).toBe(9);
    expect(changed).toEqual(before);
    expect(reset).not.toBe(changed);
  });

  it("faz o imposto pago e o preço-alvo reagirem à edição federal", () => {
    const base: PricingInput = {
      ...defaultInput,
      cost: 20,
      operation: 0,
      packaging: 0,
      promotion: 0,
      ads: 0,
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
    };
    const edited = applyCompanyTax({ ...base, taxPis: 1.65 });
    const sale = calculate(edited, 100);
    const withoutFederal = solveTarget(base, 20);
    const withFederal = solveTarget(edited, 20);

    expect(edited.taxFederal).toBe(7.15);
    expect(sale.taxes).toBe(7.15);
    expect(withoutFederal.price).not.toBeNull();
    expect(withFederal.price).not.toBeNull();
    expect(withFederal.price!).toBeGreaterThan(withoutFederal.price!);
    expect(withFederal.result!.margin + 1e-9).toBeGreaterThanOrEqual(20);
  });
});
