import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

/**
 * Isolated tests for the ScrapingBee provider. No real network calls are made.
 * They assert:
 *  - the SECURITY boundary (only the dedicated key + a public ML URL are sent);
 *  - the HTML parser (poly-card layout) extracts products correctly;
 *  - render_js + premium proxy + country=br are requested (the only combo that
 *    returns the full ML grid);
 *  - transient/terminal HTTP errors are handled with the right retry policy.
 */

process.env.COMPETITOR_RETRY_DELAY_MS = "0";

const ORIGINAL_KEY = process.env.SCRAPINGBEE_API_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.SCRAPINGBEE_API_KEY;
  else process.env.SCRAPINGBEE_API_KEY = ORIGINAL_KEY;
  vi.resetModules();
});

async function loadModule() {
  vi.resetModules();
  return await import("./scrapingbee");
}

/** ScrapingBee returns rendered HTML as text/* — model that here. */
function htmlResponse(html: string, status = 200): Response {
  return {
    status,
    text: async () => html,
    json: async () => ({}),
  } as unknown as Response;
}

/** A minimal ML "poly-card" search page fixture (current 2026 layout). */
const ML_FIXTURE = `
<html><body>
  <div class="poly-card">
    <a class="poly-component__title" href="https://www.mercadolivre.com.br/p/MLB111">Cadeira Gamer Pro</a>
    <img src="https://img/cg.jpg" />
    <div class="andes-money-amount">
      <span class="andes-money-amount__fraction">1.299</span>
      <span class="andes-money-amount__cents">90</span>
    </div>
    <span class="poly-component__shipping">Frete grátis</span>
    <span class="poly-component__seller">Loja Oficial XYZ</span>
  </div>
  <div class="poly-card">
    <a class="poly-component__title" href="https://produto.mercadolivre.com.br/MLB-222">Mesa Simples</a>
    <img data-src="https://img/mesa.jpg" />
    <div class="andes-money-amount">
      <span class="andes-money-amount__fraction">350</span>
    </div>
    <span class="poly-component__shipping">Chega amanhã</span>
  </div>
  <div class="poly-card">
    <!-- malformed card with no title/url should be skipped -->
    <span class="andes-money-amount__fraction">10</span>
  </div>
</body></html>`.padEnd(600, " ");

describe("scrapingbee — configuration", () => {
  it("reports not configured when no key is set", async () => {
    delete process.env.SCRAPINGBEE_API_KEY;
    const mod = await loadModule();
    expect(mod.isConfigured()).toBe(false);
  });

  it("reports configured when a key is set", async () => {
    process.env.SCRAPINGBEE_API_KEY = "sb-key";
    const mod = await loadModule();
    expect(mod.isConfigured()).toBe(true);
  });

  it("throws a friendly not_configured error when searching without a key", async () => {
    delete process.env.SCRAPINGBEE_API_KEY;
    const mod = await loadModule();
    await expect(mod.searchOffers("shampoo", vi.fn())).rejects.toMatchObject({
      code: "not_configured",
    });
  });
});

describe("scrapingbee — request shape & security", () => {
  beforeEach(() => {
    process.env.SCRAPINGBEE_API_KEY = "sb-key";
  });

  it("sends the api_key + public ML url with render_js + premium proxy (no account identifiers)", async () => {
    const mod = await loadModule();
    let calledUrl = "";
    const fetchMock = vi.fn(async (url: string) => {
      calledUrl = url;
      return htmlResponse(ML_FIXTURE);
    });
    await mod.searchOffers("cadeira gamer", fetchMock as unknown as typeof fetch);
    expect(calledUrl).toContain("app.scrapingbee.com");
    expect(calledUrl).toContain("api_key=sb-key");
    expect(calledUrl).toContain("render_js=true");
    expect(calledUrl).toContain("premium_proxy=true");
    expect(calledUrl).toContain("country_code=br");
    expect(decodeURIComponent(calledUrl)).toContain("lista.mercadolivre.com.br");
    // Security: never leak any seller identity / token / cnpj.
    expect(calledUrl).not.toMatch(/Bearer|cnpj|access_token|refresh_token/i);
  });
});

describe("scrapingbee — HTML parsing (poly-card)", () => {
  beforeEach(() => {
    process.env.SCRAPINGBEE_API_KEY = "sb-key";
  });

  it("parses products with price fraction+cents, url, thumbnail and free shipping", async () => {
    const mod = await loadModule();
    const fetchMock = vi.fn(async () => htmlResponse(ML_FIXTURE));
    const offers = await mod.searchOffers("cadeira", fetchMock as unknown as typeof fetch);

    // 2 valid cards (the malformed third one is skipped).
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      source: "scrapingbee",
      name: "Cadeira Gamer Pro",
      url: "https://www.mercadolivre.com.br/p/MLB111",
      price: 1299.9,
      freeShipping: true,
      sellerReputation: "Loja Oficial XYZ",
    });
    expect(offers[0].thumbnail).toBe("https://img/cg.jpg");

    expect(offers[1]).toMatchObject({
      name: "Mesa Simples",
      price: 350,
      freeShipping: false,
    });
    expect(offers[1].thumbnail).toBe("https://img/mesa.jpg");
  });

  it("parseMlSearchHtml is pure and skips cards without name", async () => {
    const mod = await loadModule();
    const offers = mod.parseMlSearchHtml(ML_FIXTURE);
    expect(offers.every((o) => o.name.length > 0)).toBe(true);
    expect(offers).toHaveLength(2);
  });

  it("returns an empty array for a page with no products", async () => {
    const mod = await loadModule();
    const offers = mod.parseMlSearchHtml("<html><body>no results</body></html>".padEnd(600, " "));
    expect(offers).toEqual([]);
  });
});

describe("scrapingbee — error handling", () => {
  beforeEach(() => {
    process.env.SCRAPINGBEE_API_KEY = "sb-key";
  });

  it("treats 401 as terminal auth error (no retry)", async () => {
    const mod = await loadModule();
    const fetchMock = vi.fn(async () => htmlResponse("", 401));
    await expect(
      mod.searchOffers("x", fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "auth" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats 402 as terminal credits error (no retry)", async () => {
    const mod = await loadModule();
    const fetchMock = vi.fn(async () => htmlResponse("", 402));
    await expect(
      mod.searchOffers("x", fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "credits" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx up to the max attempts", async () => {
    const mod = await loadModule();
    const fetchMock = vi.fn(async () => htmlResponse("", 500));
    await expect(
      mod.searchOffers("x", fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "upstream" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("treats an empty body as a retryable upstream error", async () => {
    const mod = await loadModule();
    const fetchMock = vi.fn(async () => htmlResponse("", 200));
    await expect(
      mod.searchOffers("x", fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "upstream" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
