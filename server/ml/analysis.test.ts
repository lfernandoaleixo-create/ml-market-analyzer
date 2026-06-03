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
    expect(analysis.factors.length).toBeGreaterThanOrEqual(5);
    for (const f of analysis.factors) {
      expect(f.explanation.length).toBeGreaterThan(0);
      expect(f.score).toBeGreaterThanOrEqual(0);
      expect(f.score).toBeLessThanOrEqual(100);
    }
    expect(["alto", "medio", "baixo"]).toContain(analysis.verdict);
  });

  it("factor weights sum to ~1", () => {
    const products = sampleProducts(5);
    const analysis = analyzePotential(products[0], category, {
      categoryMaxPrice: 1000,
      categoryMaxSold: 1000,
    });
    const sum = analysis.factors.reduce((s, f) => s + f.weight, 0);
    expect(sum).toBeGreaterThan(0.95);
    expect(sum).toBeLessThan(1.05);
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

  it("the cheapest product wins the price factor", () => {
    const products = sampleProducts(4);
    const result = compareProducts(products);
    const priceFactor = result.factors.find((f) => f.key === "price")!;
    const cheapest = products.reduce((a, b) => (a.price <= b.price ? a : b));
    expect(priceFactor.winnerId).toBe(cheapest.id);
  });
});
