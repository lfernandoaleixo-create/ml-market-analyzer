import { describe, expect, it } from "vitest";
import { calculate, defaultInput } from "./pricing";
import {
  getScenarioMatrixCount,
  type ProductReportRecord,
} from "./decisionReport";
import {
  ALPHA_COMPACT_MARGINS,
  ALPHA_LOGISTICS,
  alphaComparisonRecord,
  alphaProfileInput,
  alphaScenarioOptions,
  isAlphaProfile,
} from "./alphaProfile";

describe("perfil Alpha simplificado", () => {
  it("pré-seleciona as quatro margens compactas aprovadas", () => {
    expect(ALPHA_COMPACT_MARGINS).toEqual([10, 15, 20, 25]);
    expect(
      getScenarioMatrixCount(
        defaultInput,
        alphaScenarioOptions(ALPHA_COMPACT_MARGINS)
      )
    ).toBe(128);
    expect(getScenarioMatrixCount(defaultInput, alphaScenarioOptions())).toBe(
      160
    );
  });
  it("expõe somente Agência e Verde sem mudar o cadastro original", () => {
    const original = {
      ...defaultInput,
      reputation: "red" as const,
      logistic: "full" as const,
      fullExtra: 4,
    };
    const projected = alphaProfileInput(original);
    expect(isAlphaProfile(projected)).toBe(true);
    expect(ALPHA_LOGISTICS).toEqual(["agency"]);
    expect(original.reputation).toBe("red");
    expect(original.logistic).toBe("full");
    expect(original.fullExtra).toBe(4);
  });
  it("retira somente snapshot desatualizado da cópia de comparação", () => {
    const record: ProductReportRecord = {
      id: "fixture",
      at: "2026-11-01",
      input: { ...defaultInput, logistic: "full" },
      mode: "target",
      goal: 20,
      resultPrice: 150,
      snapshot: { original: true },
    };
    const projected = alphaComparisonRecord(record);
    expect(projected.resultPrice).toBeNull();
    expect(projected.snapshot).toBeUndefined();
    expect(record.resultPrice).toBe(150);
    expect(record.snapshot).toEqual({ original: true });
    expect(record.input.logistic).toBe("full");
  });
  it("preserva as quatro publicidades e demais eixos em comparativos de perfil único", () => {
    expect(getScenarioMatrixCount(defaultInput, alphaScenarioOptions())).toBe(
      160
    );
    expect(
      getScenarioMatrixCount(
        defaultInput,
        alphaScenarioOptions([10, 15, 20, 25])
      )
    ).toBe(128);
  });
  it("usa a mesma tarifa de venda para Full e Agência em condições regulares iguais", () => {
    for (const weight of [0.3, 0.5, 1, 2, 10, 25])
      for (const price of [18, 19, 49, 78.99, 79, 199, 200])
        for (const shippingMode of ["auto", "rapid"] as const) {
          const base = {
            ...defaultInput,
            automaticShippingOnly: true,
            reputation: "green" as const,
            length: 10,
            width: 10,
            height: 10,
            weight,
            price,
            shippingMode,
            fullExtra: 0,
          };
          const agency = calculate({ ...base, logistic: "agency" });
          const full = calculate({ ...base, logistic: "full" });
          expect(agency.valid).toBe(true);
          expect(full.valid).toBe(true);
          expect(full.shipping).toBe(agency.shipping);
        }
  });
  it("não confunde custo adicional Full com o frete", () => {
    const base = {
      ...defaultInput,
      length: 10,
      width: 10,
      height: 10,
      price: 100,
      weight: 0.5,
    };
    const agency = calculate({ ...base, logistic: "agency", fullExtra: 0 });
    const full = calculate({ ...base, logistic: "full", fullExtra: 4 });
    expect(full.shipping).toBe(agency.shipping);
    expect(full.fullExtra).toBe(4);
    expect(full.totalCosts).toBeGreaterThan(agency.totalCosts);
  });
});
