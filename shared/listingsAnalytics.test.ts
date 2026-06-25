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
  dayVisitsFromMap,
  listingsToCsv,
  selectActiveListings,
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

  it("é estável quando há empate: desempata por itemId e não muda de lugar entre re-renders", () => {
    // Três anúncios com EXATAMENTE o mesmo número de visitas, em ordem de entrada
    // embaralhada — simula re-renders com a fonte vindo em ordens diferentes.
    const tied = [
      row({ itemId: "MLB30", visits: 50 }),
      row({ itemId: "MLB10", visits: 50 }),
      row({ itemId: "MLB20", visits: 50 }),
    ];
    const shuffled = [
      row({ itemId: "MLB20", visits: 50 }),
      row({ itemId: "MLB30", visits: 50 }),
      row({ itemId: "MLB10", visits: 50 }),
    ];
    const out1 = sortListings(tied, "visits", "desc").map((r) => r.itemId);
    const out2 = sortListings(shuffled, "visits", "desc").map((r) => r.itemId);
    // Mesma ordem determinística independente da ordem de entrada.
    expect(out1).toEqual(["MLB10", "MLB20", "MLB30"]);
    expect(out1).toEqual(out2);
  });

  it("itens sem visitas diárias (mapa ainda carregando) mantêm ordem estável por itemId", () => {
    // Antes do dailyVisitsMap chegar, todos ficam empatados (null) — não pode embaralhar.
    const rows = [
      row({ itemId: "MLB3" }),
      row({ itemId: "MLB1" }),
      row({ itemId: "MLB2" }),
    ];
    const out = sortListings(rows, "day0", "desc", {}).map((r) => r.itemId);
    expect(out).toEqual(["MLB1", "MLB2", "MLB3"]);
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

describe("selectActiveListings", () => {
  const items: ListingRow[] = [
    row({ itemId: "MLB1", title: "Palito de Bambu", status: "active" }),
    row({ itemId: "MLB2", title: "Hashi Descartável", status: "paused" }),
    row({ itemId: "MLB3", title: "Vareta Difusor", status: "active" }),
    row({ itemId: "MLB4", title: "Colar Prata", status: "closed" }),
    row({ itemId: "MLB5", title: "Espeto Churrasco", status: "active" }),
  ];

  it("returns only active listings, preserving order", () => {
    const active = selectActiveListings(items);
    expect(active.map((i) => i.itemId)).toEqual(["MLB1", "MLB3", "MLB5"]);
  });

  it("filters active listings by title (case-insensitive)", () => {
    const r = selectActiveListings(items, "vareta");
    expect(r.map((i) => i.itemId)).toEqual(["MLB3"]);
  });

  it("filters active listings by itemId", () => {
    const r = selectActiveListings(items, "MLB5");
    expect(r.map((i) => i.itemId)).toEqual(["MLB5"]);
  });

  it("never returns non-active items even if the search matches them", () => {
    const r = selectActiveListings(items, "Hashi");
    expect(r).toHaveLength(0);
  });

  it("ignores surrounding whitespace in the query", () => {
    const r = selectActiveListings(items, "  espeto  ");
    expect(r.map((i) => i.itemId)).toEqual(["MLB5"]);
  });
});


describe("sortListings por dia (day0/day1/day2) + dayVisitsFromMap", () => {
  // Série: mais antigo -> hoje. Janela de 3 dias usada na UI.
  const daily = {
    A: [
      { date: "2026-06-21", visits: 5 },
      { date: "2026-06-22", visits: 10 },
      { date: "2026-06-23", visits: 2 },
    ],
    B: [
      { date: "2026-06-21", visits: 1 },
      { date: "2026-06-22", visits: 3 },
      { date: "2026-06-23", visits: 50 },
    ],
    C: [
      { date: "2026-06-21", visits: 8 },
      { date: "2026-06-22", visits: 0 },
      { date: "2026-06-23", visits: 0 },
    ],
  };
  const rows = [
    row({ itemId: "A", title: "A" }),
    row({ itemId: "B", title: "B" }),
    row({ itemId: "C", title: "C" }),
  ];

  it("dayVisitsFromMap resolve hoje/ontem/anteontem por offset do fim", () => {
    expect(dayVisitsFromMap(daily, "A", 0)).toBe(2); // hoje
    expect(dayVisitsFromMap(daily, "A", 1)).toBe(10); // ontem
    expect(dayVisitsFromMap(daily, "A", 2)).toBe(5); // anteontem
    expect(dayVisitsFromMap(daily, "A", 3)).toBeNull(); // fora da janela
    expect(dayVisitsFromMap(daily, "Z", 0)).toBeNull(); // item sem série
    expect(dayVisitsFromMap(undefined, "A", 0)).toBeNull();
  });

  it("ordena por HOJE (day0) desc: B(50) > A(2) > C(0)", () => {
    const out = sortListings(rows, "day0", "desc", daily).map((r) => r.itemId);
    expect(out).toEqual(["B", "A", "C"]);
  });

  it("ordena por ONTEM (day1) desc: A(10) > B(3) > C(0)", () => {
    const out = sortListings(rows, "day1", "desc", daily).map((r) => r.itemId);
    expect(out).toEqual(["A", "B", "C"]);
  });

  it("ordena por ANTEONTEM (day2) asc: B(1) < A(5) < C(8)", () => {
    const out = sortListings(rows, "day2", "asc", daily).map((r) => r.itemId);
    expect(out).toEqual(["B", "A", "C"]);
  });

  it("itens sem série vão para o fim (nulls last) independente da direção", () => {
    const withMissing = [...rows, row({ itemId: "Z", title: "Z" })];
    const desc = sortListings(withMissing, "day0", "desc", daily).map((r) => r.itemId);
    const asc = sortListings(withMissing, "day0", "asc", daily).map((r) => r.itemId);
    expect(desc[desc.length - 1]).toBe("Z");
    expect(asc[asc.length - 1]).toBe("Z");
  });
});
