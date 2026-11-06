import { describe, expect, it } from "vitest";
import {
  calculate,
  defaultInput,
  type Listing,
  type PricingInput,
} from "./pricing";
import { FEDERAL_TAX_RATE } from "./companyProfile";

/**
 * Evidência 4413 fornecida pelo usuário: pacote de 18 × 14 × 18 cm e peso
 * lido no recibo de 0,263 kg. O peso isolado da joia (3 g) não é peso de
 * envio e, portanto, não entra no campo `weight`.
 */
const jewelryInput: PricingInput = {
  ...defaultInput,
  description: "Joia — pacote medido no recibo",
  category: "",
  cost: 0,
  operation: 0,
  packaging: 0,
  taxFederal: 6.15,
  taxIcms: 0,
  taxDifal: 0,
  listing: "classic",
  classicRate: 14,
  premiumRate: 19,
  price: 98.94,
  weight: 0.263,
  length: 18,
  width: 14,
  height: 18,
  reputation: "green",
  condition: "new",
  logistic: "agency",
  shippingMode: "auto",
  manualShipping: 12.95,
  manualFixedFee: 0,
  manualFixedLimit: 0,
};

/**
 * Hipótese separada para reproduzir a faixa de frete inferida do anúncio:
 * peso físico de 0,263 kg e dimensões zeradas. Não é o pacote real fornecido
 * na evidência 4413; não deve ser usado para apagar as dimensões reais.
 */
const inferredBandFixture: PricingInput = {
  ...jewelryInput,
  description: "Hipótese de faixa do anúncio — não é o pacote real",
  weight: 0.263,
  length: 0,
  width: 0,
  height: 0,
};

const listings: readonly Listing[] = ["classic", "premium"];

describe("evidência da joia e limites da estimativa de envio", () => {
  it("usa o maior entre peso físico e peso volumétrico do pacote real", () => {
    const result = calculate(jewelryInput, 98.94, "classic");

    expect(result.valid).toBe(true);
    expect(jewelryInput.taxFederal).toBe(6.15);
    expect(jewelryInput.taxFederal).toBe(FEDERAL_TAX_RATE);
    expect(result.dimensionalWeight).toBeCloseTo(
      (18 * 14 * 18) / 6000,
      12
    );
    expect(result.dimensionalWeight).toBeCloseTo(0.756, 12);
    expect(result.weightUsed).toBeCloseTo(
      Math.max(0.263, result.dimensionalWeight),
      12
    );
    expect(result.weightUsed).toBeCloseTo(0.756, 12);
    expect(result.weightBand).toBe("0,5–1 kg");
    expect(result.shipping).toBe(14.45);

    // R$12,95 é o valor observado no vídeo, não uma razão para alterar o
    // modelo: a diferença de R$1,50 deve permanecer explícita e não negativa.
    const videoObservedShipping = 12.95;
    expect(result.shipping - videoObservedShipping).toBe(1.5);
    expect(result.shipping - videoObservedShipping).toBeGreaterThanOrEqual(0);
  });

  it.each([
    { listing: "classic" as const, commission: 13.85 },
    { listing: "premium" as const, commission: 18.8 },
  ])(
    "aplica comissão parametrizada de $listing em preço fixo de 98,94 sem desconto inventado",
    ({ listing, commission }) => {
      const result = calculate(jewelryInput, 98.94, listing);

      expect(result.valid).toBe(true);
      expect(result.commission).toBe(commission);
      expect(result.rate).toBe(listing === "classic" ? 14 : 19);
    }
  );

  it("mantém tributos fora do netPayout e calcula 6,15% como R$6,08", () => {
    const taxed = calculate(jewelryInput, 98.94, "classic");
    const withoutFederalTax = calculate(
      { ...jewelryInput, taxFederal: 0 },
      98.94,
      "classic"
    );

    expect(taxed.taxes).toBe(6.08);
    expect(withoutFederalTax.taxes).toBe(0);
    expect(taxed.netPayout).toBe(70.64);
    expect(withoutFederalTax.netPayout).toBe(taxed.netPayout);
    expect(taxed.profit).toBeLessThan(withoutFederalTax.profit);
  });

  it.each([
    { listing: "classic" as const, netPayout: 72.14 },
    { listing: "premium" as const, netPayout: 67.19 },
  ])(
    "aceita override manual pontual no preço observado para $listing",
    ({ listing, netPayout }) => {
      const result = calculate(
        { ...jewelryInput, shippingMode: "manual", manualShipping: 12.95 },
        98.94,
        listing
      );

      expect(result.valid).toBe(true);
      expect(result.shipping).toBe(12.95);
      expect(result.dimensionalWeight).toBeCloseTo(0.756, 12);
      expect(result.weightUsed).toBeCloseTo(0.756, 12);
      expect(result.warnings.join(" ")).toMatch(
        /frete: valor manual, fora perfil tabela oficial/i
      );
      expect(result.netPayout).toBe(netPayout);
    }
  );

  it.each([
    { price: 25, shipping: 6.85 },
    { price: 50, shipping: 8.15 },
    { price: 78, shipping: 8.15 },
    { price: 98.94, shipping: 12.95 },
    { price: 150, shipping: 19.05 },
  ])(
    "reproduz o frete auto da hipótese inferida até 0,3 kg em cada faixa de preço",
    ({ price, shipping }) => {
      const result = calculate(
        { ...inferredBandFixture, shippingMode: "auto" },
        price,
        "classic"
      );

      expect(result.valid).toBe(true);
      expect(result.dimensionalWeight).toBe(0);
      expect(result.weightUsed).toBe(0.263);
      expect(result.weightBand).toBe("até 0,3 kg");
      expect(result.shipping).toBe(shipping);
    }
  );

  it("reproduz R$12,95 de frete rápido na hipótese inferida a R$50", () => {
    const result = calculate(
      { ...inferredBandFixture, shippingMode: "rapid" },
      50,
      "classic"
    );

    expect(result.valid).toBe(true);
    expect(result.weightBand).toBe("até 0,3 kg");
    expect(result.shipping).toBe(12.95);
  });

  it("usa comissão observada de 12% somente no preço de R$150", () => {
    const result = calculate(
      {
        ...inferredBandFixture,
        classicRate: 12,
        shippingMode: "auto",
      },
      150,
      "classic"
    );

    expect(result.valid).toBe(true);
    expect(result.rate).toBe(12);
    expect(result.commission).toBe(18);
    // Override pontual da observação; não inferir um limiar ou generalizar
    // essa taxa para outros preços.
  });

  it("trata R$21,30 como cenário condicional, sem afirmar preço de venda observado", () => {
    const auto = calculate(
      { ...jewelryInput, shippingMode: "auto" },
      21.3,
      "classic"
    );
    const rapid = calculate(
      { ...jewelryInput, shippingMode: "rapid" },
      21.3,
      "classic"
    );

    expect(auto.valid).toBe(true);
    expect(rapid.valid).toBe(true);
    expect(auto.price).toBe(21.3);
    expect(rapid.price).toBe(21.3);
    expect(auto.shipping).toBe(7.15);
    expect(rapid.shipping).toBe(14.45);
  });

  it("mantém netPayout não negativo no cenário manual observado", () => {
    for (const listing of listings) {
      const result = calculate(
        { ...jewelryInput, shippingMode: "manual" },
        98.94,
        listing
      );

      expect(result.netPayout).toBeGreaterThanOrEqual(0);
    }
  });
});
