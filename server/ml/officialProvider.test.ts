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

  it("returns real results when the search endpoint succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/oauth/token")) {
          return { body: { access_token: "TOKEN", expires_in: 3600 } };
        }
        if (url.includes("/search")) {
          return {
            body: {
              paging: { total: 1 },
              results: [
                {
                  id: "MLB123",
                  title: "Produto real",
                  price: 100,
                  currency_id: "BRL",
                  thumbnail: "x",
                  permalink: "y",
                  category_id: "MLB1",
                  seller: { id: 1, nickname: "loja" },
                },
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
  });

  it("falls back to demo data when the search endpoint is forbidden (403)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/oauth/token")) {
          return { body: { access_token: "TOKEN", expires_in: 3600 } };
        }
        // Simulate ML restricting /search for client_credentials apps.
        return { ok: false, status: 403, body: { message: "forbidden" } };
      }),
    );

    const provider = getProvider(VALID_CREDS);
    const res = await provider.search({ keyword: "notebook" });
    // Demo provider always returns a non-empty product list.
    expect(res.products.length).toBeGreaterThan(0);
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
