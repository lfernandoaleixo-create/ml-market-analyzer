/**
 * Multi-source orchestrator for competitor intelligence.
 *
 * Queries up to FOUR independent sources in parallel, isolates per-source
 * failures (one provider being down never breaks the whole result), then hands
 * the combined raw offers to the triangulation layer (`aggregator.ts`).
 *
 * Sources (all optional / gracefully skipped when not configured):
 *   - official    → Mercado Livre public API (env client-credentials)
 *   - unwrangle   → Unwrangle scraper
 *   - oxylabs     → Oxylabs E-Commerce Scraper API
 *   - scrapingbee → ScrapingBee scraper
 *
 * SECURITY: scraper sources only ever receive a public keyword / public URL.
 * The official source uses the public search path with no seller OAuth token.
 */

import type {
  RawSourceOffer,
  SourceId,
  SourceStatus,
  SourcesStatus,
  UnifiedSearchResult,
} from "@shared/sources";
import { ALL_SOURCES, SOURCE_LABELS } from "@shared/sources";
import { triangulate, strengthScore } from "./aggregator";

import * as official from "./officialSource";
import * as oxylabs from "./oxylabs";
import * as scrapingbee from "./scrapingbee";
import {
  isConfigured as unwrangleConfigured,
  searchProducts as unwrangleSearch,
} from "./unwrangle";

/**
 * Per-source max time before we give up and triangulate with what we have.
 * The JS-render scrapers drive a headless browser through ML's anti-bot SPA:
 * Oxylabs ~35s, ScrapingBee ~55s on the happy path. When a proxy serves an
 * empty page the provider RETRIES (another full render), so a single source can
 * need ~165s end to end under contention (measured live). Because the whole
 * search runs as an ASYNCHRONOUS background job (the UI polls; no HTTP request
 * is held open and Cloud Run's 180s request cap does NOT apply to the job), we
 * budget a generous 240s so a slow-but-valid source (ScrapingBee with one retry)
 * still gets to contribute and triangulation actually happens. Sources run in
 * PARALLEL, so wall-clock cost is bounded by the SLOWEST source, not their sum.
 */
const SOURCE_TIMEOUT_MS = (() => {
  const raw = process.env.COMPETITOR_SOURCE_TIMEOUT_MS;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 240_000;
})();

type ProbeOutcome = {
  source: SourceId;
  configured: boolean;
  offers: RawSourceOffer[];
  health: SourceStatus["health"];
  note: string | null;
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("source_timeout")),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Map an arbitrary thrown error to a coarse health signal + PT-BR note. */
function classifyError(source: SourceId, err: unknown): { health: SourceStatus["health"]; note: string } {
  const code = (err as { code?: string })?.code;
  const msg = err instanceof Error ? err.message : String(err);
  if (code === "auth" || code === "credits") {
    return { health: "auth", note: "Credenciais rejeitadas ou créditos esgotados." };
  }
  if (msg === "source_timeout") {
    return { health: "upstream", note: "A fonte demorou demais para responder." };
  }
  return { health: "upstream", note: "Fonte temporariamente indisponível." };
}

/** Adapt the Unwrangle search result to neutral RawSourceOffer[]. */
async function unwrangleOffers(query: string): Promise<RawSourceOffer[]> {
  const res = await unwrangleSearch(query);
  return res.results.map((c) => ({
    source: "unwrangle" as const,
    name: c.name,
    url: c.url || null,
    thumbnail: c.thumbnail,
    price: c.price,
    listingPrice: c.listingPrice,
    rating: c.rating,
    totalRatings: c.totalRatings,
    brand: c.brand,
    freeShipping: null,
    sellerReputation: null,
    // Unwrangle's ML Search payload does not expose these card badges.
    officialStore: null,
    fulfillment: null,
    hasCoupon: null,
    sponsored: null,
  }));
}

/** Probe a single source: returns offers or a classified failure (never throws). */
async function probeSource(
  source: SourceId,
  configured: boolean,
  run: () => Promise<RawSourceOffer[]>,
): Promise<ProbeOutcome> {
  if (!configured) {
    return { source, configured: false, offers: [], health: "unconfigured", note: null };
  }
  try {
    const offers = await withTimeout(run(), SOURCE_TIMEOUT_MS);
    return {
      source,
      configured: true,
      offers,
      health: "ok",
      note: offers.length === 0 ? "Sem resultados nesta consulta." : null,
    };
  } catch (err) {
    const { health, note } = classifyError(source, err);
    return { source, configured: true, offers: [], health, note };
  }
}

/** Are the source configured? (used by the status endpoint) */
export function sourceConfigFlags(): Record<SourceId, boolean> {
  return {
    official: official.isConfigured(),
    unwrangle: unwrangleConfigured(),
    oxylabs: oxylabs.isConfigured(),
    scrapingbee: scrapingbee.isConfigured(),
  };
}

/** Build the multi-source status snapshot (no network calls). */
export function getSourcesStatus(): SourcesStatus {
  const flags = sourceConfigFlags();
  const sources: SourceStatus[] = ALL_SOURCES.map((id) => ({
    id,
    label: SOURCE_LABELS[id],
    configured: flags[id],
    health: flags[id] ? "unknown" : "unconfigured",
    note: flags[id] ? null : "Não configurada.",
  }));
  const configuredCount = sources.filter((s) => s.configured).length;
  return {
    sources,
    configuredCount,
    anyAvailable: configuredCount > 0,
  };
}

/**
 * Run a triangulated competitor search across all configured sources.
 */
export async function searchAllSources(query: string): Promise<UnifiedSearchResult> {
  const flags = sourceConfigFlags();

  const outcomes = await Promise.all([
    probeSource("official", flags.official, () => official.searchOffers(query)),
    probeSource("unwrangle", flags.unwrangle, () => unwrangleOffers(query)),
    probeSource("oxylabs", flags.oxylabs, () => oxylabs.searchOffers(query)),
    probeSource("scrapingbee", flags.scrapingbee, () => scrapingbee.searchOffers(query)),
  ]);

  const allOffers = outcomes.flatMap((o) => o.offers);
  const competitors = triangulate(allOffers).sort(
    (a, b) => strengthScore(b) - strengthScore(a),
  );

  const sourcesUsed: SourceStatus[] = outcomes.map((o) => ({
    id: o.source,
    label: SOURCE_LABELS[o.source],
    configured: o.configured,
    health: o.health,
    note: o.note,
  }));

  const contributing = outcomes.filter((o) => o.offers.length > 0).length;

  return {
    query,
    competitors,
    sourcesUsed,
    triangulated: contributing > 1,
  };
}
