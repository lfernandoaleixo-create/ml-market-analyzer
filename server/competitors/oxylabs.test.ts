import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

/**
 * Isolated tests for the Oxylabs provider. No real network calls are made: a
 * fake fetch is injected. They assert the SECURITY boundary too — the only auth
 * material sent is the dedicated OXYLABS_USERNAME/OXYLABS_PASSWORD basic-auth
 * header, and the request only carries a public Mercado Livre URL.
 */

// Make retries instant in tests (no real backoff wait).
process.env.COMPETITOR_RETRY_DELAY_MS = "0";

const ORIGINAL_USER = process.env.OXYLABS_USERNAME;
const ORIGINAL_PASS = process.env.OXYLABS_PASSWORD;

afterEach(() => {
  if (ORIGINAL_USER === undefined) delete process.env.OXYLABS_USERNAME;
  else process.env.OXYLABS_USERNAME = ORIGINAL_USER;
  if (ORIGINAL_PASS === undefined) delete process.env.OXYLABS_PASSWORD;
  else process.env.OXYLABS_PASSWORD = ORIGINAL_PASS;
  vi.resetModules();
});

async function loadModule() {
  vi.resetModules();
  return await import("./oxylabs");
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    status,
    json: async () => body,
  } as unknown as Response;
}

function oxylabsBody(items: unknown[]) {
  return { results: [{ content: { results: { organic: items } } }] };
}

describe("oxylabs — configuration", () => {
  it("reports not configured when credentials are missing", async () => {
    delete process.env.OXYLABS_USERNAME;
    delete process.env.OXYLABS_PASSWORD;
    const mod = await loadModule();
    expect(mod.isConfigured()).toBe(false);
  });

  it("reports not configured when only one of user/pass is present", async () => {
    process.env.OXYLABS_USERNAME = "user";
    delete process.env.OXYLABS_PASSWORD;
    const mod = await loadModule();
    expect(mod.isConfigured()).toBe(false);
  });

  it("reports configured when both credentials are present", async () => {
    process.env.OXYLABS_USERNAME = "user";
    process.env.OXYLABS_PASSWORD = "pass";
    const mod = await loadModule();
    expect(mod.isConfigured()).toBe(true);
  });

  it("throws a friendly not_configured error when searching without creds", async () => {
    delete process.env.OXYLABS_USERNAME;
    delete process.env.OXYLABS_PASSWORD;
    const mod = await loadModule();
    await expect(mod.searchOffers("shampoo", vi.fn())).rejects.toMatchObject({
      code: "not_configured",
    });
  });
});

describe("oxylabs — search & mapping", () => {
  beforeEach(() => {
    process.env.OXYLABS_USERNAME = "user";
    process.env.OXYLABS_PASSWORD = "pass";
  });

  it("builds a public ML search URL (no account identifiers)", async () => {
    const mod = await loadModule();
    const url = mod.buildMlSearchUrl("cadeira gamer");
    expect(url).toContain("lista.mercadolivre.com.br");
    expect(url).toContain("cadeira-gamer");
  });

  it("sends basic auth + public URL only, and normalizes items", async () => {
    const mod = await loadModule();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      // SECURITY: assert no ML seller token/cookies are present.
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toMatch(/^Basic /);
      const payload = JSON.parse(String(init?.body));
      expect(payload.url).toContain("lista.mercadolivre.com.br");
      expect(JSON.stringify(init)).not.toMatch(/Bearer|cnpj|access_token/i);
      return jsonResponse(
        oxylabsBody([
          {
            title: "Shampoo Antiqueda 300ml",
            url: "https://www.mercadolivre.com.br/p/MLB123",
            price: "R$ 49,90",
            price_strikethrough: "R$ 79,90",
            rating: 4.7,
            reviews_count: 1200,
            brand: "Marca X",
            free_shipping: true,
            thumbnail: "https://img/thumb.jpg",
          },
        ]),
      );
    });

    const offers = await mod.searchOffers("shampoo", fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      source: "oxylabs",
      name: "Shampoo Antiqueda 300ml",
      price: 49.9,
      listingPrice: 79.9,
      rating: 4.7,
      totalRatings: 1200,
      brand: "Marca X",
      freeShipping: true,
    });
  });

  it("drops items with neither name nor url", async () => {
    const mod = await loadModule();
    const fetchMock = vi.fn(async () =>
      jsonResponse(oxylabsBody([{ price: "10" }, { title: "Bom produto", url: "u" }])),
    );
    const offers = await mod.searchOffers("x", fetchMock as unknown as typeof fetch);
    expect(offers).toHaveLength(1);
    expect(offers[0].name).toBe("Bom produto");
  });

  it("treats 401/403 as a terminal auth error (no retry)", async () => {
    const mod = await loadModule();
    const fetchMock = vi.fn(async () => jsonResponse({}, 403));
    await expect(
      mod.searchOffers("x", fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "auth" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx up to the max attempts then fails as upstream", async () => {
    const mod = await loadModule();
    const fetchMock = vi.fn(async () => jsonResponse({}, 503));
    await expect(
      mod.searchOffers("x", fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "upstream" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("retries on network errors then succeeds", async () => {
    const mod = await loadModule();
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw new Error("network down");
      return jsonResponse(oxylabsBody([{ title: "OK", url: "u", price: "5" }]));
    });
    const offers = await mod.searchOffers("x", fetchMock as unknown as typeof fetch);
    expect(calls).toBe(2);
    expect(offers).toHaveLength(1);
  });
});

describe("oxylabs — mapOxylabsItem", () => {
  it("returns null when there is no usable data", async () => {
    const mod = await loadModule();
    expect(mod.mapOxylabsItem({ price: "10" })).toBeNull();
  });

  it("reads alternative field aliases", async () => {
    const mod = await loadModule();
    const offer = mod.mapOxylabsItem({
      name: "Alt fields",
      product_url: "https://x",
      current_price: 12.5,
      stars: 4.2,
      ratings_count: 30,
      manufacturer: "ACME",
      image_url: "https://img",
    });
    expect(offer).toMatchObject({
      name: "Alt fields",
      url: "https://x",
      price: 12.5,
      rating: 4.2,
      totalRatings: 30,
      brand: "ACME",
      thumbnail: "https://img",
    });
  });
});
