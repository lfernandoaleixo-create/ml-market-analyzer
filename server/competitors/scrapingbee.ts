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

import { ENV } from "../_core/env";
import type { RawSourceOffer } from "@shared/sources";
import { ProviderError, withRetry, type FetchLike } from "./providerHttp";
import { parseMlSearchHtml, buildMlSearchUrl } from "./mlSearchParser";

const ENDPOINT = "https://app.scrapingbee.com/api/v1";
const SOURCE = "scrapingbee";

/**
 * Heavy JS-render scrapers take ~55s per attempt, so we cap retries low: at most
 * 2 attempts (≈110s worst case) keeps a single source within the orchestrator's
 * 150s per-source budget. Overridable via env for tuning.
 */
const SB_MAX_ATTEMPTS = (() => {
  const raw = process.env.SCRAPINGBEE_MAX_ATTEMPTS;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 2;
})();

/** Is the ScrapingBee API key configured on the server? */
export function isConfigured(): boolean {
  return Boolean(ENV.scrapingBeeApiKey && ENV.scrapingBeeApiKey.trim().length > 0);
}

// The ML search URL and HTML parser are shared with the Oxylabs provider — both
// render the same public page; see ./mlSearchParser.ts.
export { buildMlSearchUrl };

/**
 * Heuristic: does this rendered HTML look like a LEGITIMATELY empty ML search
 * ("no results found") rather than a blocked/challenge page? Mercado Livre's
 * zero-result page contains a recognizable "não encontramos" / "sem resultados"
 * banner. If those markers are present we accept 0 offers; otherwise a 0-offer
 * render is treated as a proxy hiccup and retried.
 */
export function looksLikeEmptySearch(html: string): boolean {
  const h = html.toLowerCase();
  return (
    h.includes("não encontramos") ||
    h.includes("nao encontramos") ||
    h.includes("sem resultados") ||
    h.includes("no encontramos") ||
    h.includes("ui-search-rescue") || // ML's "no results" rescue component
    h.includes("did not match any")
  );
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
    const offers = parseMlSearchHtml(html, SOURCE);
    // ROBUSTNESS: a 200 that rendered but yielded ZERO products almost always
    // means the premium proxy served an anti-bot / challenge page rather than a
    // legitimately empty search (real ML keywords nearly always return items).
    // We saw this intermittently in live triangulation. Treat it as a retryable
    // upstream hiccup so `withRetry` gives it another proxy instead of silently
    // contributing 0 offers and defeating triangulation.
    if (offers.length === 0 && !looksLikeEmptySearch(html)) {
      throw new ProviderError(
        SOURCE,
        "upstream",
        "ScrapingBee renderizou a página sem produtos (provável proxy bloqueado).",
      );
    }
    return offers;
  }, SB_MAX_ATTEMPTS);
}
