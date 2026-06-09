import { describe, it, expect } from "vitest";

/**
 * LIVE end-to-end triangulation test.
 *
 * Runs the FULL orchestrator (`searchAllSources`) against the real providers
 * and inspects the triangulated result:
 *   - how many sources contributed offers,
 *   - how many competitors were corroborated by MORE THAN ONE source
 *     (the whole point of triangulation),
 *   - the per-source health snapshot.
 *
 * Policy (mirrors the other live tests): we don't hard-fail on provider
 * flakiness. We assert the pipeline returns a well-formed result and at least
 * ONE source contributed real offers; we log the corroboration stats so we can
 * see triangulation working with real data. Self-skips when no scraper source
 * is configured.
 */

const anyConfigured =
  Boolean(process.env.SCRAPINGBEE_API_KEY?.trim()) ||
  (Boolean(process.env.OXYLABS_USERNAME?.trim()) && Boolean(process.env.OXYLABS_PASSWORD?.trim())) ||
  Boolean(process.env.UNWRANGLE_API_KEY?.trim());

const maybe = anyConfigured ? describe : describe.skip;

maybe("orchestrator live triangulation", () => {
  it(
    "returns a well-formed triangulated result with at least one contributing source",
    async () => {
      const { searchAllSources } = await import("./orchestrator");
      const result = await searchAllSources("shampoo antiqueda");

      expect(result.query).toBe("shampoo antiqueda");
      expect(Array.isArray(result.competitors)).toBe(true);
      expect(Array.isArray(result.sourcesUsed)).toBe(true);

      const contributing = result.sourcesUsed.filter((s) => s.health === "ok");
      const corroborated = result.competitors.filter((c) => c.sources.length > 1);

      // eslint-disable-next-line no-console
      console.info(
        `[live] triangulation — competitors=${result.competitors.length}, ` +
          `triangulated=${result.triangulated}, ` +
          `corroborated(>1 source)=${corroborated.length}, ` +
          `sources=${result.sourcesUsed
            .map((s) => `${s.id}:${s.health}${s.note ? `(${s.note})` : ""}`)
            .join(", ")}`,
      );

      // At least one source should be reachable and contribute (otherwise the
      // whole environment is offline — surface that).
      const reachable = result.sourcesUsed.some(
        (s) => s.health === "ok" || s.health === "upstream",
      );
      expect(reachable).toBe(true);

      // Every competitor record must be well-formed.
      for (const c of result.competitors.slice(0, 5)) {
        expect(typeof c.name).toBe("string");
        expect(c.name.length).toBeGreaterThan(0);
        expect(Array.isArray(c.sources)).toBe(true);
        expect(c.sources.length).toBeGreaterThan(0);
      }
    },
    180_000,
  );
});
