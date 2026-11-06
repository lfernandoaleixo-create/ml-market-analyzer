import { describe, expect, it } from "vitest";
import { defaultInput } from "./pricing";
import { getStateTaxSettings } from "./stateTaxSettings";
import { normalizeInterfaceInput } from "./interfaceInput";

describe("perfil estadual ao limpar ou carregar exemplos", () => {
  it("preserva alíquotas e unidade de DIFAL já editadas", () => {
    const input = {
      ...defaultInput,
      useDestinationTaxes: true,
      saleDestination: "outside" as const,
      taxIcmsInside: 4,
      taxIcmsOutside: 2.1,
      taxIcmsTransfer: 0.8,
      taxDifal: 12,
      difalMode: "rs" as const,
      taxDifalValue: 9,
    };
    const reset = normalizeInterfaceInput({
      ...defaultInput,
      ...getStateTaxSettings(input),
      cost: 0,
    });
    expect(getStateTaxSettings(reset)).toEqual(getStateTaxSettings(input));
    expect(reset.cost).toBe(0);
    expect(reset.useDestinationTaxes).toBe(true);
  });
  it("não modifica o objeto original", () => {
    const input = { ...defaultInput };
    const before = { ...input };
    getStateTaxSettings(input);
    expect(input).toEqual(before);
  });
});
