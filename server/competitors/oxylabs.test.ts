import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

/**
 * Isolated tests for the Oxylabs provider. No real network calls are made: a
 * fake fetch is injected. They assert the SECURITY boundary too — the only auth
 * material sent is the dedicated OXYLABS_USERNAME/OXYLABS_PASSWORD basic-auth
 * header, and the request only carries a public Mercado Livre URL.
 *
 * The provider renders the ML search page (render=html + browser_instructions)
 * and parses the returned HTML with the SHARED poly-card parser, exactly like
 * ScrapingBee. So these tests model an Oxylabs realtime envelope whose
 * `content` is the rendered HTML string.
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

/** Wrap rendered HTML in an Oxylabs realtime response envelope. */
function oxylabsHtml(html: string) {
  return { results: [{ status_code: 200, content: html }] };
}

/** A minimal ML "poly-card" search page fixture (current 2026 layout). */
const ML_FIXTURE = `
<html><body>
  <div class="poly-card">
    <a class="poly-component__title" href="https://www.mercadolivre.com.br/p/MLB123">Shampoo Antiqueda 300ml</a>
    <img src="https://img/thumb.jpg" />
    <div class="andes-money-amount">
      <span class="andes-money-amount__fraction">49</span>
      <span class="andes-money-amount__cents">90</span>
    </div>
    <s><span class="andes-money-amount__fraction">79</span></s>
    <span class="poly-component__shipping">Frete grátis</span>
    <span class="poly-component__seller">Marca X</span>
  </div>
  <div class="poly-card">
    <a class="poly-component__title" href="https://produto.mercadolivre.com.br/MLB-222">Bom produto</a>
    <img data-src="https://img/2.jpg" />
    <div class="andes-money-amount">
      <span class="andes-money-amount__fraction">350</span>
    </div>
  </div>
  <div class="poly-card">
    <!-- malformed card: no title/url should be skipped -->
    <span class="andes-money-amount__fraction">10</span>
  </div>
</body></html>`.padEnd(1200, " ");

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

describe("oxylabs — request shape & security", () => {
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

  it("sends basic auth + render=html + browser_instructions + public URL only", async () => {
    const mod = await loadModule();
    let captured: RequestInit | undefined;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = init;
      // SECURITY: assert no ML seller token/cookies are present anywhere.
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toMatch(/^Basic /);
      expect(JSON.stringify(init)).not.toMatch(/Bearer|cnpj|access_token|refresh_token/i);
      return jsonResponse(oxylabsHtml(ML_FIXTURE));
    });

    await mod.searchOffers("shampoo", fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(captured?.body));
    expect(payload.source).toBe("universal");
    expect(payload.render).toBe("html");
    expect(payload.url).toContain("lista.mercadolivre.com.br");
    expect(Array.isArray(payload.browser_instructions)).toBe(true);
    // First instruction waits for the product cards to hydrate.
    expect(JSON.stringify(payload.browser_instructions)).toContain("poly-card");
  });
});

describe("oxylabs — HTML parsing (poly-card)", () => {
  beforeEach(() => {
    process.env.OXYLABS_USERNAME = "user";
    process.env.OXYLABS_PASSWORD = "pass";
  });

  it("parses rendered HTML into normalized offers stamped as 'oxylabs'", async () => {
    const mod = await loadModule();
    const fetchMock = vi.fn(async () => jsonResponse(oxylabsHtml(ML_FIXTURE)));
    const offers = await mod.searchOffers("shampoo", fetchMock as unknown as typeof fetch);

    // 2 valid cards (malformed third skipped).
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      source: "oxylabs",
      name: "Shampoo Antiqueda 300ml",
      url: "https://www.mercadolivre.com.br/p/MLB123",
      price: 49.9,
      listingPrice: 79,
      freeShipping: true,
      sellerReputation: "Marca X",
    });
    expect(offers[0].thumbnail).toBe("https://img/thumb.jpg");
    expect(offers[1]).toMatchObject({ name: "Bom produto", price: 350 });
  });

  it("treats an empty/short rendered page as a retryable upstream error", async () => {
    const mod = await loadModule();
    // Oxylabs internal status 613 returns an empty content body for ML.
    const fetchMock = vi.fn(async () => jsonResponse(oxylabsHtml("")));
    await expect(
      mod.searchOffers("x", fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "upstream" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("retries when a long page rendered but yielded ZERO products (challenge page)", async () => {
    const mod = await loadModule();
    const blocked = "<html><body><div>verificando seu navegador</div></body></html>".padEnd(
      2000,
      " ",
    );
    const fetchMock = vi.fn(async () => jsonResponse(oxylabsHtml(blocked)));
    await expect(
      mod.searchOffers("x", fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "upstream" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("accepts ZERO products when the rendered page is a legitimate empty search", async () => {
    const mod = await loadModule();
    const empty =
      '<html><body><section class="ui-search-rescue">No encontramos resultados</section></body></html>'.padEnd(
        1200,
        " ",
      );
    const fetchMock = vi.fn(async () => jsonResponse(oxylabsHtml(empty)));
    const offers = await mod.searchOffers("zzxqwnoresults", fetchMock as unknown as typeof fetch);
    expect(offers).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("oxylabs — error handling", () => {
  beforeEach(() => {
    process.env.OXYLABS_USERNAME = "user";
    process.env.OXYLABS_PASSWORD = "pass";
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
      return jsonResponse(oxylabsHtml(ML_FIXTURE));
    });
    const offers = await mod.searchOffers("x", fetchMock as unknown as typeof fetch);
    expect(calls).toBe(2);
    expect(offers).toHaveLength(2);
  });
});

describe("oxylabs — extractHtml", () => {
  it("reads content as a string", async () => {
    const mod = await loadModule();
    expect(mod.extractHtml({ results: [{ content: "<html>x</html>" }] })).toBe("<html>x</html>");
  });

  it("reads content.html when nested", async () => {
    const mod = await loadModule();
    expect(mod.extractHtml({ results: [{ content: { html: "<html>y</html>" } }] })).toBe(
      "<html>y</html>",
    );
  });

  it("returns empty string when no usable content", async () => {
    const mod = await loadModule();
    expect(mod.extractHtml({ results: [{}] })).toBe("");
    expect(mod.extractHtml({})).toBe("");
  });
});
