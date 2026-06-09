import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

/**
 * Isolated tests for the ScrapingBee provider. No real network calls are made.
 * They assert the SECURITY boundary: the only secret sent is the dedicated
 * SCRAPINGBEE_API_KEY and the only target is a public Mercado Livre URL.
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

function jsonResponse(body: unknown, status = 200): Response {
  return {
    status,
    json: async () => body,
  } as unknown as Response;
}

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

describe("scrapingbee — search & mapping", () => {
  beforeEach(() => {
    process.env.SCRAPINGBEE_API_KEY = "sb-key";
  });

  it("sends the api_key + public ML url only (no account identifiers)", async () => {
    const mod = await loadModule();
    let calledUrl = "";
    const fetchMock = vi.fn(async (url: string) => {
      calledUrl = url;
      return jsonResponse({ products: [] });
    });
    await mod.searchOffers("cadeira gamer", fetchMock as unknown as typeof fetch);
    expect(calledUrl).toContain("app.scrapingbee.com");
    expect(calledUrl).toContain("api_key=sb-key");
    expect(decodeURIComponent(calledUrl)).toContain("lista.mercadolivre.com.br");
    expect(calledUrl).not.toMatch(/Bearer|cnpj|access_token/i);
  });

  it("maps product rows (price fraction + free shipping detection)", async () => {
    const mod = await loadModule();
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        products: [
          {
            name: "Cadeira Gamer Pro",
            url: "https://www.mercadolivre.com.br/p/MLB999",
            price_fraction: "1.299",
            free_shipping: "Frete grátis",
            thumbnail: "https://img/cg.jpg",
            seller: "Loja Oficial",
          },
        ],
      }),
    );
    const offers = await mod.searchOffers("cadeira", fetchMock as unknown as typeof fetch);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      source: "scrapingbee",
      name: "Cadeira Gamer Pro",
      price: 1299,
      freeShipping: true,
      sellerReputation: "Loja Oficial",
    });
  });

  it("sets freeShipping=false when shipping text is not free", async () => {
    const mod = await loadModule();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ products: [{ name: "X", url: "u", free_shipping: "R$ 20" }] }),
    );
    const offers = await mod.searchOffers("x", fetchMock as unknown as typeof fetch);
    expect(offers[0].freeShipping).toBe(false);
  });

  it("treats 401 as terminal auth error (no retry)", async () => {
    const mod = await loadModule();
    const fetchMock = vi.fn(async () => jsonResponse({}, 401));
    await expect(
      mod.searchOffers("x", fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "auth" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats 402 as terminal credits error (no retry)", async () => {
    const mod = await loadModule();
    const fetchMock = vi.fn(async () => jsonResponse({}, 402));
    await expect(
      mod.searchOffers("x", fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "credits" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx up to the max attempts", async () => {
    const mod = await loadModule();
    const fetchMock = vi.fn(async () => jsonResponse({}, 500));
    await expect(
      mod.searchOffers("x", fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "upstream" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("scrapingbee — mapScrapingBeeRow", () => {
  it("returns null without name or url", async () => {
    const mod = await loadModule();
    expect(mod.mapScrapingBeeRow({ price_fraction: "10" })).toBeNull();
  });

  it("leaves freeShipping null when there is no shipping text", async () => {
    const mod = await loadModule();
    const row = mod.mapScrapingBeeRow({ name: "X", url: "u" });
    expect(row?.freeShipping).toBeNull();
  });
});
