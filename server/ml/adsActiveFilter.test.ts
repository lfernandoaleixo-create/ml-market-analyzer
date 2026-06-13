import { describe, it, expect } from "vitest";
import { isActiveAdStatus } from "./adsProvider";
import { buildCategoryStats } from "./adsAudit";
import type { AdsAdRow, AdsCategoryKey } from "@shared/ads";

const labels = {
  espetos: "Espetos",
  manicure: "Manicure",
  aroma_fibra: "Aroma fibra",
  aroma_madeira: "Aroma madeira",
  hashi: "Hashi",
  palitos_bambu: "Palitos de bambu",
  outros: "Outros",
} as Record<AdsCategoryKey, string>;

function emptyMetrics() {
  return {
    clicks: 0, prints: 0, cost: 0, cpc: 0, ctr: 0, acos: 0, sov: 0,
    directAmount: 0, indirectAmount: 0, totalAmount: 0,
    directUnits: 0, indirectUnits: 0, units: 0, organicUnits: 0, organicItems: 0,
  };
}

function ad(title: string, status: string): AdsAdRow {
  return {
    itemId: "MLB" + Math.random().toString().slice(2, 8),
    campaignId: 1,
    title,
    price: 10,
    status,
    thumbnail: null,
    permalink: null,
    listingTypeId: null,
    logisticType: null,
    buyBoxWinner: false,
    catalogListing: false,
    brand: null,
    imageQuality: null,
    hasDiscount: false,
    metrics: emptyMetrics(),
  };
}

describe("isActiveAdStatus", () => {
  it("treats active/enabled/running as active", () => {
    expect(isActiveAdStatus("active")).toBe(true);
    expect(isActiveAdStatus("enabled")).toBe(true);
    expect(isActiveAdStatus("running")).toBe(true);
    expect(isActiveAdStatus("ACTIVE")).toBe(true);
  });

  it("treats empty/undefined as active (served ad, label omitted)", () => {
    expect(isActiveAdStatus("")).toBe(true);
    expect(isActiveAdStatus(null)).toBe(true);
    expect(isActiveAdStatus(undefined)).toBe(true);
  });

  it("excludes paused/idle/closed and other off states", () => {
    expect(isActiveAdStatus("paused")).toBe(false);
    expect(isActiveAdStatus("idle")).toBe(false);
    expect(isActiveAdStatus("closed")).toBe(false);
    expect(isActiveAdStatus("inactive")).toBe(false);
    expect(isActiveAdStatus("deleted")).toBe(false);
    expect(isActiveAdStatus(" PAUSED ")).toBe(false);
  });
});

describe("buildCategoryStats activeAdCount", () => {
  it("counts active ads robustly (not just literal 'active')", () => {
    const ads = [
      ad("Espeto de bambu", "active"),
      ad("Espeto para churrasco", "enabled"),
      ad("Espeto de madeira", "paused"),
      ad("Kit espetos", ""),
    ];
    const stats = buildCategoryStats(ads, labels);
    const espetos = stats.find((s) => s.key === "espetos");
    expect(espetos).toBeTruthy();
    expect(espetos!.adCount).toBe(4);
    // active + enabled + "" = 3 active, paused excluded
    expect(espetos!.activeAdCount).toBe(3);
  });
});
