import { describe, it, expect } from "vitest";
import {
  computeListingProfit,
  computeTargetPrice,
  computeTargetPrices,
  normalizeListingType,
  normalizeLogisticType,
  applyOverrides,
  weightGramsToIndex,
  ACTIVE_LISTING_COLUMNS,
  type ListingCalcInput,
  type ListingCalcParams,
} from "./activeListings";
import { ML_WEIGHT_KG } from "./pricing";

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

describe("ACTIVE_LISTING_COLUMNS — colunas visíveis por padrão (lista do Fernando)", () => {
  it("inicia mostrando exatamente as colunas combinadas", () => {
    const defaultOn = ACTIVE_LISTING_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key);
    // Foto, Anúncio (locked), Tipo, Preço atual, Custo, Lucro real, Margem real,
    // Comissão, Frete, Vendidos, Visitas, Frete grátis, Catálogo, Link.
    expect(new Set(defaultOn)).toEqual(
      new Set([
        "thumbnail",
        "title",
        "mlListingType",
        "price",
        "cost",
        "realProfit",
        "realMarginPct",
        "commissionPercent",
        "shippingCost",
        "soldQuantity",
        "visits",
        "freeShipping",
        "catalogListing",
        "permalink",
      ]),
    );
  });

  it("mantém as demais colunas disponíveis, porém ocultas por padrão", () => {
    const offByDefault = ACTIVE_LISTING_COLUMNS.filter((c) => !c.defaultVisible).map((c) => c.key);
    for (const k of [
      "sku",
      "itemId",
      "availableQuantity",
      "conversion",
      "health",
      "mlLogisticType",
      "stockValue",
      "createdMs",
      "updatedMs",
    ]) {
      expect(offByDefault).toContain(k);
    }
  });

  it("o título permanece travado (não pode ser ocultado)", () => {
    const title = ACTIVE_LISTING_COLUMNS.find((c) => c.key === "title");
    expect(title?.locked).toBe(true);
  });
});

describe("weightGramsToIndex (peso real → faixa de peso da calculadora)", () => {
  it("retorna 0 (Até 300g) para peso desconhecido ou inválido", () => {
    expect(weightGramsToIndex(null)).toBe(0);
    expect(weightGramsToIndex(undefined)).toBe(0);
    expect(weightGramsToIndex(0)).toBe(0);
    expect(weightGramsToIndex(-100)).toBe(0);
  });

  it("escolhe a menor faixa cujo limite (kg) cobre o peso", () => {
    // ML_WEIGHT_KG = [0.3, 0.5, 1, 2, 3, 4, 5, ...]
    expect(weightGramsToIndex(250)).toBe(0); // <= 300g
    expect(weightGramsToIndex(300)).toBe(0); // exatamente 300g
    expect(weightGramsToIndex(400)).toBe(1); // <= 500g
    expect(weightGramsToIndex(1920)).toBe(3); // <= 2kg
    expect(weightGramsToIndex(4280)).toBe(6); // <= 5kg
  });

  it("pesos muito altos caem na última faixa disponível", () => {
    const lastIdx = weightGramsToIndex(999_000);
    expect(lastIdx).toBe(ML_WEIGHT_KG.length - 1);
  });
});

describe("applyOverrides (precedência lote/anúncio)", () => {
  it("sem overrides usa os valores reais do anúncio", () => {
    const e = applyOverrides(baseListing, params, {});
    expect(e.cost).toBe(30);
    expect(e.commissionPercent).toBe(12);
    expect(e.mlListingType).toBe("classico");
    expect(e.manualShipping).toBe(false);
  });

  it("override de custo e comissão vence o valor real", () => {
    const e = applyOverrides(baseListing, params, { cost: 18, commissionPercent: 14 });
    expect(e.cost).toBe(18);
    expect(e.commissionPercent).toBe(14);
  });

  it("mudar o tipo sem informar comissão aplica o default do novo tipo", () => {
    const e = applyOverrides(baseListing, params, { mlListingType: "premium" });
    expect(e.mlListingType).toBe("premium");
    expect(e.commissionPercent).toBe(17); // default premium
  });

  it("frete manual liga a flag e usa o valor informado", () => {
    const e = applyOverrides(baseListing, params, { shippingCost: 9.9, manualShipping: true });
    expect(e.manualShipping).toBe(true);
    expect(e.shippingCost).toBe(9.9);
  });

  it("override de peso vence o peso real do anúncio", () => {
    const e = applyOverrides({ ...baseListing, weightIndex: 2 }, params, { weightIndex: 6 });
    expect(e.weightIndex).toBe(6);
  });
});

describe("computeListingProfit com overrides", () => {
  it("frete manual altera o frete usado e o lucro", () => {
    const base = computeListingProfit(baseListing, params);
    const manual = computeListingProfit(baseListing, params, {
      shippingCost: 20,
      manualShipping: true,
    });
    expect(manual.shippingCost).toBeCloseTo(20, 2);
    expect(manual.realProfit!).toBeLessThan(base.realProfit!);
  });

  it("peso maior aumenta o frete e reduz o lucro", () => {
    const leve = computeListingProfit({ ...baseListing, weightIndex: 0 }, params);
    const pesado = computeListingProfit({ ...baseListing, weightIndex: 6 }, params);
    expect(pesado.shippingCost).toBeGreaterThan(leve.shippingCost);
    expect(pesado.realProfit!).toBeLessThan(leve.realProfit!);
  });

  it("campanha destaque reduz o lucro (mais comissão)", () => {
    const sem = computeListingProfit(baseListing, params);
    const com = computeListingProfit(baseListing, params, { highlightCampaign: true });
    expect(com.realProfit!).toBeLessThan(sem.realProfit!);
  });

  it("override de custo recalcula o lucro mesmo sem custo na base", () => {
    const semCusto = computeListingProfit({ ...baseListing, cost: null }, params);
    expect(semCusto.realProfit).toBeNull();
    const comOverride = computeListingProfit({ ...baseListing, cost: null }, params, { cost: 25 });
    expect(comOverride.realProfit).not.toBeNull();
  });
});

describe("computeTargetPrice com overrides", () => {
  it("comissão maior exige preço-alvo maior para a mesma margem", () => {
    const baseP = computeTargetPrice(baseListing, params, 20)!;
    const altP = computeTargetPrice(baseListing, params, 20, { commissionPercent: 20 })!;
    expect(altP).toBeGreaterThan(baseP);
  });

  it("usa o custo do override quando a base não tem custo", () => {
    const semCusto = computeTargetPrice({ ...baseListing, cost: null }, params, 20);
    expect(semCusto).toBeNull();
    const comOverride = computeTargetPrice({ ...baseListing, cost: null }, params, 20, { cost: 25 });
    expect(comOverride).not.toBeNull();
  });
});


import {
  autoFieldValues,
  listingTypeLabel,
  logisticTypeLabel,
  weightLabel,
  type ActiveListingRow,
} from "./activeListings";

describe("rótulos do valor automático do card de recalibração", () => {
  function makeRow(over: Partial<ActiveListingRow> = {}): ActiveListingRow {
    return {
      itemId: "MLB123",
      title: "Produto",
      sku: "SKU1",
      price: 100,
      currency: "BRL",
      listingType: "gold_special",
      mlListingType: "classico",
      availableQuantity: 5,
      soldQuantity: 10,
      visits: 200,
      visitsAvailable: true,
      conversion: 0.05,
      freeShipping: false,
      mlLogisticType: "padrao",
      catalogListing: false,
      stockValue: 500,
      cost: 30,
      costSource: "sku",
      commissionPercent: 14,
      fixedFee: 0,
      shippingCost: 7.75,
      realProfit: 20,
      realMarginPct: 20,
      targetPrices: {},
      packageWeightGrams: 250,
      weightIndex: 0,
      taxPercent: 5.93,
      ...over,
    };
  }

  // O Intl usa espaço não separável (U+00A0) entre "R$" e o número; normalizamos
  // para um espaço comum antes de comparar.
  const nb = (s: string) => s.replace(/\u00a0/g, " ");

  it("formata os campos automáticos em pt-BR (R$ e %)", () => {
    const a = autoFieldValues(makeRow());
    expect(nb(a.cost)).toBe("R$ 30,00");
    expect(nb(a.taxPercent)).toBe("5,93%");
    expect(nb(a.commissionPercent)).toBe("14%");
    expect(a.mlListingType).toBe("Clássico");
    expect(a.mlLogisticType).toBe("Padrão (Clássico)");
    expect(nb(a.shippingCost)).toBe("R$ 7,75");
    expect(nb(a.fixedFee)).toBe("R$ 0,00");
    // peso inclui a faixa e os gramas reais
    expect(a.weight).toContain("Até 300g");
    expect(a.weight).toContain("250 g");
  });

  it("mostra 'sem custo' quando o custo é desconhecido", () => {
    const a = autoFieldValues(makeRow({ cost: null }));
    expect(a.cost).toBe("sem custo");
  });

  it("não inclui os gramas quando o peso da embalagem não é declarado", () => {
    const a = autoFieldValues(makeRow({ packageWeightGrams: null, weightIndex: 2 }));
    expect(a.weight).toBe(weightLabel(2));
    expect(a.weight).not.toContain("g)");
  });

  it("helpers de rótulo cobrem premium e full/super e categorias especiais", () => {
    expect(listingTypeLabel("premium")).toBe("Premium");
    expect(logisticTypeLabel("full_super")).toBe("Full / Super");
    expect(logisticTypeLabel("cat_especial")).toBe("Categorias especiais");
  });
});
