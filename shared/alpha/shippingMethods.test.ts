import { describe, expect, it } from "vitest";
import {
  SHIPPING_METHODS,
  SHIPPING_METHOD_ORDER,
  isShippingMethod,
} from "./shippingMethods";

describe("ajuda das modalidades de envio", () => {
  it("preserva os cinco códigos usados pelo motor", () => {
    expect(SHIPPING_METHOD_ORDER).toEqual([
      "agency",
      "collection",
      "full",
      "flex",
      "other",
    ]);
  });
  it.each(SHIPPING_METHOD_ORDER)("tem explicação e resumo para %s", method => {
    expect(SHIPPING_METHODS[method].label.length).toBeGreaterThan(5);
    expect(SHIPPING_METHODS[method].quickHelp.length).toBeGreaterThan(15);
    expect(SHIPPING_METHODS[method].explanation.length).toBeGreaterThan(50);
  });
  it("usa somente Agência no título e mantém a explicação dos Correios", () => {
    expect(SHIPPING_METHODS.agency.label).toBe("Agência");
    expect(SHIPPING_METHODS.agency.shortLabel).toBe("Agência");
    expect(SHIPPING_METHODS.agency.explanation).toContain(
      "etiqueta ou o código"
    );
    expect(SHIPPING_METHODS.agency.correiosNote).toContain(
      "Mercado Livre = Agência"
    );
  });
  it("separa PAC/SEDEX contratado diretamente dos envios com etiqueta", () => {
    expect(SHIPPING_METHODS.other.explanation).toContain(
      "sem etiqueta do Mercado Livre"
    );
    expect(SHIPPING_METHODS.other.correiosNote).toContain("PAC/SEDEX");
    expect(SHIPPING_METHODS.other.correiosNote).toContain("= Outro");
  });
  it("não promete cotação automática para Flex ou envio próprio", () => {
    expect(SHIPPING_METHODS.flex.explanation).toContain(
      "não tem cotação automática"
    );
    expect(SHIPPING_METHODS.other.explanation).toContain(
      "Sem cotação automática"
    );
  });
  it("não aceita valores desconhecidos como modalidades", () => {
    expect(isShippingMethod("agency")).toBe(true);
    expect(isShippingMethod("sedex")).toBe(false);
    expect(isShippingMethod("")).toBe(false);
  });
});
