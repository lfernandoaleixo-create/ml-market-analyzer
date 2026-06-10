/**
 * Resilient competitor product-detail resolver (for the "Diagnóstico" feature).
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  WHY THIS EXISTS
 *  The diagnosis used to call ONLY Unwrangle's `mercado_detail`. Unwrangle is the
 *  least reliable of our four sources (it intermittently returns a soft parser
 *  error), so the whole "Por que ele vende mais?" screen failed with
 *  "Serviço de dados temporariamente instável" whenever Unwrangle hiccuped —
 *  even though the Radar (which uses Oxylabs + ScrapingBee) worked fine.
 *
 *  ML's public catalog API (`/products/{id}`) now returns 401 for anonymous
 *  proxy access, so we CANNOT rely on plain JSON endpoints. Instead we render
 *  the public product PAGE (which always loads) and parse stable signals from
 *  its HTML (Open Graph + itemprop tags): title, price, image, availability,
 *  Full/free-shipping. This mirrors exactly how the Radar already scrapes the
 *  ML search page reliably.
 *
 *  Order (first usable result wins):
 *    1. Product page rendered via ScrapingBee (render_js + wait) → parse HTML.
 *    2. Same page via Oxylabs (universal + render) → parse HTML.
 *    3. Unwrangle `mercado_detail` (legacy) as a final fallback.
 *
 *  SECURITY BOUNDARY: like every file under server/competitors, this module is
 *  isolated from the ML seller account. It only ever sends a PUBLIC product URL
 *  and uses the dedicated scraping credentials. It MUST NOT import anything from
 *  `../ml/*`, OAuth tokens, cookies, the CNPJ or any seller identity.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { ENV } from "../_core/env";
import type { CompetitorProductDetail } from "@shared/competitors";
import { ProviderError, withRetry, num, str, type FetchLike } from "./providerHttp";
import { extractHtml } from "./oxylabs";
import { getProductDetail as unwrangleProductDetail } from "./unwrangle";

const SB_ENDPOINT = "https://app.scrapingbee.com/api/v1";
const OXY_ENDPOINT = "https://realtime.oxylabs.io/v1/queries";

function scrapingBeeConfigured(): boolean {
  return Boolean(ENV.scrapingBeeApiKey && ENV.scrapingBeeApiKey.trim().length > 0);
}

function oxylabsConfigured(): boolean {
  return Boolean(
    ENV.oxylabsUsername &&
      ENV.oxylabsUsername.trim().length > 0 &&
      ENV.oxylabsPassword &&
      ENV.oxylabsPassword.trim().length > 0,
  );
}

function oxylabsAuthHeader(): string {
  const token = Buffer.from(
    `${ENV.oxylabsUsername.trim()}:${ENV.oxylabsPassword.trim()}`,
  ).toString("base64");
  return `Basic ${token}`;
}

// ── HTML parsing ────────────────────────────────────────────────────────────

function metaContent(html: string, key: string): string | null {
  // matches <meta property="og:title" content="..."> and name/itemprop variants
  const re = new RegExp(
    `<meta\\s+(?:property|name|itemprop)="${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s+content="([^"]*)"`,
    "i",
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1]).trim() || null : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú")
    .replace(/&atilde;/g, "ã")
    .replace(/&otilde;/g, "õ")
    .replace(/&ccedil;/g, "ç");
}

/** Extract price (BRL) from the page, preferring itemprop/meta price tags. */
function parsePrice(html: string): number | null {
  // itemprop="price" content="20.64"  OR  <meta property="product:price:amount" ...>
  const candidates = [
    /itemprop="price"[^>]*content="([0-9]+(?:\.[0-9]+)?)"/i,
    /<meta\s+property="product:price:amount"\s+content="([0-9]+(?:\.[0-9]+)?)"/i,
    /"price"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/i,
  ];
  for (const re of candidates) {
    const m = html.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  // Fallback: "R$ 20,64" embedded in og:title or page.
  const title = metaContent(html, "og:title") ?? "";
  const brl = (title + " " + html.slice(0, 5000)).match(/R\$\s*([0-9.]+,[0-9]{2})/);
  if (brl) return num(brl[1]);
  return null;
}

/** Title without the trailing " - R$ x" that ML appends to og:title. */
function parseTitle(html: string): string | null {
  const t =
    metaContent(html, "og:title") ??
    metaContent(html, "twitter:title") ??
    null;
  if (!t) return null;
  return t.replace(/\s*[-–]\s*R\$\s*[0-9.,]+\s*$/i, "").trim() || t.trim();
}

function parseImage(html: string): string | null {
  const img =
    metaContent(html, "og:image") ?? metaContent(html, "twitter:image") ?? null;
  return img ? img.replace(/^http:\/\//, "https://") : null;
}

/** Detect Mercado Envios Full / free shipping signals in the page. */
function parseSellerLabels(html: string): string[] {
  const labels: string[] = [];
  const lower = html.toLowerCase();
  if (/\bfull\b/.test(lower) && /mercado\s*envios|fulfillment|"full"/.test(lower)) {
    labels.push("FULL");
  }
  if (/frete\s*gr[áa]tis|free_shipping|"free_shipping":\s*true/.test(lower)) {
    labels.push("Frete grátis");
  }
  if (/mercadol[íi]der|mercado l[íi]der/.test(lower)) {
    labels.push("MercadoLíder");
  }
  return Array.from(new Set(labels));
}

/** Build a CompetitorProductDetail from rendered product-page HTML. */
export function parseListingHtml(
  html: string,
  productUrl: string,
): CompetitorProductDetail | null {
  if (!html || html.length < 500) return null;
  const name = parseTitle(html);
  const image = parseImage(html);
  const price = parsePrice(html);
  // Need at least a name and (price or image) to be useful.
  if (!name || (price == null && !image)) return null;

  const availability = metaContent(html, "og:availability");
  const isAvailable =
    availability != null ? /instock|in stock|disponivel/i.test(availability) : null;

  return {
    name,
    url:
      metaContent(html, "og:url")?.replace(/^http:\/\//, "https://") ?? productUrl,
    image,
    price,
    listingPrice: price,
    currency: "BRL",
    currencySymbol: "R$",
    brand: metaContent(html, "product:brand"),
    description: metaContent(html, "og:description"),
    rating: null,
    totalRatings: null,
    images: image ? [image] : [],
    isAvailable,
    state: null,
    soldBy: null,
    sellerSales: null,
    sellerLabels: parseSellerLabels(html),
    remainingCredits: null,
  };
}

// ── Page fetchers (rendered HTML) ────────────────────────────────────────────

async function fetchPageViaScrapingBee(targetUrl: string, fetchImpl: FetchLike): Promise<string> {
  const url = new URL(SB_ENDPOINT);
  url.searchParams.set("api_key", ENV.scrapingBeeApiKey.trim());
  url.searchParams.set("url", targetUrl);
  url.searchParams.set("render_js", "true");
  url.searchParams.set("premium_proxy", "true");
  url.searchParams.set("country_code", "br");
  url.searchParams.set("wait", "2500");

  return withRetry("scrapingbee", async () => {
    let res: Response;
    try {
      res = await fetchImpl(url.toString(), { method: "GET" });
    } catch {
      throw new ProviderError("scrapingbee", "upstream", "Falha de rede ao contatar a ScrapingBee.");
    }
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError("scrapingbee", "auth", "Credenciais da ScrapingBee inválidas.");
    }
    if (res.status === 402) {
      throw new ProviderError("scrapingbee", "credits", "Créditos da ScrapingBee esgotados.");
    }
    if (res.status >= 500) {
      throw new ProviderError("scrapingbee", "upstream", "ScrapingBee temporariamente indisponível.");
    }
    const html = await res.text().catch(() => "");
    if (!html || html.length < 500) {
      throw new ProviderError("scrapingbee", "upstream", "Página vazia retornada pela ScrapingBee.");
    }
    return html;
  });
}

async function fetchPageViaOxylabs(targetUrl: string, fetchImpl: FetchLike): Promise<string> {
  const payload = {
    source: "universal",
    url: targetUrl,
    geo_location: "Brazil",
    render: "html",
  };

  return withRetry("oxylabs", async () => {
    let res: Response;
    try {
      res = await fetchImpl(OXY_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: oxylabsAuthHeader(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new ProviderError("oxylabs", "upstream", "Falha de rede ao contatar a Oxylabs.");
    }
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError("oxylabs", "auth", "Credenciais da Oxylabs inválidas.");
    }
    if (res.status === 402) {
      throw new ProviderError("oxylabs", "credits", "Créditos da Oxylabs esgotados.");
    }
    if (res.status >= 500) {
      throw new ProviderError("oxylabs", "upstream", "Oxylabs temporariamente indisponível.");
    }
    const body = await res.json().catch(() => null);
    const html = extractHtml(body);
    if (!html || html.length < 500) {
      throw new ProviderError("oxylabs", "upstream", "Página vazia retornada pela Oxylabs.");
    }
    return html;
  });
}

/** True when the detail has enough signal to be worth showing. */
function isUsableDetail(d: CompetitorProductDetail | null): d is CompetitorProductDetail {
  return Boolean(d && d.name && (d.price != null || d.image));
}

/**
 * Resolve the competitor product detail resiliently.
 * Order: product page via ScrapingBee → Oxylabs → Unwrangle fallback.
 * `fetchImpl` is injectable for tests.
 */
export async function getCompetitorDetail(
  productUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<CompetitorProductDetail> {
  const errors: string[] = [];

  const pageProxies: Array<{ name: string; configured: boolean; run: () => Promise<string> }> = [
    {
      name: "scrapingbee",
      configured: scrapingBeeConfigured(),
      run: () => fetchPageViaScrapingBee(productUrl, fetchImpl),
    },
    {
      name: "oxylabs",
      configured: oxylabsConfigured(),
      run: () => fetchPageViaOxylabs(productUrl, fetchImpl),
    },
  ];

  for (const proxy of pageProxies) {
    if (!proxy.configured) continue;
    try {
      const html = await proxy.run();
      const detail = parseListingHtml(html, productUrl);
      if (isUsableDetail(detail)) {
        console.log(`[diagnose] detail via page/${proxy.name}`);
        return detail;
      }
      errors.push(`${proxy.name}: HTML sem dados úteis`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${proxy.name}: ${msg}`);
    }
  }

  // Final fallback: Unwrangle (legacy, least reliable).
  try {
    const detail = await unwrangleProductDetail(productUrl, fetchImpl);
    if (isUsableDetail(detail)) {
      console.log(`[diagnose] detail via Unwrangle fallback`);
      return detail;
    }
    errors.push("unwrangle: detalhe sem dados úteis");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`unwrangle: ${msg}`);
  }

  console.warn(`[diagnose] all sources failed: ${errors.join(" | ")}`);
  throw new ProviderError(
    "diagnose",
    "upstream",
    "Não foi possível obter os dados deste anúncio agora. As fontes de dados estão instáveis no momento — tente novamente em alguns instantes.",
  );
}
