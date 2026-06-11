import { describe, it, expect } from "vitest";
import type { ListingRow } from "./account";
import {
  VISIT_BUCKETS,
  STOCK_BUCKETS,
  CONVERSION_BUCKETS,
  HEALTH_BUCKETS,
  bucketIdFor,
  bucketCounts,
  conversionPct,
  computeInsights,
  filterListings,
  sortListings,
  listingsToCsv,
} from "./listingsAnalytics";

function row(over: Partial<ListingRow>): ListingRow {
  return {
    itemId: "MLB1",
    title: "Produto",
    price: 10,
    currency: "BRL",
    availableQuantity: 5,
    soldQuantity: 0,
    status: "active",
    listingType: "gold_special",
    visits: 0,
    conversion: null,
    stockValue: 50,
    ...over,
  };
}

describe("bucketIdFor", () => {
  it("maps visit values to the right band", () => {
    expect(bucketIdFor(0, VISIT_BUCKETS)).toBe("v0");
    expect(bucketIdFor(5, VISIT_BUCKETS)).toBe("v1_10");
    expect(bucketIdFor(10, VISIT_BUCKETS)).toBe("v1_10");
    expect(bucketIdFor(11, VISIT_BUCKETS)).toBe("v10_50");
    expect(bucketIdFor(200, VISIT_BUCKETS)).toBe("v100_200");
    expect(bucketIdFor(201, VISIT_BUCKETS)).toBe("v200");
  });

  it("maps stock and health bands", () => {
    expect(bucketIdFor(0, STOCK_BUCKETS)).toBe("s0");
    expect(bucketIdFor(3, STOCK_BUCKETS)).toBe("s1_5");
    expect(bucketIdFor(0.4, HEALTH_BUCKETS)).toBe("h_crit");
    expect(bucketIdFor(0.9, HEALTH_BUCKETS)).toBe("h_good");
  });
});

describe("conversionPct + conversion buckets", () => {
  it("returns null without visits and percent otherwise", () => {
    expect(conversionPct(row({ conversion: null }))).toBeNull();
    expect(conversionPct(row({ conversion: 0.025 }))).toBeCloseTo(2.5);
    expect(bucketIdFor(2.5, CONVERSION_BUCKETS)).toBe("c1_3");
    expect(bucketIdFor(0, CONVERSION_BUCKETS)).toBe("c0");
    expect(bucketIdFor(6, CONVERSION_BUCKETS)).toBe("c5");
  });
});

describe("bucketCounts", () => {
  it("counts items per visit band, skipping nulls", () => {
    const items = [
      row({ visits: 0 }),
      row({ visits: 5 }),
      row({ visits: 8 }),
      row({ visits: 300 }),
    ];
    const counts = bucketCounts(items, VISIT_BUCKETS, (r) => r.visits);
    expect(counts.v0).toBe(1);
    expect(counts.v1_10).toBe(2);
    expect(counts.v200).toBe(1);
  });
});

describe("computeInsights", () => {
  it("classifies actionable cases", () => {
    const items = [
      row({ itemId: "A", visits: 120, soldQuantity: 1, availableQuantity: 50, conversion: 1 / 120 }), // high visits low conv (<1%)
      row({ itemId: "B", visits: 50, soldQuantity: 0, conversion: null }), // no sales high visits
      row({ itemId: "C", soldQuantity: 4, availableQuantity: 3 }), // selling low stock
      row({ itemId: "D", status: "paused", soldQuantity: 2 }), // paused with sales
      row({ itemId: "E", availableQuantity: 0, status: "active" }), // out of stock active
    ];
    const insights = computeInsights(items);
    const by = Object.fromEntries(insights.map((i) => [i.id, i.count]));
    expect(by.high_visits_low_conv).toBe(1);
    expect(by.no_sales_high_visits).toBe(1);
    expect(by.selling_low_stock).toBe(1);
    expect(by.paused_with_sales).toBe(1);
    expect(by.out_of_stock_active).toBe(1);
  });

});

describe("filterListings", () => {
  const items = [
    row({ itemId: "A", title: "Camiseta Azul", status: "active", price: 30, visits: 5, soldQuantity: 1, conversion: 0.2, freeShipping: true }),
    row({ itemId: "B", title: "Tênis Corrida", status: "paused", price: 200, visits: 80, soldQuantity: 0, conversion: 0 }),
    row({ itemId: "C", title: "Boné Preto", status: "active", price: 50, visits: 0, soldQuantity: 0, conversion: null }),
  ];

  it("filters by accent-insensitive search", () => {
    expect(filterListings(items, { search: "tenis" }).map((r) => r.itemId)).toEqual(["B"]);
    expect(filterListings(items, { search: "bone" }).map((r) => r.itemId)).toEqual(["C"]);
  });

  it("filters by status and price range", () => {
    expect(filterListings(items, { statuses: ["active"] }).map((r) => r.itemId)).toEqual(["A", "C"]);
    expect(filterListings(items, { priceMin: 40, priceMax: 100 }).map((r) => r.itemId)).toEqual(["C"]);
  });

  it("filters by visit bucket and free shipping", () => {
    expect(filterListings(items, { visitBucketIds: ["v50_100"] }).map((r) => r.itemId)).toEqual(["B"]);
    expect(filterListings(items, { freeShipping: true }).map((r) => r.itemId)).toEqual(["A"]);
  });

  it("combines filters with AND semantics", () => {
    const res = filterListings(items, { statuses: ["active"], visitBucketIds: ["v1_10"] });
    expect(res.map((r) => r.itemId)).toEqual(["A"]);
  });
});

describe("sortListings", () => {
  const items = [
    row({ itemId: "A", visits: 10, conversion: 0.5 }),
    row({ itemId: "B", visits: 100, conversion: null }),
    row({ itemId: "C", visits: 50, conversion: 0.1 }),
  ];

  it("sorts numeric desc and keeps nulls last", () => {
    expect(sortListings(items, "visits", "desc").map((r) => r.itemId)).toEqual(["B", "C", "A"]);
    expect(sortListings(items, "conversion", "desc").map((r) => r.itemId)).toEqual(["A", "C", "B"]);
    expect(sortListings(items, "conversion", "asc").map((r) => r.itemId)).toEqual(["C", "A", "B"]);
  });
});

describe("listingsToCsv", () => {
  it("produces a header and a row, escaping separators", () => {
    const csv = listingsToCsv([row({ title: "Produto; especial", price: 12.5, conversion: 0.0123 })]);
    const lines = csv.split("\n");
    expect(lines[0].startsWith("ID;Titulo;Status")).toBe(true);
    expect(lines[1]).toContain('"Produto; especial"');
    expect(lines[1]).toContain("12,50");
    expect(lines[1]).toContain("1,23"); // conversion percent
  });
});
