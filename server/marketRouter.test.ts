import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * End-to-end-ish tests for the public market procedures using a tRPC caller.
 * These exercise the demo data provider + analysis pipeline without a DB or
 * browser login, validating the data contract the frontend depends on.
 */
function publicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("market router (demo provider)", () => {
  const caller = appRouter.createCaller(publicContext());

  it("reports demo mode in status when no credentials are configured", async () => {
    const status = await caller.market.status();
    expect(status.mode).toBe("demo");
    expect(status.message).toContain("demonstração");
  });

  it("returns a non-empty category list with demand index", async () => {
    const cats = await caller.market.categories();
    expect(cats.length).toBeGreaterThan(0);
    for (const c of cats) {
      expect(c.id).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.demandIndex).toBeGreaterThanOrEqual(0);
      expect(c.demandIndex).toBeLessThanOrEqual(100);
    }
  });

  it("search returns products and respects the sales sort", async () => {
    const res = await caller.market.search({ categoryId: "MLB1051", sortBy: "sales", limit: 20 });
    expect(res.products.length).toBeGreaterThan(0);
    for (let i = 1; i < res.products.length; i++) {
      expect(res.products[i - 1].soldQuantity).toBeGreaterThanOrEqual(res.products[i].soldQuantity);
    }
  });

  it("search sorts by ascending price correctly", async () => {
    const res = await caller.market.search({ categoryId: "MLB1051", sortBy: "price_asc", limit: 20 });
    for (let i = 1; i < res.products.length; i++) {
      expect(res.products[i - 1].price).toBeLessThanOrEqual(res.products[i].price);
    }
  });

  it("bestSellers returns products ordered by sold quantity", async () => {
    const res = await caller.market.bestSellers({ categoryId: "MLB1051", limit: 10 });
    expect(res.products.length).toBeGreaterThan(0);
    for (let i = 1; i < res.products.length; i++) {
      expect(res.products[i - 1].soldQuantity).toBeGreaterThanOrEqual(res.products[i].soldQuantity);
    }
  });

  it("bestSellers applies server-side sorting by price and rating", async () => {
    const byPrice = await caller.market.bestSellers({ categoryId: "MLB1051", limit: 10, sortBy: "price_asc" });
    for (let i = 1; i < byPrice.products.length; i++) {
      expect(byPrice.products[i - 1].price).toBeLessThanOrEqual(byPrice.products[i].price);
    }
    const byRating = await caller.market.bestSellers({ categoryId: "MLB1051", limit: 10, sortBy: "rating" });
    for (let i = 1; i < byRating.products.length; i++) {
      expect(byRating.products[i - 1].rating).toBeGreaterThanOrEqual(byRating.products[i].rating);
    }
  });

  it("opportunities returns analyses with scores in [0,100] and explained factors", async () => {
    const res = await caller.market.opportunities({ categoryId: "MLB1051", limit: 10 });
    expect(res.analyses.length).toBeGreaterThan(0);
    for (const a of res.analyses) {
      expect(a.potentialScore).toBeGreaterThanOrEqual(0);
      expect(a.potentialScore).toBeLessThanOrEqual(100);
      expect(a.factors.length).toBeGreaterThan(0);
      for (const f of a.factors) {
        expect(f.label).toBeTruthy();
        expect(f.explanation.length).toBeGreaterThan(0);
        expect(f.weight).toBeGreaterThan(0);
      }
    }
    // Analyses must be sorted descending by potential.
    for (let i = 1; i < res.analyses.length; i++) {
      expect(res.analyses[i - 1].potentialScore).toBeGreaterThanOrEqual(res.analyses[i].potentialScore);
    }
  });

  it("compare resolves 2+ products and picks an overall winner with per-factor winners", async () => {
    const list = await caller.market.bestSellers({ categoryId: "MLB1051", limit: 4 });
    const ids = list.products.slice(0, 3).map((p) => p.id);
    const cmp = await caller.market.compare({ itemIds: ids });
    expect(cmp.products.length).toBe(ids.length);
    expect(ids).toContain(cmp.overallWinnerId);
    expect(cmp.factors.length).toBeGreaterThan(0);
    expect(cmp.summary.length).toBeGreaterThan(0);
    for (const f of cmp.factors) {
      expect(ids).toContain(f.winnerId);
      for (const id of ids) {
        expect(f.values[id]).toBeDefined();
      }
    }
  });

  it("trends returns keyword entries with volume indices", async () => {
    const trends = await caller.market.trends({ categoryId: "MLB1051" });
    expect(trends.length).toBeGreaterThan(0);
    for (const t of trends) {
      expect(t.keyword).toBeTruthy();
      expect(typeof t.changePercent).toBe("number");
    }
  });
});
