import { describe, it, expect } from "vitest";
import {
  computeListingProfit,
  computeTargetPrice,
  computeTargetPrices,
  normalizeListingType,
  normalizeLogisticType,
  type ListingCalcInput,
  type ListingCalcParams,
} from "./activeListings";

const params: ListingCalcParams = { taxPercent: 0, tacosPercent: 0, affiliatePercent: 0, weightIndex: 0 };

const baseListing: ListingCalcInput = {
  price: 55.51,
  cost: 30,
  mlListingType: "classico",
  mlLogisticType: "padrao",
  commissionPercent: 12,
};

describe("normalizeListingType", () => {
  it("mapeia gold_pro para premium e o resto para classico", () => {
    expect(normalizeListingType("gold_pro")).toBe("premium");
    expect(normalizeListingType("gold_special")).toBe("classico");
    expect(normalizeListingType("gold")).toBe("classico");
    expect(normalizeListingType(undefined)).toBe("classico");
  });
});

describe("normalizeLogisticType", () => {
  it("mapeia fulfillment para full_super e o resto para padrao", () => {
    expect(normalizeLogisticType("fulfillment")).toBe("full_super");
    expect(normalizeLogisticType("cross_docking")).toBe("padrao");
    expect(normalizeLogisticType("drop_off")).toBe("padrao");
    expect(normalizeLogisticType(null)).toBe("padrao");
  });
});

describe("computeListingProfit (lucro real atual)", () => {
  it("retorna lucro/margem null quando o custo é desconhecido", () => {
    const r = computeListingProfit({ ...baseListing, cost: null }, params);
    expect(r.realProfit).toBeNull();
    expect(r.realMarginPct).toBeNull();
    // mas ainda calcula comissão/frete (informativo)
    expect(r.shippingCost).toBeGreaterThanOrEqual(0);
  });

  it("calcula o lucro real para o exemplo de referência (preço 55,51, custo 30)", () => {
    // Preço 55,51; custo 30; frete 7,75 (Até 300g, faixa 49-78.99); comissão 12%.
    // Margem de contribuição esperada ≈ 11,10 (20% do preço), igual à Mamba.
    const r = computeListingProfit(baseListing, params);
    expect(r.shippingCost).toBeCloseTo(7.75, 2);
    expect(r.realProfit).not.toBeNull();
    expect(r.realProfit!).toBeGreaterThan(10);
    expect(r.realProfit!).toBeLessThan(12);
    expect(r.realMarginPct!).toBeGreaterThan(18);
    expect(r.realMarginPct!).toBeLessThan(22);
  });

  it("lucro cai quando o custo sobe", () => {
    const low = computeListingProfit({ ...baseListing, cost: 20 }, params);
    const high = computeListingProfit({ ...baseListing, cost: 40 }, params);
    expect(low.realProfit!).toBeGreaterThan(high.realProfit!);
  });
});

describe("computeTargetPrice (preço-alvo por margem)", () => {
  it("retorna null quando o custo é desconhecido", () => {
    expect(computeTargetPrice({ ...baseListing, cost: null }, params, 20)).toBeNull();
  });

  it("reproduz o preço-alvo de referência da Mamba (margem 20% → R$ 55,51)", () => {
    const price = computeTargetPrice(baseListing, params, 20);
    expect(price).not.toBeNull();
    expect(price!).toBeCloseTo(55.51, 1);
  });

  it("preço-alvo cresce com a margem desejada", () => {
    const p20 = computeTargetPrice(baseListing, params, 20)!;
    const p30 = computeTargetPrice(baseListing, params, 30)!;
    const p40 = computeTargetPrice(baseListing, params, 40)!;
    expect(p30).toBeGreaterThan(p20);
    expect(p40).toBeGreaterThan(p30);
  });
});

describe("computeTargetPrices (múltiplas margens)", () => {
  it("calcula um preço para cada margem fornecida", () => {
    const prices = computeTargetPrices(baseListing, params, [20, 30, 40]);
    expect(Object.keys(prices)).toEqual(["20", "30", "40"]);
    expect(prices["20"]).toBeCloseTo(55.51, 1);
    expect(prices["40"]).toBeGreaterThan(prices["30"]!);
  });

  it("retorna null em todas quando não há custo", () => {
    const prices = computeTargetPrices({ ...baseListing, cost: null }, params, [20, 30]);
    expect(prices["20"]).toBeNull();
    expect(prices["30"]).toBeNull();
  });
});
