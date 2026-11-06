import { describe, expect, it } from "vitest";
import {
  calculate,
  defaultInput,
  money,
  type Listing,
  type PricingInput,
} from "./pricing";
import { FEDERAL_TAX_RATE } from "./companyProfile";

// Hipótese: 2,5 kg reproduz a faixa >2 até 3 kg da tabela; o peso real não foi
// mostrado no vídeo e este valor não deve ser tratado como uma observação.
const fixtureHypothesis: PricingInput = {
  ...defaultInput,
  cost: 0,
  operation: 0,
  packaging: 0,
  classicRate: 11.5,
  premiumRate: 16.5,
  weight: 2.5,
  length: 0,
  width: 0,
  height: 0,
  price: 71.94,
};

const listings: readonly Listing[] = ["classic", "premium"];

const shippingCases = [
  { price: 71.94, auto: 9.15, rapid: 16.45 },
  { price: 50, auto: 9.15, rapid: 16.45 },
  { price: 100, auto: 19.15, rapid: 19.15 },
] as const;

describe("evidência do vídeo: envio normal, não Full e não Flex", () => {
  it.each(shippingCases)(
    "reproduz frete auto/rapid nos dois anúncios",
    ({ price, auto, rapid }) => {
      for (const listing of listings) {
        const normal = calculate(
          { ...fixtureHypothesis, price, shippingMode: "auto" },
          price,
          listing
        );
        const optionalRapid = calculate(
          { ...fixtureHypothesis, price, shippingMode: "rapid" },
          price,
          listing
        );

        expect(normal.valid).toBe(true);
        expect(optionalRapid.valid).toBe(true);
        expect(normal.shipping).toBe(auto);
        expect(optionalRapid.shipping).toBe(rapid);
        expect(normal.weightBand).toBe("2–3 kg");
        expect(optionalRapid.weightBand).toBe("2–3 kg");
      }
    }
  );

  it.each([
    { listing: "classic" as const, price: 71.94, commission: 8.27 },
    { listing: "classic" as const, price: 50, commission: 5.75 },
    { listing: "classic" as const, price: 100, commission: 11.5 },
    { listing: "premium" as const, price: 71.94, commission: 11.87 },
    { listing: "premium" as const, price: 50, commission: 8.25 },
    { listing: "premium" as const, price: 100, commission: 16.5 },
  ])(
    "aplica as comissões parametrizadas sem desconto adicional de 50%",
    ({ listing, price, commission }) => {
      const result = calculate(
        { ...fixtureHypothesis, price, shippingMode: "auto" },
        price,
        listing
      );

      expect(result.valid).toBe(true);
      expect(result.commission).toBe(commission);
      expect(result.promotion).toBe(0);
      expect(result.commission).not.toBe(money(commission / 2));
    }
  );

  it.each(shippingCases)(
    "calcula netPayout somente com preço, comissão e frete",
    ({ price, auto, rapid }) => {
      for (const listing of listings) {
        for (const [shippingMode, expectedShipping] of [
          ["auto", auto],
          ["rapid", rapid],
        ] as const) {
          const result = calculate(
            { ...fixtureHypothesis, price, shippingMode },
            price,
            listing
          );
          const expectedNetPayout = money(
            price - result.commission - result.shipping
          );
          const expectedProfit = money(
            expectedNetPayout - result.taxes
          );

          expect(result.shipping).toBe(expectedShipping);
          expect(result.fixedFee).toBe(0);
          expect(result.fullExtra).toBe(0);
          expect(result.netPayout).toBe(expectedNetPayout);
          expect(fixtureHypothesis.taxFederal).toBe(6.15);
          expect(fixtureHypothesis.taxFederal).toBe(FEDERAL_TAX_RATE);
          expect(result.taxes).toBe(money(price * (FEDERAL_TAX_RATE / 100)));
          expect(result.profit).toBe(expectedProfit);
          expect(result.profit).toBeLessThan(result.netPayout);
        }
      }
    }
  );
});
