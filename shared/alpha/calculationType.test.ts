import { describe, expect, it } from "vitest";
import {
  calculate,
  defaultInput,
  solveTarget,
  type PricingInput,
} from "./pricing";

describe("modalidade de custo e envio da interface simplificada", () => {
  it("identificar custo confirmado não muda nenhuma despesa nem o preço", () => {
    const estimated = {
      ...defaultInput,
      calculationType: "estimated" as const,
    };
    const real = { ...estimated, calculationType: "real" as const };
    expect(calculate(real)).toEqual(calculate(estimated));
    expect(solveTarget(real, 20)).toEqual(solveTarget(estimated, 20));
    expect(real.cost).toBe(estimated.cost);
  });

  it.each([
    { reputation: "yellow" },
    { reputation: "red" },
    { condition: "used" },
    { logistic: "flex" },
    { logistic: "other" },
    { shippingMode: "manual" },
  ] as Partial<PricingInput>[])("não usa frete manual oculto em %o", fields => {
    const input = {
      ...defaultInput,
      ...fields,
      automaticShippingOnly: true,
      manualShipping: 21.3,
    };
    const direct = calculate(input);
    const target = solveTarget(input, 20);
    expect(direct.valid).toBe(false);
    expect(direct.error).toMatch(/indisponível/i);
    expect(target.price).toBeNull();
    expect(target.error).toBe(direct.error);
  });

  it("o perfil atendido continua calculando pela tabela", () => {
    const original = calculate(defaultInput);
    const restricted = calculate({
      ...defaultInput,
      automaticShippingOnly: true,
    });
    expect(restricted).toEqual(original);
  });

  it("o motor histórico permanece capaz de conferir um comprovante sem habilitá-lo na interface", () => {
    const result = calculate({
      ...defaultInput,
      shippingMode: "manual",
      manualShipping: 21.3,
    });
    expect(result.valid).toBe(true);
    expect(result.shipping).toBe(21.3);
  });
});
