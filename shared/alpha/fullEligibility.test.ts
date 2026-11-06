import { describe, expect, it } from "vitest";
import { calculate, defaultInput, solveTarget } from "./pricing";

const base = {
  ...defaultInput,
  automaticShippingOnly: true,
  logistic: "full" as const,
};
describe("medidas obrigatórias e elegibilidade Full", () => {
  it("bloqueia dimensões não informadas no fluxo automático atual", () => {
    const input = {
      ...base,
      logistic: "agency" as const,
      length: 0,
      width: 0,
      height: 0,
    };
    expect(calculate(input).valid).toBe(false);
    expect(solveTarget(input, 20).error).toMatch(
      /comprimento.*largura.*altura/
    );
    expect(calculate({ ...input, automaticShippingOnly: false }).valid).toBe(
      true
    );
  });
  it.each([
    [{ weight: 26 }, /25 kg/],
    [{ length: 121 }, /120 cm/],
    [{ length: 100, width: 100, height: 61 }, /260 cm/],
    [{ weight: 0 }, /peso físico/],
  ] as const)(
    "rejeita limitação Full sem devolver cotação zero (%j)",
    (change, error) => {
      const input = { ...base, ...change };
      expect(calculate(input).valid).toBe(false);
      expect(solveTarget(input, 20).price).toBeNull();
      expect(solveTarget(input, 20).error).toMatch(error);
    }
  );
  it("aceita cubagem acima de25 quando o peso físico e as medidas são elegíveis", () => {
    const result = calculate({
      ...base,
      weight: 10,
      length: 80,
      width: 80,
      height: 80,
    });
    expect(result.valid).toBe(true);
    expect(result.weightUsed).toBeGreaterThan(25);
    expect(result.shipping).toBeGreaterThan(0);
  });
});
