import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MlProduct } from "@shared/ml";

/**
 * Tests for the official-source adapter. We mock the ML provider + credentials
 * so we never exercise the full official provider stack (covered elsewhere).
 * The focus is: configured detection, public-product → RawSourceOffer mapping,
 * and the demo-mode short-circuit (returns [] so triangulation just skips it).
 */

const getProviderMock = vi.fn();
const resolveEnvMlCredentialsMock = vi.fn();

vi.mock("../ml/provider", () => ({
  getProvider: (...args: unknown[]) => getProviderMock(...args),
}));
vi.mock("../ml/credentials", () => ({
  resolveEnvMlCredentials: (...args: unknown[]) =>
    resolveEnvMlCredentialsMock(...args),
}));

function baseProduct(overrides: Partial<MlProduct> = {}): MlProduct {
  return {
    id: "MLB123",
    title: "Produto Oficial",
    price: 99.9,
    originalPrice: 149.9,
    currency: "BRL",
    soldQuantity: 0,
    availableQuantity: 10,
    condition: "new",
    thumbnail: "https://img/p.jpg",
    pictureCount: 3,
    permalink: "https://www.mercadolivre.com.br/p/MLB123",
    freeShipping: true,
    officialStore: false,
    catalogPosition: null,
    rating: 4.5,
    reviewsCount: 200,
    categoryId: "MLB1",
    categoryName: "Cat",
    seller: {
      id: "1",
      nickname: "loja",
      reputationLevel: "5_green",
      powerSellerStatus: "gold",
      transactions: 100,
      positiveRatingRatio: 0.98,
    },
    priceAvailable: true,
    ratingAvailable: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveEnvMlCredentialsMock.mockReturnValue({ appId: "1", clientSecret: "s" });
});

async function loadModule() {
  vi.resetModules();
  return await import("./officialSource");
}

describe("officialSource — configuration", () => {
  it("is configured when the provider resolves to official mode", async () => {
    getProviderMock.mockReturnValue({ mode: "official" });
    const mod = await loadModule();
    expect(mod.isConfigured()).toBe(true);
  });

  it("is NOT configured when the provider falls back to demo", async () => {
    getProviderMock.mockReturnValue({ mode: "demo" });
    const mod = await loadModule();
    expect(mod.isConfigured()).toBe(false);
  });
});

describe("officialSource — mapOfficialProduct", () => {
  it("maps a public product into a neutral RawSourceOffer", async () => {
    getProviderMock.mockReturnValue({ mode: "official" });
    const mod = await loadModule();
    const offer = mod.mapOfficialProduct(
      baseProduct({
        attributes: [{ name: "Marca", value: "ACME" }],
      }),
    );
    expect(offer).toMatchObject({
      source: "official",
      name: "Produto Oficial",
      url: "https://www.mercadolivre.com.br/p/MLB123",
      price: 99.9,
      listingPrice: 149.9,
      rating: 4.5,
      totalRatings: 200,
      brand: "ACME",
      freeShipping: true,
      sellerReputation: "gold",
    });
  });

  it("hides price when priceAvailable is false", async () => {
    getProviderMock.mockReturnValue({ mode: "official" });
    const mod = await loadModule();
    const offer = mod.mapOfficialProduct(
      baseProduct({ priceAvailable: false, price: 0 }),
    );
    expect(offer?.price).toBeNull();
  });

  it("hides rating when ratingAvailable is false", async () => {
    getProviderMock.mockReturnValue({ mode: "official" });
    const mod = await loadModule();
    const offer = mod.mapOfficialProduct(
      baseProduct({ ratingAvailable: false }),
    );
    expect(offer?.rating).toBeNull();
    expect(offer?.totalRatings).toBeNull();
  });

  it("returns null for an empty product", async () => {
    getProviderMock.mockReturnValue({ mode: "official" });
    const mod = await loadModule();
    expect(mod.mapOfficialProduct({ title: "" } as MlProduct)).toBeNull();
  });
});

describe("officialSource — searchOffers", () => {
  it("returns [] when in demo mode (no triangulation contribution)", async () => {
    getProviderMock.mockReturnValue({ mode: "demo", search: vi.fn() });
    const mod = await loadModule();
    const offers = await mod.searchOffers("shampoo");
    expect(offers).toEqual([]);
  });

  it("queries the public search and maps results in official mode", async () => {
    const search = vi.fn(async () => ({
      query: "shampoo",
      total: 2,
      products: [baseProduct(), baseProduct({ title: "" })],
    }));
    getProviderMock.mockReturnValue({ mode: "official", search });
    const mod = await loadModule();
    const offers = await mod.searchOffers("shampoo");
    expect(search).toHaveBeenCalledWith({ keyword: "shampoo", limit: 30 });
    // The empty-title product is filtered out.
    expect(offers).toHaveLength(1);
    expect(offers[0].source).toBe("official");
  });
});
