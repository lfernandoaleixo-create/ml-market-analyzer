import { describe, it, expect } from "vitest";
import {
  extractMlbId,
  normalizeName,
  nameSimilarity,
  isSameProduct,
  clusterOffers,
  consensusFromCounts,
  numericConsensus,
  stringConsensus,
  booleanConsensus,
  mergeCluster,
  strengthScore,
  triangulate,
} from "./aggregator";
import type { RawSourceOffer, SourceId } from "@shared/sources";

function offer(source: SourceId, over: Partial<RawSourceOffer> = {}): RawSourceOffer {
  return {
    source,
    name: "Fone de Ouvido Bluetooth XYZ",
    url: "https://www.mercadolivre.com.br/p/MLB-1234567890",
    thumbnail: null,
    price: 100,
    listingPrice: null,
    rating: 4.5,
    totalRatings: 1000,
    brand: "XYZ",
    freeShipping: true,
    sellerReputation: "MercadoLíder",
    officialStore: null,
    fulfillment: null,
    hasCoupon: null,
    sponsored: null,
    ...over,
  };
}

describe("matching helpers", () => {
  it("extracts MLB id from various URL formats", () => {
    expect(extractMlbId("https://www.mercadolivre.com.br/p/MLB-1234567890")).toBe("MLB1234567890");
    expect(extractMlbId("https://produto.mercadolivre.com.br/MLB1234567890-foo")).toBe("MLB1234567890");
    expect(extractMlbId(null)).toBeNull();
    expect(extractMlbId("https://example.com/no-id")).toBeNull();
  });

  it("normalizes names (accents, case, punctuation)", () => {
    expect(normalizeName("Fone de Ouvido — Bluetooth!!")).toBe("fone de ouvido bluetooth");
  });

  it("computes name similarity", () => {
    expect(nameSimilarity("fone bluetooth xyz", "fone bluetooth xyz")).toBeCloseTo(1, 5);
    expect(nameSimilarity("fone bluetooth", "geladeira frost free")).toBe(0);
  });

  it("matches same product by MLB id even with different names", () => {
    const a = offer("unwrangle", { name: "Fone A" });
    const b = offer("oxylabs", { name: "Totally Different Name" });
    expect(isSameProduct(a, b)).toBe(true); // same MLB id
  });

  it("matches by name+price when ids are absent", () => {
    const a = offer("unwrangle", { url: "https://x.com/a", name: "Fone Bluetooth XYZ Preto", price: 100 });
    const b = offer("oxylabs", { url: "https://y.com/b", name: "Fone Bluetooth XYZ Preto", price: 101 });
    expect(isSameProduct(a, b)).toBe(true);
  });

  it("does NOT match clearly different products", () => {
    const a = offer("unwrangle", { url: "https://x.com/a", name: "Fone Bluetooth", price: 100 });
    const b = offer("oxylabs", { url: "https://y.com/b", name: "Geladeira Frost Free 400L", price: 3000 });
    expect(isSameProduct(a, b)).toBe(false);
  });

  it("clusters offers of the same product together", () => {
    const offers = [
      offer("official"),
      offer("unwrangle"),
      offer("oxylabs", { url: "https://z.com/other", name: "Cadeira Gamer", price: 900 }),
    ];
    const clusters = clusterOffers(offers);
    expect(clusters.length).toBe(2);
    expect(clusters[0].length).toBe(2);
  });
});

describe("consensus calculators", () => {
  it("maps counts to levels", () => {
    expect(consensusFromCounts(0, 0)).toBe("none");
    expect(consensusFromCounts(1, 1)).toBe("single");
    // Unanimous corroboration is "high" even with only two sources.
    expect(consensusFromCounts(2, 2)).toBe("high");
    expect(consensusFromCounts(3, 3)).toBe("high");
    // Majority (2 of 3) agrees → medium.
    expect(consensusFromCounts(3, 2)).toBe("medium");
    // Reported by several but no agreement → low.
    expect(consensusFromCounts(3, 1)).toBe("low");
  });

  it("numeric consensus picks the agreeing group and flags high confidence", () => {
    const r = numericConsensus([
      { source: "official", value: 100 },
      { source: "unwrangle", value: 101 },
      { source: "oxylabs", value: 100.5 },
    ]);
    expect(r.consensus).toBe("high");
    expect(r.reportingCount).toBe(3);
    expect(r.agreeingCount).toBe(3);
    expect(r.value).toBeGreaterThanOrEqual(100);
    expect(r.value).toBeLessThanOrEqual(101);
  });

  it("numeric consensus marks disagreement as low", () => {
    const r = numericConsensus([
      { source: "official", value: 100 },
      { source: "unwrangle", value: 200 },
    ]);
    // largest agreeing group is 1 → "low"
    expect(r.consensus).toBe("low");
    expect(r.reportingCount).toBe(2);
  });

  it("numeric consensus with a single source is 'single'", () => {
    const r = numericConsensus([{ source: "official", value: 100 }]);
    expect(r.consensus).toBe("single");
    expect(r.value).toBe(100);
  });

  it("string consensus uses normalized mode", () => {
    const r = stringConsensus([
      { source: "official", value: "MercadoLíder" },
      { source: "unwrangle", value: "mercadolider" },
      { source: "oxylabs", value: "Outro" },
    ]);
    expect(r.agreeingCount).toBe(2);
    // 2 of 3 strings agree (majority) → medium.
    expect(r.consensus).toBe("medium");
  });

  it("boolean consensus uses majority", () => {
    const r = booleanConsensus([
      { source: "official", value: true },
      { source: "unwrangle", value: true },
      { source: "oxylabs", value: false },
    ]);
    expect(r.value).toBe(true);
    expect(r.agreeingCount).toBe(2);
  });
});

describe("merge + strength", () => {
  it("merges a 3-source cluster into a high-confidence competitor", () => {
    const cluster = [
      offer("official", { price: 100 }),
      offer("unwrangle", { price: 101 }),
      offer("oxylabs", { price: 100 }),
    ];
    const u = mergeCluster(cluster);
    expect(u.sources.sort()).toEqual(["official", "oxylabs", "unwrangle"]);
    expect(u.price.consensus).toBe("high");
    expect(u.overallConsensus === "high" || u.overallConsensus === "medium").toBe(true);
    expect(u.matchKey).toBe("MLB1234567890");
  });

  it("merges enrichment badges with boolean consensus (official + FULL + coupon + sponsored)", () => {
    const cluster = [
      offer("oxylabs", { officialStore: true, fulfillment: true, hasCoupon: true, sponsored: false }),
      offer("scrapingbee", { officialStore: true, fulfillment: true, hasCoupon: false, sponsored: false }),
    ];
    const u = mergeCluster(cluster);
    // Both sources agree it's an official store + FULL → unanimous (2/2) = high.
    expect(u.officialStore.value).toBe(true);
    expect(u.officialStore.consensus).toBe("high");
    expect(u.fulfillment.value).toBe(true);
    expect(u.fulfillment.consensus).toBe("high");
    // Sources disagree on coupon (true vs false) → no majority, value falls to most common.
    expect(u.hasCoupon.consensus === "low" || u.hasCoupon.consensus === "medium").toBe(true);
    // Both agree it is NOT sponsored.
    expect(u.sponsored.value).toBe(false);
  });

  it("ignores sources that don't report a badge (null) without lowering consensus", () => {
    const cluster = [
      offer("oxylabs", { officialStore: true }),
      offer("unwrangle", { officialStore: null }),
    ];
    const u = mergeCluster(cluster);
    // Only one source reported the badge → single (null is skipped, not counted as disagreement).
    expect(u.officialStore.value).toBe(true);
    expect(u.officialStore.consensus).toBe("single");
  });

  it("strength rewards corroboration and social proof", () => {
    const strong = mergeCluster([
      offer("official", { totalRatings: 5000, rating: 4.8 }),
      offer("unwrangle", { totalRatings: 5000, rating: 4.8 }),
    ]);
    const weak = mergeCluster([offer("unwrangle", { totalRatings: 1, rating: 3, url: "https://q.com/x", name: "Outro Produto" })]);
    expect(strengthScore(strong)).toBeGreaterThan(strengthScore(weak));
  });

  it("triangulate sorts competitors by strength descending", () => {
    const offers = [
      offer("unwrangle", { url: "https://a.com/MLB-1", name: "Produto Fraco", totalRatings: 2, rating: 3 }),
      offer("official", { url: "https://b.com/MLB-2", name: "Produto Forte", totalRatings: 9000, rating: 4.9 }),
      offer("oxylabs", { url: "https://b.com/MLB-2", name: "Produto Forte", totalRatings: 9000, rating: 4.9 }),
    ];
    const result = triangulate(offers);
    expect(result.length).toBe(2);
    expect(result[0].name).toBe("Produto Forte");
    expect(result[0].sources.length).toBe(2);
  });
});
