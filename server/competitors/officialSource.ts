/**
 * Official Mercado Livre source adapter for the triangulation layer.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  SECURITY NOTE (the ONLY sanctioned bridge to server/ml/*)
 * ──────────────────────────────────────────────────────────────────────────
 *  The competitor module is otherwise isolated from the seller account. This
 *  adapter is the single, explicit exception: it calls the official provider's
 *  PUBLIC search (catalog/highlights) to obtain competitor offers and converts
 *  them to the neutral RawSourceOffer shape. It does NOT use the seller's OAuth
 *  user token, CNPJ, cookies or identity — only the public, client-credentials
 *  search path. No seller-private data ever flows out through this source.
 * ──────────────────────────────────────────────────────────────────────────
 */

import type { RawSourceOffer } from "@shared/sources";
import type { MlProduct } from "@shared/ml";
import { getProvider } from "../ml/provider";
import { resolveEnvMlCredentials } from "../ml/credentials";

/**
 * Resolve the official provider using ONLY env client-credentials (no per-user
 * OAuth token). This keeps the competitor path on the public search endpoint
 * and free of any seller-private identity.
 */
function publicProvider() {
  return getProvider(resolveEnvMlCredentials());
}

/** The official source is "configured" whenever env credentials yield official mode. */
export function isConfigured(): boolean {
  return publicProvider().mode === "official";
}

/** Convert a public MlProduct (search result) into a neutral RawSourceOffer. */
export function mapOfficialProduct(p: MlProduct): RawSourceOffer | null {
  if (!p || !p.title) return null;
  const reputation =
    p.seller?.powerSellerStatus || p.seller?.reputationLevel || null;
  return {
    source: "official",
    name: p.title,
    url: p.permalink || null,
    thumbnail: p.thumbnail || null,
    // Only expose a price when the official API actually provided one.
    price: p.priceAvailable && p.price > 0 ? p.price : null,
    listingPrice:
      typeof p.originalPrice === "number" && p.originalPrice > 0
        ? p.originalPrice
        : null,
    // The official API does not expose ratings for non-certified apps.
    rating: p.ratingAvailable && p.rating > 0 ? p.rating : null,
    totalRatings: p.ratingAvailable && p.reviewsCount > 0 ? p.reviewsCount : null,
    brand:
      p.attributes?.find((a) => /marca|brand/i.test(a.name))?.value ?? null,
    freeShipping: typeof p.freeShipping === "boolean" ? p.freeShipping : null,
    sellerReputation: reputation,
    // The public search API response does not carry these card-level badges;
    // leave them null so triangulation simply skips them for this source.
    officialStore: typeof p.officialStore === "boolean" ? p.officialStore : null,
    fulfillment: null,
    hasCoupon: null,
    sponsored: null,
  };
}

/**
 * Search competitor offers via the official public API. Returns [] when the
 * official provider is unavailable (demo mode) so triangulation just skips it.
 */
export async function searchOffers(query: string): Promise<RawSourceOffer[]> {
  const provider = publicProvider();
  if (provider.mode !== "official") return [];
  const result = await provider.search({ keyword: query, limit: 30 });
  return result.products
    .map(mapOfficialProduct)
    .filter((o): o is RawSourceOffer => o !== null && Boolean(o.name));
}
