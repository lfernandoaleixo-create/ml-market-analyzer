import { afterEach, describe, expect, it, vi } from "vitest";
import { getProvider } from "./provider";

const VALID_CREDS = {
  appId: "1790005725650717",
  clientSecret: "abcdefghijklmnop1234567890ABCDEF",
};

function mockFetch(handler: (url: string, init?: any) => any) {
  return vi.fn(async (url: string, init?: any) => {
    const result = handler(String(url), init);
    return {
      ok: result.ok ?? true,
      status: result.status ?? 200,
      json: async () => result.body,
      text: async () => JSON.stringify(result.body ?? {}),
    } as any;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OfficialProvider", () => {
  it("resolves to official mode when credentials have valid format", () => {
    const provider = getProvider(VALID_CREDS);
    expect(provider.mode).toBe("official");
  });

  it("resolves to demo mode when credentials are placeholders", () => {
    const provider = getProvider({ appId: "name", clientSecret: "x" });
    expect(provider.mode).toBe("demo");
  });

  it("returns real catalog results enriched with the cheapest live price", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/oauth/token")) {
          return { body: { access_token: "TOKEN", expires_in: 3600 } };
        }
        if (url.includes("/products/search")) {
          return {
            body: {
              paging: { total: 1 },
              results: [
                {
                  id: "MLB123",
                  name: "Produto real",
                  pictures: [{ url: "https://img/x.jpg" }],
                  attributes: [{ id: "BRAND", name: "Marca", value_name: "Acme" }],
                },
              ],
            },
          };
        }
        // product detail has no buy_box → forces /items enrichment
        if (/\/products\/MLB123$/.test(url)) {
          return { body: { id: "MLB123", name: "Produto real", buy_box_winner: null } };
        }
        if (url.includes("/products/MLB123/items")) {
          return {
            body: {
              paging: { total: 2 },
              results: [
                { item_id: "MLBA", price: 250, currency_id: "BRL", condition: "new" },
                { item_id: "MLBB", price: 199.9, currency_id: "BRL", condition: "new" },
              ],
            },
          };
        }
        return { ok: false, status: 404, body: {} };
      }),
    );

    const provider = getProvider(VALID_CREDS);
    const res = await provider.search({ keyword: "teste" });
    expect(res.products[0].id).toBe("MLB123");
    expect(res.products[0].title).toBe("Produto real");
    // cheapest of the two live offers
    expect(res.products[0].price).toBe(199.9);
  });

  it("marks priceAvailable=false when catalog product has no buy box nor live offers", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/oauth/token")) {
          return { body: { access_token: "TOKEN", expires_in: 3600 } };
        }
        if (url.includes("/products/search")) {
          return {
            body: {
              paging: { total: 1 },
              results: [
                {
                  id: "MLB777",
                  name: "Tênis sem oferta",
                  pictures: [{ url: "https://img/y.jpg" }],
                  permalink: "https://produto.mercadolivre.com.br/MLB777",
                },
              ],
            },
          };
        }
        if (/\/products\/MLB777$/.test(url)) {
          return { body: { id: "MLB777", name: "Tênis sem oferta", buy_box_winner: null, permalink: "https://produto.mercadolivre.com.br/MLB777" } };
        }
        // /products/MLB777/items → 404 "No winners found"
        return { ok: false, status: 404, body: { message: "No winners found" } };
      }),
    );

    const provider = getProvider(VALID_CREDS);
    const res = await provider.search({ keyword: "tenis" });
    expect(res.products[0].id).toBe("MLB777");
    expect(res.products[0].price).toBe(0);
    expect(res.products[0].priceAvailable).toBe(false);
    expect(res.products[0].permalink).toContain("MLB777");
  });

  it("falls back to demo data when products/search is forbidden (403)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/oauth/token")) {
          return { body: { access_token: "TOKEN", expires_in: 3600 } };
        }
        return { ok: false, status: 403, body: { message: "forbidden" } };
      }),
    );

    const provider = getProvider(VALID_CREDS);
    const res = await provider.search({ keyword: "notebook" });
    // Demo provider always returns a non-empty product list.
    expect(res.products.length).toBeGreaterThan(0);
  });

  it("builds best sellers from highlights and resolves product names", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/oauth/token")) {
          return { body: { access_token: "TOKEN", expires_in: 3600 } };
        }
        if (url.includes("/highlights/")) {
          return {
            body: {
              content: [
                { id: "MLB1", position: 1, type: "PRODUCT" },
                { id: "MLB2", position: 2, type: "USER_PRODUCT" },
              ],
            },
          };
        }
        if (/\/products\/MLB1$/.test(url)) {
          return { body: { id: "MLB1", name: "Top seller", buy_box_winner: { price: 99 } } };
        }
        return { ok: false, status: 404, body: {} };
      }),
    );

    const provider = getProvider(VALID_CREDS);
    const res = await provider.getBestSellers!({ categoryId: "MLB1051", limit: 5 });
    expect(res.products.length).toBe(1);
    expect(res.products[0].title).toBe("Top seller");
    expect(res.products[0].price).toBe(99);
  });

  it("falls back to demo when getProduct fails on the official API", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/oauth/token")) {
          return { body: { access_token: "TOKEN", expires_in: 3600 } };
        }
        return { ok: false, status: 403, body: {} };
      }),
    );

    const provider = getProvider(VALID_CREDS);
    const product = await provider.getProduct("MLB999");
    // Demo fallback may return null for unknown ids, but must not throw.
    expect(product === null || typeof product.id === "string").toBe(true);
  });
});
