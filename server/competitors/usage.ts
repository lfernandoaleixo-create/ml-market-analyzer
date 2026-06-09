/**
 * Consumption / quota panel for the competitor data sources.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  SECURITY BOUNDARY: like every other module under server/competitors, this
 *  file is fully isolated from the ML seller account. It only ever talks to the
 *  paid scraper providers using their OWN dedicated credentials. No ML OAuth
 *  token, CNPJ, cookies or seller identity is involved here.
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  WHAT IT REPORTS
 *  Each paid provider differs in how (and whether) it exposes usage:
 *   - ScrapingBee  → GET /usage returns { max_api_credit, used_api_credit, ... }.
 *                    We surface remaining credits + renewal date as a "quota".
 *   - Oxylabs      → the Web Scraper API has no simple public balance endpoint;
 *                    consumption is shown on its dashboard. We report it honestly
 *                    as "panel_only" so the UI never invents a number.
 *   - Unwrangle    → same as Oxylabs (panel_only) when configured.
 *   - official     → free public API, no quota to report (omitted).
 *
 *  All network access is injectable (FetchLike) so tests run without real keys.
 */

import { ENV } from "../_core/env";
import type { SourceId, SourceUsage, UsageStatus } from "@shared/sources";
import { SOURCE_LABELS } from "@shared/sources";
import type { FetchLike } from "./providerHttp";
import { countSearchesSince } from "./searchStore";

const SCRAPINGBEE_USAGE_ENDPOINT = "https://app.scrapingbee.com/api/v1/usage";

/** Build the start-of-today (UTC) unix-ms instant. */
export function startOfTodayUtc(now: number = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** 30 days ago in unix-ms. */
export function thirtyDaysAgo(now: number = Date.now()): number {
  return now - 30 * 24 * 60 * 60 * 1000;
}

function emptyUsage(id: SourceId, kind: SourceUsage["kind"], note: string | null): SourceUsage {
  return {
    id,
    label: SOURCE_LABELS[id],
    kind,
    maxCredits: null,
    usedCredits: null,
    remainingCredits: null,
    renewalAt: null,
    note,
  };
}

/**
 * Query the ScrapingBee usage endpoint and normalize it into a SourceUsage.
 * Never throws: any failure becomes a kind="error" entry so the panel degrades
 * gracefully instead of breaking the whole request.
 */
export async function getScrapingBeeUsage(
  fetchImpl: FetchLike = fetch,
): Promise<SourceUsage> {
  const key = ENV.scrapingBeeApiKey?.trim();
  if (!key) {
    return emptyUsage("scrapingbee", "unconfigured", "ScrapingBee não está configurado.");
  }

  const url = new URL(SCRAPINGBEE_USAGE_ENDPOINT);
  url.searchParams.set("api_key", key);

  let res: Response;
  try {
    res = await fetchImpl(url.toString(), { method: "GET" });
  } catch {
    return emptyUsage("scrapingbee", "error", "Falha de rede ao consultar a ScrapingBee.");
  }

  if (res.status === 401) {
    return emptyUsage("scrapingbee", "error", "Chave da ScrapingBee inválida.");
  }
  if (!res.ok) {
    return emptyUsage("scrapingbee", "error", "Não foi possível ler o consumo da ScrapingBee.");
  }

  const body = (await res.json().catch(() => null)) as
    | {
        max_api_credit?: number;
        used_api_credit?: number;
        // Some accounts also expose subscription metadata; renewal is optional.
        renewal_period_end?: string | number;
        max_concurrency?: number;
      }
    | null;

  if (!body || typeof body.max_api_credit !== "number") {
    return emptyUsage("scrapingbee", "error", "Resposta inesperada da ScrapingBee.");
  }

  const max = body.max_api_credit;
  const used = typeof body.used_api_credit === "number" ? body.used_api_credit : 0;
  const remaining = Math.max(0, max - used);

  let renewalAt: number | null = null;
  if (body.renewal_period_end !== undefined && body.renewal_period_end !== null) {
    const parsed =
      typeof body.renewal_period_end === "number"
        ? body.renewal_period_end
        : Date.parse(body.renewal_period_end);
    if (Number.isFinite(parsed)) renewalAt = parsed;
  }

  return {
    id: "scrapingbee",
    label: SOURCE_LABELS.scrapingbee,
    kind: "quota",
    maxCredits: max,
    usedCredits: used,
    remainingCredits: remaining,
    renewalAt,
    note: null,
  };
}

/**
 * Oxylabs has no simple public balance endpoint for the Web Scraper API, so we
 * report it honestly: configured → "panel_only" (consumption visible on the
 * Oxylabs dashboard); otherwise "unconfigured".
 */
export function getOxylabsUsage(): SourceUsage {
  const configured = Boolean(
    ENV.oxylabsUsername?.trim() && ENV.oxylabsPassword?.trim(),
  );
  return configured
    ? emptyUsage(
        "oxylabs",
        "panel_only",
        "Consumo visível no painel da Oxylabs (sem saldo público via API).",
      )
    : emptyUsage("oxylabs", "unconfigured", "Oxylabs não está configurado.");
}

/** Unwrangle: same honest treatment as Oxylabs (no public balance endpoint). */
export function getUnwrangleUsage(): SourceUsage {
  const configured = Boolean(ENV.unwrangleApiKey?.trim());
  return configured
    ? emptyUsage(
        "unwrangle",
        "panel_only",
        "Consumo visível no painel da Unwrangle.",
      )
    : emptyUsage("unwrangle", "unconfigured", "Unwrangle não está configurado.");
}

/**
 * Build the full consumption panel for a user: per-source quota/state plus the
 * user's own search counts (today and last 30 days). The official public API is
 * free and has no quota, so it is intentionally omitted from this panel.
 */
export async function getUsageStatus(
  userId: number,
  fetchImpl: FetchLike = fetch,
  now: number = Date.now(),
): Promise<UsageStatus> {
  const [scrapingbee, searchesToday, searchesLast30Days] = await Promise.all([
    getScrapingBeeUsage(fetchImpl),
    countSearchesSince(userId, startOfTodayUtc(now)),
    countSearchesSince(userId, thirtyDaysAgo(now)),
  ]);

  const sources: SourceUsage[] = [scrapingbee, getOxylabsUsage(), getUnwrangleUsage()];

  return { sources, searchesToday, searchesLast30Days };
}
