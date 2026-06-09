/**
 * Shared Mercado Livre search-page parser.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  WHY THIS EXISTS
 * ──────────────────────────────────────────────────────────────────────────
 *  Two independent scraper sources (ScrapingBee and Oxylabs) both fetch the
 *  SAME public Mercado Livre search page and get back the SAME JS-rendered
 *  HTML (the "poly-card" product grid). Rather than duplicate the DOM-parsing
 *  logic per provider — which drifts and rots — both providers call this single
 *  parser and only differ in HOW they obtain the HTML.
 *
 *  Keeping ML's selectors in our own, unit-tested code (instead of each
 *  provider's proprietary "extract rules") means that when ML changes its DOM
 *  we fix it in exactly one place, with one fixture-based test.
 *
 *  SECURITY: this module is pure HTML→data. It never touches the seller's ML
 *  account, tokens, cookies or identity.
 * ──────────────────────────────────────────────────────────────────────────
 */

import * as cheerio from "cheerio";
import type { RawSourceOffer, SourceId } from "@shared/sources";
import { num, str } from "./providerHttp";

/**
 * Parse a Mercado Livre search HTML page into raw offers using the current
 * "poly-card" layout. The `source` is stamped onto each offer so the
 * aggregator knows which provider contributed it.
 *
 * Exported so it can be unit-tested against an HTML fixture with no network.
 */
export function parseMlSearchHtml(html: string, source: SourceId): RawSourceOffer[] {
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
      card.find("a[href*='mercadolibre.com']").attr("href") ||
      null;
    if (url) url = url.trim();

    // Price: ML splits the integer "fraction" from "cents".
    const fraction = card.find(".andes-money-amount__fraction").first().text().trim();
    const cents = card.find(".andes-money-amount__cents").first().text().trim();
    const price =
      fraction.length > 0
        ? num(`${fraction.replace(/\./g, "")}${cents ? "," + cents : ""}`)
        : null;

    // Original (struck-through) price, when discounted: the 2nd money-amount block.
    const moneyBlocks = card.find("s .andes-money-amount__fraction");
    const listingFraction = moneyBlocks.first().text().trim();
    const listingPrice =
      listingFraction.length > 0 ? num(listingFraction.replace(/\./g, "")) : null;

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

    const sellerEl = card.find(".poly-component__seller").first();
    const seller = str(sellerEl.text());

    // ── Enrichment fields (only what ML's search DOM reliably exposes) ──
    // Official brand store: ML renders an icon with aria-label="Loja oficial".
    const officialStore = card.find('[aria-label="Loja oficial"]').length > 0;
    // FULL fulfillment: an icon/label with aria-label "Enviado pelo FULL".
    const fulfillment = card.find('[aria-label*="Full" i]').length > 0;
    // Coupon/discount pill present on the card.
    const hasCoupon = card.find(".poly-component__coupons").length > 0;
    // Sponsored/paid placement: the product link carries is_advertising=true.
    const sponsored =
      card.find('a[href*="is_advertising=true"]').length > 0 ||
      card.find('[aria-label*="Patrocinado" i]').length > 0;

    if (!name && !url) return;

    offers.push({
      source,
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
      officialStore,
      fulfillment,
      hasCoupon,
      sponsored,
    });
  });

  return offers.filter((o) => o.name.length > 0);
}

/** Public Mercado Livre Brasil search URL for a keyword (shared by providers). */
export function buildMlSearchUrl(query: string): string {
  const slug = encodeURIComponent(query.trim()).replace(/%20/g, "-");
  return `https://lista.mercadolivre.com.br/${slug}`;
}
