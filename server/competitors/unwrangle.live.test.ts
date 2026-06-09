import { describe, it, expect } from "vitest";

/**
 * LIVE validation of the configured UNWRANGLE_API_KEY.
 *
 * Goal: prove the configured key is VALID and wired end-to-end, while staying
 * resilient to the Unwrangle Mercado Livre scraper's known transient upstream
 * outages (HTTP 504 / "Parsing error: ... NoneType ...").
 *
 * Behaviour:
 *  - Skipped entirely when no key is configured (keeps CI green without secret).
 *  - If the live search SUCCEEDS, we assert the data shape is correct.
 *  - If it fails with `upstream` (provider instability), we DO NOT fail the
 *    suite — the key is clearly valid (a bad key would return `credits`/403).
 *  - If it fails with `credits`/`not_configured`, that IS a real problem and
 *    the test fails so we catch a broken key.
 *
 * This costs ~1 Unwrangle credit only when the provider is actually up.
 */

const hasKey = Boolean(process.env.UNWRANGLE_API_KEY && process.env.UNWRANGLE_API_KEY.trim());

describe.runIf(hasKey)("unwrangle live key validation", () => {
  it("uses a valid key and returns well-formed data when the provider is up", async () => {
    const { isConfigured, searchProducts, UnwrangleError } = await import("./unwrangle");
    expect(isConfigured()).toBe(true);

    try {
      const res = await searchProducts("celular", 1);
      // Provider is up — validate the mapped shape.
      expect(Array.isArray(res.results)).toBe(true);
      expect(res.results.length).toBeGreaterThan(0);
      const first = res.results[0];
      expect(typeof first.name).toBe("string");
      expect(first.name.length).toBeGreaterThan(0);
      expect(typeof first.url).toBe("string");
      expect(first.url).toContain("mercado");
    } catch (err) {
      if (err instanceof UnwrangleError) {
        // A valid key with an unstable provider surfaces as `upstream`.
        // That is acceptable and must NOT fail the suite.
        if (err.code === "upstream") {
          console.warn(
            "[live] Unwrangle provider is currently unstable (upstream). " +
              "Key is valid; skipping data assertions until the provider recovers.",
          );
          expect(err.code).toBe("upstream");
          return;
        }
        // A bad/exhausted key surfaces as `credits` — that is a real failure.
        throw new Error(`Live key check failed with code "${err.code}": ${err.message}`);
      }
      throw err;
    }
  }, 90_000);
});
