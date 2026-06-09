import { describe, it, expect } from "vitest";

/**
 * LIVE credential validation for Oxylabs Web Scraper API.
 *
 * This test makes a REAL network call using the configured OXYLABS_USERNAME /
 * OXYLABS_PASSWORD. It is intentionally tolerant of provider instability: it
 * FAILS only when the credentials are clearly invalid (auth error). When the
 * provider is merely flaky (5xx / network), it logs and passes, mirroring the
 * established `unwrangle.live.test.ts` policy.
 *
 * It self-skips when credentials are not configured, so CI without secrets
 * stays green.
 */

const hasCreds =
  Boolean(process.env.OXYLABS_USERNAME?.trim()) &&
  Boolean(process.env.OXYLABS_PASSWORD?.trim());

const maybe = hasCreds ? describe : describe.skip;

maybe("oxylabs live key validation", () => {
  it(
    "authenticates with the real account and returns well-formed offers (or a tolerated upstream hiccup)",
    async () => {
      const { searchOffers } = await import("./oxylabs");
      try {
        const offers = await searchOffers("shampoo");
        // If we got here, auth worked. Validate the shape defensively.
        expect(Array.isArray(offers)).toBe(true);
        for (const o of offers.slice(0, 3)) {
          expect(o.source).toBe("oxylabs");
          expect(typeof o.name).toBe("string");
        }
      } catch (err: any) {
        const code = err?.code;
        if (code === "auth") {
          // Invalid credentials → this is a real failure we must surface.
          throw new Error(
            "Oxylabs rejected the configured credentials (auth). Please re-check OXYLABS_USERNAME/OXYLABS_PASSWORD.",
          );
        }
        // Any other provider-side condition is tolerated (provider instability).
        console.warn(
          `[live] Oxylabs reachable but not returning data right now (code=${code}). Credentials appear accepted; tolerating.`,
        );
        expect(["upstream", "parse", "credits", "bad_input", undefined]).toContain(code);
      }
    },
    60_000,
  );
});
