/**
 * Throwaway timing probe: measure how long each competitor source takes for a
 * single real query, to calibrate the orchestrator timeouts. Run with tsx.
 */
import "dotenv/config";
import * as oxylabs from "../server/competitors/oxylabs";
import * as scrapingbee from "../server/competitors/scrapingbee";
import { searchProducts as unwrangleSearch, isConfigured as uwConfigured } from "../server/competitors/unwrangle";

const query = process.argv[2] || "palito de bambu";

async function time<T>(label: string, fn: () => Promise<T>): Promise<void> {
  const t0 = Date.now();
  try {
    const r = await fn();
    const n = Array.isArray((r as any)) ? (r as any).length : (r as any)?.results?.length ?? "ok";
    console.log(`${label}: ${Date.now() - t0}ms -> ${n} itens`);
  } catch (e) {
    console.log(`${label}: ${Date.now() - t0}ms -> ERRO ${(e as Error).message}`);
  }
}

(async () => {
  console.log(`Query: "${query}"`);
  console.log("unwrangle configured:", uwConfigured(), "| oxylabs:", oxylabs.isConfigured(), "| scrapingbee:", scrapingbee.isConfigured());
  await Promise.all([
    time("unwrangle", () => unwrangleSearch(query)),
    time("oxylabs", () => oxylabs.searchOffers(query)),
    time("scrapingbee", () => scrapingbee.searchOffers(query)),
  ]);
  process.exit(0);
})();
