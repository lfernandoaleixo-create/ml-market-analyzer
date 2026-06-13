import { describe, it, expect } from "vitest";
import {
  categorize,
  normalizeTitle,
  buildCategoryStats,
  diffCampaign,
  judgeCurrentConfig,
  toSnapshotLike,
  emptyMetrics,
  type CampaignSnapshotLike,
} from "./adsAudit";
import type { AdsAdRow, AdsCampaign, AdsCategoryKey, AdsMetrics } from "@shared/ads";

const LABELS: Record<AdsCategoryKey, string> = {
  espetos: "Espetos",
  manicure: "Palito de manicure",
  aroma_fibra: "Aromatizador (fibra)",
  aroma_madeira: "Aromatizador (madeira)",
  hashi: "Hashi",
  palitos_bambu: "Palitos de bambu",
  outros: "Outros",
};

function metrics(p: Partial<AdsMetrics>): AdsMetrics {
  return { ...emptyMetrics(), ...p };
}

function ad(title: string, p: Partial<AdsAdRow> = {}): AdsAdRow {
  return {
    itemId: p.itemId ?? "MLB" + Math.random().toString().slice(2, 8),
    campaignId: p.campaignId ?? 1,
    title,
    price: p.price ?? 10,
    status: p.status ?? "active",
    thumbnail: null,
    permalink: null,
    listingTypeId: "gold_pro",
    logisticType: "drop_off",
    buyBoxWinner: false,
    catalogListing: false,
    brand: null,
    imageQuality: null,
    hasDiscount: false,
    metrics: p.metrics ?? emptyMetrics(),
  };
}

function campaign(p: Partial<AdsCampaign> = {}): AdsCampaign {
  return {
    id: p.id ?? 1,
    name: p.name ?? "Campanha",
    status: p.status ?? "active",
    strategy: p.strategy ?? "PROFITABILITY",
    acosTarget: p.acosTarget ?? 15,
    roasTarget: p.roasTarget ?? null,
    budget: p.budget ?? 50,
    automaticBudget: p.automaticBudget ?? false,
    channel: "marketplace",
    dateCreated: null,
    lastUpdated: null,
    metrics: p.metrics ?? emptyMetrics(),
  };
}

describe("categorize", () => {
  it("normalizes accents and case", () => {
    expect(normalizeTitle("Espetão Churrasco")).toBe("espetao churrasco");
  });

  it("classifies the five real product families", () => {
    expect(categorize("Espeto de Bambu para Churrasco 500un")).toBe("espetos");
    expect(categorize("Palito de Manicure Profissional")).toBe("manicure");
    expect(categorize("Refil Fibra de Algodão para Aromatizador")).toBe("aroma_fibra");
    expect(categorize("Varetas de Madeira Difusor Aromatizador")).toBe("aroma_madeira");
    expect(categorize("Hashi Bambu Descartável 100 pares")).toBe("hashi");
    expect(categorize("Palito de Dente Bambu Caixa")).toBe("palitos_bambu");
  });

  it("separates aromatizador fibra from madeira", () => {
    expect(categorize("aromatizador fibra")).toBe("aroma_fibra");
    expect(categorize("aromatizador varetas de madeira")).toBe("aroma_madeira");
  });

  it("falls back to 'outros' for unknown titles", () => {
    expect(categorize("Produto qualquer sem palavra-chave")).toBe("outros");
  });
});

describe("buildCategoryStats", () => {
  it("groups ads, sums metrics and sorts by spend desc", () => {
    const ads = [
      ad("Espeto churrasco", { metrics: metrics({ cost: 100, clicks: 50, totalAmount: 400, units: 4 }) }),
      ad("Espeto bambu", { metrics: metrics({ cost: 50, clicks: 20, totalAmount: 150, units: 1 }) }),
      ad("Hashi descartável", { metrics: metrics({ cost: 10, clicks: 5, totalAmount: 0 }) }),
    ];
    const stats = buildCategoryStats(ads, LABELS);
    expect(stats[0].key).toBe("espetos");
    expect(stats[0].adCount).toBe(2);
    expect(stats[0].metrics.cost).toBe(150);
    expect(stats[0].derived.roas).toBe(round2(550 / 150));
    const hashi = stats.find((s) => s.key === "hashi")!;
    expect(hashi.derived.roas).toBe(0); // spent but no revenue -> honest 0, not null
  });
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

describe("diffCampaign", () => {
  const base: CampaignSnapshotLike = {
    campaignId: 1,
    name: "Mamba Compra de Dados",
    status: "active",
    strategy: "PROFITABILITY",
    acosTarget: 15,
    budget: 50,
    automaticBudget: false,
  };

  it("judges pausing a high-ACOS campaign as coherent", () => {
    const curr = { ...base, status: "paused" };
    const m = metrics({ cost: 100, totalAmount: 200 }); // ACOS 50% vs target 15%
    const changes = diffCampaign(base, curr, m);
    const c = changes.find((x) => x.field === "status")!;
    expect(c.verdict).toBe("coherent");
  });

  it("judges pausing a healthy campaign as questionable", () => {
    const curr = { ...base, status: "paused" };
    const m = metrics({ cost: 10, totalAmount: 200 }); // ACOS 5% within target
    const changes = diffCampaign(base, curr, m);
    const c = changes.find((x) => x.field === "status")!;
    expect(c.verdict).toBe("questionable");
  });

  it("judges raising budget with strong ROAS as coherent", () => {
    const curr = { ...base, budget: 100 };
    const m = metrics({ cost: 100, totalAmount: 500 }); // ROAS 5x
    const changes = diffCampaign(base, curr, m);
    const c = changes.find((x) => x.field === "budget")!;
    expect(c.verdict).toBe("coherent");
  });

  it("judges raising budget with weak ROAS as questionable", () => {
    const curr = { ...base, budget: 100 };
    const m = metrics({ cost: 100, totalAmount: 120 }); // ROAS 1.2x
    const changes = diffCampaign(base, curr, m);
    const c = changes.find((x) => x.field === "budget")!;
    expect(c.verdict).toBe("questionable");
  });

  it("flags lowering the ACOS target as coherent (profit focus)", () => {
    const curr = { ...base, acosTarget: 10 };
    const changes = diffCampaign(base, curr, emptyMetrics());
    const c = changes.find((x) => x.field === "acosTarget")!;
    expect(c.verdict).toBe("coherent");
  });

  it("emits no change when nothing differs", () => {
    expect(diffCampaign(base, { ...base }, emptyMetrics())).toHaveLength(0);
  });

  it("detects an automatic-budget toggle", () => {
    const curr = { ...base, automaticBudget: true };
    const changes = diffCampaign(base, curr, emptyMetrics());
    expect(changes.find((x) => x.field === "automaticBudget")).toBeTruthy();
  });
});

describe("judgeCurrentConfig", () => {
  it("flags spend without sales as questionable", () => {
    const r = judgeCurrentConfig(campaign({ metrics: metrics({ cost: 80, totalAmount: 0 }) }));
    expect(r.verdict).toBe("questionable");
  });

  it("flags ACOS well above target as questionable", () => {
    const r = judgeCurrentConfig(
      campaign({ acosTarget: 15, metrics: metrics({ cost: 100, totalAmount: 250 }) }), // ACOS 40%
    );
    expect(r.verdict).toBe("questionable");
  });

  it("approves a healthy high-ROAS active campaign", () => {
    const r = judgeCurrentConfig(
      campaign({ status: "active", acosTarget: 30, metrics: metrics({ cost: 100, totalAmount: 500 }) }),
    );
    expect(r.verdict).toBe("coherent");
  });
});

describe("toSnapshotLike", () => {
  it("maps a campaign to the snapshot shape", () => {
    const snap = toSnapshotLike(campaign({ id: 7, name: "X", budget: 33 }));
    expect(snap).toMatchObject({ campaignId: 7, name: "X", budget: 33, automaticBudget: false });
  });
});
