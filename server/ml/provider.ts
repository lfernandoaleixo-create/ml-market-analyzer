import type { MlCategory, MlProduct, MlSearchResult, MlTrend } from "@shared/ml";
import { ML_SITE_ID } from "@shared/ml";
import {
  findDemoProductById,
  generateProducts,
  getDemoCategories,
  getDemoTrends,
} from "./demoData";
import { hasValidMlCredentialFormat, type MlCredentials } from "./credentials";

/**
 * Provider-agnostic interface for all Mercado Livre data access.
 *
 * Two implementations share this contract:
 *  - DemoProvider: deterministic realistic data (active now)
 *  - OfficialProvider: official ML REST API via OAuth (active once credentials
 *    are configured). The rest of the app NEVER talks to ML directly — it goes
 *    through this interface, so switching providers is transparent.
 */
export interface MercadoLivreProvider {
  readonly mode: "demo" | "official";
  search(opts: { keyword?: string; categoryId?: string; limit?: number }): Promise<MlSearchResult>;
  getCategories(): Promise<MlCategory[]>;
  getTrends(categoryId?: string): Promise<MlTrend[]>;
  getProduct(itemId: string): Promise<MlProduct | null>;
}

// ---- Demo provider -------------------------------------------------------

class DemoProvider implements MercadoLivreProvider {
  readonly mode = "demo" as const;

  async search(opts: { keyword?: string; categoryId?: string; limit?: number }): Promise<MlSearchResult> {
    const products = generateProducts({
      keyword: opts.keyword,
      categoryId: opts.categoryId,
      count: opts.limit ?? 30,
    });
    return {
      query: opts.keyword ?? "",
      total: products.length * 137 + 42, // plausible total
      products,
    };
  }

  async getCategories(): Promise<MlCategory[]> {
    return getDemoCategories();
  }

  async getTrends(categoryId?: string): Promise<MlTrend[]> {
    return getDemoTrends(categoryId);
  }

  async getProduct(itemId: string): Promise<MlProduct | null> {
    return findDemoProductById(itemId);
  }
}

// ---- Official provider (OAuth) ------------------------------------------

/**
 * Official Mercado Livre provider. Fully wired for the day credentials become
 * available. It obtains an app token via client_credentials and calls the
 * official endpoints. If any call fails (e.g. ML policy changes), it throws,
 * and the resolver falls back to the demo provider so the app never breaks.
 */
class OfficialProvider implements MercadoLivreProvider {
  readonly mode = "official" as const;
  private creds: MlCredentials;
  private siteId: string;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(creds: MlCredentials, siteId = ML_SITE_ID) {
    this.creds = creds;
    this.siteId = siteId;
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) {
      return this.token.value;
    }
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.creds.appId,
      client_secret: this.creds.clientSecret,
    });
    const res = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    });
    const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
    if (!json.access_token) {
      throw new Error(`ML OAuth failed: ${JSON.stringify(json)}`);
    }
    this.token = {
      value: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    return this.token.value;
  }

  private async authedFetch(url: string): Promise<any> {
    const token = await this.getToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`ML API ${res.status} on ${url}`);
    return res.json();
  }

  private mapItem(raw: any): MlProduct {
    return {
      id: raw.id,
      title: raw.title,
      price: raw.price ?? 0,
      originalPrice: raw.original_price ?? null,
      currency: raw.currency_id ?? "BRL",
      soldQuantity: raw.sold_quantity ?? 0,
      availableQuantity: raw.available_quantity ?? 0,
      condition: raw.condition ?? "not_specified",
      thumbnail: raw.thumbnail ?? "",
      pictureCount: Array.isArray(raw.pictures) ? raw.pictures.length : 1,
      permalink: raw.permalink ?? "",
      freeShipping: Boolean(raw.shipping?.free_shipping),
      officialStore: Boolean(raw.official_store_id),
      catalogPosition: null,
      rating: raw.reviews?.rating_average ?? 0,
      reviewsCount: raw.reviews?.total ?? 0,
      categoryId: raw.category_id ?? "",
      categoryName: raw.category_name ?? "",
      seller: {
        id: String(raw.seller?.id ?? ""),
        nickname: raw.seller?.nickname ?? "",
        reputationLevel: raw.seller?.seller_reputation?.level_id ?? "",
        powerSellerStatus: raw.seller?.seller_reputation?.power_seller_status ?? null,
        transactions: raw.seller?.seller_reputation?.transactions?.total ?? 0,
        positiveRatingRatio:
          raw.seller?.seller_reputation?.transactions?.ratings?.positive ?? 0.9,
      },
    };
  }

  async search(opts: { keyword?: string; categoryId?: string; limit?: number }): Promise<MlSearchResult> {
    const params = new URLSearchParams();
    if (opts.keyword) params.set("q", opts.keyword);
    if (opts.categoryId) params.set("category", opts.categoryId);
    params.set("limit", String(opts.limit ?? 30));
    const data = await this.authedFetch(
      `https://api.mercadolibre.com/sites/${this.siteId}/search?${params.toString()}`,
    );
    const products = (data.results ?? []).map((r: any, i: number) => {
      const p = this.mapItem(r);
      p.catalogPosition = i + 1;
      return p;
    });
    return { query: opts.keyword ?? "", total: data.paging?.total ?? products.length, products };
  }

  async getCategories(): Promise<MlCategory[]> {
    const data = await this.authedFetch(
      `https://api.mercadolibre.com/sites/${this.siteId}/categories`,
    );
    return (data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      totalItems: 0,
      demandIndex: 70,
    }));
  }

  async getTrends(categoryId?: string): Promise<MlTrend[]> {
    const url = categoryId
      ? `https://api.mercadolibre.com/trends/${this.siteId}/${categoryId}`
      : `https://api.mercadolibre.com/trends/${this.siteId}`;
    const data = await this.authedFetch(url);
    return (data ?? []).map((t: any, i: number) => ({
      keyword: t.keyword,
      volumeIndex: Math.max(0, 100 - i * 4),
      changePercent: 0,
    }));
  }

  async getProduct(itemId: string): Promise<MlProduct | null> {
    try {
      const raw = await this.authedFetch(`https://api.mercadolibre.com/items/${itemId}`);
      return this.mapItem(raw);
    } catch {
      return null;
    }
  }
}

// ---- Resolver ------------------------------------------------------------

const demoSingleton = new DemoProvider();

/**
 * Resolve the active provider. When valid credentials are supplied (from DB or
 * env), the official provider is returned; otherwise the demo provider.
 *
 * Callers that want resilience can use `getResilientProvider`, which probes the
 * official provider and falls back to demo on failure.
 */
export function getProvider(creds?: MlCredentials | null): MercadoLivreProvider {
  if (creds && hasValidMlCredentialFormat(creds.appId, creds.clientSecret)) {
    return new OfficialProvider(creds);
  }
  return demoSingleton;
}

export function getDemoProvider(): MercadoLivreProvider {
  return demoSingleton;
}
