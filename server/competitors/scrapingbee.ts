/**
 * ScrapingBee provider.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  SECURITY BOUNDARY: isolated from the ML seller account. Only public search
 *  keywords / public Mercado Livre URLs are sent. The only secret used is the
 *  dedicated SCRAPINGBEE_API_KEY.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * ScrapingBee returns the RAW HTML of the requested page (GET /api/v1?api_key&url).
 * We request Mercado Livre Brasil's public search page and use ScrapingBee's
 * `extract_rules` (JSON-based CSS extraction, executed server-side by SB) to get
 * structured rows back as JSON — avoiding shipping a full HTML parser.
 *
 * Docs: https://www.scrapingbee.com/documentation/  (ai/extract rules)
 */

import { ENV } from "../_core/env";
import type { RawSourceOffer } from "@shared/sources";
import { ProviderError, withRetry, num, str, type FetchLike } from "./providerHttp";

const ENDPOINT = "https://app.scrapingbee.com/api/v1";
const SOURCE = "scrapingbee";

/** Is the ScrapingBee API key configured on the server? */
export function isConfigured(): boolean {
  return Boolean(ENV.scrapingBeeApiKey && ENV.scrapingBeeApiKey.trim().length > 0);
}

/** Public Mercado Livre Brasil search URL for a keyword. */
export function buildMlSearchUrl(query: string): string {
  const slug = encodeURIComponent(query.trim()).replace(/%20/g, "-");
  return `https://lista.mercadolivre.com.br/${slug}`;
}

/**
 * ScrapingBee extract_rules: ask SB to return an array of product rows with the
 * fields we need, parsed from the ML search results DOM. SB executes these CSS
 * selectors server-side and returns JSON.
 */
export const EXTRACT_RULES = {
  products: {
    selector: "li.ui-search-layout__item",
    type: "list",
    output: {
      name: "h2.ui-search-item__title",
      url: { selector: "a.ui-search-link", output: "@href" },
      price_fraction: "span.andes-money-amount__fraction",
      thumbnail: { selector: "img.ui-search-result-image__element", output: "@src" },
      free_shipping: "p.ui-search-item__shipping",
      seller: "span.ui-search-official-store-label",
    },
  },
};

/**
 * Normalize one extracted row into a RawSourceOffer. The price comes as a
 * "fraction" string (e.g. "1.299"); `num()` handles the BR formatting.
 */
export function mapScrapingBeeRow(raw: any): RawSourceOffer | null {
  const name = str(raw?.name);
  const url = str(raw?.url);
  if (!name && !url) return null;
  const price = num(raw?.price_fraction);
  const shippingText = str(raw?.free_shipping);
  const freeShipping = shippingText
    ? /gr[áa]tis|free/i.test(shippingText)
    : null;
  return {
    source: "scrapingbee",
    name: name ?? "",
    url: url ?? null,
    thumbnail: str(raw?.thumbnail),
    price,
    listingPrice: null,
    rating: null,
    totalRatings: null,
    brand: null,
    freeShipping,
    sellerReputation: str(raw?.seller),
  };
}

/** Extract the product rows array from ScrapingBee's JSON response. */
function extractRows(body: any): any[] {
  if (Array.isArray(body?.products)) return body.products;
  if (Array.isArray(body)) return body;
  return [];
}

/**
 * Search Mercado Livre via ScrapingBee and return normalized offers.
 * `fetchImpl` is injectable so tests can mock the network with no real key.
 */
export async function searchOffers(
  query: string,
  fetchImpl: FetchLike = fetch,
): Promise<RawSourceOffer[]> {
  if (!isConfigured()) {
    throw new ProviderError(SOURCE, "not_configured", "ScrapingBee não está configurado.");
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("api_key", ENV.scrapingBeeApiKey.trim());
  url.searchParams.set("url", buildMlSearchUrl(query));
  url.searchParams.set("render_js", "false");
  url.searchParams.set("premium_proxy", "true");
  url.searchParams.set("country_code", "br");
  url.searchParams.set("extract_rules", JSON.stringify(EXTRACT_RULES));

  return withRetry(SOURCE, async () => {
    let res: Response;
    try {
      res = await fetchImpl(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
    } catch {
      throw new ProviderError(SOURCE, "upstream", "Falha de rede ao contatar a ScrapingBee.");
    }

    if (res.status === 401) {
      throw new ProviderError(SOURCE, "auth", "Chave da ScrapingBee inválida.");
    }
    if (res.status === 402) {
      throw new ProviderError(SOURCE, "credits", "Créditos da ScrapingBee esgotados.");
    }
    if (res.status === 400) {
      throw new ProviderError(SOURCE, "bad_input", "Requisição inválida para a ScrapingBee.");
    }
    if (res.status >= 500) {
      throw new ProviderError(SOURCE, "upstream", "ScrapingBee temporariamente indisponível.");
    }

    const body = await res.json().catch(() => null);
    if (!body) {
      throw new ProviderError(SOURCE, "parse", "Resposta inesperada da ScrapingBee.");
    }
    return extractRows(body)
      .map(mapScrapingBeeRow)
      .filter((o): o is RawSourceOffer => o !== null && Boolean(o.name));
  });
}
