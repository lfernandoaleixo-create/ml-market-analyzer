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
 * Per-source max time before we give up on THAT source and triangulate with
 * whatever already arrived. Measured live for "palito de bambu": Oxylabs ~27s
 * (60 itens), ScrapingBee ~50s (60 itens), Unwrangle ~47s (often a transient
 * error after retries). A 60s ceiling per source comfortably covers the happy
 * path of the two reliable scrapers while preventing a single slow/erroring
 * source from holding the whole collection.
 */
const SOURCE_TIMEOUT_MS = (() => {
  const raw = process.env.COMPETITOR_SOURCE_TIMEOUT_MS;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 60_000;
})();

/**
 * GLOBAL ceiling for the whole collection. Even if some source is still within
 * its per-source budget, once we hit this wall-clock limit we finish with what
 * arrived so far. The UI promises ~30-45s; this keeps the worst case bounded so
 * the screen never sits on "Coletando…" for minutes.
 */
const JOB_DEADLINE_MS = (() => {
  const raw = process.env.COMPETITOR_JOB_DEADLINE_MS;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 70_000;
})();

/**
 * Once at least this many competitors have been collected from the sources that
 * already responded, we can finish EARLY without waiting for slower sources.
 * The fast, reliable source (Oxylabs) typically returns ~60 offers in ~27s, so
 * this lets a healthy search settle in well under the global deadline.
 */
const EARLY_FINISH_MIN_OFFERS = (() => {
  const raw = process.env.COMPETITOR_EARLY_FINISH_MIN_OFFERS;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 15;
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
 * Resolve the per-source outcomes using an EARLY-FINISH strategy:
 *  - all configured sources run in PARALLEL (each already capped at
 *    SOURCE_TIMEOUT_MS by probeSource);
 *  - as soon as the sources that ALREADY responded have produced at least
 *    EARLY_FINISH_MIN_OFFERS competitors, we stop waiting for the rest;
 *  - a global JOB_DEADLINE_MS guarantees we never wait longer than that even if
 *    no source has hit the early-finish threshold yet.
 * Sources that haven't resolved by the time we finish are reported as still
 * "upstream" (they simply didn't make it into THIS result) — their work is
 * abandoned, never awaited further.
 */
async function collectOutcomes(
  query: string,
  flags: Record<SourceId, boolean>,
): Promise<ProbeOutcome[]> {
  const specs: { source: SourceId; run: () => Promise<RawSourceOffer[]> }[] = [
    { source: "official", run: () => official.searchOffers(query) },
    { source: "unwrangle", run: () => unwrangleOffers(query) },
    { source: "oxylabs", run: () => oxylabs.searchOffers(query) },
    { source: "scrapingbee", run: () => scrapingbee.searchOffers(query) },
  ];

  // Settled outcomes keyed by source; configured-but-unsettled sources default
  // to a soft "upstream" note so the UI explains they didn't make this round.
  const settled = new Map<SourceId, ProbeOutcome>();
  for (const { source } of specs) {
    if (!flags[source]) {
      settled.set(source, {
        source,
        configured: false,
        offers: [],
        health: "unconfigured",
        note: null,
      });
    }
  }

  const configuredSpecs = specs.filter((s) => flags[s.source]);
  if (configuredSpecs.length === 0) {
    return specs.map((s) => settled.get(s.source)!);
  }

  let resolvedCount = 0;
  let resolveDone!: () => void;
  const earlyDone = new Promise<void>((r) => {
    resolveDone = r;
  });

  const collectedOffers = () =>
    Array.from(settled.values()).reduce((n, o) => n + o.offers.length, 0);

  for (const { source, run } of configuredSpecs) {
    void probeSource(source, true, run).then((outcome) => {
      settled.set(source, outcome);
      resolvedCount += 1;
      const t = Date.now() - t0;
      console.log(
        `[radar] "${query}" ${source}: ${outcome.health} (${outcome.offers.length} ofertas) em ${t}ms`,
      );
      // Finish early once every source settled OR we already have enough.
      if (
        resolvedCount === configuredSpecs.length ||
        collectedOffers() >= EARLY_FINISH_MIN_OFFERS
      ) {
        resolveDone();
      }
    });
  }

  const t0 = Date.now();
  const deadline = new Promise<void>((r) => setTimeout(r, JOB_DEADLINE_MS));
  await Promise.race([earlyDone, deadline]);

  // Build the final outcome list. Any configured source that hasn't settled yet
  // is reported honestly as a source that didn't contribute to this round.
  return specs.map((s) => {
    const got = settled.get(s.source);
    if (got) return got;
    return {
      source: s.source,
      configured: true,
      offers: [],
      health: "upstream" as const,
      note: "Não respondeu a tempo nesta coleta.",
    };
  });
}

/**
 * Run a triangulated competitor search across all configured sources.
 */
export async function searchAllSources(query: string): Promise<UnifiedSearchResult> {
  const flags = sourceConfigFlags();

  const outcomes = await collectOutcomes(query, flags);

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
