import { describe, expect, it } from "vitest";
import {
  calculate,
  defaultInput,
  parseLocalized,
  solveTarget,
  type PricingInput,
} from "./pricing";
import {
  SHIPPING_CHECKED_AT,
  SHIPPING_PRICE_STARTS,
  SHIPPING_RAPID_VALUES,
  SHIPPING_VALUES,
} from "./tariffs";
import { FEDERAL_TAX_RATE } from "./companyProfile";

const makeInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  ...defaultInput,
  ...overrides,
});

describe("pricing", () => {
  it("preserva a tabela oficial, inclusive a correção de 125–150 kg", () => {
    expect(SHIPPING_PRICE_STARTS).toEqual([0, 19, 49, 79, 100, 120, 150, 200]);
    expect(SHIPPING_VALUES[28][5]).toBe(166.55);
    expect(SHIPPING_VALUES[28][5]).not.toBe(156.95);
    expect(SHIPPING_CHECKED_AT).toBe("26/10/2026");
  });

  it("reproduz o print no modo rápido sem tratar o envio como frete zero", () => {
    const input = makeInput({
      price: 23.99,
      weight: 1.5,
      classicRate: 11,
      shippingMode: "rapid",
    });
    const rapid = calculate(input);
    const normal = calculate({ ...input, shippingMode: "auto" });

    expect(rapid.shipping).toBe(14.75);
    expect(rapid.commission).toBe(2.64);
    expect(rapid.netPayout).toBe(6.6);
    expect(rapid.shipping).toBe(SHIPPING_RAPID_VALUES[3]);
    expect(normal.shipping).toBe(7.35);
    expect(normal.shipping).not.toBe(rapid.shipping / 2);
    expect(rapid.fixedFee).toBe(0);
  });

  it("usa 6,15% federais no default para um preço de R$100", () => {
    const input = makeInput({ price: 100, taxIcms: 0, taxDifal: 0 });
    const result = calculate(input);

    expect(input.taxFederal).toBe(FEDERAL_TAX_RATE);
    expect(result.valid).toBe(true);
    expect(result.taxes).toBe(6.15);
  });

  it("mantém o aporte federal ao combinar ICMS e DIFAL", () => {
    const federalOnly = calculate(
      makeInput({ price: 100, taxIcms: 0, taxDifal: 0 })
    );
    const combined = calculate(
      makeInput({ price: 100, taxIcms: 2, taxDifal: 1 })
    );

    expect(federalOnly.taxes).toBe(6.15);
    expect(combined.taxes).toBe(9.15);
    expect(combined.taxes - federalOnly.taxes).toBe(3);
  });

  it("faz o preço alvo reagir aos impostos sem forçar a taxa no motor", () => {
    const base = makeInput({
      cost: 20,
      operation: 0,
      packaging: 0,
      promotion: 0,
      price: 10,
      classicRate: 10,
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
    });
    const withoutFederal = solveTarget(base, 25);
    const withFederal = solveTarget(
      { ...base, taxFederal: FEDERAL_TAX_RATE },
      25
    );

    expect(calculate({ ...base, taxFederal: 0 }, 100).taxes).toBe(0);
    expect(withoutFederal.price).not.toBeNull();
    expect(withFederal.price).not.toBeNull();
    expect(withFederal.price!).toBeGreaterThan(withoutFederal.price!);
    expect(withFederal.result!.margin + 1e-9).toBeGreaterThanOrEqual(25);
  });

  it("multiplica productKg no custo por kg e eleva o preço alvo", () => {
    const oneKg = makeInput({
      costMode: "kg",
      cost: 10,
      productKg: 1,
      operation: 0,
      packaging: 0,
      promotion: 0,
      price: 100,
      classicRate: 10,
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
    });
    const threeKg = { ...oneKg, productKg: 3 };
    const oneKgResult = calculate(oneKg);
    const threeKgResult = calculate(threeKg);
    const oneKgTarget = solveTarget(oneKg, 25);
    const threeKgTarget = solveTarget(threeKg, 25);

    expect(oneKgResult.productCost).toBe(10);
    expect(threeKgResult.productCost).toBe(30);
    expect(oneKgTarget.price).not.toBeNull();
    expect(threeKgTarget.price).not.toBeNull();
    expect(threeKgTarget.price!).toBeGreaterThan(oneKgTarget.price!);
    expect(threeKgTarget.result!.margin + 1e-9).toBeGreaterThanOrEqual(25);
  });

  it("muda com a faixa de peso do envio, mas não dentro da mesma faixa", () => {
    const base = makeInput({
      cost: 10,
      operation: 0,
      packaging: 0,
      promotion: 0,
      price: 100,
      classicRate: 10,
      taxFederal: 0,
      taxIcms: 0,
      taxDifal: 0,
      weight: 0.3,
      length: 0,
      width: 0,
      height: 0,
    });
    const firstBand = calculate(base);
    const crossedBand = calculate({ ...base, weight: 0.31 });
    const sameBand = calculate({ ...base, weight: 0.4 });
    const firstTarget = solveTarget(base, 20);
    const crossedTarget = solveTarget({ ...base, weight: 0.31 }, 20);
    const sameTarget = solveTarget({ ...base, weight: 0.4 }, 20);

    expect(crossedBand.weightBand).not.toBe(firstBand.weightBand);
    expect(crossedBand.shipping).not.toBe(firstBand.shipping);
    expect(sameBand.weightBand).toBe(crossedBand.weightBand);
    expect(sameBand.shipping).toBe(crossedBand.shipping);
    expect(firstTarget.price).not.toBeNull();
    expect(crossedTarget.price).not.toBeNull();
    expect(sameTarget.price).not.toBeNull();
    expect(crossedTarget.price).not.toBe(firstTarget.price);
    expect(sameTarget.price).toBe(crossedTarget.price);
  });

  it("usa o peso volumétrico dominante para determinar o envio", () => {
    const result = calculate(
      makeInput({
        price: 100,
        weight: 0.3,
        length: 30,
        width: 20,
        height: 15,
        taxFederal: 0,
        taxIcms: 0,
        taxDifal: 0,
      })
    );

    expect(result.dimensionalWeight).toBe(1.5);
    expect(result.weightUsed).toBe(1.5);
    expect(result.shipping).toBe(17.15);
  });

  it("não muda o preço alvo com peso manual no modo de custo unitário", () => {
    const base = makeInput({
      costMode: "unit",
      cost: 20,
      productKg: 1,
      operation: 0,
      packaging: 0,
      promotion: 0,
      price: 10,
      classicRate: 10,
      taxFederal: 0,
      taxIcms: 0,
      taxDifal: 0,
      weight: 0.3,
      length: 0,
      width: 0,
      height: 0,
      shippingMode: "manual",
      manualShipping: 12.34,
      manualFixedFee: 0,
      manualFixedLimit: 0,
    });
    const changedWeight = { ...base, weight: 10, productKg: 5 };
    const baseResult = calculate(base);
    const changedResult = calculate(changedWeight);
    const baseTarget = solveTarget(base, 20);
    const changedTarget = solveTarget(changedWeight, 20);

    expect(baseResult.productCost).toBe(20);
    expect(changedResult.productCost).toBe(20);
    expect(changedResult.shipping).toBe(baseResult.shipping);
    expect(baseTarget.price).not.toBeNull();
    expect(changedTarget.price).toBe(baseTarget.price);
  });

  it("usa peso dimensional e avisa quando o peso físico está zerado", () => {
    const result = calculate(
      makeInput({ weight: 0, length: 20, width: 20, height: 20 })
    );
    expect(result.valid).toBe(true);
    expect(result.dimensionalWeight).toBeCloseTo(20 / 15, 12);
    expect(result.weightUsed).toBeCloseTo(20 / 15, 12);
    expect(result.warnings.join(" ")).toMatch(/peso físico/i);
  });

  it("não aplica a tabela nem divide o frete para perfil fora da elegibilidade", () => {
    const result = calculate(
      makeInput({
        reputation: "yellow",
        price: 50,
        shippingMode: "auto",
        manualShipping: 14.75,
        manualFixedFee: 2,
        manualFixedLimit: 79,
      })
    );
    expect(result.shipping).toBe(14.75);
    expect(result.fixedFee).toBe(2);
    expect(result.warnings.join(" ")).toMatch(
      /valor manual, fora perfil tabela oficial/i
    );
  });

  it("retorna inválido para peso automático zerado sem dimensões e preserva negativos", () => {
    const noWeight = calculate(
      makeInput({ weight: 0, length: 0, width: 0, height: 0 })
    );
    expect(noWeight.valid).toBe(false);
    expect(noWeight.error).toMatch(/peso/i);

    const negative = calculate(makeInput({ cost: -1 }));
    expect(negative.valid).toBe(false);
    expect(negative.error).toMatch(/custo/i);
    expect(parseLocalized("-1,00")).toBe(-1);
    expect(parseLocalized("23,99")).toBe(23.99);
    expect(parseLocalized("1.234,56")).toBe(1234.56);
    expect(parseLocalized("0,4627")).toBe(0.4627);
    expect(parseLocalized("")).toBe(0);
    expect(Number.isNaN(parseLocalized("23.99"))).toBe(true);
  });

  it("resolve a margem alvo em faixas descontínuas sem devolver margem menor", () => {
    const input = makeInput({
      cost: 31.2,
      operation: 0,
      packaging: 0,
      price: 10,
      classicRate: 12,
      taxFederal: 0,
      shippingMode: "auto",
      weight: 1,
    });

    for (const target of [10, 15, 20]) {
      const solved = solveTarget(input, target);
      expect(solved.error).toBeUndefined();
      expect(solved.price).not.toBeNull();
      expect(solved.result).not.toBeNull();
      expect(solved.result!.margin + 1e-9).toBeGreaterThanOrEqual(target);
      expect(
        calculate(input, solved.price!).margin + 1e-9
      ).toBeGreaterThanOrEqual(target);
    }
  });

  it("não perde a solução abaixo de R$19 quando o teto de metade termina dentro da faixa", () => {
    const input = makeInput({
      cost: 1,
      operation: 0,
      packaging: 0,
      price: 1,
      weight: 0.1,
      classicRate: 12,
      taxFederal: 0,
      shippingMode: "auto",
    });
    const solved = solveTarget(input, 45);
    let brute: number | null = null;
    for (let cents = 1; cents <= 1899; cents += 1) {
      const result = calculate(input, cents / 100);
      if (result.valid && result.margin + 1e-9 >= 45) {
        brute = cents / 100;
        break;
      }
    }
    expect(solved.error).toBeUndefined();
    expect(solved.price).toBe(brute);
    expect(solved.result!.margin + 1e-9).toBeGreaterThanOrEqual(45);
  });

  it("aplica o teto no rápido abaixo de R$19 e não inventa uma faixa sem peso", () => {
    const rapid = makeInput({
      shippingMode: "rapid",
      price: 10,
      weight: 0.3,
      length: 0,
      width: 0,
      height: 0,
      taxFederal: 0,
    });
    expect(calculate(rapid).shipping).toBe(5);
    expect(calculate({ ...rapid, weight: 0 }).valid).toBe(false);
    expect(solveTarget({ ...rapid, weight: 0 }, 10).price).toBeNull();
    const solved = solveTarget(
      { ...rapid, cost: 1, operation: 0, packaging: 0 },
      20
    );
    expect(solved.result!.margin).toBeGreaterThanOrEqual(20);
    expect(
      calculate(
        { ...rapid, cost: 1, operation: 0, packaging: 0 },
        solved.price!
      ).shipping
    ).toBeCloseTo(solved.price! / 2, 2);
  });

  it("informa erros explícitos no solver para percentuais e peso inválidos", () => {
    const excessive = solveTarget(
      makeInput({ classicRate: 90, adsMode: "percent", ads: 10 }),
      1
    );
    expect(excessive.price).toBeNull();
    expect(excessive.error).toMatch(/porcentagens/i);

    const invalidWeight = solveTarget(
      makeInput({ weight: 0, length: 0, width: 0, height: 0 }),
      10
    );
    expect(invalidWeight.price).toBeNull();
    expect(invalidWeight.error).toMatch(/peso/i);
  });
});
