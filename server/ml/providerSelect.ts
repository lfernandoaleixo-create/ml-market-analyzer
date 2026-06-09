import { getProvider, type MercadoLivreProvider } from "./provider";
import { ScrapingProvider, hasScrapingSources } from "./scrapingProvider";
import { getCredentials } from "../dbMl";
import { ensureUserAccessToken } from "./oauthMl";

/**
 * Data-source origin for a resolved provider, used to keep the UI honest about
 * where the numbers come from.
 *  - "official": the user connected their Mercado Livre account (live API).
 *  - "scraping": real public data triangulated from the Radar sources.
 *  - "demo": no real source configured — deterministic sample data.
 */
export type ProviderOrigin = "official" | "scraping" | "demo";

/**
 * Central provider resolution shared by market, monitor and monitoring.
 * Priority: official (user OAuth/credentials) → scraping (public sources) → demo.
 */
export async function resolveProviderForUser(
  userId?: number,
): Promise<{ provider: MercadoLivreProvider; origin: ProviderOrigin }> {
  if (userId) {
    const creds = await getCredentials(userId);
    if (creds && creds.appId && creds.clientSecret) {
      return {
        provider: getProvider(
          { appId: creds.appId, clientSecret: creds.clientSecret },
          {
            siteId: creds.siteId || "MLB",
            userTokenResolver: () => ensureUserAccessToken(userId),
          },
        ),
        origin: "official",
      };
    }
  }
  if (hasScrapingSources()) {
    return { provider: new ScrapingProvider(), origin: "scraping" };
  }
  return { provider: getProvider(null), origin: "demo" };
}

/** True when the resolved origin reflects REAL data (not the demo fallback). */
export function isRealOrigin(origin: ProviderOrigin): boolean {
  return origin === "official" || origin === "scraping";
}
