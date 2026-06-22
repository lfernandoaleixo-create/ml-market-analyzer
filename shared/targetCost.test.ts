import { describe, it, expect } from "vitest";
import {
  calculateTargetCost,
  calculatePricing,
  defaultCommission,
  type PricingInput,
} from "./pricing";

/** Entrada base no Mercado Livre, Clássico, frete auto. */
function baseInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    mode: "custo_para_preco",
    marketplace: "mercado_livre",
    mlListingType: "classico",
    desiredMargin: 0, // ignorado no custo-alvo
    productCost: 0, // ignorado no custo-alvo
    taxPercent: 0,
    tacosPercent: 0,
    affiliatePercent: 0,
    otherCostKind: "reais",
    otherCostValue: 0,
    commissionPercent: defaultCommission("mercado_livre", "classico"),
    fixedFee: 0,
    shippingCost: 0,
    autoFees: true,
    mlLogisticType: "padrao",
    weightIndex: 0,
    reputation: "verde",
    ...overrides,
  };
}

describe("calculateTargetCost", () => {
  it("desconta comissão + impostos + frete + margem do preço (BRL)", () => {
    const input = baseInput({ commissionPercent: 12, taxPercent: 10 });
    const r = calculateTargetCost(input, 100, [20], 5);
    expect(r.valid).toBe(true);
    // varPct = 12 + 10 = 22% => R$ 22; margem 20% => R$ 20; frete auto p/ preço 100.
    const m = r.perMargin[0];
    const expectedFixed = r.shippingUsed + r.fixedFeeUsed;
    expect(m.productCostBRL).toBeCloseTo(100 - 22 - 20 - expectedFixed, 2);
    expect(m.marginPct).toBe(20);
    expect(m.feasible).toBe(true);
  });

  it("converte o custo-alvo para USD pela cotação", () => {
    const input = baseInput({ commissionPercent: 12, taxPercent: 10 });
    const r = calculateTargetCost(input, 100, [20], 5);
    const m = r.perMargin[0];
    expect(m.productCostUSD).toBeCloseTo(m.productCostBRL / 5, 2);
  });

  it("calcula várias margens de uma vez e mantém ordem", () => {
    const input = baseInput({ commissionPercent: 12, taxPercent: 10 });
    const r = calculateTargetCost(input, 100, [15, 20, 30], 5.4);
    expect(r.perMargin.map((p) => p.marginPct)).toEqual([15, 20, 30]);
    // Quanto maior a margem, menor o custo que posso pagar.
    expect(r.perMargin[0].productCostBRL).toBeGreaterThan(r.perMargin[1].productCostBRL);
    expect(r.perMargin[1].productCostBRL).toBeGreaterThan(r.perMargin[2].productCostBRL);
  });

  it("marca inviável quando a margem não cabe no preço", () => {
    const input = baseInput({ commissionPercent: 17, taxPercent: 30 });
    const r = calculateTargetCost(input, 50, [60], 5.4);
    const m = r.perMargin[0];
    expect(m.productCostBRL).toBeLessThan(0);
    expect(m.feasible).toBe(false);
  });

  it("erro quando preço <= 0", () => {
    const r = calculateTargetCost(baseInput(), 0, [20], 5.4);
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("erro quando cotação inválida", () => {
    const r = calculateTargetCost(baseInput(), 100, [20], 0);
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("é coerente com a calculadora: usar o custo-alvo como custo recompõe o preço (frete manual fixo)", () => {
    // Com frete manual (sem faixa escalonada por preço), o inverso deve ser exato:
    // alimentar a calculadora custo→preço com o custo-alvo recompõe o preço e a margem.
    const input = baseInput({
      commissionPercent: 12,
      taxPercent: 10,
      autoFees: false,
      manualShipping: true,
      shippingCost: 8,
    });
    const target = calculateTargetCost(input, 100, [20], 5.4);
    const cost = target.perMargin[0].productCostBRL;

    const forward = calculatePricing({
      ...input,
      mode: "custo_para_preco",
      productCost: cost,
      desiredMargin: 20,
    });
    expect(forward.valid).toBe(true);
    expect(forward.price).toBeCloseTo(100, 1);
    expect(forward.contributionMarginPct).toBeCloseTo(20, 1);
  });
});

describe("calculateTargetCost — regime TTS (filial → matriz)", () => {
  it("COM TTS (14%) deixa pagar MAIS à matriz do que SEM TTS (24%) no mesmo preço/margem", () => {
    const comTts = baseInput({ commissionPercent: 12, taxPercent: 14, tacosPercent: 3, affiliatePercent: 0 });
    const semTts = baseInput({ commissionPercent: 12, taxPercent: 24, tacosPercent: 3, affiliatePercent: 0 });
    const rCom = calculateTargetCost(comTts, 100, [20], 1);
    const rSem = calculateTargetCost(semTts, 100, [20], 1);
    expect(rCom.valid).toBe(true);
    expect(rSem.valid).toBe(true);
    // 10 p.p. a mais de imposto sobre R$100 = R$10 a menos para pagar à matriz.
    expect(rCom.perMargin[0].productCostBRL - rSem.perMargin[0].productCostBRL).toBeCloseTo(10, 2);
  });

  it("calcula em R$ com cotação neutra (1) e mantém uma coluna por margem", () => {
    const input = baseInput({ commissionPercent: 12, taxPercent: 14, tacosPercent: 3, affiliatePercent: 0 });
    const r = calculateTargetCost(input, 120, [20, 30, 40], 1);
    expect(r.perMargin.map((p) => p.marginPct)).toEqual([20, 30, 40]);
    // Em R$, productCostUSD == productCostBRL quando a cotação é 1.
    for (const p of r.perMargin) {
      expect(p.productCostUSD).toBeCloseTo(p.productCostBRL, 2);
    }
    // Margem maior ⇒ menos a pagar para a matriz.
    expect(r.perMargin[0].productCostBRL).toBeGreaterThan(r.perMargin[2].productCostBRL);
  });
});
