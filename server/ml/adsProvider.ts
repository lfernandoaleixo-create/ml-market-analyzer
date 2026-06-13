import type {
  AdsCampaign,
  AdsAdRow,
  AdsMetrics,
  AdsAccountSummary,
  AdsDashboard,
  AdsInsight,
} from "@shared/ads";
import { MLRateLimitError } from "./accountProvider";

/**
 * AdsProvider — reads REAL Mercado Ads (Product Ads) data for the connected
 * seller using the owner OAuth token.
 *
 * Validated endpoints (June 2026, MLB, owner token, READ scope):
 *  - GET /advertising/advertisers?product_id=PADS                 → advertiser id
 *  - GET /marketplace/advertising/{site}/advertisers/{adv}/product_ads/campaigns/search
 *  - GET /marketplace/advertising/{site}/advertisers/{adv}/product_ads/ads/search
 *
 * WRITE is intentionally NOT implemented here: the current app scope is
 * read-only for advertising (a PUT returns 401 "User does not have permission
 * to write"). When the write scope is enabled in the DevCenter and the account
 * re-consents, write actions can be added — until then this module is a
 * faithful, honest read + intelligence layer.
 *
 * Like AccountProvider, every request goes through `get()` which: respects 429
 * with capped backoff, refreshes the token once on 401/403, and surfaces a
 * persistent rate limit as MLRateLimitError instead of masking it as empty.
 */
const API = "https://api.mercadolibre.com";

const CAMPAIGN_METRICS = [
  "clicks",
  "prints",
  "cost",
  "cpc",
  "ctr",
  "acos",
  "sov",
  "direct_amount",
  "indirect_amount",
  "total_amount",
  "direct_units_quantity",
  "indirect_units_quantity",
  "units_quantity",
  "organic_units_quantity",
  "organic_items_quantity",
].join(",");

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : 0;
}

/**
 * Whether a Mercado Ads ad status means the ad is currently RUNNING.
 *
 * The ADS audit/category tracking must always follow ACTIVE ads only — never
 * paused/idle/closed ones. We treat the label defensively so a future API
 * wording change does not silently break the filter: anything that clearly
 * signals "off" is excluded; everything else (active/enabled, or an empty
 * label when the item is being served) counts as active.
 */
export function isActiveAdStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase().trim();
  if (s === "") return true; // ML sometimes omits status for a served ad
  const inactive = [
    "paused",
    "idle",
    "closed",
    "inactive",
    "deleted",
    "finished",
    "under_review",
    "rejected",
    "disabled",
  ];
  if (inactive.includes(s)) return false;
  return s === "active" || s === "enabled" || s === "running";
}

/** Normalize the ML metric block (snake_case) into our AdsMetrics (camelCase). */
function mapMetrics(m: any): AdsMetrics {
  m = m ?? {};
  return {
    clicks: num(m.clicks),
    prints: num(m.prints),
    cost: num(m.cost),
    cpc: num(m.cpc),
    ctr: num(m.ctr),
    acos: num(m.acos),
    sov: num(m.sov),
    directAmount: num(m.direct_amount),
    indirectAmount: num(m.indirect_amount),
    totalAmount: num(m.total_amount),
    directUnits: num(m.direct_units_quantity),
    indirectUnits: num(m.indirect_units_quantity),
    units: num(m.units_quantity),
    organicUnits: num(m.organic_units_quantity),
    organicItems: num(m.organic_items_quantity),
  };
}

/** Sum a list of metric blocks into a single aggregate. Rates (cpc/ctr/acos/sov)
 *  are RECOMPUTED from the summed base values so the aggregate is correct rather
 *  than a meaningless average of averages. */
export function aggregateMetrics(list: AdsMetrics[]): AdsMetrics {
  const acc: AdsMetrics = {
    clicks: 0, prints: 0, cost: 0, cpc: 0, ctr: 0, acos: 0, sov: 0,
    directAmount: 0, indirectAmount: 0, totalAmount: 0,
    directUnits: 0, indirectUnits: 0, units: 0, organicUnits: 0, organicItems: 0,
  };
  for (const m of list) {
    acc.clicks += m.clicks;
    acc.prints += m.prints;
    acc.cost += m.cost;
    acc.directAmount += m.directAmount;
    acc.indirectAmount += m.indirectAmount;
    acc.totalAmount += m.totalAmount;
    acc.directUnits += m.directUnits;
    acc.indirectUnits += m.indirectUnits;
    acc.units += m.units;
    acc.organicUnits += m.organicUnits;
    acc.organicItems += m.organicItems;
  }
  acc.cpc = acc.clicks > 0 ? round2(acc.cost / acc.clicks) : 0;
  acc.ctr = acc.prints > 0 ? round2((acc.clicks / acc.prints) * 100) : 0;
  acc.acos = acc.totalAmount > 0 ? round2((acc.cost / acc.totalAmount) * 100) : 0;
  // SOV cannot be summed meaningfully across campaigns; leave at 0 in aggregate.
  acc.sov = 0;
  return acc;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export class AdsProvider {
  static readonly MAX_RATE_LIMIT_RETRIES = 4;

  private advertiserId: number | null = null;

  constructor(
    private token: string,
    private site = "MLB",
    private onUnauthorized?: (staleToken: string) => Promise<string | null>,
  ) {}

  private async get(
    path: string,
    timeoutMs = 12000,
    _isRetry = false,
    _rateLimitAttempt = 0,
  ): Promise<any | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${API}${path}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          "Api-Version": "1",
        },
        signal: ctrl.signal,
      });
      if (res.status === 429) {
        clearTimeout(timer);
        const retryAfterHeader = res.headers.get("retry-after");
        if (_rateLimitAttempt < AdsProvider.MAX_RATE_LIMIT_RETRIES) {
          const retryAfterMs = retryAfterHeader
            ? Number(retryAfterHeader) * 1000
            : Math.min(8000, 500 * 2 ** _rateLimitAttempt);
          const waitMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 1000;
          await new Promise((r) => setTimeout(r, waitMs));
          return this.get(path, timeoutMs, _isRetry, _rateLimitAttempt + 1);
        }
        const retryAfterSec =
          retryAfterHeader && Number(retryAfterHeader) > 0 ? Number(retryAfterHeader) : 30;
        throw new MLRateLimitError(retryAfterSec);
      }
      if ((res.status === 401 || res.status === 403) && this.onUnauthorized && !_isRetry) {
        clearTimeout(timer);
        const fresh = await this.onUnauthorized(this.token);
        if (fresh && fresh !== this.token) {
          this.token = fresh;
          return this.get(path, timeoutMs, true, _rateLimitAttempt);
        }
        return null;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      if (err instanceof MLRateLimitError) throw err;
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Resolve (and cache) the advertiser id for Product Ads. Returns null when
   *  the account has no Product Ads access. */
  async getAdvertiserId(): Promise<number | null> {
    if (this.advertiserId != null) return this.advertiserId;
    const data = await this.get(`/advertising/advertisers?product_id=PADS`);
    const advertisers: any[] = Array.isArray(data?.advertisers) ? data.advertisers : [];
    const mlb = advertisers.find((a) => a.site_id === this.site) ?? advertisers[0];
    this.advertiserId = mlb ? num(mlb.advertiser_id) : null;
    return this.advertiserId;
  }

  private dateParams(days: number): string {
    const to = new Date();
    const from = new Date(Date.now() - days * 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return `date_from=${fmt(from)}&date_to=${fmt(to)}`;
  }

  /** All campaigns (paged) with metrics for the window. */
  async getCampaigns(days = 30): Promise<AdsCampaign[]> {
    const adv = await this.getAdvertiserId();
    if (!adv) return [];
    const out: AdsCampaign[] = [];
    let offset = 0;
    const limit = 50;
    for (let page = 0; page < 10; page++) {
      const data = await this.get(
        `/marketplace/advertising/${this.site}/advertisers/${adv}/product_ads/campaigns/search` +
          `?limit=${limit}&offset=${offset}&${this.dateParams(days)}&metrics=${CAMPAIGN_METRICS}`,
      );
      const results: any[] = Array.isArray(data?.results) ? data.results : [];
      for (const c of results) {
        out.push({
          id: num(c.id),
          name: c.name ?? `Campanha ${c.id}`,
          status: c.status ?? "idle",
          strategy: c.strategy ?? "",
          acosTarget: c.acos_target != null ? num(c.acos_target) : null,
          roasTarget: c.roas_target != null ? num(c.roas_target) : null,
          budget: c.budget != null ? num(c.budget) : null,
          automaticBudget: !!c.automatic_budget,
          channel: c.channel ?? "marketplace",
          dateCreated: c.date_created ?? null,
          lastUpdated: c.last_updated ?? null,
          metrics: mapMetrics(c.metrics),
        });
      }
      const total = num(data?.paging?.total);
      offset += limit;
      if (offset >= total || results.length === 0) break;
    }
    return out;
  }

  /**
   * Ads (item-level) with metrics. Optionally filter to a single campaign.
   *
   * Pass `activeOnly: true` to keep only ads that are currently running. The
   * audit/category snapshot ALWAYS uses this so the tracking follows the active
   * set, never paused/closed ads.
   */
  async getAds(
    days = 30,
    campaignId?: number,
    maxAds = 300,
    options?: { activeOnly?: boolean },
  ): Promise<AdsAdRow[]> {
    const adv = await this.getAdvertiserId();
    if (!adv) return [];
    const out: AdsAdRow[] = [];
    let offset = 0;
    const limit = 50;
    const campaignParam = campaignId ? `&campaign_id=${campaignId}` : "";
    for (let page = 0; page < 20 && out.length < maxAds; page++) {
      const data = await this.get(
        `/marketplace/advertising/${this.site}/advertisers/${adv}/product_ads/ads/search` +
          `?limit=${limit}&offset=${offset}${campaignParam}&${this.dateParams(days)}&metrics=${CAMPAIGN_METRICS}`,
      );
      const results: any[] = Array.isArray(data?.results) ? data.results : [];
      for (const a of results) {
        out.push({
          itemId: a.item_id ?? "",
          campaignId: num(a.campaign_id),
          title: a.title ?? "",
          price: num(a.price),
          status: a.status ?? "",
          thumbnail: a.thumbnail ?? null,
          permalink: a.permalink ?? null,
          listingTypeId: a.listing_type_id ?? null,
          logisticType: a.logistic_type ?? null,
          buyBoxWinner: !!a.buy_box_winner,
          catalogListing: !!a.catalog_listing,
          brand: a.brand_value_name && a.brand_value_name !== "null" ? a.brand_value_name : null,
          imageQuality: a.image_quality ?? null,
          hasDiscount: !!a.has_discount,
          metrics: mapMetrics(a.metrics),
        });
      }
      const total = num(data?.paging?.total);
      offset += limit;
      if (offset >= total || results.length === 0) break;
    }
    if (options?.activeOnly) {
      return out.filter((a) => isActiveAdStatus(a.status));
    }
    return out;
  }

  /** Convenience: only ads that are currently running. */
  async getActiveAds(days = 30, campaignId?: number, maxAds = 300): Promise<AdsAdRow[]> {
    return this.getAds(days, campaignId, maxAds, { activeOnly: true });
  }

  /** Build the account-level summary from the campaign list. */
  buildSummary(campaigns: AdsCampaign[], advertiserId: number, currency = "BRL"): AdsAccountSummary {
    const metrics = aggregateMetrics(campaigns.map((c) => c.metrics));
    const totalBudget = campaigns.reduce((s, c) => s + (c.budget ?? 0), 0);
    const roas = metrics.cost > 0 ? round2(metrics.totalAmount / metrics.cost) : null;
    const acos = metrics.totalAmount > 0 ? round2((metrics.cost / metrics.totalAmount) * 100) : null;
    const conversionRate = metrics.clicks > 0 ? round2((metrics.units / metrics.clicks) * 100) : null;
    const organicShare =
      metrics.units + metrics.organicUnits > 0
        ? round2((metrics.organicUnits / (metrics.units + metrics.organicUnits)) * 100)
        : null;
    return {
      advertiserId,
      currency,
      campaignCount: campaigns.length,
      activeCampaignCount: campaigns.filter((c) => c.status === "active").length,
      metrics,
      derived: { roas, acos, conversionRate, totalBudget, organicShare },
    };
  }

  /** Full dashboard payload: summary + top campaigns + top ads + insight count. */
  async getDashboard(days = 30): Promise<AdsDashboard> {
    const adv = await this.getAdvertiserId();
    if (!adv) return { connection: "no_ads_access", summary: null, topCampaigns: [], topAds: [], insightsCount: 0 };
    const campaigns = await this.getCampaigns(days);
    const summary = this.buildSummary(campaigns, adv);
    const topCampaigns = [...campaigns].sort((a, b) => b.metrics.cost - a.metrics.cost).slice(0, 5);
    const ads = await this.getAds(days, undefined, 300);
    const topAds = [...ads].sort((a, b) => b.metrics.cost - a.metrics.cost).slice(0, 6);
    const insights = buildAdsInsights(summary, campaigns, ads);
    return { connection: "connected", summary, topCampaigns, topAds, insightsCount: insights.length };
  }
}

/**
 * Read-only intelligence: turn real metrics into actionable, honest insights.
 * No write actions are performed — these are recommendations the team can act on
 * (or that future automation will execute once the write scope is enabled).
 */
export function buildAdsInsights(
  summary: AdsAccountSummary,
  campaigns: AdsCampaign[],
  ads: AdsAdRow[],
): AdsInsight[] {
  const insights: AdsInsight[] = [];

  // 1. Campaigns running well above their ACOS target (eroding margin).
  for (const c of campaigns) {
    if (c.acosTarget && c.metrics.cost > 0 && c.metrics.acos > c.acosTarget * 1.25 && c.metrics.acos > 0) {
      insights.push({
        id: `acos-over-${c.id}`,
        severity: "critical",
        scope: "campaign",
        refId: String(c.id),
        title: `ACOS acima do alvo em "${c.name}"`,
        detail: `O ACOS real está em ${c.metrics.acos.toFixed(1)}%, bem acima do alvo de ${c.acosTarget.toFixed(1)}%. Isso indica gasto pouco eficiente — vale revisar o alvo ou os anúncios desta campanha.`,
        metric: { label: "ACOS real", value: `${c.metrics.acos.toFixed(1)}%` },
      });
    }
  }

  // 2. Ads spending money with zero sales (clear waste).
  const wasteful = ads
    .filter((a) => a.metrics.cost > 0 && a.metrics.units === 0)
    .sort((a, b) => b.metrics.cost - a.metrics.cost);
  if (wasteful.length > 0) {
    const wasted = wasteful.reduce((s, a) => s + a.metrics.cost, 0);
    insights.push({
      id: "ads-zero-sales",
      severity: "warning",
      scope: "account",
      title: `${wasteful.length} anúncio(s) gastando sem vender`,
      detail: `Existem anúncios consumindo verba sem nenhuma venda atribuída no período. O maior deles é "${wasteful[0].title.slice(0, 50)}". Revisar lance, preço ou qualidade pode recuperar essa verba.`,
      metric: { label: "Verba sem retorno", value: `R$ ${wasted.toFixed(2)}` },
    });
  }

  // 3. Strong performers worth scaling (good ACOS + real sales).
  const winners = ads
    .filter((a) => a.metrics.units > 0 && a.metrics.acos > 0 && a.metrics.acos < 12)
    .sort((a, b) => b.metrics.units - a.metrics.units);
  if (winners.length > 0) {
    insights.push({
      id: "ads-scale-winners",
      severity: "good",
      scope: "account",
      title: `${winners.length} anúncio(s) com ótimo retorno para escalar`,
      detail: `Anúncios como "${winners[0].title.slice(0, 50)}" vendem com ACOS baixo (${winners[0].metrics.acos.toFixed(1)}%). Aumentar a presença deles tende a trazer mais venda mantendo a eficiência.`,
      metric: { label: "Melhor ACOS", value: `${winners[0].metrics.acos.toFixed(1)}%` },
    });
  }

  // 4. Organic halo: campaigns also lifting organic sales.
  if (summary.derived.organicShare && summary.derived.organicShare > 0) {
    insights.push({
      id: "organic-halo",
      severity: "info",
      scope: "account",
      title: "Os anúncios estão impulsionando vendas orgânicas",
      detail: `Cerca de ${summary.derived.organicShare.toFixed(0)}% das unidades atribuídas ao período foram orgânicas — ou seja, investir em Ads também aquece a venda que não paga clique. Esse efeito raramente é considerado por ferramentas que olham só o Ads.`,
      metric: { label: "Parcela orgânica", value: `${summary.derived.organicShare.toFixed(0)}%` },
    });
  }

  // 5. Low CTR ads (creative/relevance problem).
  const lowCtr = ads.filter((a) => a.metrics.prints > 500 && a.metrics.ctr > 0 && a.metrics.ctr < 0.05);
  if (lowCtr.length > 0) {
    insights.push({
      id: "low-ctr",
      severity: "warning",
      scope: "account",
      title: `${lowCtr.length} anúncio(s) com baixa taxa de clique`,
      detail: `Alguns anúncios aparecem bastante mas recebem poucos cliques (CTR baixo). Geralmente é a foto principal, o título ou o preço que precisam de ajuste para converter a exibição em clique.`,
    });
  }

  return insights;
}
