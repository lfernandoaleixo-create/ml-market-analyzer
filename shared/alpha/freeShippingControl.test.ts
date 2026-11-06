import { describe, expect, it } from "vitest";
import { calculate, defaultInput, type PricingInput } from "./pricing";
import { resolvePricingFlow } from "./pricingFlow";
import {
  canApplyShippingScenario,
  evaluateFreeShippingControl,
  mandatoryFreeShippingChoiceReason,
  MANDATORY_FREE_SHIPPING_CHOICE_REASON,
  optionalShippingMode,
} from "./freeShippingControl";

const input: PricingInput = {
  ...defaultInput,
  automaticShippingOnly: true,
  cost: 100,
  weight: 0.5,
  length: 20,
  width: 30,
  height: 5,
};

const stateFor = (value: PricingInput, goal = 20) => {
  const current = resolvePricingFlow(value, "target", goal).result;
  return evaluateFreeShippingControl(value, "target", goal, current);
};

describe("frete grátis permitido pela regra e pelo preço resolvido", () => {
  it("não aplica uma escolha sem avaliação, inválida ou proibida", () => {
    expect(canApplyShippingScenario(undefined)).toBe(false);
    expect(canApplyShippingScenario({ valid: false })).toBe(false);
    expect(canApplyShippingScenario({ valid: true, blockedChoice: true })).toBe(
      false
    );
    expect(canApplyShippingScenario({ valid: true })).toBe(true);
  });
  it("mantém obrigatório ligado e impede desligar quando não existe alternativa válida abaixo de R$79", () => {
    const state = stateFor(input);
    expect(state.kind).toBe("mandatory");
    expect(state.checked).toBe(true);
    expect(state.canToggle).toBe(false);
    expect(state.without.price).toBeGreaterThanOrEqual(79);
    expect(state.withFree.price).toBe(state.without.price);
    expect(state.withFree.shipping).toBe(state.without.shipping);
    expect(state.withFree.shipping).toBeGreaterThan(0);
    expect(input.shippingMode).toBe("auto");
  });

  it.each([78.99, 79])("respeita o limite oficial no preço fixo %s", price => {
    const value = { ...input, price };
    const state = evaluateFreeShippingControl(
      value,
      "sale",
      20,
      calculate(value)
    );
    expect(state.mandatory).toBe(price >= 79);
    expect(state.canToggle).toBe(price < 79);
    expect(state.checked).toBe(price >= 79);
  });

  it("recalcula frete e preço-alvo diferentes nas duas opções permitidas", () => {
    const value = { ...input, cost: 12 };
    const state = stateFor(value);
    expect(state.canToggle).toBe(true);
    expect(state.without.valid).toBe(true);
    expect(state.withFree.valid).toBe(true);
    expect(state.withFree.price).toBeGreaterThan(state.without.price);
    expect(state.withFree.shipping).toBeGreaterThan(state.without.shipping);
    expect(state.withFree.margin).toBeGreaterThanOrEqual(20);
    for (const enabled of [true, false, true, false]) {
      const next = { ...value, shippingMode: optionalShippingMode(enabled) };
      const current = resolvePricingFlow(next, "target", 20).result;
      const evaluated = evaluateFreeShippingControl(
        next,
        "target",
        20,
        current
      );
      expect(evaluated.canToggle).toBe(true);
      expect(evaluated.checked).toBe(enabled);
      expect(current.price).toBe(
        enabled ? state.withFree.price : state.without.price
      );
      expect(current.shipping).toBe(
        enabled ? state.withFree.shipping : state.without.shipping
      );
    }
  });

  it("permite voltar quando a oferta sobe o preço a R$79 mas sem oferta existe preço válido abaixo da faixa", () => {
    const value = { ...input, cost: 32 };
    const state = stateFor(value);
    expect(state.without.price).toBeLessThan(79);
    expect(state.withFree.price).toBeGreaterThanOrEqual(79);
    const withOffer = stateFor({ ...value, shippingMode: "rapid" });
    expect(withOffer.kind).toBe("optional");
    expect(withOffer.checked).toBe(true);
    expect(withOffer.canToggle).toBe(true);
    expect(withOffer.without.price).toBe(state.without.price);
  });

  it("no modo conferência mantém o preço manual e altera o custo e o lucro", () => {
    const value = { ...input, price: 70 };
    const state = evaluateFreeShippingControl(
      value,
      "sale",
      20,
      calculate(value)
    );
    expect(state.canToggle).toBe(true);
    expect(state.without.price).toBe(70);
    expect(state.withFree.price).toBe(70);
    expect(state.withFree.shipping).toBeGreaterThan(state.without.shipping);
    expect(state.withFree.profit).toBeLessThan(state.without.profit);
  });

  it("bloqueia a escolha e mantém resultados inválidos com pacote incompleto", () => {
    const state = stateFor({ ...input, height: 0 });
    expect(state.kind).toBe("unavailable");
    expect(state.canToggle).toBe(false);
    expect(state.without.valid).toBe(false);
    expect(state.withFree.valid).toBe(false);
    expect(state.reason).toBeTruthy();
    expect(state.mandatory).toBe(false);
  });

  it.each([
    { reputation: "yellow" as const },
    { reputation: "red" as const },
    { logistic: "flex" as const },
    { logistic: "other" as const },
  ])("não cria permissão ou cotação para perfil sem tabela %j", overrides => {
    const state = stateFor({ ...input, ...overrides });
    expect(state.kind).toBe("unavailable");
    expect(state.canToggle).toBe(false);
    expect(state.mandatory).toBe(false);
  });

  it("não fabrica diferença quando as duas tarifas ficam no mesmo teto abaixo de R$19", () => {
    const value = {
      ...input,
      cost: 1,
      operation: 0,
      packaging: 0,
      ads: 0,
      taxFederal: 0,
      taxPis: 0,
      taxCofins: 0,
      taxIrpj: 0,
      taxCsll: 0,
      classicRate: 0,
      premiumRate: 0,
    };
    const state = stateFor(value);
    expect(state.canToggle).toBe(true);
    expect(state.without.price).toBeLessThan(19);
    expect(state.sameCost).toBe(true);
    expect(state.withFree.price).toBe(state.without.price);
    expect(state.reason).toMatch(/mesmo custo/);
  });

  it("identifica escolha Sem frete grátis proibida sem invalidar a precificação auto normal", () => {
    const result = resolvePricingFlow(input, "target", 20).result;
    expect(result.valid).toBe(true);
    expect(mandatoryFreeShippingChoiceReason(input, result)).toBe(
      MANDATORY_FREE_SHIPPING_CHOICE_REASON
    );
    expect(
      mandatoryFreeShippingChoiceReason(input, { valid: false, price: 100 })
    ).toBeUndefined();
  });
});
