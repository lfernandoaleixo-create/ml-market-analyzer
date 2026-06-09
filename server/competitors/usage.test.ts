import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Isolated tests for the consumption / quota panel (usage.ts). No real network.
 * They assert:
 *  - ScrapingBee /usage is parsed into a "quota" SourceUsage (remaining = max-used);
 *  - any ScrapingBee failure degrades gracefully into kind="error" (never throws);
 *  - unconfigured keys are reported as kind="unconfigured";
 *  - Oxylabs/Unwrangle are reported honestly as "panel_only" when configured;
 *  - getUsageStatus combines source usage with the user's search counts and uses
 *    the right time windows (today / last 30 days).
 */

const ORIGINAL = {
  sb: process.env.SCRAPINGBEE_API_KEY,
  oxuser: process.env.OXYLABS_USERNAME,
  oxpass: process.env.OXYLABS_PASSWORD,
  unw: process.env.UNWRANGLE_API_KEY,
};

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  restore("SCRAPINGBEE_API_KEY", ORIGINAL.sb);
  restore("OXYLABS_USERNAME", ORIGINAL.oxuser);
  restore("OXYLABS_PASSWORD", ORIGINAL.oxpass);
  restore("UNWRANGLE_API_KEY", ORIGINAL.unw);
  vi.resetModules();
  vi.restoreAllMocks();
});

async function loadModule() {
  vi.resetModules();
  return await import("./usage");
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

describe("getScrapingBeeUsage", () => {
  it("parses max/used into a quota with remaining credits", async () => {
    process.env.SCRAPINGBEE_API_KEY = "sb-key";
    const mod = await loadModule();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ max_api_credit: 250000, used_api_credit: 1200, max_concurrency: 10 }),
    );

    const usage = await mod.getScrapingBeeUsage(fetchImpl as unknown as typeof fetch);

    expect(usage.kind).toBe("quota");
    expect(usage.maxCredits).toBe(250000);
    expect(usage.usedCredits).toBe(1200);
    expect(usage.remainingCredits).toBe(248800);
    // Only the dedicated key + the usage endpoint are contacted.
    const calledUrl = String(fetchImpl.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("app.scrapingbee.com/api/v1/usage");
    expect(calledUrl).toContain("api_key=sb-key");
  });

  it("parses an optional renewal date when present", async () => {
    process.env.SCRAPINGBEE_API_KEY = "sb-key";
    const mod = await loadModule();
    const iso = "2026-07-09T00:00:00.000Z";
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ max_api_credit: 100, used_api_credit: 0, renewal_period_end: iso }),
    );

    const usage = await mod.getScrapingBeeUsage(fetchImpl as unknown as typeof fetch);
    expect(usage.renewalAt).toBe(Date.parse(iso));
  });

  it("reports unconfigured when no key is set", async () => {
    delete process.env.SCRAPINGBEE_API_KEY;
    const mod = await loadModule();
    const fetchImpl = vi.fn();
    const usage = await mod.getScrapingBeeUsage(fetchImpl as unknown as typeof fetch);
    expect(usage.kind).toBe("unconfigured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("degrades to error on 401 without throwing", async () => {
    process.env.SCRAPINGBEE_API_KEY = "bad-key";
    const mod = await loadModule();
    const fetchImpl = vi.fn(async () => jsonResponse({}, 401));
    const usage = await mod.getScrapingBeeUsage(fetchImpl as unknown as typeof fetch);
    expect(usage.kind).toBe("error");
    expect(usage.maxCredits).toBeNull();
  });

  it("degrades to error on a network failure without throwing", async () => {
    process.env.SCRAPINGBEE_API_KEY = "sb-key";
    const mod = await loadModule();
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const usage = await mod.getScrapingBeeUsage(fetchImpl as unknown as typeof fetch);
    expect(usage.kind).toBe("error");
  });

  it("degrades to error on an unexpected body shape", async () => {
    process.env.SCRAPINGBEE_API_KEY = "sb-key";
    const mod = await loadModule();
    const fetchImpl = vi.fn(async () => jsonResponse({ something: "else" }));
    const usage = await mod.getScrapingBeeUsage(fetchImpl as unknown as typeof fetch);
    expect(usage.kind).toBe("error");
  });
});

describe("getOxylabsUsage / getUnwrangleUsage", () => {
  it("reports oxylabs as panel_only when configured", async () => {
    process.env.OXYLABS_USERNAME = "user";
    process.env.OXYLABS_PASSWORD = "pass";
    const mod = await loadModule();
    const usage = mod.getOxylabsUsage();
    expect(usage.kind).toBe("panel_only");
    expect(usage.note).toMatch(/painel/i);
  });

  it("reports oxylabs as unconfigured when credentials are missing", async () => {
    delete process.env.OXYLABS_USERNAME;
    delete process.env.OXYLABS_PASSWORD;
    const mod = await loadModule();
    expect(mod.getOxylabsUsage().kind).toBe("unconfigured");
  });

  it("reports unwrangle as panel_only when configured", async () => {
    process.env.UNWRANGLE_API_KEY = "unw-key";
    const mod = await loadModule();
    expect(mod.getUnwrangleUsage().kind).toBe("panel_only");
  });
});

describe("time windows", () => {
  it("startOfTodayUtc returns midnight UTC for the given instant", async () => {
    const mod = await loadModule();
    const noon = Date.UTC(2026, 5, 9, 12, 34, 56);
    expect(mod.startOfTodayUtc(noon)).toBe(Date.UTC(2026, 5, 9));
  });

  it("thirtyDaysAgo subtracts exactly 30 days", async () => {
    const mod = await loadModule();
    const now = 1_000_000_000_000;
    expect(mod.thirtyDaysAgo(now)).toBe(now - 30 * 24 * 60 * 60 * 1000);
  });
});

describe("getUsageStatus", () => {
  it("combines source usage with the user's search counts", async () => {
    process.env.SCRAPINGBEE_API_KEY = "sb-key";
    process.env.OXYLABS_USERNAME = "user";
    process.env.OXYLABS_PASSWORD = "pass";
    delete process.env.UNWRANGLE_API_KEY;

    // Mock the search-count helper so we don't need a database.
    vi.doMock("./searchStore", () => ({
      countSearchesSince: vi.fn(async (_userId: number, sinceMs: number) =>
        // Return 2 for "today" (larger sinceMs) and 7 for "30 days" (smaller).
        sinceMs >= Date.UTC(2026, 5, 9) ? 2 : 7,
      ),
    }));

    const mod = await loadModule();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ max_api_credit: 250000, used_api_credit: 1000 }),
    );
    const now = Date.UTC(2026, 5, 9, 15, 0, 0);

    const status = await mod.getUsageStatus(7, fetchImpl as unknown as typeof fetch, now);

    expect(status.searchesToday).toBe(2);
    expect(status.searchesLast30Days).toBe(7);
    const sb = status.sources.find((s) => s.id === "scrapingbee");
    const ox = status.sources.find((s) => s.id === "oxylabs");
    const unw = status.sources.find((s) => s.id === "unwrangle");
    expect(sb?.kind).toBe("quota");
    expect(sb?.remainingCredits).toBe(249000);
    expect(ox?.kind).toBe("panel_only");
    expect(unw?.kind).toBe("unconfigured");
  });
});
