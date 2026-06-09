import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RawSourceOffer } from "@shared/sources";

/**
 * Tests for the multi-source orchestrator. All four sources are mocked so no
 * network calls happen. We verify:
 *  - getSourcesStatus reflects per-source configuration
 *  - per-source failures are isolated (one down never breaks the result)
 *  - results from >1 source are flagged as triangulated
 *  - unconfigured sources are simply skipped
 */

// Make the per-source timeout effectively irrelevant for fast tests.
process.env.COMPETITOR_SOURCE_TIMEOUT_MS = "2000";

const official = {
  isConfigured: vi.fn(),
  searchOffers: vi.fn(),
};
const oxylabs = {
  isConfigured: vi.fn(),
  searchOffers: vi.fn(),
};
const scrapingbee = {
  isConfigured: vi.fn(),
  searchOffers: vi.fn(),
};
const unwrangle = {
  isConfigured: vi.fn(),
  searchProducts: vi.fn(),
};

vi.mock("./officialSource", () => ({
  isConfigured: () => official.isConfigured(),
  searchOffers: (...a: unknown[]) => official.searchOffers(...a),
}));
vi.mock("./oxylabs", () => ({
  isConfigured: () => oxylabs.isConfigured(),
  searchOffers: (...a: unknown[]) => oxylabs.searchOffers(...a),
}));
vi.mock("./scrapingbee", () => ({
  isConfigured: () => scrapingbee.isConfigured(),
  searchOffers: (...a: unknown[]) => scrapingbee.searchOffers(...a),
}));
vi.mock("./unwrangle", () => ({
  isConfigured: () => unwrangle.isConfigured(),
  searchProducts: (...a: unknown[]) => unwrangle.searchProducts(...a),
}));

function offer(source: RawSourceOffer["source"], over: Partial<RawSourceOffer> = {}): RawSourceOffer {
  return {
    source,
    name: "Shampoo Antiqueda 300ml",
    url: "https://www.mercadolivre.com.br/p/MLB123",
    thumbnail: null,
    price: 50,
    listingPrice: null,
    rating: 4.5,
    totalRatings: 100,
    brand: null,
    freeShipping: null,
    sellerReputation: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: nothing configured.
  official.isConfigured.mockReturnValue(false);
  oxylabs.isConfigured.mockReturnValue(false);
  scrapingbee.isConfigured.mockReturnValue(false);
  unwrangle.isConfigured.mockReturnValue(false);
});

async function loadModule() {
  vi.resetModules();
  return await import("./orchestrator");
}

describe("orchestrator — getSourcesStatus", () => {
  it("reports all four sources with correct configured flags", async () => {
    official.isConfigured.mockReturnValue(true);
    oxylabs.isConfigured.mockReturnValue(true);
    const mod = await loadModule();
    const status = mod.getSourcesStatus();
    expect(status.sources).toHaveLength(4);
    expect(status.configuredCount).toBe(2);
    expect(status.anyAvailable).toBe(true);
    const byId = Object.fromEntries(status.sources.map((s) => [s.id, s]));
    expect(byId.official.configured).toBe(true);
    expect(byId.oxylabs.configured).toBe(true);
    expect(byId.unwrangle.configured).toBe(false);
    expect(byId.unwrangle.health).toBe("unconfigured");
  });

  it("reports anyAvailable=false when nothing is configured", async () => {
    const mod = await loadModule();
    const status = mod.getSourcesStatus();
    expect(status.configuredCount).toBe(0);
    expect(status.anyAvailable).toBe(false);
  });
});

describe("orchestrator — searchAllSources", () => {
  it("skips unconfigured sources and never calls them", async () => {
    official.isConfigured.mockReturnValue(true);
    official.searchOffers.mockResolvedValue([offer("official")]);
    const mod = await loadModule();
    const res = await mod.searchAllSources("shampoo");
    expect(official.searchOffers).toHaveBeenCalledTimes(1);
    expect(oxylabs.searchOffers).not.toHaveBeenCalled();
    expect(scrapingbee.searchOffers).not.toHaveBeenCalled();
    expect(unwrangle.searchProducts).not.toHaveBeenCalled();
    expect(res.competitors).toHaveLength(1);
    expect(res.triangulated).toBe(false);
  });

  it("isolates a failing source — others still produce results", async () => {
    official.isConfigured.mockReturnValue(true);
    oxylabs.isConfigured.mockReturnValue(true);
    official.searchOffers.mockRejectedValue(
      Object.assign(new Error("boom"), { code: "upstream" }),
    );
    oxylabs.searchOffers.mockResolvedValue([offer("oxylabs")]);
    const mod = await loadModule();
    const res = await mod.searchAllSources("shampoo");
    expect(res.competitors).toHaveLength(1);
    const officialStatus = res.sourcesUsed.find((s) => s.id === "official");
    const oxylabsStatus = res.sourcesUsed.find((s) => s.id === "oxylabs");
    expect(officialStatus?.health).toBe("upstream");
    expect(oxylabsStatus?.health).toBe("ok");
  });

  it("classifies auth errors distinctly", async () => {
    oxylabs.isConfigured.mockReturnValue(true);
    oxylabs.searchOffers.mockRejectedValue(
      Object.assign(new Error("nope"), { code: "auth" }),
    );
    const mod = await loadModule();
    const res = await mod.searchAllSources("x");
    const st = res.sourcesUsed.find((s) => s.id === "oxylabs");
    expect(st?.health).toBe("auth");
    expect(res.competitors).toHaveLength(0);
  });

  it("flags triangulated=true when more than one source contributes the same product", async () => {
    official.isConfigured.mockReturnValue(true);
    oxylabs.isConfigured.mockReturnValue(true);
    official.searchOffers.mockResolvedValue([offer("official", { price: 50 })]);
    oxylabs.searchOffers.mockResolvedValue([offer("oxylabs", { price: 50 })]);
    const mod = await loadModule();
    const res = await mod.searchAllSources("shampoo");
    expect(res.triangulated).toBe(true);
    expect(res.competitors).toHaveLength(1);
    // The single merged competitor should reference both sources.
    expect(res.competitors[0].sources.sort()).toEqual(["official", "oxylabs"]);
    expect(res.competitors[0].price.reportingCount).toBe(2);
  });

  it("adapts the Unwrangle search shape into RawSourceOffer", async () => {
    unwrangle.isConfigured.mockReturnValue(true);
    unwrangle.searchProducts.mockResolvedValue({
      results: [
        {
          name: "Shampoo Antiqueda 300ml",
          url: "https://www.mercadolivre.com.br/p/MLB123",
          thumbnail: "t",
          price: 48,
          listingPrice: 60,
          rating: 4.4,
          totalRatings: 80,
          brand: "Marca",
        },
      ],
    });
    const mod = await loadModule();
    const res = await mod.searchAllSources("shampoo");
    expect(res.competitors).toHaveLength(1);
    expect(res.competitors[0].sources).toEqual(["unwrangle"]);
    expect(res.competitors[0].price.value).toBe(48);
  });
});
