/**
 * ScrapingProvider — real Mercado Livre market data WITHOUT the official API.
 *
 * It implements the same `MercadoLivreProvider` contract used by the demo and
 * official providers, but sources its data from the multi-source competitor
 * orchestrator (Oxylabs / ScrapingBee / Unwrangle / public official search).
 *
 * This lets "Buscar produtos" and "Mais vendidos" show REAL photos and prices
 * from the public ML search even before the seller connects the official API.
 *
 * HONESTY RULES (the UI depends on these flags to avoid faking data):
 *  - price:  taken from the triangulated consensus. priceAvailable = value!=null.
 *  - sales:  the public SEARCH page does NOT expose a reliable sold_quantity, so
 *            salesAvailable=false and soldQuantity=0 here. Real "sales over time"
 *            is delivered by the detail+monitoring layer (separate feature), not
 *            invented from the search card.
 *  - rating: only set when a source reported it (ratingAvailable accordingly).
 *
 * SECURITY: this provider only ever passes a PUBLIC keyword to the orchestrator.
 * It never touches the seller's account, token, cookies or identity.
 */

import type {
  MlCategory,
  MlProduct,
  MlSearchResult,
  MlTrend,
} from "@shared/ml";
import type { UnifiedCompetitor } from "@shared/sources";
import { searchAllSources, sourceConfigFlags } from "../competitors/orchestrator";
import { strengthScore } from "../competitors/aggregator";
import { getDemoCategories, getDemoTrends, DEMO_CATEGORIES } from "./demoData";
import type { MercadoLivreProvider } from "./provider";
import { getProductDetail, isConfigured as unwrangleConfigured } from "../competitors/unwrangle";
import { parsePastSales } from "../competitors/diagnosis";
import type { CompetitorProductDetail } from "@shared/competitors";

/** True when at least one SCRAPER source (not just official) is configured. */
export function hasScrapingSources(): boolean {
  const f = sourceConfigFlags();
  return f.unwrangle || f.oxylabs || f.scrapingbee;
}

/** Derive a stable numeric-ish id from a competitor match key / url. */
function deriveId(c: UnifiedCompetitor): string {
  // Prefer an MLB id parsed from the URL when present (stable across sources).
  const fromUrl = c.url?.match(/MLB-?(\d{6,})/i)?.[1];
  if (fromUrl) return `MLB${fromUrl}`;
  return `SCR-${c.matchKey}`.slice(0, 48);
}

/** Map a triangulated competitor to the provider-agnostic MlProduct shape. */
export function unifiedToMlProduct(c: UnifiedCompetitor, position: number): MlProduct {
  const price = c.price.value;
  const listing = c.listingPrice.value;
  const rating = c.rating.value;
  const totalRatings = c.totalRatings.value;
  const attrs: { name: string; value: string }[] = [];
  if (c.hasCoupon?.value === true) attrs.push({ name: "Cupom", value: "Sim" });
  if (c.sponsored?.value === true) attrs.push({ name: "Patrocinado", value: "Sim" });
  if (c.brand.value) attrs.push({ name: "Marca", value: c.brand.value });

  return {
    id: deriveId(c),
    title: c.name,
    price: price ?? 0,
    originalPrice: listing && price && listing > price ? listing : null,
    currency: "BRL",
    // Public search cards do not expose a trustworthy lifetime sold_quantity.
    soldQuantity: 0,
    availableQuantity: 0,
    condition: "new",
    thumbnail: (c.thumbnail ?? "").replace(/^http:/, "https:"),
    pictureCount: c.thumbnail ? 1 : 0,
    permalink: c.url ?? "",
    freeShipping: c.freeShipping.value === true,
    officialStore: c.officialStore?.value === true,
    catalogPosition: position,
    rating: rating ?? 0,
    reviewsCount: totalRatings ?? 0,
    categoryId: "",
    categoryName: "",
    seller: {
      id: "",
      nickname: c.brand.value ?? "",
      reputationLevel: "",
      powerSellerStatus: null,
      transactions: 0,
      positiveRatingRatio: 0.9,
    },
    attributes: attrs,
    priceAvailable: price != null,
    salesAvailable: false,
    ratingAvailable: rating != null,
    offersCount: price != null ? 1 : 0,
    priceIsFrom: false,
  };
}

export class ScrapingProvider implements MercadoLivreProvider {
  readonly mode = "demo" as const; // wire-compatible: the UI treats non-official as best-effort

  /** A short in-process cache so repeated tabs don't re-trigger a full scrape. */
  private static cache = new Map<string, { at: number; result: MlSearchResult }>();
  /** Maps a derived product id -> its public permalink, to resolve detail by id. */
  private static idToUrl = new Map<string, string>();
  private static TTL_MS = 5 * 60_000;

  private cacheKey(keyword?: string, categoryId?: string, limit?: number): string {
    return `${(keyword ?? "").toLowerCase().trim()}|${categoryId ?? ""}|${limit ?? 30}`;
  }

  /** Resolve the effective public keyword: explicit keyword, else category name. */
  private keywordFor(keyword?: string, categoryId?: string): string {
    if (keyword && keyword.trim()) return keyword.trim();
    const cat = DEMO_CATEGORIES.find((c) => c.id === categoryId);
    return cat?.name ?? "";
  }

  async search(opts: { keyword?: string; categoryId?: string; limit?: number }): Promise<MlSearchResult> {
    const limit = Math.min(opts.limit ?? 30, 50);
    const keyword = this.keywordFor(opts.keyword, opts.categoryId);
    if (!keyword) return { query: "", total: 0, products: [] };

    const key = this.cacheKey(keyword, opts.categoryId, limit);
    const cached = ScrapingProvider.cache.get(key);
    if (cached && Date.now() - cached.at < ScrapingProvider.TTL_MS) {
      return cached.result;
    }

    const unified = await searchAllSources(keyword);
    const ranked = [...unified.competitors].sort((a, b) => strengthScore(b) - strengthScore(a));
    const products = ranked.slice(0, limit).map((c, i) => unifiedToMlProduct(c, i + 1));
    // Remember id -> permalink so getProduct() can fetch a real detail by id.
    for (const p of products) {
      if (p.permalink) ScrapingProvider.idToUrl.set(p.id, p.permalink);
    }

    const result: MlSearchResult = {
      query: keyword,
      total: products.length,
      products,
    };
    ScrapingProvider.cache.set(key, { at: Date.now(), result });
    return result;
  }

  /** Best sellers == strongest competitors for the category keyword. */
  async getBestSellers(opts: { categoryId?: string; limit?: number }): Promise<MlSearchResult> {
    return this.search({ categoryId: opts.categoryId, limit: opts.limit });
  }

  async getCategories(): Promise<MlCategory[]> {
    // Category tree is navigational; real per-category counts are not available
    // from the public search, so reuse the curated demand index for navigation.
    return getDemoCategories();
  }

  async getTrends(categoryId?: string): Promise<MlTrend[]> {
    return getDemoTrends(categoryId);
  }

  async getProduct(itemId: string): Promise<MlProduct | null> {
    // 1) Look the product up in the most recent cached searches by derived id.
    for (const entry of Array.from(ScrapingProvider.cache.values())) {
      const found = entry.result.products.find((p: MlProduct) => p.id === itemId);
      if (found) {
        // Enrich with a real detail (sales) when we have a permalink + Unwrangle.
        const enriched = await this.tryEnrichWithDetail(found);
        return enriched ?? found;
      }
    }
    // 2) Not cached: if we know its URL (or it's an MLB id), fetch a real detail.
    const url = ScrapingProvider.idToUrl.get(itemId);
    if (url && unwrangleConfigured()) {
      try {
        const d = await getProductDetail(url);
        return detailToMlProduct(itemId, d);
      } catch {
        return null;
      }
    }
    return null;
  }

  /** Best-effort: add real sales to a cached product via the detail endpoint. */
  private async tryEnrichWithDetail(p: MlProduct): Promise<MlProduct | null> {
    if (!p.permalink || !unwrangleConfigured()) return null;
    try {
      const d = await getProductDetail(p.permalink);
      const merged = detailToMlProduct(p.id, d);
      // Keep the search-derived fields, override with real detail where present.
      return {
        ...p,
        soldQuantity: merged.soldQuantity,
        salesAvailable: merged.salesAvailable,
        price: merged.priceAvailable ? merged.price : p.price,
        priceAvailable: merged.priceAvailable || p.priceAvailable,
        rating: merged.ratingAvailable ? merged.rating : p.rating,
        reviewsCount: merged.ratingAvailable ? merged.reviewsCount : p.reviewsCount,
        ratingAvailable: merged.ratingAvailable || p.ratingAvailable,
        pictureCount: Math.max(p.pictureCount, merged.pictureCount),
        officialStore: p.officialStore || merged.officialStore,
      };
    } catch {
      return null;
    }
  }
}

/** Map a real Unwrangle product detail to MlProduct, with HONEST sales flags. */
export function detailToMlProduct(id: string, d: CompetitorProductDetail): MlProduct {
  const sales = parsePastSales(d.sellerSales);
  const price = d.price;
  const isFull = (d.sellerLabels ?? []).some((l) => /full/i.test(l));
  const isOfficial = (d.sellerLabels ?? []).some((l) => /loja oficial/i.test(l));
  return {
    id,
    title: d.name,
    price: price ?? 0,
    originalPrice: d.listingPrice && price && d.listingPrice > price ? d.listingPrice : null,
    currency: d.currency ?? "BRL",
    soldQuantity: sales ?? 0,
    availableQuantity: 0,
    condition: "new",
    thumbnail: (d.image ?? d.images?.[0] ?? "").replace(/^http:/, "https:"),
    pictureCount: Array.isArray(d.images) ? d.images.length : d.image ? 1 : 0,
    permalink: d.url ?? "",
    freeShipping: false,
    officialStore: isOfficial,
    catalogPosition: null,
    rating: d.rating ?? 0,
    reviewsCount: d.totalRatings ?? 0,
    categoryId: "",
    categoryName: "",
    seller: {
      id: "",
      nickname: d.soldBy ?? d.brand ?? "",
      reputationLevel: (d.sellerLabels ?? []).some((l) => /mercadol[ií]der/i.test(l)) ? "5_green" : "",
      powerSellerStatus: null,
      transactions: 0,
      positiveRatingRatio: 0.9,
    },
    attributes: [
      ...(isFull ? [{ name: "FULL", value: "Sim" }] : []),
      ...(d.brand ? [{ name: "Marca", value: d.brand }] : []),
    ],
    priceAvailable: price != null,
    salesAvailable: sales != null,
    ratingAvailable: d.rating != null,
    offersCount: price != null ? 1 : 0,
    priceIsFrom: false,
  };
}
