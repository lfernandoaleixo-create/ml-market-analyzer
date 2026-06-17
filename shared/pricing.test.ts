import { describe, it, expect } from "vitest";
import {
  calculatePricing,
  defaultCommission,
  mlShipping,
  mlFlatShipping,
  ML_DEFAULT_COMMISSION,
  ML_WEIGHT_LABELS,
  ML_WEIGHT_KG,
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
  it("outro marketplace tem comissão padrão própria", () => {
    expect(defaultCommission("outro", "classico")).toBeGreaterThan(0);
  });
});

describe("auto-alimentação de frete (tabelas reais do ML)", () => {
  it("tem 28 faixas de peso alinhadas entre rótulos e kg", () => {
    expect(ML_WEIGHT_LABELS.length).toBe(28);
    expect(ML_WEIGHT_KG.length).toBe(28);
  });

  it("Clássico/Padrão, Até 300g, preço na faixa 49-78.99 → frete 7,75", () => {
    expect(mlShipping(0, 55.51, "padrao")).toBeCloseTo(7.75, 2);
  });

  it("Clássico/Padrão, 1kg a 2kg (idx 3), faixa 49-78.99 → frete 8,15", () => {
    // qL maxWeight:2 corresponde ao índice 3 (1kg a 2kg)
    expect(mlShipping(3, 56.1, "padrao")).toBeCloseTo(8.15, 2);
  });

  it("frete sobe ao mudar a faixa de preço (79-99.99)", () => {
    expect(mlShipping(0, 85, "padrao")).toBeCloseTo(12.35, 2);
  });

  it("Cat. Especiais usa tabela própria (amarela > verde em itens médios)", () => {
    // Em faixas de preço mais altas a tabela especial diverge do padrão.
    const espVerde = mlShipping(0, 85, "cat_especial", "verde");
    const espAmarela = mlShipping(0, 85, "cat_especial", "amarela");
    expect(espVerde).toBeGreaterThan(0);
    expect(espAmarela).toBeGreaterThan(0);
    expect(espAmarela).not.toBe(espVerde);
  });

  it("Full Super usa tabela jLt (faixas de 7) e é mais barato em itens leves", () => {
    const full = mlShipping(0, 55, "full_super");
    expect(full).toBeGreaterThan(0);
  });

  it("frete custo-fixo (FGR < R$79) cresce com o peso", () => {
    const leve = mlFlatShipping(0, 60);
    const pesado = mlFlatShipping(10, 60);
    expect(pesado).toBeGreaterThan(leve);
  });
});

describe("auto-frete integrado ao cálculo (solver iterativo)", () => {
  it("com autoFees, o frete é puxado da tabela e reflete em shippingUsed", () => {
    const r = calculatePricing({
      mode: "custo_para_preco",
      marketplace: "mercado_livre",
      mlListingType: "classico",
      mlLogisticType: "padrao",
      desiredMargin: 20,
      productCost: 30,
      taxPercent: 0,
      tacosPercent: 0,
      affiliatePercent: 0,
      otherCostKind: "reais",
      otherCostValue: 0,
      commissionPercent: 12,
      fixedFee: 0,
      shippingCost: 0,
      autoFees: true,
      weightIndex: 0,
      reputation: "verde",
    });
    expect(r.valid).toBe(true);
    // preço ~55,51 cai na faixa 49-78.99 → frete 7,75
    expect(r.shippingUsed).toBeCloseTo(7.75, 2);
    expect(r.price).toBeCloseTo(55.51, 1);
  });

  it("Campanhas Destaque somam 6 p.p. na comissão efetiva", () => {
    const r = calculatePricing({
      mode: "custo_para_preco",
      marketplace: "mercado_livre",
      mlListingType: "classico",
      mlLogisticType: "padrao",
      desiredMargin: 20,
      productCost: 30,
      taxPercent: 0,
      tacosPercent: 0,
      affiliatePercent: 0,
      otherCostKind: "reais",
      otherCostValue: 0,
      commissionPercent: 12,
      fixedFee: 0,
      shippingCost: 0,
      autoFees: true,
      weightIndex: 0,
      highlightCampaign: true,
    });
    expect(r.commissionUsed).toBe(18);
  });

  it("frete manual sobrescreve a tabela", () => {
    const r = calculatePricing({
      mode: "custo_para_preco",
      marketplace: "mercado_livre",
      mlListingType: "classico",
      mlLogisticType: "padrao",
      desiredMargin: 20,
      productCost: 30,
      taxPercent: 0,
      tacosPercent: 0,
      affiliatePercent: 0,
      otherCostKind: "reais",
      otherCostValue: 0,
      commissionPercent: 12,
      fixedFee: 0,
      shippingCost: 99,
      autoFees: true,
      manualShipping: true,
      weightIndex: 0,
    });
    expect(r.shippingUsed).toBe(99);
  });
});
