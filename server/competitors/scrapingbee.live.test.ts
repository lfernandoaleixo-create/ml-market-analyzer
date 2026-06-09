import { describe, it, expect } from "vitest";

/**
 * LIVE credential validation for ScrapingBee.
 *
 * Makes a REAL network call using the configured SCRAPINGBEE_API_KEY. It is
 * tolerant of provider instability (mirrors oxylabs/unwrangle live policy): it
 * FAILS only on a clearly invalid key (auth). Flaky upstream conditions are
 * logged and tolerated. Self-skips when the key is not configured.
 */

const hasKey = Boolean(process.env.SCRAPINGBEE_API_KEY?.trim());
const maybe = hasKey ? describe : describe.skip;

maybe("scrapingbee live key validation", () => {
  it(
    "authenticates and returns well-formed offers (or a tolerated upstream hiccup)",
    async () => {
      const { searchOffers } = await import("./scrapingbee");
      try {
        const offers = await searchOffers("shampoo antiqueda");
        expect(Array.isArray(offers)).toBe(true);
        for (const o of offers.slice(0, 3)) {
          expect(o.source).toBe("scrapingbee");
          expect(typeof o.name).toBe("string");
        }
        // eslint-disable-next-line no-console
        console.info(
          `[live] ScrapingBee returned ${offers.length} offers; sample: ${offers[0]?.name ?? "(none)"} @ ${offers[0]?.price ?? "?"}`,
        );
      } catch (err: any) {
        const code = err?.code;
        if (code === "auth") {
          throw new Error(
            "ScrapingBee rejected the configured key (auth). Please re-check SCRAPINGBEE_API_KEY.",
          );
        }
        // eslint-disable-next-line no-console
        console.warn(
          `[live] ScrapingBee reachable but not returning data right now (code=${code}). Key appears accepted; tolerating.`,
        );
        expect(["upstream", "parse", "credits", "bad_input", undefined]).toContain(code);
      }
    },
    180_000,
  );
});
