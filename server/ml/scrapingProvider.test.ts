import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UnifiedCompetitor, FieldConsensus } from "@shared/sources";

// Mock the orchestrator BEFORE importing the module under test.
const searchAllSourcesMock = vi.fn();
const sourceConfigFlagsMock = vi.fn();
vi.mock("../competitors/orchestrator", () => ({
  searchAllSources: (...args: unknown[]) => searchAllSourcesMock(...args),
  sourceConfigFlags: () => sourceConfigFlagsMock(),
}));

import {
  unifiedToMlProduct,
  hasScrapingSources,
  ScrapingProvider,
} from "./scrapingProvider";

function fc<T>(value: T | null): FieldConsensus<T> {
  return { value, consensus: value == null ? "none" : "single", reportingCount: value == null ? 0 : 1, agreeingCount: value == null ? 0 : 1, contributions: [] };
}

function makeCompetitor(over: Partial<UnifiedCompetitor> = {}): UnifiedCompetitor {
  return {
    matchKey: "abc",
    name: "Cadeira Gamer XPTO",
    url: "https://www.mercadolivre.com.br/p/MLB-123456789",
    thumbnail: "http://http2.mlstatic.com/x.webp",
    price: fc(499.9),
    listingPrice: fc(599.9),
    rating: fc(4.5),
    totalRatings: fc(120),
    brand: fc("XPTO"),
    freeShipping: fc(true),
    sellerReputation: fc("MercadoLíder"),
    officialStore: fc(true),
    fulfillment: fc(true),
    hasCoupon: fc(true),
    sponsored: fc(false),
    sources: ["oxylabs"],
    overallConsensus: "single",
    ...over,
  };
}

describe("unifiedToMlProduct — honest mapping", () => {
  it("maps price/rating/thumbnail and forces https", () => {
    const p = unifiedToMlProduct(makeCompetitor(), 1);
    expect(p.price).toBe(499.9);
    expect(p.originalPrice).toBe(599.9);
    expect(p.rating).toBe(4.5);
    expect(p.thumbnail.startsWith("https://")).toBe(true);
    expect(p.priceAvailable).toBe(true);
    expect(p.ratingAvailable).toBe(true);
  });

  it("never invents sales from a search card", () => {
    const p = unifiedToMlProduct(makeCompetitor(), 1);
    expect(p.soldQuantity).toBe(0);
    expect(p.salesAvailable).toBe(false);
  });

  it("flags missing price honestly (no fake R$ 0 as available)", () => {
    const p = unifiedToMlProduct(makeCompetitor({ price: fc(null) }), 2);
    expect(p.price).toBe(0);
    expect(p.priceAvailable).toBe(false);
  });

  it("derives an MLB id from the url when present", () => {
    const p = unifiedToMlProduct(makeCompetitor(), 1);
    expect(p.id).toMatch(/MLB123456789/);
  });

  it("reflects officialStore and coupon/sponsored badges", () => {
    const p = unifiedToMlProduct(makeCompetitor(), 1);
    expect(p.officialStore).toBe(true);
    expect(p.attributes?.some((a) => a.name === "Cupom")).toBe(true);
  });
});

describe("hasScrapingSources", () => {
  beforeEach(() => sourceConfigFlagsMock.mockReset());
  it("true when any scraper is configured", () => {
    sourceConfigFlagsMock.mockReturnValue({ official: false, unwrangle: false, oxylabs: true, scrapingbee: false });
    expect(hasScrapingSources()).toBe(true);
  });
  it("false when only official is configured", () => {
    sourceConfigFlagsMock.mockReturnValue({ official: true, unwrangle: false, oxylabs: false, scrapingbee: false });
    expect(hasScrapingSources()).toBe(false);
  });
});

describe("ScrapingProvider.search", () => {
  beforeEach(() => {
    searchAllSourcesMock.mockReset();
    // Clear the static cache between tests.
    (ScrapingProvider as unknown as { cache: Map<string, unknown> }).cache.clear();
  });

  it("returns real products mapped from the orchestrator", async () => {
    searchAllSourcesMock.mockResolvedValue({
      query: "cadeira gamer",
      competitors: [makeCompetitor(), makeCompetitor({ matchKey: "def", name: "Outra", price: fc(389.0) })],
      sourcesUsed: [],
      triangulated: true,
    });
    const provider = new ScrapingProvider();
    const res = await provider.search({ keyword: "cadeira gamer", limit: 10 });
    expect(res.products.length).toBe(2);
    expect(res.products[0].priceAvailable).toBe(true);
    expect(searchAllSourcesMock).toHaveBeenCalledWith("cadeira gamer");
  });

  it("returns empty (not demo) when no keyword/category is provided", async () => {
    const provider = new ScrapingProvider();
    const res = await provider.search({});
    expect(res.products).toEqual([]);
    expect(searchAllSourcesMock).not.toHaveBeenCalled();
  });
});

import { detailToMlProduct } from "./scrapingProvider";
import type { CompetitorProductDetail } from "@shared/competitors";

function makeDetail(over: Partial<CompetitorProductDetail> = {}): CompetitorProductDetail {
  return {
    name: "Produto Detalhe",
    url: "https://www.mercadolivre.com.br/p/MLB987654321",
    image: "http://http2.mlstatic.com/y.webp",
    price: 250,
    listingPrice: 300,
    currency: "BRL",
    currencySymbol: "R$",
    brand: "ACME",
    description: null,
    rating: 4.8,
    totalRatings: 40,
    images: ["a", "b", "c"],
    isAvailable: true,
    state: "Novo",
    soldBy: "Loja ACME",
    sellerSales: "+5mil vendas",
    sellerLabels: ["MercadoLíder", "Enviado pelo FULL"],
    remainingCredits: null,
    ...over,
  };
}

describe("detailToMlProduct — real sales mapping", () => {
  it("parses '+5mil vendas' into 5000 and flags salesAvailable", () => {
    const p = detailToMlProduct("MLB987654321", makeDetail());
    expect(p.soldQuantity).toBe(5000);
    expect(p.salesAvailable).toBe(true);
  });

  it("flags FULL from seller labels and forces https thumbnail", () => {
    const p = detailToMlProduct("X", makeDetail());
    expect(p.attributes?.some((a) => a.name === "FULL")).toBe(true);
    expect(p.thumbnail.startsWith("https://")).toBe(true);
  });

  it("when no sales hint, salesAvailable=false and soldQuantity=0", () => {
    const p = detailToMlProduct("X", makeDetail({ sellerSales: null }));
    expect(p.salesAvailable).toBe(false);
    expect(p.soldQuantity).toBe(0);
  });

  it("when price missing, priceAvailable=false", () => {
    const p = detailToMlProduct("X", makeDetail({ price: null }));
    expect(p.priceAvailable).toBe(false);
  });
});
