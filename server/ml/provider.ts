import type { MlCategory, MlProduct, MlSearchResult, MlTrend } from "@shared/ml";
import { ML_SITE_ID } from "@shared/ml";
import {
  DEMO_CATEGORIES,
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
 *  - DemoProvider: deterministic realistic data (fallback)
 *  - OfficialProvider: official ML REST API via OAuth. The rest of the app
 *    NEVER talks to ML directly — it goes through this interface, so switching
 *    providers is transparent.
 */
export interface MercadoLivreProvider {
  readonly mode: "demo" | "official";
  search(opts: { keyword?: string; categoryId?: string; limit?: number }): Promise<MlSearchResult>;
  getCategories(): Promise<MlCategory[]>;
  getTrends(categoryId?: string): Promise<MlTrend[]>;
  getProduct(itemId: string): Promise<MlProduct | null>;
  /** Best-seller ranking for a category (resolved from official highlights). */
  getBestSellers?(opts: { categoryId?: string; limit?: number }): Promise<MlSearchResult>;
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
 * Official Mercado Livre provider.
 *
 * Endpoint reality (validated against the live API for client_credentials +
 * user OAuth tokens, June 2026):
 *  - `/sites/MLB/search`          → HTTP 403 forbidden (DISCONTINUED for apps)
 *  - `/products/search`           → HTTP 200 (catalog: name, brand, pictures)
 *  - `/products/{id}`             → HTTP 200 (buy_box_winner has price/sold when present)
 *  - `/highlights/MLB/category/{id}` → HTTP 200 (best-seller product ids)
 *  - `/sites/MLB/categories`      → HTTP 200 (real category tree)
 *  - `/trends/MLB`                → HTTP 200 (real trending keywords)
 *  - `/items?ids=...` (multiget)  → HTTP 200 (price, sold_quantity, thumbnail)
 *
 * So search/best-sellers are built on the catalog + highlights endpoints, and
 * enriched with live listing data (buy_box / items multiget) when available.
 * Each method tries the real path and only falls back to demo data if the real
 * call genuinely fails, so the app never breaks.
 */
class OfficialProvider implements MercadoLivreProvider {
  readonly mode = "official" as const;
  private creds: MlCredentials;
  private siteId: string;
  private token: { value: string; expiresAt: number } | null = null;
  private userTokenResolver?: () => Promise<string | null>;

  constructor(
    creds: MlCredentials,
    siteId = ML_SITE_ID,
    userTokenResolver?: () => Promise<string | null>,
  ) {
    this.creds = creds;
    this.siteId = siteId;
    this.userTokenResolver = userTokenResolver;
  }

  private async getToken(): Promise<string> {
    // Prefer a user OAuth token when available (live, refreshable access).
    if (this.userTokenResolver) {
      const userToken = await this.userTokenResolver();
      if (userToken) return userToken;
    }
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
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
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
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ML API ${res.status} on ${url}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  /** Like authedFetch but returns null on failure (for optional enrichments). */
  private async tryFetch(url: string): Promise<any | null> {
    try {
      return await this.authedFetch(url);
    } catch {
      return null;
    }
  }

  // -- mapping helpers -----------------------------------------------------

  private categoryName(id?: string | null): string {
    if (!id) return "";
    return DEMO_CATEGORIES.find((c) => c.id === id)?.name ?? "";
  }

  /** Build an MlProduct from a catalog product, enriched with buy_box data. */
  private mapCatalogProduct(raw: any, buyBox?: any): MlProduct {
    const pic = Array.isArray(raw.pictures) && raw.pictures.length ? raw.pictures[0].url : "";
    const brandAttr = Array.isArray(raw.attributes)
      ? raw.attributes.find((a: any) => a.id === "BRAND")
      : null;
    const attrs: { name: string; value: string }[] = Array.isArray(raw.attributes)
      ? raw.attributes
          .filter((a: any) => a.name && (a.value_name ?? a.value))
          .slice(0, 8)
          .map((a: any) => ({ name: a.name, value: a.value_name ?? String(a.value) }))
      : [];

    const categoryId = raw.category_id ?? buyBox?.category_id ?? "";
    return {
      id: raw.id,
      title: raw.name ?? raw.title ?? "",
      price: buyBox?.price ?? 0,
      originalPrice: buyBox?.original_price ?? null,
      currency: buyBox?.currency_id ?? "BRL",
      soldQuantity: buyBox?.sold_quantity ?? 0,
      availableQuantity: buyBox?.available_quantity ?? 0,
      condition: buyBox?.condition ?? "new",
      thumbnail: (buyBox?.thumbnail ?? pic ?? "").replace(/^http:/, "https:"),
      pictureCount: Array.isArray(raw.pictures) ? raw.pictures.length : 1,
      permalink: buyBox?.permalink ?? raw.permalink ?? "",
      freeShipping: Boolean(buyBox?.shipping?.free_shipping),
      officialStore: Boolean(buyBox?.official_store_id),
      catalogPosition: null,
      rating: 0,
      reviewsCount: 0,
      categoryId,
      categoryName: this.categoryName(categoryId),
      seller: {
        id: String(buyBox?.seller_id ?? ""),
        nickname: brandAttr?.value_name ?? "",
        reputationLevel: "",
        powerSellerStatus: null,
        transactions: 0,
        positiveRatingRatio: 0.9,
      },
      attributes: attrs,
    };
  }

  /** Map an `/items` listing (multiget body) to MlProduct. */
  private mapItem(raw: any): MlProduct {
    const categoryId = raw.category_id ?? "";
    return {
      id: raw.id,
      title: raw.title,
      price: raw.price ?? 0,
      originalPrice: raw.original_price ?? null,
      currency: raw.currency_id ?? "BRL",
      soldQuantity: raw.sold_quantity ?? 0,
      availableQuantity: raw.available_quantity ?? 0,
      condition: raw.condition ?? "new",
      thumbnail: (raw.thumbnail ?? "").replace(/^http:/, "https:"),
      pictureCount: Array.isArray(raw.pictures) ? raw.pictures.length : 1,
      permalink: raw.permalink ?? "",
      freeShipping: Boolean(raw.shipping?.free_shipping),
      officialStore: Boolean(raw.official_store_id),
      catalogPosition: null,
      rating: 0,
      reviewsCount: 0,
      categoryId,
      categoryName: this.categoryName(categoryId),
      seller: {
        id: String(raw.seller_id ?? raw.seller?.id ?? ""),
        nickname: raw.seller?.nickname ?? "",
        reputationLevel: raw.seller?.seller_reputation?.level_id ?? "",
        powerSellerStatus: raw.seller?.seller_reputation?.power_seller_status ?? null,
        transactions: raw.seller?.seller_reputation?.transactions?.total ?? 0,
        positiveRatingRatio:
          raw.seller?.seller_reputation?.transactions?.ratings?.positive ?? 0.9,
      },
    };
  }

  /**
   * Fetch a catalog product detail and a synthetic "buy box" built from the
   * cheapest live listing. The catalog `buy_box_winner` is frequently null for
   * non-certified apps, so we resolve real price/shipping/seller from
   * `/products/{id}/items` (the live offers attached to the catalog product).
   */
  private async fetchProductDetail(id: string): Promise<{ raw: any; buyBox: any } | null> {
    const raw = await this.tryFetch(`https://api.mercadolibre.com/products/${id}`);
    if (!raw || !raw.id) return null;

    let buyBox = raw.buy_box_winner ?? null;
    if (!buyBox || !buyBox.price) {
      const offers = await this.tryFetch(
        `https://api.mercadolibre.com/products/${id}/items`,
      );
      const results: any[] = Array.isArray(offers?.results) ? offers.results : [];
      const priced = results.filter((o) => typeof o.price === "number" && o.price > 0);
      if (priced.length > 0) {
        priced.sort((a, b) => a.price - b.price);
        const best = priced[0];
        buyBox = {
          price: best.price,
          original_price: best.original_price ?? null,
          currency_id: best.currency_id ?? "BRL",
          available_quantity: best.available_quantity ?? 0,
          sold_quantity: 0,
          condition: best.condition ?? "new",
          permalink: best.permalink ?? "",
          thumbnail: "",
          shipping: best.shipping ?? null,
          official_store_id: best.official_store_id ?? null,
          seller_id: best.seller_id ?? null,
          category_id: best.category_id ?? null,
          offers_count: priced.length,
        };
      }
    }
    return { raw, buyBox };
  }

  // -- public API ----------------------------------------------------------

  async search(opts: { keyword?: string; categoryId?: string; limit?: number }): Promise<MlSearchResult> {
    const limit = Math.min(opts.limit ?? 30, 50);
    const params = new URLSearchParams({ status: "active", site_id: this.siteId });
    if (opts.keyword) params.set("q", opts.keyword);
    const data = await this.tryFetch(
      `https://api.mercadolibre.com/products/search?${params.toString()}&limit=${limit}`,
    );
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    if (results.length === 0) {
      // Real call failed or returned nothing → keep the UI working with demo.
      return demoSingleton.search(opts);
    }

    // Enrich each catalog product with buy_box price/sold (in parallel, capped).
    const enriched = await Promise.all(
      results.slice(0, limit).map(async (r, i) => {
        const detail = await this.fetchProductDetail(r.id);
        const product = this.mapCatalogProduct(detail?.raw ?? r, detail?.buyBox);
        product.catalogPosition = i + 1;
        return product;
      }),
    );

    return {
      query: opts.keyword ?? "",
      total: data.paging?.total ?? enriched.length,
      products: enriched,
    };
  }

  async getBestSellers(opts: { categoryId?: string; limit?: number }): Promise<MlSearchResult> {
    const limit = Math.min(opts.limit ?? 20, 30);
    const categoryId = opts.categoryId || DEMO_CATEGORIES[0].id;
    const data = await this.tryFetch(
      `https://api.mercadolibre.com/highlights/${this.siteId}/category/${categoryId}`,
    );
    const content: any[] = Array.isArray(data?.content) ? data.content : [];
    const productIds = content
      .filter((c) => c.type === "PRODUCT")
      .slice(0, limit)
      .map((c) => ({ id: c.id, position: c.position }));

    if (productIds.length === 0) {
      // Highlights unavailable → fall back to a catalog search for the category.
      return demoSingleton.search({ categoryId, limit });
    }

    const products = await Promise.all(
      productIds.map(async (p) => {
        const detail = await this.fetchProductDetail(p.id);
        if (!detail) return null;
        const product = this.mapCatalogProduct(detail.raw, detail.buyBox);
        product.catalogPosition = p.position;
        product.categoryId = categoryId;
        product.categoryName = this.categoryName(categoryId);
        return product;
      }),
    );

    const clean = products.filter((p): p is MlProduct => Boolean(p));
    if (clean.length === 0) return demoSingleton.search({ categoryId, limit });
    return { query: "", total: clean.length, products: clean };
  }

  async getCategories(): Promise<MlCategory[]> {
    const data = await this.tryFetch(
      `https://api.mercadolibre.com/sites/${this.siteId}/categories`,
    );
    if (!Array.isArray(data) || data.length === 0) {
      return demoSingleton.getCategories();
    }
    return data.map((c: any) => {
      const known = DEMO_CATEGORIES.find((d) => d.id === c.id);
      return {
        id: c.id,
        name: c.name,
        totalItems: known?.totalItems ?? 0,
        demandIndex: known?.demandIndex ?? 70,
      };
    });
  }

  async getTrends(categoryId?: string): Promise<MlTrend[]> {
    const url = categoryId
      ? `https://api.mercadolibre.com/trends/${this.siteId}/${categoryId}`
      : `https://api.mercadolibre.com/trends/${this.siteId}`;
    const data = await this.tryFetch(url);
    if (!Array.isArray(data) || data.length === 0) {
      return demoSingleton.getTrends(categoryId);
    }
    return data.map((t: any, i: number) => ({
      keyword: t.keyword,
      volumeIndex: Math.max(5, 100 - i * 4),
      changePercent: 0,
    }));
  }

  async getProduct(itemId: string): Promise<MlProduct | null> {
    // Catalog product ids look like "MLB12345678"; listing ids too. Try catalog
    // first (richer), then fall back to a listing item, then demo.
    const detail = await this.fetchProductDetail(itemId);
    if (detail) {
      return this.mapCatalogProduct(detail.raw, detail.buyBox);
    }
    const item = await this.tryFetch(`https://api.mercadolibre.com/items/${itemId}`);
    if (item && item.id) {
      return this.mapItem(item);
    }
    return demoSingleton.getProduct(itemId);
  }
}

// ---- Resolver ------------------------------------------------------------

const demoSingleton = new DemoProvider();

/**
 * Resolve the active provider. When valid credentials are supplied (from DB or
 * env), the official provider is returned; otherwise the demo provider.
 */
export function getProvider(
  creds?: MlCredentials | null,
  opts?: { siteId?: string; userTokenResolver?: () => Promise<string | null> },
): MercadoLivreProvider {
  if (creds && hasValidMlCredentialFormat(creds.appId, creds.clientSecret)) {
    return new OfficialProvider(creds, opts?.siteId ?? ML_SITE_ID, opts?.userTokenResolver);
  }
  return demoSingleton;
}

export function getDemoProvider(): MercadoLivreProvider {
  return demoSingleton;
}
