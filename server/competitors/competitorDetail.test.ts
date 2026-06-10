import { describe, it, expect, vi, beforeEach } from "vitest";

// Force relevant providers "configured" BEFORE importing the module under test.
process.env.SCRAPINGBEE_API_KEY = "sb-test-key";
process.env.OXYLABS_USERNAME = "oxy-user";
process.env.OXYLABS_PASSWORD = "oxy-pass";
process.env.UNWRANGLE_API_KEY = "uw-test-key";
process.env.COMPETITOR_RETRY_DELAY_MS = "0";
process.env.UNWRANGLE_RETRY_DELAY_MS = "0";

import { getCompetitorDetail, parseListingHtml } from "./competitorDetail";

const PRODUCT_URL =
  "https://www.mercadolivre.com.br/kit-com-50-pares-de-hashi-descartavel-em-bambu-liso-gw/p/MLB46238945";

/** A realistic rendered ML product page (trimmed to the relevant tags). */
const PAGE_HTML = `<!doctype html><html><head>
<meta property="og:title" content="Kit com 50 Pares de Hashi Descartável em Bambu Liso GW - R$ 20,64">
<meta property="og:image" content="https://http2.mlstatic.com/D_NQ_NP_856866-MLA99977186739_112025-O.webp">
<meta property="og:url" content="https://www.mercadolivre.com.br/p/MLB46238945">
<meta property="og:description" content="Hashi descartável de bambu, kit com 50 pares.">
<meta itemprop="price" content="20.64">
<meta property="og:availability" content="instock">
</head><body>
<div class="ui-pdp">Mercado Envios Full · Frete grátis · MercadoLíder Platinum</div>
${"x".repeat(800)}
</body></html>`;

function textResponse(body: string, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
    json: async () => ({ results: [{ content: body }] }),
  } as unknown as Response;
}

describe("parseListingHtml", () => {
  it("extracts title, price, image and labels from rendered HTML", () => {
    const d = parseListingHtml(PAGE_HTML, PRODUCT_URL);
    expect(d).not.toBeNull();
    expect(d!.name).toBe("Kit com 50 Pares de Hashi Descartável em Bambu Liso GW");
    expect(d!.price).toBe(20.64);
    expect(d!.image).toBe(
      "https://http2.mlstatic.com/D_NQ_NP_856866-MLA99977186739_112025-O.webp",
    );
    expect(d!.isAvailable).toBe(true);
    expect(d!.sellerLabels).toContain("Frete grátis");
    expect(d!.sellerLabels).toContain("MercadoLíder");
  });

  it("returns null for empty / junk HTML", () => {
    expect(parseListingHtml("", PRODUCT_URL)).toBeNull();
    expect(parseListingHtml("<html></html>", PRODUCT_URL)).toBeNull();
  });
});

describe("getCompetitorDetail", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("resolves via product page (ScrapingBee) when that proxy responds", async () => {
    const fetchImpl = vi.fn(async (url: any) => {
      expect(String(url)).toContain("app.scrapingbee.com");
      return textResponse(PAGE_HTML);
    });
    const d = await getCompetitorDetail(PRODUCT_URL, fetchImpl as any);
    expect(d.name).toContain("Hashi");
    expect(d.price).toBe(20.64);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to Oxylabs when ScrapingBee fails", async () => {
    const fetchImpl = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("app.scrapingbee.com")) return textResponse("err", 500);
      if (u.includes("realtime.oxylabs.io")) return textResponse(PAGE_HTML);
      throw new Error(`unexpected url: ${u}`);
    });
    const d = await getCompetitorDetail(PRODUCT_URL, fetchImpl as any);
    expect(d.price).toBe(20.64);
  });

  it("falls back to Unwrangle when both page proxies fail", { timeout: 20000 }, async () => {
    const fetchImpl = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("app.scrapingbee.com")) return textResponse("err", 500);
      if (u.includes("realtime.oxylabs.io")) return textResponse("err", 500);
      if (u.includes("data.unwrangle.com")) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            success: true,
            detail: {
              name: "Hashi (Unwrangle)",
              url: PRODUCT_URL,
              price: 18,
              currency: "BRL",
              currency_symbol: "R$",
              images: ["https://x/uw.jpg"],
              is_available: true,
            },
            remaining_credits: 10,
          }),
          text: async () => "",
        } as unknown as Response;
      }
      throw new Error(`unexpected url: ${u}`);
    });
    const d = await getCompetitorDetail(PRODUCT_URL, fetchImpl as any);
    expect(d.name).toContain("Unwrangle");
    expect(d.price).toBe(18);
  });

  it("throws a single honest error when ALL sources fail", { timeout: 20000 }, async () => {
    const fetchImpl = vi.fn(async () => textResponse("err", 500));
    await expect(getCompetitorDetail(PRODUCT_URL, fetchImpl as any)).rejects.toThrow(
      /instáveis no momento|não foi possível/i,
    );
  });
});
