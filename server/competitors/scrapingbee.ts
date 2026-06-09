/**
 * ScrapingBee provider.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  SECURITY BOUNDARY: isolated from the ML seller account. Only public search
 *  keywords / public Mercado Livre URLs are sent. The only secret used is the
 *  dedicated SCRAPINGBEE_API_KEY. This module MUST NOT import anything from
 *  `../ml/*`, OAuth tokens, cookies, the CNPJ or any seller identity.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * HOW IT WORKS
 *  Mercado Livre's public search page renders its product grid via JavaScript,
 *  so a plain HTTP fetch returns only a skeleton (and is usually blocked). We
 *  therefore ask ScrapingBee to render the page (render_js) through a Brazilian
 *  premium proxy (premium_proxy + country_code=br), which returns the FULL HTML
 *  including the "poly-card" product grid. We then parse that HTML server-side
 *  with cheerio using the current ML selectors and normalize each product into
 *  a RawSourceOffer.
 *
 *  This server-side parsing approach (instead of ScrapingBee's extract_rules) is
 *  deliberate: ML changes its DOM frequently, and keeping the selectors in our
 *  own code makes them easy to inspect, test and update.
 *
 * Docs: https://www.scrapingbee.com/documentation/
 */

import * as cheerio from "cheerio";
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
 * Parse a Mercado Livre search HTML page into raw offers using the current
 * "poly-card" layout. Exported so it can be unit-tested against an HTML fixture
 * without any network call.
 */
export function parseMlSearchHtml(html: string): RawSourceOffer[] {
  const $ = cheerio.load(html);
  const offers: RawSourceOffer[] = [];

  $("div.poly-card").each((_, el) => {
    const card = $(el);

    const name = card.find(".poly-component__title").first().text().trim();
    // The title is usually an anchor; fall back to any product link in the card.
    let url =
      card.find("a.poly-component__title").attr("href") ||
      card.find(".poly-component__title a").attr("href") ||
      card.find("a.poly-component__title-wrapper").attr("href") ||
      card.find("a[href*='mercadolivre.com']").attr("href") ||
      null;
    if (url) url = url.trim();

    // Price: ML splits the integer "fraction" from "cents".
    const fraction = card.find(".andes-money-amount__fraction").first().text().trim();
    const cents = card.find(".andes-money-amount__cents").first().text().trim();
    const price =
      fraction.length > 0 ? num(`${fraction.replace(/\./g, "")}${cents ? "," + cents : ""}`) : null;

    // Original (struck-through) price, when discounted: the 2nd money-amount block.
    const moneyBlocks = card.find("s .andes-money-amount__fraction");
    const listingFraction = moneyBlocks.first().text().trim();
    const listingPrice = listingFraction.length > 0 ? num(listingFraction.replace(/\./g, "")) : null;

    const thumbnail =
      card.find("img").attr("data-src") || card.find("img").attr("src") || null;

    // Rating + reviews (not present on every card).
    const ratingText = card.find(".poly-reviews__rating").first().text().trim();
    const rating = ratingText ? num(ratingText) : null;
    const reviewsText = card.find(".poly-reviews__total").first().text().trim();
    const totalRatings = reviewsText ? num(reviewsText.replace(/[()]/g, "")) : null;

    const brand =
      str(card.find(".poly-component__brand").first().text()) ??
      str(card.find(".poly-component__seller").first().text());

    const shippingText = card.find(".poly-component__shipping").first().text().trim();
    const freeShipping = shippingText ? /gr[áa]tis|free/i.test(shippingText) : null;

    const seller = str(card.find(".poly-component__seller").first().text());

    if (!name && !url) return;

    offers.push({
      source: "scrapingbee",
      name: name ?? "",
      url: url ?? null,
      thumbnail: thumbnail ? thumbnail.trim() : null,
      price,
      listingPrice,
      rating,
      totalRatings,
      brand,
      freeShipping,
      sellerReputation: seller,
    });
  });

  return offers.filter((o) => o.name.length > 0);
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
  // Render JS + Brazilian premium proxy is the ONLY combination that returns the
  // full ML product grid (plain/JS-only requests are blocked or skeleton-only).
  url.searchParams.set("render_js", "true");
  url.searchParams.set("premium_proxy", "true");
  url.searchParams.set("country_code", "br");
  // Block heavy resources (images/CSS/fonts) so the page renders ~3x faster.
  // The product grid is plain DOM, so blocking media does not lose any data.
  url.searchParams.set("block_resources", "true");
  // Small fixed wait for the SPA to hydrate the product grid. Measured ~37s end
  // to end with 60 products. NOTE: `wait_for` is unreliable with premium_proxy
  // on this target (it hangs), so we use a short fixed `wait` instead.
  url.searchParams.set("wait", "1500");
  // We want the rendered HTML back (not JSON), so no extract_rules here.

  return withRetry(SOURCE, async () => {
    let res: Response;
    try {
      res = await fetchImpl(url.toString(), { method: "GET" });
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
      // SB returns 500 when the upstream target blocks the request — retryable.
      throw new ProviderError(SOURCE, "upstream", "ScrapingBee temporariamente indisponível.");
    }

    const html = await res.text().catch(() => "");
    if (!html || html.length < 500) {
      throw new ProviderError(SOURCE, "upstream", "Resposta vazia da ScrapingBee.");
    }
    return parseMlSearchHtml(html);
  });
}
