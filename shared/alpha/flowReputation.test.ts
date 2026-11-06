import { describe, expect, it } from "vitest";
import { defaultInput, solveTarget } from "./pricing";
import { buildScenarioInput } from "./decisionReport";
import { flowCompactLayout } from "./flowGeometry";
import {
  FLOW_REPUTATION_OPTIONS,
  flowReputationCacheKey,
  flowReputationLabel,
  flowReputationReason,
  flowReputationVisibleValues,
  isFlowReputation,
} from "./flowReputation";

const input = {
  ...defaultInput,
  reputation: "green" as const,
  automaticShippingOnly: true,
  weight: 0.5,
  length: 20,
  width: 30,
  height: 5,
};

describe("reputação variável no explorador", () => {
  it("usa somente os quatro grupos reconhecidos pelo motor", () => {
    expect(FLOW_REPUTATION_OPTIONS.map(option => option.value)).toEqual([
      "green",
      "new",
      "yellow",
      "red",
    ]);
    expect(flowReputationLabel("new")).toBe("Sem reputação");
    expect(flowReputationLabel("red")).toBe("Laranja / vermelha");
    expect(isFlowReputation("red")).toBe(true);
    expect(isFlowReputation("blue")).toBe(false);
  });
  it("solicita uma escolha quando a reputação está ausente", () => {
    expect(flowReputationReason(null)).toContain("Escolha uma reputação");
  });
  it("permite os perfis suportados e mantém as outras cores sem cotação", () => {
    expect(flowReputationReason("green")).toBeUndefined();
    expect(flowReputationReason("new")).toBeUndefined();
    expect(flowReputationReason("yellow")).toContain("Amarela");
    expect(flowReputationReason("red")).toContain("Laranja / vermelha");
    expect(flowReputationReason("red")).toContain("sem preço e frete");
  });
  it("não reutiliza preço verde como se fosse de outro perfil", () => {
    const keys = FLOW_REPUTATION_OPTIONS.map(option =>
      flowReputationCacheKey("same-product", "same-path|20", option.value)
    );
    expect(new Set(keys).size).toBe(FLOW_REPUTATION_OPTIONS.length);
    expect(
      flowReputationCacheKey("same-product", "same-path|20", null)
    ).not.toBe(keys[0]);
    expect(
      flowReputationCacheKey("same-product", "same-path|25", "green")
    ).not.toBe(keys[0]);
  });
  it.each(FLOW_REPUTATION_OPTIONS)(
    "aplica $value ao cenário sem alterar o produto original",
    option => {
      const scenario = buildScenarioInput(input, {
        adsAmount: 2,
        destination: "inside",
        listing: "classic",
        logistic: "agency",
        reputation: option.value,
        shippingMode: "auto",
      });
      expect(scenario.reputation).toBe(option.value);
      expect(input.reputation).toBe("green");
      const target = solveTarget(scenario, 20, "classic");
      if (option.value === "green" || option.value === "new") {
        expect(target.result?.valid).toBe(true);
        expect(target.price).not.toBeNull();
      } else {
        expect(target.price).toBeNull();
        expect(target.result).toBeNull();
      }
    }
  );
  it("reserva altura para as quatro reputações na coluna original", () => {
    const closed = flowCompactLayout(
      [[164], [146], [146], [146], [146], [146]],
      5,
      226,
      192,
      248,
      24,
      28
    );
    const opened = flowCompactLayout(
      [[164, 164, 164, 164], [146], [146], [146], [146], [146]],
      5,
      226,
      192,
      248,
      24,
      28
    );
    expect(opened.width).toBe(closed.width);
    expect(opened.height).toBeGreaterThan(closed.height);
    expect(opened.marginY - 86).toBeGreaterThan(82 + 4 * 164 + 3 * 24);
    expect(opened.height).toBeGreaterThan(opened.marginY + 192);
  });
});

describe("exibição imediata do perfil atual", () => {
  it("oculta os resultados verdes imediatamente ao selecionar outro perfil", () => {
    const green = flowReputationCacheKey("produto", "caminho", "green");
    const red = flowReputationCacheKey("produto", "caminho", "red");
    const values = { "10": { price: 100 } };
    const stored = { scope: green, values };
    expect(flowReputationVisibleValues(stored, red)).toEqual({});
    expect(flowReputationVisibleValues(stored, green)).toBe(values);
    expect(
      flowReputationVisibleValues(
        stored,
        flowReputationCacheKey("produto", "caminho", "new")
      )
    ).toEqual({});
  });
});
