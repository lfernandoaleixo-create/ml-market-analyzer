import { describe, it, expect } from "vitest";
import { parseMlSearchHtml, buildMlSearchUrl, pickBestImage } from "./mlSearchParser";

/**
 * Tests for the shared ML search parser, focused on the ENRICHMENT badges that
 * the real poly-card DOM exposes (verified against a live ML sample, Jun 2026):
 *   - "Loja oficial"      → aria-label on a seller icon
 *   - "Enviado pelo FULL" → aria-label on the fulfillment icon
 *   - coupon pill         → .poly-component__coupons
 *   - sponsored placement → product link with is_advertising=true
 *
 * The parser must extract these as honest booleans and never invent data.
 */

// Card 1: official store + FULL + coupon + sponsored (all positive signals).
// Card 2: a plain organic listing with none of the badges.
const FIXTURE = `
<html><body>
  <div class="poly-card">
    <h3 class="poly-component__title-wrapper">
      <a class="poly-component__title"
         href="https://www.mercadolivre.com.br/p/MLB111?is_advertising=true">Creatina Pura 500g</a>
    </h3>
    <span class="poly-component__seller">
      DARK LAB
      <svg aria-label="Loja oficial" class="polylabel-icon"></svg>
    </span>
    <span class="poly-reviews__rating">4.9</span>
    <span class="poly-reviews__total">(1234)</span>
    <div class="andes-money-amount">
      <span class="andes-money-amount__fraction">129</span>
      <span class="andes-money-amount__cents">90</span>
    </div>
    <span class="poly-component__shipping">Frete grátis</span>
    <div class="poly-component__shipping-icon">
      <svg aria-label="Enviado pelo FULL"></svg>
    </div>
    <div class="poly-component__coupons">
      <span class="poly-coupons__pill">Cupom R$ 10</span>
    </div>
  </div>
  <div class="poly-card">
    <h3 class="poly-component__title-wrapper">
      <a class="poly-component__title"
         href="https://produto.mercadolivre.com.br/MLB-222">Creatina Genérica 300g</a>
    </h3>
    <span class="poly-component__seller">Loja Qualquer</span>
    <div class="andes-money-amount">
      <span class="andes-money-amount__fraction">79</span>
    </div>
    <span class="poly-component__shipping">Chega amanhã</span>
  </div>
</body></html>`.padEnd(600, " ");

describe("pickBestImage — ML lazy-load image resolution", () => {
  const REAL = "https://http2.mlstatic.com/D_NQ_NP_2X_942122-MLA99923169249_112025-E.webp";
  const PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  it("picks the widest real URL from srcset even when src is a placeholder gif", () => {
    const srcset =
      "https://http2.mlstatic.com/a-T.webp 160w, " +
      "https://http2.mlstatic.com/a-C.webp 400w, " +
      "https://http2.mlstatic.com/a-B.webp 800w, " +
      "https://http2.mlstatic.com/a-V.webp 320w";
    expect(pickBestImage({ src: PLACEHOLDER, srcset })).toBe(
      "https://http2.mlstatic.com/a-B.webp",
    );
  });

  it("falls back to data-src when there is no srcset", () => {
    expect(pickBestImage({ src: PLACEHOLDER, dataSrc: REAL })).toBe(REAL);
  });

  it("uses a real src directly when it is not a placeholder", () => {
    expect(pickBestImage({ src: REAL })).toBe(REAL);
  });

  it("reads data-srcset when srcset is absent", () => {
    expect(
      pickBestImage({ src: PLACEHOLDER, dataSrcset: `${REAL} 320w` }),
    ).toBe(REAL);
  });

  it("returns null when only a placeholder is available (no invented URL)", () => {
    expect(pickBestImage({ src: PLACEHOLDER })).toBeNull();
    expect(pickBestImage({})).toBeNull();
    expect(
      pickBestImage({ src: "https://http2.mlstatic.com/spacer.gif" }),
    ).toBeNull();
  });
});

describe("parseMlSearchHtml — real thumbnail extraction", () => {
  it("extracts the real product photo from a lazy-loaded poly-card img", () => {
    const html = `
      <div class="poly-card">
        <a class="poly-component__title" href="https://www.mercadolivre.com.br/p/MLB1">Item A</a>
        <img class="poly-component__picture"
             src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
             srcset="https://http2.mlstatic.com/x-T.webp 160w, https://http2.mlstatic.com/x-B.webp 800w" />
      </div>`.padEnd(600, " ");
    const [offer] = parseMlSearchHtml(html, "oxylabs");
    expect(offer.thumbnail).toBe("https://http2.mlstatic.com/x-B.webp");
  });

  it("yields null thumbnail (not a placeholder) when no real image exists", () => {
    const html = `
      <div class="poly-card">
        <a class="poly-component__title" href="https://www.mercadolivre.com.br/p/MLB2">Item B</a>
        <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />
      </div>`.padEnd(600, " ");
    const [offer] = parseMlSearchHtml(html, "oxylabs");
    expect(offer.thumbnail).toBeNull();
  });
});

describe("mlSearchParser — enrichment badges", () => {
  it("extracts officialStore / fulfillment / hasCoupon / sponsored when present", () => {
    const offers = parseMlSearchHtml(FIXTURE, "scrapingbee");
    expect(offers).toHaveLength(2);

    const [rich, plain] = offers;

    expect(rich.name).toBe("Creatina Pura 500g");
    expect(rich.officialStore).toBe(true);
    expect(rich.fulfillment).toBe(true);
    expect(rich.hasCoupon).toBe(true);
    expect(rich.sponsored).toBe(true);

    // The plain organic card has none of the badges.
    expect(plain.name).toBe("Creatina Genérica 300g");
    expect(plain.officialStore).toBe(false);
    expect(plain.fulfillment).toBe(false);
    expect(plain.hasCoupon).toBe(false);
    expect(plain.sponsored).toBe(false);
  });

  it("stamps the given source onto every offer", () => {
    const offers = parseMlSearchHtml(FIXTURE, "oxylabs");
    expect(offers.every((o) => o.source === "oxylabs")).toBe(true);
  });

  it("still parses core fields (price, rating, reviews) alongside badges", () => {
    const [rich] = parseMlSearchHtml(FIXTURE, "scrapingbee");
    expect(rich.price).toBe(129.9);
    expect(rich.rating).toBe(4.9);
    expect(rich.totalRatings).toBe(1234);
  });

  it("builds a public ML search URL from a keyword", () => {
    expect(buildMlSearchUrl("creatina pura")).toContain("lista.mercadolivre.com.br");
    expect(buildMlSearchUrl("creatina pura")).toContain("creatina");
  });
});
