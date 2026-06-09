/**
 * Oxylabs provider — Web Scraper API (Realtime).
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  SECURITY BOUNDARY: isolated from the ML seller account. Only public search
 *  keywords / public Mercado Livre URLs are sent. Credentials used are the
 *  dedicated OXYLABS_USERNAME / OXYLABS_PASSWORD (basic auth) — nothing else.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Endpoint: POST https://realtime.oxylabs.io/v1/queries
 * Payload:  { source: "universal", url, geo_location, parse, render }
 *
 * We point at Mercado Livre Brasil's public search page and request parsed
 * output. Because parser shapes vary, the mapper is defensive: it tries the
 * structured `content.results` first and degrades gracefully.
 */

import { ENV } from "../_core/env";
import type { RawSourceOffer } from "@shared/sources";
import { ProviderError, withRetry, num, str, type FetchLike } from "./providerHttp";

const ENDPOINT = "https://realtime.oxylabs.io/v1/queries";
const SOURCE = "oxylabs";

/** Are Oxylabs credentials configured on the server? */
export function isConfigured(): boolean {
  return Boolean(
    ENV.oxylabsUsername &&
      ENV.oxylabsUsername.trim().length > 0 &&
      ENV.oxylabsPassword &&
      ENV.oxylabsPassword.trim().length > 0,
  );
}

/** Public Mercado Livre Brasil search URL for a keyword. */
export function buildMlSearchUrl(query: string): string {
  const slug = encodeURIComponent(query.trim()).replace(/%20/g, "-");
  return `https://lista.mercadolivre.com.br/${slug}`;
}

function basicAuthHeader(): string {
  const token = Buffer.from(
    `${ENV.oxylabsUsername.trim()}:${ENV.oxylabsPassword.trim()}`,
  ).toString("base64");
  return `Basic ${token}`;
}

/**
 * Normalize a single Oxylabs parsed item into our RawSourceOffer. Oxylabs
 * universal e-commerce parsing typically exposes title/price/url/rating fields;
 * we read several common aliases so we are resilient to minor shape changes.
 */
export function mapOxylabsItem(raw: any): RawSourceOffer | null {
  const name = str(raw?.title) ?? str(raw?.name);
  const url = str(raw?.url) ?? str(raw?.link) ?? str(raw?.product_url);
  if (!name && !url) return null;
  const price = num(raw?.price) ?? num(raw?.price_str) ?? num(raw?.current_price);
  const listingPrice = num(raw?.price_strikethrough) ?? num(raw?.old_price) ?? num(raw?.list_price);
  const rating = num(raw?.rating) ?? num(raw?.reviews_rating) ?? num(raw?.stars);
  const totalRatings = num(raw?.reviews_count) ?? num(raw?.ratings_count) ?? num(raw?.review_count);
  const freeShippingRaw =
    raw?.free_shipping ?? raw?.shipping_free ?? raw?.is_free_shipping;
  const freeShipping =
    typeof freeShippingRaw === "boolean" ? freeShippingRaw : null;
  return {
    source: "oxylabs",
    name: name ?? "",
    url: url ?? null,
    thumbnail: str(raw?.thumbnail) ?? str(raw?.image) ?? str(raw?.image_url),
    price,
    listingPrice,
    rating,
    totalRatings,
    brand: str(raw?.brand) ?? str(raw?.manufacturer),
    freeShipping,
    sellerReputation: str(raw?.seller?.reputation) ?? str(raw?.seller_status),
  };
}

/** Pull the array of result items from various possible parsed shapes. */
function extractItems(body: any): any[] {
  const content = body?.results?.[0]?.content ?? body?.content ?? body;
  const candidates = [
    content?.results?.organic,
    content?.results,
    content?.organic,
    content?.products,
    content?.items,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c;
  }
  return [];
}

/**
 * Search Mercado Livre via Oxylabs and return normalized offers.
 * `fetchImpl` is injectable so tests can mock the network with no real creds.
 */
export async function searchOffers(
  query: string,
  fetchImpl: FetchLike = fetch,
): Promise<RawSourceOffer[]> {
  if (!isConfigured()) {
    throw new ProviderError(SOURCE, "not_configured", "Oxylabs não está configurado.");
  }

  const payload = {
    source: "universal",
    url: buildMlSearchUrl(query),
    geo_location: "Brazil",
    parse: true,
    render: "html",
  };

  return withRetry(SOURCE, async () => {
    let res: Response;
    try {
      res = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new ProviderError(SOURCE, "upstream", "Falha de rede ao contatar a Oxylabs.");
    }

    if (res.status === 401 || res.status === 403) {
      throw new ProviderError(SOURCE, "auth", "Credenciais da Oxylabs inválidas ou sem acesso.");
    }
    if (res.status === 402) {
      throw new ProviderError(SOURCE, "credits", "Créditos da Oxylabs esgotados.");
    }
    if (res.status === 400 || res.status === 422) {
      throw new ProviderError(SOURCE, "bad_input", "Requisição inválida para a Oxylabs.");
    }
    if (res.status >= 500) {
      throw new ProviderError(SOURCE, "upstream", "Oxylabs temporariamente indisponível.");
    }

    const body = await res.json().catch(() => null);
    if (!body) {
      throw new ProviderError(SOURCE, "parse", "Resposta vazia da Oxylabs.");
    }
    const items = extractItems(body);
    return items
      .map(mapOxylabsItem)
      .filter((o): o is RawSourceOffer => o !== null && Boolean(o.name));
  });
}
