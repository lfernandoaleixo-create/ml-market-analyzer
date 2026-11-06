import type { PricingInput } from "./pricing";
import { applyCompanyTax } from "./companyProfile";

export const JEWELRY_POSTAGE_EVIDENCE = {
  origin: "Minas Gerais",
  destination: "Ponta Grossa/PR",
  postage: 21.3,
  weight: 0.263,
  length: 18,
  width: 14,
  height: 18,
  source:
    "Valor de postagem no comprovante dos Correios, confirmado pela usuária",
} as const;

/** Reprodução de custo observado, não cotação por CEP/UF nem débito Mercado Pago confirmado. */
export function createJewelryPostageCase(input: PricingInput): PricingInput {
  return applyCompanyTax({
    ...input,
    description:
      "Joias — MG → Ponta Grossa/PR; postagem da nota usada como custo manual",
    category: "Joias e Relógios > Joias e Bijuterias > Colares",
    classicRate: 14,
    premiumRate: 19,
    categoryDiscountEligible: false,
    packagingPreset: "custom",
    itemQuantity: 1,
    weight: JEWELRY_POSTAGE_EVIDENCE.weight,
    weightInputMode: "exact",
    weightExact: JEWELRY_POSTAGE_EVIDENCE.weight,
    length: JEWELRY_POSTAGE_EVIDENCE.length,
    width: JEWELRY_POSTAGE_EVIDENCE.width,
    height: JEWELRY_POSTAGE_EVIDENCE.height,
    logistic: "agency",
    condition: "new",
    reputation: "green",
    shippingMode: "manual",
    manualShipping: JEWELRY_POSTAGE_EVIDENCE.postage,
    manualFixedFee: 0,
    fullExtra: 0,
  });
}
