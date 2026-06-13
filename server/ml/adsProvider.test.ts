import { describe, it, expect } from "vitest";
import { AdsProvider, buildAdsInsights, aggregateMetrics } from "./adsProvider";
import type { AdsMetrics, AdsCampaign, AdsAdRow } from "@shared/ads";

/** Build a metrics block with sensible zeros, overriding only what a test needs. */
function metrics(over: Partial<AdsMetrics> = {}): AdsMetrics {
  return {
    clicks: 0,
    prints: 0,
    cost: 0,
    cpc: 0,
    ctr: 0,
    acos: 0,
    sov: 0,
    directAmount: 0,
    indirectAmount: 0,
    totalAmount: 0,
    directUnits: 0,
    indirectUnits: 0,
    units: 0,
    organicUnits: 0,
    organicItems: 0,
    ...over,
  };
}

function campaign(over: Partial<AdsCampaign> = {}): AdsCampaign {
  return {
    id: 1,
    name: "Campanha",
    status: "active",
    strategy: "PROFITABILITY",
    acosTarget: null,
    roasTarget: null,
    budget: null,
    automaticBudget: false,
    channel: "marketplace",
    dateCreated: null,
    lastUpdated: null,
    metrics: metrics(),
    ...over,
  };
}

function ad(over: Partial<AdsAdRow> = {}): AdsAdRow {
  return {
    itemId: "MLB1",
    campaignId: 1,
    title: "Produto de teste",
    price: 100,
    status: "active",
    thumbnail: null,
    permalink: null,
    listingTypeId: null,
    logisticType: null,
    buyBoxWinner: false,
    catalogListing: false,
    brand: null,
    imageQuality: null,
    hasDiscount: false,
    metrics: metrics(),
    ...over,
  };
}

describe("aggregateMetrics", () => {
  it("sums money/units and recomputes derived rates", () => {
    const agg = aggregateMetrics([
      metrics({ clicks: 100, prints: 1000, cost: 50, totalAmount: 200, units: 10 }),
      metrics({ clicks: 100, prints: 1000, cost: 50, totalAmount: 200, units: 10 }),
    ]);
    expect(agg.clicks).toBe(200);
    expect(agg.cost).toBe(100);
    expect(agg.totalAmount).toBe(400);
    // ACOS = cost/revenue*100 = 100/400*100 = 25
    expect(agg.acos).toBe(25);
    // CTR = clicks/prints*100 = 200/2000*100 = 10
    expect(agg.ctr).toBe(10);
  });
});

describe("buildSummary", () => {
  it("computes ROAS, ACOS, conversion and organic share from real metrics", () => {
    const p = new AdsProvider("token", "MLB");
    const summary = p.buildSummary(
      [
        campaign({
          budget: 100,
          metrics: metrics({ clicks: 200, cost: 100, totalAmount: 400, units: 20, organicUnits: 5 }),
        }),
      ],
      999,
    );
    expect(summary.advertiserId).toBe(999);
    expect(summary.derived.roas).toBe(4); // 400/100
    expect(summary.derived.acos).toBe(25); // 100/400*100
    expect(summary.derived.conversionRate).toBe(10); // 20/200*100
    expect(summary.derived.totalBudget).toBe(100);
    // organic share = 5/(20+5)*100 = 20
    expect(summary.derived.organicShare).toBe(20);
  });

  it("returns null derived values instead of dividing by zero", () => {
    const p = new AdsProvider("token", "MLB");
    const summary = p.buildSummary([campaign({ metrics: metrics() })], 1);
    expect(summary.derived.roas).toBeNull();
    expect(summary.derived.acos).toBeNull();
    expect(summary.derived.conversionRate).toBeNull();
    expect(summary.derived.organicShare).toBeNull();
  });
});

describe("buildAdsInsights", () => {
  const baseSummary = {
    advertiserId: 1,
    currency: "BRL",
    campaignCount: 1,
    activeCampaignCount: 1,
    metrics: metrics(),
    derived: { roas: null, acos: null, conversionRate: null, totalBudget: 0, organicShare: null },
  };

  it("flags a campaign whose ACOS is well above its target as critical", () => {
    const c = campaign({ id: 7, name: "Cara", acosTarget: 15, metrics: metrics({ cost: 50, acos: 40 }) });
    const out = buildAdsInsights(baseSummary, [c], []);
    const critical = out.find((i) => i.id === "acos-over-7");
    expect(critical).toBeDefined();
    expect(critical?.severity).toBe("critical");
  });

  it("warns about ads spending with zero sales and quantifies wasted spend", () => {
    const ads = [ad({ itemId: "A", metrics: metrics({ cost: 30, units: 0 }) }), ad({ itemId: "B", metrics: metrics({ cost: 10, units: 0 }) })];
    const out = buildAdsInsights(baseSummary, [], ads);
    const waste = out.find((i) => i.id === "ads-zero-sales");
    expect(waste).toBeDefined();
    expect(waste?.metric?.value).toContain("40"); // 30 + 10
  });

  it("suggests scaling winners with low ACOS and real sales", () => {
    const ads = [ad({ itemId: "W", metrics: metrics({ cost: 20, units: 8, acos: 8 }) })];
    const out = buildAdsInsights(baseSummary, [], ads);
    expect(out.find((i) => i.id === "ads-scale-winners")?.severity).toBe("good");
  });

  it("surfaces the organic halo when organic share is positive", () => {
    const summary = { ...baseSummary, derived: { ...baseSummary.derived, organicShare: 36 } };
    const out = buildAdsInsights(summary, [], []);
    expect(out.find((i) => i.id === "organic-halo")?.severity).toBe("info");
  });

  it("does not invent insights when everything is healthy and empty", () => {
    const out = buildAdsInsights(baseSummary, [campaign({ metrics: metrics() })], []);
    expect(out).toHaveLength(0);
  });
});
