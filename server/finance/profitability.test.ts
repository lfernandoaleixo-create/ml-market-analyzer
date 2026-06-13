import { describe, it, expect } from "vitest";
import { defaultTaxConfig } from "../../shared/finance";
import { buildProfitability, resolveUnitCost, type CostLookup } from "./profitability";
import { type BlOrder, type BlProductCost } from "../baselinker/provider";

function costs(entries: Array<Partial<BlProductCost> & { productId: string; averageCost: number }>): CostLookup {
  const byId = new Map<string, BlProductCost>();
  const bySku = new Map<string, BlProductCost>();
  for (const e of entries) {
    const c: BlProductCost = {
      productId: e.productId,
      sku: e.sku ?? "",
      ean: "",
      name: e.name ?? e.productId,
      averageCost: e.averageCost,
      taxRate: 0,
    };
    byId.set(c.productId, c);
    if (c.sku) bySku.set(c.sku.toLowerCase(), c);
  }
  return { byId, bySku };
}

function order(partial: Partial<BlOrder> & { lines: BlOrder["lines"] }): BlOrder {
  return {
    orderId: partial.orderId ?? 1,
    dateConfirmedMs: partial.dateConfirmedMs ?? Date.now(),
    currency: "BRL",
    commission: partial.commission ?? 0,
    deliveryPrice: partial.deliveryPrice ?? 0,
    destinationUF: partial.destinationUF ?? "SP",
    source: "melibr",
    lines: partial.lines,
  };
}

describe("resolveUnitCost", () => {
  const c = costs([{ productId: "100", sku: "ESP-500", averageCost: 3.7 }]);
  it("resolve por productId", () => {
    expect(resolveUnitCost({ productId: "100", sku: "" }, c)).toBe(3.7);
  });
  it("resolve por sku quando id não bate", () => {
    expect(resolveUnitCost({ productId: "999", sku: "esp-500" }, c)).toBe(3.7);
  });
  it("retorna null quando não encontra", () => {
    expect(resolveUnitCost({ productId: "X", sku: "Y" }, c)).toBeNull();
  });
});

describe("buildProfitability", () => {
  const config = defaultTaxConfig();

  it("calcula totais e comparação dos 2 cenários", () => {
    const orders: BlOrder[] = [
      order({
        orderId: 1,
        commission: 125,
        deliveryPrice: 0,
        destinationUF: "SP",
        lines: [{ productId: "100", sku: "ESP-500", itemId: "MLB1", name: "Espeto", quantity: 1, priceBrutto: 1000 }],
      }),
    ];
    const res = buildProfitability({
      orders,
      costs: costs([{ productId: "100", averageCost: 300 }]),
      config,
      from: 0,
      to: 1,
    });

    // sem TTS: tax 239.3 ; net = 1000-125-0-300-239.3 = 335.7
    expect(res.totals.netProfit).toBeCloseTo(335.7, 1);
    // com TTS net should be higher
    expect(res.comparison.comTts.netProfit).toBeGreaterThan(res.comparison.semTts.netProfit);
    expect(res.comparison.ttsGain).toBeCloseTo(167, 1);
    expect(res.scenario).toBe("sem_tts");
  });

  it("agrega lucro por anúncio (itemId) e marca custo faltante", () => {
    const orders: BlOrder[] = [
      order({
        orderId: 1,
        commission: 50,
        destinationUF: "SP",
        lines: [{ productId: "100", sku: "A", itemId: "MLB1", name: "Prod A", quantity: 2, priceBrutto: 100 }],
      }),
      order({
        orderId: 2,
        commission: 30,
        destinationUF: "MG",
        lines: [{ productId: "200", sku: "B", itemId: "MLB1", name: "Prod A", quantity: 1, priceBrutto: 100 }],
      }),
    ];
    const res = buildProfitability({
      orders,
      // only product 100 has cost; 200 missing
      costs: costs([{ productId: "100", averageCost: 10 }]),
      config,
      from: 0,
      to: 1,
    });
    const row = res.listings.find((l) => l.itemId === "MLB1")!;
    expect(row.unitsSold).toBe(3);
    expect(row.orders).toBe(2);
    expect(row.missingCost).toBe(true);
    expect(res.productsMissingCost).toBe(1);
  });

  it("apropria comissão por participação de receita entre linhas", () => {
    const orders: BlOrder[] = [
      order({
        orderId: 1,
        commission: 100,
        destinationUF: "SP",
        lines: [
          { productId: "100", sku: "A", itemId: "MLB1", name: "A", quantity: 1, priceBrutto: 300 },
          { productId: "200", sku: "B", itemId: "MLB2", name: "B", quantity: 1, priceBrutto: 100 },
        ],
      }),
    ];
    const res = buildProfitability({
      orders,
      costs: costs([{ productId: "100", averageCost: 0 }, { productId: "200", averageCost: 0 }]),
      config,
      from: 0,
      to: 1,
    });
    const a = res.listings.find((l) => l.itemId === "MLB1")!;
    const b = res.listings.find((l) => l.itemId === "MLB2")!;
    // commission split 75/25
    expect(a.current.commission).toBeCloseTo(75, 1);
    expect(b.current.commission).toBeCloseTo(25, 1);
  });

  it("inclui gasto de Ads por anúncio quando fornecido", () => {
    const orders: BlOrder[] = [
      order({
        orderId: 1,
        commission: 0,
        destinationUF: "SP",
        lines: [{ productId: "100", sku: "A", itemId: "MLB1", name: "A", quantity: 1, priceBrutto: 1000 }],
      }),
    ];
    const adsByItem = new Map<string, number>([["MLB1", 80]]);
    const res = buildProfitability({
      orders,
      costs: costs([{ productId: "100", averageCost: 0 }]),
      config,
      from: 0,
      to: 1,
      adsByItem,
    });
    const row = res.listings.find((l) => l.itemId === "MLB1")!;
    expect(row.current.ads).toBe(80);
  });

  it("distribui vendas por UF de destino", () => {
    const orders: BlOrder[] = [
      order({ orderId: 1, destinationUF: "SP", lines: [{ productId: "1", sku: "", itemId: "MLB1", name: "x", quantity: 1, priceBrutto: 100 }] }),
      order({ orderId: 2, destinationUF: "SP", lines: [{ productId: "1", sku: "", itemId: "MLB1", name: "x", quantity: 1, priceBrutto: 100 }] }),
      order({ orderId: 3, destinationUF: "BA", lines: [{ productId: "1", sku: "", itemId: "MLB1", name: "x", quantity: 1, priceBrutto: 100 }] }),
    ];
    const res = buildProfitability({
      orders,
      costs: costs([{ productId: "1", averageCost: 0 }]),
      config,
      from: 0,
      to: 1,
    });
    const sp = res.byUF.find((u) => u.uf === "SP")!;
    expect(sp.orders).toBe(2);
    expect(res.byUF.find((u) => u.uf === "BA")!.orders).toBe(1);
  });

  it("seleciona cenário com TTS quando habilitado", () => {
    const cfg = { ...defaultTaxConfig(), ttsEnabled: true };
    const orders: BlOrder[] = [
      order({ orderId: 1, commission: 0, destinationUF: "SP", lines: [{ productId: "1", sku: "", itemId: "MLB1", name: "x", quantity: 1, priceBrutto: 1000 }] }),
    ];
    const res = buildProfitability({
      orders,
      costs: costs([{ productId: "1", averageCost: 0 }]),
      config: cfg,
      from: 0,
      to: 1,
    });
    expect(res.scenario).toBe("com_tts");
    // tax efetiva ~7.23% => net ~927.7
    expect(res.totals.netProfit).toBeCloseTo(927.7, 1);
  });
});
