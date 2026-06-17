import { describe, it, expect } from "vitest";
import {
  calculatePricing,
  defaultCommission,
  ML_DEFAULT_COMMISSION,
  type PricingInput,
} from "./pricing";

/** Base de entrada zerada para compor casos. */
function baseInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    mode: "custo_para_preco",
    marketplace: "mercado_livre",
    mlListingType: "classico",
    desiredMargin: 20,
    productCost: 30,
    taxPercent: 0,
    tacosPercent: 0,
    affiliatePercent: 0,
    otherCostKind: "reais",
    otherCostValue: 0,
    commissionPercent: 12,
    fixedFee: 0,
    shippingCost: 7.75,
    ...overrides,
  };
}

describe("calculatePricing — modo custo → preço (exemplo confirmado da Mamba)", () => {
  it("custo 30, margem 20%, ML Clássico (12%), frete 7,75 → preço 55,51", () => {
    const r = calculatePricing(baseInput());
    expect(r.valid).toBe(true);
    expect(r.price).toBeCloseTo(55.51, 1);
    expect(r.fixedTotal).toBeCloseTo(37.75, 2);
    expect(r.variableCostPct).toBe(12); // só comissão (margem entra à parte)
    expect(r.contributionMargin).toBeCloseTo(11.1, 1);
    expect(r.breakEven).toBeCloseTo(44.41, 1);
  });

  it("ML Premium (17%) → preço sobe para ~59,92", () => {
    const r = calculatePricing(baseInput({ mlListingType: "premium", commissionPercent: 17 }));
    expect(r.price).toBeCloseTo(59.92, 1);
  });

  it("inclui impostos, tacos e afiliados na parcela variável", () => {
    const r = calculatePricing(
      baseInput({ taxPercent: 4, tacosPercent: 3, affiliatePercent: 1 }),
    );
    // variável (sem margem) = 12 + 4 + 3 + 1 = 20
    expect(r.variableCostPct).toBe(20);
    // denom = 1 - (20 + 20)/100 = 0.6 → 37.75 / 0.6
    expect(r.price).toBeCloseTo(62.92, 1);
  });

  it("outros custos em reais entram nos fixos", () => {
    const r = calculatePricing(baseInput({ otherCostKind: "reais", otherCostValue: 2.25 }));
    expect(r.fixedTotal).toBeCloseTo(40, 2); // 30 + 7.75 + 2.25
    expect(r.price).toBeCloseTo(58.82, 1); // 40 / 0.68
  });

  it("outros custos em % entram nos variáveis", () => {
    const r = calculatePricing(baseInput({ otherCostKind: "percent", otherCostValue: 5 }));
    expect(r.variableCostPct).toBe(17); // 12 + 5
  });

  it("retorna inválido quando margem + variáveis >= 100%", () => {
    const r = calculatePricing(baseInput({ desiredMargin: 90, commissionPercent: 12 }));
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("aplica desconto promocional sobre o preço base", () => {
    const r = calculatePricing(baseInput({ promoPercent: 10 }));
    expect(r.promoPrice).toBeCloseTo(r.price * 0.9, 2);
  });

  it("distribuição da receita soma ~100%", () => {
    const r = calculatePricing(baseInput());
    const total = r.revenueShare.reduce((s, x) => s + x.percent, 0);
    expect(total).toBeGreaterThan(98);
    expect(total).toBeLessThan(102);
  });
});

describe("calculatePricing — modo preço → margem", () => {
  it("deduz a margem real a partir do preço informado", () => {
    // No exemplo da Mamba, preço 55,51 deve devolver ~20% de margem.
    const r = calculatePricing(
      baseInput({ mode: "preco_para_margem", sellingPrice: 55.51 }),
    );
    expect(r.valid).toBe(true);
    expect(r.contributionMarginPct).toBeCloseTo(20, 0);
    expect(r.contributionMargin).toBeCloseTo(11.1, 1);
  });

  it("margem negativa quando o preço não cobre os custos", () => {
    const r = calculatePricing(
      baseInput({ mode: "preco_para_margem", sellingPrice: 35 }),
    );
    expect(r.contributionMargin).toBeLessThan(0);
  });

  it("inválido quando preço <= 0", () => {
    const r = calculatePricing(baseInput({ mode: "preco_para_margem", sellingPrice: 0 }));
    expect(r.valid).toBe(false);
  });
});

describe("defaultCommission", () => {
  it("ML clássico = 12, premium = 17", () => {
    expect(defaultCommission("mercado_livre", "classico")).toBe(ML_DEFAULT_COMMISSION.classico);
    expect(defaultCommission("mercado_livre", "premium")).toBe(ML_DEFAULT_COMMISSION.premium);
  });
  it("shopee tem comissão padrão própria", () => {
    expect(defaultCommission("shopee", "classico")).toBeGreaterThan(0);
  });
  it("outro marketplace começa em 0", () => {
    expect(defaultCommission("outro", "classico")).toBe(0);
  });
});
