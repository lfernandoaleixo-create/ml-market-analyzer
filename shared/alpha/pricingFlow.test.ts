import { describe, expect, it } from "vitest";
import { calculate, defaultInput, money, type PricingInput } from "./pricing";
import { FEDERAL_TAX_RATE } from "./companyProfile";
import { resolvePricingFlow, type PricingFlowResult } from "./pricingFlow";

const makeInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  ...defaultInput,
  ...overrides,
});

function expectTargetSuccess(flow: PricingFlowResult, goal: number) {
  expect(flow.mode).toBe("target");
  expect(flow.target.error).toBeUndefined();
  expect(flow.target.price).not.toBeNull();
  expect(flow.target.result).not.toBeNull();
  expect(flow.result.valid).toBe(true);
  expect(flow.result.price).toBe(flow.target.price);
  expect(flow.result.margin + 1e-9).toBeGreaterThanOrEqual(goal);
}

describe("resolvePricingFlow", () => {
  it.each([0, 99.9, 99999])(
    "ignora o preço digitado (%s) ao sugerir o preço alvo",
    price => {
      const flow = resolvePricingFlow(makeInput({ price }), "target", 20);
      expectTargetSuccess(flow, 20);
    }
  );

  it("calcula percentuais, impostos, frete e descontos no candidato real", () => {
    const input = makeInput({
      price: 99.9,
      categoryDiscountEligible: true,
      promotion: 3.25,
      adsMode: "percent",
      ads: 2,
      taxIcms: 4,
      taxDifal: 1,
      reservePercent: 1.5,
      classicRate: 12,
      taxFederal: FEDERAL_TAX_RATE,
    });
    const flow = resolvePricingFlow(input, "target", 20);
    expectTargetSuccess(flow, 20);

    const candidate = calculate(input, flow.target.price!);
    expect(flow.result).toEqual(candidate);
    expect(flow.result.taxes).toBe(
      money(flow.result.price * ((FEDERAL_TAX_RATE + 4 + 1) / 100))
    );
    expect(flow.result.ads).toBe(money(flow.result.price * 0.02));
    expect(flow.result.promotion).toBe(3.25);
    expect(flow.result.margin + 1e-9).toBeGreaterThanOrEqual(20);
    expect(flow.result.commission).toBe(
      money(flow.result.price * (flow.result.rate / 100))
    );
    expect(flow.result.shipping).toBe(candidate.shipping);
  });

  it("não reaproveita o preço atual quando a margem alvo é impossível", () => {
    const input = makeInput({ price: 99.9 });
    const flow = resolvePricingFlow(input, "target", 99);

    expect(flow.target.price).toBeNull();
    expect(flow.target.result).toBeNull();
    expect(flow.target.error).toBeDefined();
    expect(flow.result.price).toBe(0);
    expect(flow.result.valid).toBe(false);
    expect(flow.result.error).toBe(flow.target.error);
    expect(flow.result.warnings).toEqual([]);
    expect(flow.result.price).not.toBe(input.price);
  });

  it.each([Number.NaN, 0, -1, 100])(
    "valida a meta de UI somente no modo target (%s)",
    goal => {
      const flow = resolvePricingFlow(
        makeInput({ price: 99.9 }),
        "target",
        goal
      );

      expect(flow.target).toEqual({
        price: null,
        result: null,
        error: "Informe uma margem maior que 0 e menor que 100%.",
      });
      expect(flow.result.valid).toBe(false);
      expect(flow.result.price).toBe(0);
      expect(flow.result.error).toBe(flow.target.error);
      expect(flow.result.warnings).toEqual([]);
    }
  );

  it.each([Number.NaN, 0, -1, 100])(
    "mantém a venda manual mesmo com meta inválida (%s)",
    goal => {
      const input = makeInput({ price: 99.9 });
      const flow = resolvePricingFlow(input, "sale", goal);

      expect(flow.mode).toBe("sale");
      expect(flow.result).toEqual(calculate(input));
      expect(flow.result.valid).toBe(true);
      expect(flow.result.price).toBe(input.price);
    }
  );

  it("preserva exatamente o erro do solver para peso e dimensões inválidos", () => {
    const flow = resolvePricingFlow(
      makeInput({ weight: 0, length: 0, width: 0, height: 0 }),
      "target",
      20
    );

    expect(flow.target.price).toBeNull();
    expect(flow.target.error).toMatch(/peso/i);
    expect(flow.result.valid).toBe(false);
    expect(flow.result.price).toBe(0);
    expect(flow.result.error).toBe(flow.target.error);
    expect(flow.result.warnings).toEqual([]);
  });

  it("ignora input.price NaN durante a resolução do alvo", () => {
    const entered = makeInput({ price: Number.NaN });
    const withNaN = resolvePricingFlow(entered, "target", 20);
    const withAnotherPrice = resolvePricingFlow(
      { ...entered, price: 1234.56 },
      "target",
      20
    );

    expectTargetSuccess(withNaN, 20);
    expect(withNaN.result.price).toBe(withAnotherPrice.result.price);
  });

  it("mantém o preço manual no modo sale e ainda expõe o target", () => {
    const input = makeInput({ price: 99.9 });
    const flow = resolvePricingFlow(input, "sale", 20);

    expect(flow.mode).toBe("sale");
    expect(flow.result).toEqual(calculate(input));
    expect(flow.result.price).toBe(input.price);
    expect(flow.target.price).not.toBeNull();
    expect(flow.target.result).not.toBeNull();
  });

  it("usa os custos, peso e modos da entrada ao resolver múltiplos alvos", () => {
    const unit = makeInput({
      costMode: "unit",
      cost: 32,
      operation: 2,
      packaging: 1.5,
      weight: 0.5,
      length: 20,
      width: 15,
      height: 10,
      price: 0,
    });
    const perKg = makeInput({
      ...unit,
      costMode: "kg",
      cost: 32,
      productKg: 2,
    });
    const heavier = { ...unit, weight: 1.5 };

    for (const goal of [10, 20, 30]) {
      const flow = resolvePricingFlow(unit, "target", goal);
      expectTargetSuccess(flow, goal);
      expect(flow.result.productCost).toBe(32);
      expect(flow.result.operation).toBe(2);
      expect(flow.result.packaging).toBe(1.5);
      expect(flow.result.weightUsed).toBeGreaterThanOrEqual(0.5);
      expect(flow.result.profit).toBe(
        money(flow.result.price - flow.result.totalCosts)
      );
      expect(flow.result.netPayout).toBe(
        money(
          flow.result.price -
            flow.result.commission -
            flow.result.shipping -
            flow.result.fixedFee
        )
      );
    }

    const perKgFlow = resolvePricingFlow(perKg, "target", 20);
    const heavierFlow = resolvePricingFlow(heavier, "target", 20);
    expectTargetSuccess(perKgFlow, 20);
    expectTargetSuccess(heavierFlow, 20);
    expect(perKgFlow.result.productCost).toBe(64);
    expect(perKgFlow.result.price).toBeGreaterThan(
      resolvePricingFlow(unit, "target", 20).result.price
    );
    expect(heavierFlow.result.weightUsed).toBe(1.5);
    expect(heavierFlow.result.shipping).not.toBe(
      resolvePricingFlow(unit, "target", 20).result.shipping
    );
  });

  it("preserva a taxa federal padrão de 6,15% no candidato", () => {
    const input = makeInput({
      taxFederal: FEDERAL_TAX_RATE,
      taxIcms: 0,
      taxDifal: 0,
    });
    const flow = resolvePricingFlow(input, "target", 20);

    expectTargetSuccess(flow, 20);
    expect(flow.result.taxes).toBe(money(flow.result.price * (6.15 / 100)));
  });
});
