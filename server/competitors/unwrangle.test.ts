import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * These tests exercise the isolated Unwrangle client. They never make a real
 * network call: a fake fetch is injected. They also assert the security
 * boundary — the only auth material sent is the dedicated UNWRANGLE_API_KEY,
 * and the request goes to the Unwrangle host with just the public keyword/URL.
 */

const ORIGINAL_KEY = process.env.UNWRANGLE_API_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.UNWRANGLE_API_KEY;
  else process.env.UNWRANGLE_API_KEY = ORIGINAL_KEY;
  vi.resetModules();
});

async function loadModule() {
  // Re-import after setting env so ENV picks up the key.
  vi.resetModules();
  return await import("./unwrangle");
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("unwrangle client — configuration", () => {
  it("reports not configured when no key is set", async () => {
    delete process.env.UNWRANGLE_API_KEY;
    const mod = await loadModule();
    expect(mod.isConfigured()).toBe(false);
  });

  it("reports configured when a key is set", async () => {
    process.env.UNWRANGLE_API_KEY = "test-key-123";
    const mod = await loadModule();
    expect(mod.isConfigured()).toBe(true);
  });

  it("throws a friendly not_configured error when searching without a key", async () => {
    delete process.env.UNWRANGLE_API_KEY;
    const mod = await loadModule();
    await expect(mod.searchProducts("shampoo", 1, vi.fn())).rejects.toMatchObject({
      code: "not_configured",
    });
  });
});

describe("unwrangle client — search", () => {
  beforeEach(() => {
    process.env.UNWRANGLE_API_KEY = "test-key-123";
  });

  it("maps results and sorts by strength (more ratings first)", async () => {
    const mod = await loadModule();
    const fakeFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        total_results: 200,
        no_of_pages: 4,
        results: [
          { name: "Weak", url: "u1", rating: 4.9, total_ratings: 10, price: 50, currency: "BRL", currency_symbol: "R$" },
          { name: "Strong", url: "u2", rating: 4.5, total_ratings: 9000, price: 60, currency: "BRL", currency_symbol: "R$" },
        ],
        remaining_credits: 1000,
      }),
    );
    const res = await mod.searchProducts("shampoo antiqueda", 1, fakeFetch as any);
    expect(res.results[0].name).toBe("Strong");
    expect(res.results[1].name).toBe("Weak");
    expect(res.totalResults).toBe(200);
    expect(res.remainingCredits).toBe(1000);
  });

  it("sends ONLY the API key as auth and never any ML/seller data", async () => {
    const mod = await loadModule();
    const fakeFetch = vi.fn().mockResolvedValue(jsonResponse({ success: true, results: [] }));
    await mod.searchProducts("smartwatch", 1, fakeFetch as any);

    const [url, init] = fakeFetch.mock.calls[0];
    // Host is the third-party service
    expect(String(url)).toContain("data.unwrangle.com/api/getter/");
    // Public keyword present, no seller identity
    expect(String(url)).toContain("platform=mercado_search");
    expect(String(url)).toContain("search=smartwatch");
    // Auth header is ONLY the dedicated token
    expect((init as any).headers.Authorization).toBe("Token test-key-123");
    // Nothing resembling ML/CNPJ/cookies is sent
    const serialized = JSON.stringify(init) + String(url);
    expect(serialized).not.toMatch(/mercadolibre\.com/i);
    expect(serialized).not.toMatch(/36\.562\.762/);
    expect(serialized.toLowerCase()).not.toContain("cookie");
  });

  it("maps 403 to a credits/auth error", async () => {
    const mod = await loadModule();
    const fakeFetch = vi.fn().mockResolvedValue(jsonResponse({}, 403));
    await expect(mod.searchProducts("x", 1, fakeFetch as any)).rejects.toMatchObject({
      code: "credits",
    });
  });
});

describe("unwrangle client — detail", () => {
  beforeEach(() => {
    process.env.UNWRANGLE_API_KEY = "test-key-123";
  });

  it("maps product detail fields", async () => {
    const mod = await loadModule();
    const fakeFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        detail: {
          name: "Shampoo X",
          url: "https://www.mercadolivre.com.br/x/p/MLB1",
          price: 64.58,
          listing_price: 82.8,
          currency: "BRL",
          currency_symbol: "R$",
          rating: 4.0,
          total_ratings: 3,
          images: ["i1", "i2"],
          is_available: true,
          state: "Novo",
          sold_by: "Loja",
          seller_sales: "+10mil vendas",
          seller_labels: ["MercadoLíder"],
        },
        remaining_credits: 999,
      }),
    );
    const d = await mod.getProductDetail("https://www.mercadolivre.com.br/x/p/MLB1", fakeFetch as any);
    expect(d.name).toBe("Shampoo X");
    expect(d.price).toBe(64.58);
    expect(d.images.length).toBe(2);
    expect(d.sellerLabels).toContain("MercadoLíder");
    expect(d.remainingCredits).toBe(999);
  });
});
