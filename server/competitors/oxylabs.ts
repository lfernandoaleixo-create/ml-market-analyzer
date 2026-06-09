/**
 * Oxylabs provider — Web Scraper API (Realtime).
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  SECURITY BOUNDARY: isolated from the ML seller account. Only public search
 *  keywords / public Mercado Livre URLs are sent. Credentials used are the
 *  dedicated OXYLABS_USERNAME / OXYLABS_PASSWORD (basic auth) — nothing else.
 *  This module MUST NOT import anything from `../ml/*`, OAuth tokens, cookies,
 *  the CNPJ or any seller identity.
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  HOW IT WORKS (and why this shape)
 *  Mercado Livre's public search page renders its product grid via JavaScript
 *  and actively blocks plain/datacenter requests — a non-rendered fetch (or the
 *  public JSON API through a datacenter IP) comes back EMPTY (Oxylabs internal
 *  status 613). The combination that reliably returns the FULL grid is:
 *    - source: "universal"
 *    - render: "html"  (headless browser)
 *    - browser_instructions: wait for the product cards, then scroll to trigger
 *      lazy hydration.
 *  This was confirmed live: it returns ~2.2MB of HTML with 300+ "poly-card"
 *  nodes. We then parse that HTML with the SAME shared parser ScrapingBee uses
 *  (see ./mlSearchParser.ts), so both sources speak one normalized shape and
 *  ML DOM changes are fixed in exactly one place.
 *
 * Endpoint: POST https://realtime.oxylabs.io/v1/queries
 */

import { ENV } from "../_core/env";
import type { RawSourceOffer } from "@shared/sources";
import { ProviderError, withRetry, type FetchLike } from "./providerHttp";
import { parseMlSearchHtml, buildMlSearchUrl } from "./mlSearchParser";
import { looksLikeEmptySearch } from "./scrapingbee";

const ENDPOINT = "https://realtime.oxylabs.io/v1/queries";
const SOURCE = "oxylabs";

// The ML search URL + HTML parser are shared with the ScrapingBee provider.
export { buildMlSearchUrl };

/** Are Oxylabs credentials configured on the server? */
export function isConfigured(): boolean {
  return Boolean(
    ENV.oxylabsUsername &&
      ENV.oxylabsUsername.trim().length > 0 &&
      ENV.oxylabsPassword &&
      ENV.oxylabsPassword.trim().length > 0,
  );
}

function basicAuthHeader(): string {
  const token = Buffer.from(
    `${ENV.oxylabsUsername.trim()}:${ENV.oxylabsPassword.trim()}`,
  ).toString("base64");
  return `Basic ${token}`;
}

/**
 * Browser instructions that force the ML SPA to hydrate its product grid.
 * Exported for testing/inspection. We wait for either the poly-card or the
 * legacy search-result item, then scroll to trigger any lazy loading.
 */
export const BROWSER_INSTRUCTIONS = [
  {
    type: "wait_for_element",
    selector: { type: "css", value: "div.poly-card, li.ui-search-layout__item" },
    timeout_s: 15,
  },
  { type: "scroll", x: 0, y: 1200 },
  { type: "wait", wait_time_s: 2 },
];

/** Pull the rendered HTML string out of Oxylabs' realtime response envelope. */
export function extractHtml(body: any): string {
  const r0 = body?.results?.[0];
  const content = r0?.content;
  if (typeof content === "string") return content;
  // Some shapes nest the html under content.html.
  if (content && typeof content.html === "string") return content.html;
  return "";
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
    parse: false,
    render: "html",
    browser_instructions: BROWSER_INSTRUCTIONS,
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
    const html = extractHtml(body);
    // An empty/short body means ML served the headless browser a challenge or
    // skeleton page (we saw Oxylabs internal status 613 for non-rendered hits).
    // Treat it as a retryable upstream hiccup rather than "0 results".
    if (!html || html.length < 1000) {
      throw new ProviderError(SOURCE, "upstream", "Oxylabs retornou página vazia do Mercado Livre.");
    }
    const offers = parseMlSearchHtml(html, SOURCE);
    // ROBUSTNESS (mirrors ScrapingBee): a page that rendered with NO products is
    // almost always an anti-bot/challenge page, not a legitimately empty search.
    // Retry instead of contributing 0 offers and defeating triangulation.
    if (offers.length === 0 && !looksLikeEmptySearch(html)) {
      throw new ProviderError(
        SOURCE,
        "upstream",
        "Oxylabs renderizou a página sem produtos (provável challenge/anti-bot).",
      );
    }
    return offers;
  });
}
