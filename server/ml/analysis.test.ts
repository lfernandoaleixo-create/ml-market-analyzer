import { describe, expect, it } from "vitest";
import { analyzePotential, compareProducts, rankByPotential } from "./analysis";
import {
  DEMO_CATEGORIES,
  findDemoProductById,
  generateProducts,
  getDemoTrends,
} from "./demoData";
import type { MlProduct } from "@shared/ml";

const category = DEMO_CATEGORIES[0];

function sampleProducts(count = 10): MlProduct[] {
  return generateProducts({ categoryId: category.id, count });
}

describe("demoData", () => {
  it("generates deterministic products for the same input", () => {
    const a = generateProducts({ categoryId: category.id, count: 5 });
    const b = generateProducts({ categoryId: category.id, count: 5 });
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
    expect(a[0].price).toEqual(b[0].price);
  });

  it("produces products with all required fields", () => {
    const [p] = sampleProducts(1);
    expect(p.id).toMatch(/^MLB/);
    expect(p.price).toBeGreaterThan(0);
    expect(p.rating).toBeGreaterThanOrEqual(0);
    expect(p.rating).toBeLessThanOrEqual(5);
    expect(p.seller).toBeTruthy();
    expect(typeof p.freeShipping).toBe("boolean");
  });

  it("resolves a product by id", () => {
    const [p] = sampleProducts(1);
    const found = findDemoProductById(p.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(p.id);
  });

  it("returns trends for a category", () => {
    const trends = getDemoTrends(category.id);
    expect(trends.length).toBeGreaterThan(0);
    expect(trends[0]).toHaveProperty("keyword");
    expect(trends[0]).toHaveProperty("volumeIndex");
  });
});

describe("analyzePotential", () => {
  it("returns a score between 0 and 100 with explained factors", () => {
    const products = sampleProducts(12);
    const maxPrice = Math.max(...products.map((p) => p.price));
    const maxSold = Math.max(...products.map((p) => p.soldQuantity));
    const analysis = analyzePotential(products[0], category, {
      categoryMaxPrice: maxPrice,
      categoryMaxSold: maxSold,
    });
    expect(analysis.potentialScore).toBeGreaterThanOrEqual(0);
    expect(analysis.potentialScore).toBeLessThanOrEqual(100);
    expect(analysis.factors.length).toBeGreaterThanOrEqual(4);
    for (const f of analysis.factors) {
      expect(f.explanation.length).toBeGreaterThan(0);
      expect(f.score).toBeGreaterThanOrEqual(0);
      expect(f.score).toBeLessThanOrEqual(100);
    }
    expect(["alto", "medio", "baixo"]).toContain(analysis.verdict);
  });

  it("uses ONLY real factors and never the removed synthetic ones", () => {
    const products = sampleProducts(8);
    const analysis = analyzePotential(products[0], category, {
      categoryMaxPrice: 1000,
      categoryMaxSold: 1000,
    });
    const keys = analysis.factors.map((f) => f.key);
    // Synthetic factors must be gone.
    expect(keys).not.toContain("growth");
    expect(keys).not.toContain("demand");
    expect(keys).not.toContain("price_rating");
    // Real factors must be present.
    expect(keys).toContain("price");
    expect(keys).toContain("best_seller");
    expect(keys).toContain("trust");
    expect(keys).toContain("logistics");
    // The analysis object must not expose synthetic estimates anymore.
    expect(analysis).not.toHaveProperty("salesGrowthPercent");
    expect(analysis).not.toHaveProperty("categoryDemand");
    expect(analysis).toHaveProperty("priceScore");
    expect(analysis).toHaveProperty("bestSellerScore");
  });

  it("omits the rating factor when rating is NOT available (honest default)", () => {
    const [p] = sampleProducts(1);
    const product: MlProduct = { ...p, ratingAvailable: false };
    const analysis = analyzePotential(product, category, {
      categoryMaxPrice: 1000,
      categoryMaxSold: 1000,
    });
    expect(analysis.factors.find((f) => f.key === "rating")).toBeUndefined();
  });

  it("includes the rating factor only when rating IS available", () => {
    const [p] = sampleProducts(1);
    const product: MlProduct = {
      ...p,
      ratingAvailable: true,
      rating: 4.6,
      reviewsCount: 120,
    };
    const analysis = analyzePotential(product, category, {
      categoryMaxPrice: 1000,
      categoryMaxSold: 1000,
    });
    expect(analysis.factors.find((f) => f.key === "rating")).toBeTruthy();
  });

  it("does not score price when price is unavailable", () => {
    const [p] = sampleProducts(1);
    const product: MlProduct = { ...p, priceAvailable: false };
    const analysis = analyzePotential(product, category, {
      categoryMaxPrice: 1000,
      categoryMaxSold: 1000,
    });
    const priceFactor = analysis.factors.find((f) => f.key === "price")!;
    expect(priceFactor.score).toBe(0);
  });
});

describe("rankByPotential", () => {
  it("sorts products by descending potential score", () => {
    const products = sampleProducts(15);
    const ranked = rankByPotential(products, category);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].potentialScore).toBeGreaterThanOrEqual(ranked[i].potentialScore);
    }
  });
});

describe("compareProducts", () => {
  it("requires at least 2 products", () => {
    const products = sampleProducts(1);
    expect(() => compareProducts(products)).toThrow();
  });

  it("compares products and picks a winner per factor + overall", () => {
    const products = sampleProducts(3);
    const result = compareProducts(products);
    // Always-present real factors: price, shipping, seller, pictures, title, position.
    expect(result.factors.length).toBeGreaterThanOrEqual(6);
    const ids = products.map((p) => p.id);
    expect(ids).toContain(result.overallWinnerId);
    for (const f of result.factors) {
      expect(ids).toContain(f.winnerId);
      expect(f.explanation.length).toBeGreaterThan(0);
      // every product has a value entry
      for (const id of ids) expect(f.values[id]).toBeTruthy();
    }
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("omits rating & sales factors when the data is not available for all items", () => {
    // Demo products default to ratingAvailable !== true, so rating/sales must be absent.
    const products = sampleProducts(3).map((p) => ({
      ...p,
      ratingAvailable: false,
      salesAvailable: false,
    }));
    const result = compareProducts(products);
    const keys = result.factors.map((f) => f.key);
    expect(keys).not.toContain("rating");
    expect(keys).not.toContain("sales");
    expect(keys).toContain("price");
    expect(keys).toContain("seller");
  });

  it("includes rating & sales factors only when ALL items have the data", () => {
    const products = sampleProducts(3).map((p, i) => ({
      ...p,
      ratingAvailable: true,
      rating: 4 + i * 0.2,
      reviewsCount: 50 + i * 10,
      salesAvailable: true,
      soldQuantity: 100 + i * 25,
    }));
    const result = compareProducts(products);
    const keys = result.factors.map((f) => f.key);
    expect(keys).toContain("rating");
    expect(keys).toContain("sales");
  });

  it("the cheapest product wins the price factor", () => {
    const products = sampleProducts(4);
    const result = compareProducts(products);
    const priceFactor = result.factors.find((f) => f.key === "price")!;
    const cheapest = products.reduce((a, b) => (a.price <= b.price ? a : b));
    expect(priceFactor.winnerId).toBe(cheapest.id);
  });
});
