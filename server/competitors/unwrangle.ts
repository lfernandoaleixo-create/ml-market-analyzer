/**
 * Unwrangle client — third-party competitor intelligence provider.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  SECURITY BOUNDARY (READ BEFORE EDITING)
 * ──────────────────────────────────────────────────────────────────────────
 *  This module is intentionally ISOLATED from the user's Mercado Livre seller
 *  account. It MUST NOT import anything from `../ml/*`, `../dbMl`, OAuth tokens,
 *  cookies, the CNPJ or any seller identity. The only secret it touches is the
 *  dedicated `UNWRANGLE_API_KEY`. Every request goes to Unwrangle's public
 *  endpoint with nothing but the public search keyword / product URL. This
 *  keeps the seller account (LOJADOSRWU) completely out of the competitor data
 *  collection path.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { ENV } from "../_core/env";
import type {
  Competitor,
  CompetitorSearchResult,
  CompetitorSeller,
  CompetitorSellersResult,
  CompetitorProductDetail,
} from "@shared/competitors";

const BASE_URL = "https://data.unwrangle.com/api/getter/";

/** Thrown for recoverable, user-facing API problems (credits, auth, upstream). */
export class UnwrangleError extends Error {
  readonly code: "not_configured" | "auth" | "credits" | "upstream" | "bad_input" | "unknown";
  constructor(code: UnwrangleError["code"], message: string) {
    super(message);
    this.name = "UnwrangleError";
    this.code = code;
  }
}

/** Is the dedicated Unwrangle key configured on the server? */
export function isConfigured(): boolean {
  return Boolean(ENV.unwrangleApiKey && ENV.unwrangleApiKey.trim().length > 0);
}

type FetchLike = typeof fetch;

/**
 * Internal low-level GET against the Unwrangle getter endpoint.
 * `fetchImpl` is injectable so tests can mock the network with no real key.
 */
async function getJson(
  params: Record<string, string | number | undefined>,
  fetchImpl: FetchLike = fetch,
): Promise<any> {
  const apiKey = ENV.unwrangleApiKey.trim();
  if (!apiKey) {
    throw new UnwrangleError(
      "not_configured",
      "A API de inteligência de concorrentes ainda não está configurada.",
    );
  }

  const url = new URL(BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  let res: Response;
  try {
    res = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Token ${apiKey}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    throw new UnwrangleError(
      "upstream",
      "Não foi possível contatar o serviço de inteligência. Tente novamente em instantes.",
    );
  }

  if (res.status === 403) {
    throw new UnwrangleError(
      "credits",
      "Chave inválida ou créditos esgotados na API de inteligência de concorrentes.",
    );
  }
  if (res.status === 400) {
    throw new UnwrangleError("bad_input", "Requisição inválida para a API de inteligência.");
  }
  if (res.status >= 500) {
    throw new UnwrangleError(
      "upstream",
      "O serviço de inteligência está temporariamente indisponível. Tente novamente.",
    );
  }

  const data = await res.json().catch(() => null);
  if (!data || data.success === false) {
    throw new UnwrangleError(
      "upstream",
      (data && (data.message as string)) ||
        "O serviço de inteligência retornou uma resposta inesperada.",
    );
  }
  return data;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function mapCompetitor(raw: any): Competitor {
  return {
    name: str(raw?.name) ?? "",
    url: str(raw?.url) ?? "",
    thumbnail: str(raw?.thumbnail),
    brand: str(raw?.brand),
    price: num(raw?.price),
    listingPrice: num(raw?.listing_price),
    currency: str(raw?.currency) ?? "BRL",
    currencySymbol: str(raw?.currency_symbol) ?? "R$",
    rating: num(raw?.rating),
    totalRatings: num(raw?.total_ratings),
  };
}

function mapSeller(raw: any): CompetitorSeller {
  return {
    price: num(raw?.price),
    currency: str(raw?.currency) ?? "BRL",
    currencySymbol: str(raw?.currency_symbol) ?? "R$",
    bulkPricing: str(raw?.bulk_pricing),
    condition: str(raw?.condition),
    shipping: str(raw?.shipping),
    sellerName: str(raw?.seller_name),
    sellerId: num(raw?.seller_id),
    offerUrl: str(raw?.offer_url),
    soldQuantity: num(raw?.sold_quantity),
    pastSales: str(raw?.past_sales),
    sellerRating: str(raw?.seller_rating),
  };
}

/**
 * Score a competitor's "strength" so stronger sellers float to the top.
 * Strength is driven by social proof (ratings count + rating) since the search
 * endpoint does not expose per-seller sales. Higher = stronger.
 */
export function competitorStrength(c: Competitor): number {
  const ratings = c.totalRatings ?? 0;
  const rating = c.rating ?? 0;
  // log-scale the volume so a 10k-review listing doesn't dwarf everything,
  // then nudge by average rating.
  const volume = ratings > 0 ? Math.log10(ratings + 1) : 0;
  return volume * 10 + rating;
}

/** Active competitor search by keyword (or category term). */
export async function searchProducts(
  query: string,
  page = 1,
  fetchImpl: FetchLike = fetch,
): Promise<CompetitorSearchResult> {
  const data = await getJson(
    { platform: "mercado_search", search: query, page },
    fetchImpl,
  );
  const results: Competitor[] = Array.isArray(data?.results)
    ? data.results.map(mapCompetitor).filter((c: Competitor) => c.name && c.url)
    : [];
  results.sort((a, b) => competitorStrength(b) - competitorStrength(a));
  return {
    query,
    page,
    totalResults: num(data?.total_results),
    totalPages: num(data?.no_of_pages),
    results,
    remainingCredits: num(data?.remaining_credits),
  };
}

/** All sellers competing on a specific product page. */
export async function getProductSellers(
  productUrl: string,
  page = 1,
  fetchImpl: FetchLike = fetch,
): Promise<CompetitorSellersResult> {
  const data = await getJson(
    { platform: "mercado_sellers", url: productUrl, page },
    fetchImpl,
  );
  const sellers: CompetitorSeller[] = Array.isArray(data?.sellers)
    ? data.sellers.map(mapSeller)
    : [];
  return {
    productUrl,
    productName: str(data?.product_name),
    productImageUrl: str(data?.product_image_url),
    page,
    totalPages: num(data?.no_of_pages),
    sellers,
    remainingCredits: num(data?.remaining_credits),
  };
}

/** Full product detail for a single listing URL. */
export async function getProductDetail(
  productUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<CompetitorProductDetail> {
  const data = await getJson({ platform: "mercado_detail", url: productUrl }, fetchImpl);
  const d = data?.detail ?? {};
  return {
    name: str(d?.name) ?? "",
    url: str(d?.url) ?? productUrl,
    image: str(d?.image),
    price: num(d?.price),
    listingPrice: num(d?.listing_price),
    currency: str(d?.currency) ?? "BRL",
    currencySymbol: str(d?.currency_symbol) ?? "R$",
    brand: str(d?.brand),
    description: str(d?.description),
    rating: num(d?.rating),
    totalRatings: num(d?.total_ratings),
    images: Array.isArray(d?.images) ? d.images.filter((x: unknown) => typeof x === "string") : [],
    isAvailable: typeof d?.is_available === "boolean" ? d.is_available : null,
    state: str(d?.state),
    soldBy: str(d?.sold_by),
    sellerSales: str(d?.seller_sales),
    sellerLabels: Array.isArray(d?.seller_labels)
      ? d.seller_labels.filter((x: unknown) => typeof x === "string")
      : [],
    remainingCredits: num(data?.remaining_credits),
  };
}
