import { describe, expect, it } from "vitest";
import { defaultInput, calculate, solveTarget } from "./pricing";
import {
  createJewelryPostageCase,
  JEWELRY_POSTAGE_EVIDENCE,
} from "./jewelryPostageCase";

describe("postagem comprovada da joia, não cotação automática", () => {
  it("reproduz os R$21,30 como custo manual único, sem somar envio de tabela", () => {
    const input = createJewelryPostageCase(defaultInput);
    const result = calculate(input, 98.94);
    expect(result.valid).toBe(true);
    expect(result.shipping).toBe(21.3);
    expect(result.fixedFee).toBe(0);
    expect(input.shippingMode).toBe("manual");
    expect([input.length, input.width, input.height]).toEqual([18, 14, 18]);
    expect(input.weight).toBe(0.263);
    expect(input.description).toMatch(/postagem da nota.*manual/);
    expect(JEWELRY_POSTAGE_EVIDENCE.source).toMatch(/comprovante/);
  });

  it("usa o custo observado no preço por margem e mantém custos e impostos editados", () => {
    const original = {
      ...defaultInput,
      itemQuantity: 4,
      cost: 20,
      operation: 2,
      packaging: 3,
      taxPis: 1.65,
      taxCofins: 3,
      taxIrpj: 1.5,
      taxCsll: 1,
      taxIcms: 4,
      taxDifal: 1,
    };
    const input = createJewelryPostageCase(original);
    const target = solveTarget(input, 20);
    expect(input.itemQuantity).toBe(1);
    expect(input.cost).toBe(20);
    expect(input.operation).toBe(2);
    expect(input.packaging).toBe(3);
    expect(input.taxFederal).toBe(7.15);
    expect(input.taxIcms).toBe(4);
    expect(input.taxDifal).toBe(1);
    expect(target.result?.valid).toBe(true);
    expect(target.result!.shipping).toBe(21.3);
    expect(target.result!.margin).toBeGreaterThanOrEqual(20);
    expect(original.itemQuantity).toBe(4);
  });
});
