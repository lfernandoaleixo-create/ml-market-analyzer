import type {
  ListingRow,
  ListingStatus,
  ListingsResult,
  PostSaleItem,
  PostSaleResult,
  ReputationInfo,
  SalesDashboard,
  SalesDayPoint,
  TopProduct,
  PeriodSummary,
  StoreLifetime,
  DayProducts,
  VisitsDayPoint,
  TechSpecsResult,
  TechSpecListing,
} from "@shared/account";
import {
  diagnoseListing,
  buildTechSpecsResult,
  type RawCategoryAttribute,
  type RawItemAttribute,
} from "@shared/technicalSpecs";
import { mlLimiter } from "./mlRateLimiter";
import { readVisits, ensureCollecting } from "./visitsStore";
import { readDailyVisits, ensureCollectingDaily } from "./visitsDailyStore";

/**
 * AccountProvider — reads REAL data from the connected seller account using the
 * owner (proprietary) OAuth token. Unlike market/competitor data (blocked by
 * ML's public API), the owner token unlocks the seller's own orders, listings,
 * visits, post-sale claims and reputation.
 *
 * Validated endpoints (June 2026, MLB, owner token):
 *  - GET /users/me                                   → profile + reputation
 *  - GET /users/{id}/items/search                    → own item ids (paged)
 *  - GET /items/{id}                                  → price/stock/sold/status
 *  - GET /items/{id}/visits/time_window?last=&unit=  → visits time series
 *  - GET /orders/search?seller={id}&sort=date_desc   → orders (paged)
 *  - GET /post-purchase/v1/claims/search?status=     → claims (needs a filter)
 *
 * The provider degrades gracefully: any failing optional call is skipped and we
 * never fabricate numbers (important for a brand-new, low-volume account).
 */
const API = "https://api.mercadolibre.com";

/**
 * Thrown when Mercado Livre keeps replying 429 (rate limited) after we have
 * exhausted our retries. This MUST NOT be swallowed into a null/empty result:
 * a rate limit means "the data exists, ML just won't serve it right now", which
 * is completely different from "the store has no sales". Masking it as an empty
 * result is exactly what produced the all-zero dashboard during the live demo.
 * Callers surface this as an honest, retryable error in the UI.
 */
export class MLRateLimitError extends Error {
  readonly retryAfterSec: number;
  constructor(retryAfterSec = 30) {
    super(
      `O Mercado Livre limitou temporariamente as consultas (429). Aguarde cerca de ${retryAfterSec}s e tente novamente.`,
    );
    this.name = "MLRateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

/**
 * Extrai o peso da embalagem do vendedor (gramas) a partir dos atributos do ML.
 * O ML usa o `SELLER_PACKAGE_WEIGHT` para calcular o frete. O valor vem como
 * string com unidade (ex.: "1920 g", "2.5 kg", "400"). Converte tudo para gramas.
 * Retorna null quando o anúncio não declara o peso.
 */
export function extractPackageWeightGrams(attributes: unknown): number | null {
  if (!Array.isArray(attributes)) return null;
  const attr = attributes.find((a: any) => a?.id === "SELLER_PACKAGE_WEIGHT");
  if (!attr) return null;
  // Prefer the structured value when present (value_struct: { number, unit }).
  const vs = (attr as any).value_struct;
  if (vs && typeof vs.number === "number") {
    const unit = String(vs.unit ?? "g").toLowerCase();
    return unit.startsWith("kg") ? vs.number * 1000 : vs.number;
  }
  const raw = String((attr as any).value_name ?? (attr as any).values?.[0]?.name ?? "").trim();
  if (!raw) return null;
  // Aceita "1.920,5 g" / "1920 g" / "2,5 kg" / "2.5kg".
  const m = raw.match(/([\d.,]+)\s*(kg|g)?/i);
  if (!m) return null;
  let numStr = m[1];
  // Normaliza separadores: se tiver vírgula como decimal, troca por ponto.
  if (numStr.includes(",") && numStr.includes(".")) {
    numStr = numStr.replace(/\./g, "").replace(",", "."); // 1.920,5 -> 1920.5
  } else if (numStr.includes(",")) {
    numStr = numStr.replace(",", ".");
  }
  const num = Number(numStr);
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = (m[2] ?? "g").toLowerCase();
  return unit === "kg" ? num * 1000 : num;
}

export class AccountProvider {
  /** Max retries when ML responds 429 (rate limited). */
  static readonly MAX_RATE_LIMIT_RETRIES = 4;

  constructor(
    private token: string,
    private userId: number,
    private currency = "BRL",
    /**
     * Optional callback invoked when a request comes back unauthorized (401/403).
     * It should force-refresh the OAuth token and return the new one (or null).
     * When provided, `get()` retries the request once with the fresh token.
     */
    private onUnauthorized?: (staleToken: string) => Promise<string | null>,
  ) {}

  /** Cache of ALL paid orders for this provider instance (one request burst per
   *  request lifecycle). Multiple period summaries reuse it without re-paging. */
  private paidOrdersCache: any[] | null = null;

  private async getPaidOrders(): Promise<any[]> {
    if (this.paidOrdersCache) return this.paidOrdersCache;
    this.paidOrdersCache = await this.getOrdersByStatus("paid");
    return this.paidOrdersCache;
  }

  /** Cache of ALL cancelled orders (with their date_created) for this instance,
   *  used to mark which days had cancellations in the daily series. */
  private cancelledOrdersCache: any[] | null = null;

  private async getCancelledOrders(): Promise<any[]> {
    if (this.cancelledOrdersCache) return this.cancelledOrdersCache;
    this.cancelledOrdersCache = await this.getOrdersByStatus("cancelled");
    return this.cancelledOrdersCache;
  }

  /**
   * Run `work` but never wait longer than `budgetMs`. If the budget elapses
   * first, resolve with `fallback` instead of blocking the whole request. The
   * underlying work keeps running but its (late) result is ignored. Used to keep
   * the dashboard responsive when the heavy per-item visits fan-out is slow:
   * the page renders totals/status/stock immediately and the visits series just
   * comes back empty instead of timing out the entire response.
   */
  private async withBudget<T>(work: Promise<T>, budgetMs: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const guard = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), budgetMs);
    });
    // Visits are best-effort: if the bounded work REJECTS (e.g. a 429 mid fan-out)
    // we must NOT let it bubble up and crash the whole dashboard — the page still
    // has its essential data. Swallow the rejection into the fallback. Essential
    // calls (orders, users/me) do NOT go through withBudget, so their 429s still
    // propagate as an honest, retryable error.
    const safeWork = work.catch(() => fallback);
    try {
      return await Promise.race([safeWork, guard]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Max retries for a transient NETWORK failure (timeout / socket closed).
   *  The Mercado Livre API is reached through the sandbox/Cloud Run egress, and
   *  the FIRST connection after an idle period frequently times out or gets its
   *  socket closed mid-handshake, succeeding only on the 2nd/3rd try. Without a
   *  network retry (we previously only retried 429s) that first failure returns
   *  null, which silently zeroed the background visits collection and left the
   *  chart stuck on "Carregando". A couple of cheap retries fixes that. */
  static readonly MAX_NETWORK_RETRIES = 3;

  private async get(
    path: string,
    timeoutMs = 12000,
    _isRetry = false,
    _rateLimitAttempt = 0,
    _networkAttempt = 0,
  ): Promise<any | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      // Funnel every ML call through the shared global limiter: parallel pages
      // (Vendas/Anúncios/Pós-venda/Reputação + ADS) are serialized and spaced
      // instead of bursting at ML, which is what triggered the 429s.
      const res = await mlLimiter.schedule(() =>
        fetch(`${API}${path}`, {
          headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
          signal: ctrl.signal,
        }),
      );

      // Rate limited (429): ML throttles bursts. Respect Retry-After when present,
      // otherwise use a capped exponential backoff, and retry a few times. We do
      // NOT treat this as a hard failure — the data is there, we just need to wait.
      if (res.status === 429) {
        clearTimeout(timer);
        const retryAfterHeader = res.headers.get("retry-after");
        if (_rateLimitAttempt < AccountProvider.MAX_RATE_LIMIT_RETRIES) {
          const retryAfterMs = retryAfterHeader
            ? Number(retryAfterHeader) * 1000
            : Math.min(8000, 500 * 2 ** _rateLimitAttempt);
          const waitMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 1000;
          // Back off the WHOLE queue, not just this call.
          mlLimiter.applyCooldown(waitMs);
          await new Promise((r) => setTimeout(r, waitMs));
          return this.get(path, timeoutMs, _isRetry, _rateLimitAttempt + 1, _networkAttempt);
        }
        // Retries exhausted: signal the rate limit instead of masking it as an
        // empty result. This is what stops the dashboard from showing a fake
        // R$ 0,00 / zeros when ML is actually just throttling us.
        const retryAfterSec = retryAfterHeader && Number(retryAfterHeader) > 0 ? Number(retryAfterHeader) : 30;
        throw new MLRateLimitError(retryAfterSec);
      }

      // Token died mid-flight (expired/revoked before its advertised expiry).
      // Force a refresh and retry the request ONCE with the new token.
      if ((res.status === 401 || res.status === 403) && this.onUnauthorized && !_isRetry) {
        clearTimeout(timer);
        const fresh = await this.onUnauthorized(this.token);
        if (fresh && fresh !== this.token) {
          this.token = fresh;
          return this.get(path, timeoutMs, true, _rateLimitAttempt, _networkAttempt);
        }
        return null;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      // A rate-limit signal must propagate (so the UI can show an honest retry).
      if (err instanceof MLRateLimitError) throw err;
      // Transient network failure (timeout / aborted / socket closed): the ML
      // egress frequently drops the FIRST connection and succeeds on a retry.
      // Retry a few times with a short backoff before giving up. This is the
      // fix for the visits chart that stayed on "Carregando": the background
      // collection's first call no longer silently returns null.
      if (_networkAttempt < AccountProvider.MAX_NETWORK_RETRIES) {
        clearTimeout(timer);
        await new Promise((r) => setTimeout(r, 400 * (_networkAttempt + 1)));
        return this.get(path, timeoutMs, _isRetry, _rateLimitAttempt, _networkAttempt + 1);
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- Reputation / profile ---------------------------------------------

  async getReputation(): Promise<ReputationInfo | null> {
    const me = await this.get("/users/me");
    if (!me) return null;
    const rep = me.seller_reputation ?? {};
    const tx = rep.transactions ?? {};
    const ratings = tx.ratings ?? {};
    const m = rep.metrics ?? {};
    return {
      nickname: me.nickname ?? "",
      levelId: rep.level_id ?? null,
      powerSellerStatus: rep.power_seller_status ?? null,
      sellerExperience: me.seller_experience ?? null,
      transactionsTotal: tx.total ?? 0,
      transactionsCompleted: tx.completed ?? 0,
      transactionsCanceled: tx.canceled ?? 0,
      ratingsPositive: ratings.positive ?? 0,
      ratingsNeutral: ratings.neutral ?? 0,
      ratingsNegative: ratings.negative ?? 0,
      metrics: {
        claimsRate: m.claims?.rate ?? null,
        delayedRate: m.delayed_handling_time?.rate ?? null,
        cancellationsRate: m.cancellations?.rate ?? null,
      },
      points: me.points ?? 0,
      registrationDate: me.registration_date ?? undefined,
      permalink: me.permalink ?? undefined,
    };
  }

  // ---- Listings ----------------------------------------------------------

  /** Fetch all of the seller's item ids (paged, capped for safety). Returns the
   *  ids plus whether the cap was hit (more items exist beyond the cap). */
  private async getAllItemIds(maxItems = 600): Promise<{ ids: string[]; capped: boolean }> {
    const ids: string[] = [];
    let offset = 0;
    const limit = 50;
    let total = maxItems;
    while (ids.length < maxItems) {
      const data = await this.get(
        `/users/${this.userId}/items/search?limit=${limit}&offset=${offset}`,
      );
      const results: string[] = Array.isArray(data?.results) ? data.results : [];
      if (results.length === 0) break;
      ids.push(...results);
      total = data?.paging?.total ?? ids.length;
      offset += limit;
      if (offset >= total) break;
    }
    const capped = total > ids.length || ids.length > maxItems;
    return { ids: ids.slice(0, maxItems), capped };
  }

  /** Fetch ALL of the seller's ACTIVE item ids (paged). Uses the ML search
   *  `status=active` filter so we only diagnose live listings. Capped high for
   *  safety; returns whether the cap was hit. */
  private async getActiveItemIds(
    maxItems = 5000,
  ): Promise<{ ids: string[]; capped: boolean }> {
    const ids: string[] = [];
    let offset = 0;
    const limit = 50;
    let total = maxItems;
    while (ids.length < maxItems) {
      const data = await this.get(
        `/users/${this.userId}/items/search?status=active&limit=${limit}&offset=${offset}`,
      );
      const results: string[] = Array.isArray(data?.results) ? data.results : [];
      if (results.length === 0) break;
      ids.push(...results);
      total = data?.paging?.total ?? ids.length;
      offset += limit;
      if (offset >= total) break;
    }
    const capped = total > ids.length;
    return { ids: ids.slice(0, maxItems), capped };
  }

  /** Cache of user-product id -> SKU (lives for the provider instance lifetime). */
  private userProductSkuCache = new Map<string, string>();

  /**
   * Extract the seller SKU directly available in an item's payload.
   * Returns "" when the SKU is not present at the item/variation level (which
   * happens for variation listings whose SKU lives in the user-product).
   */
  private extractInlineSku(d: any): string {
    const fromAttr = (arr: any[]): string | undefined =>
      Array.isArray(arr) ? arr.find((a: any) => a?.id === "SELLER_SKU")?.value_name : undefined;
    const root = d.seller_custom_field || d.seller_sku || fromAttr(d.attributes);
    if (root) return String(root).trim();
    if (Array.isArray(d.variations)) {
      for (const v of d.variations) {
        const vs = v.seller_custom_field || v.seller_sku || fromAttr(v.attributes);
        if (vs) return String(vs).trim();
      }
    }
    return "";
  }

  /** Collect every user_product_id referenced by an item (root + variations). */
  private collectUserProductIds(d: any): string[] {
    const ids: string[] = [];
    if (d.user_product_id) ids.push(String(d.user_product_id));
    if (Array.isArray(d.variations)) {
      for (const v of d.variations) {
        if (v.user_product_id) ids.push(String(v.user_product_id));
      }
    }
    return ids;
  }

  /** Fetch the SELLER_SKU of a user-product (cached). */
  private async getUserProductSku(upid: string): Promise<string> {
    const cached = this.userProductSkuCache.get(upid);
    if (cached !== undefined) return cached;
    const up = await this.get(`/user-products/${upid}`).catch(() => null);
    let sku = "";
    if (up && Array.isArray(up.attributes)) {
      const attr = up.attributes.find((a: any) => a?.id === "SELLER_SKU");
      const val = attr?.values?.[0]?.name ?? attr?.value_name;
      if (val) sku = String(val).trim();
    }
    this.userProductSkuCache.set(upid, sku);
    return sku;
  }

  /**
   * For items whose SKU is NOT inline (typically variation listings), resolve it
   * from the seller's user-product catalog (/user-products/{id}). Mutates each
   * detail object, attaching a `_resolvedSku` used later when mapping the row.
   * Runs with gentle concurrency and a cache to avoid hammering ML.
   */
  private async resolveMissingSkus(details: any[]): Promise<void> {
    const pending: { d: any; upid: string }[] = [];
    for (const d of details) {
      const inline = this.extractInlineSku(d);
      if (inline) {
        d._resolvedSku = inline;
        continue;
      }
      const upid = this.collectUserProductIds(d)[0];
      if (upid) pending.push({ d, upid });
      else d._resolvedSku = "";
    }
    const concurrency = 4;
    for (let i = 0; i < pending.length; i += concurrency) {
      const slice = pending.slice(i, i + concurrency);
      await Promise.all(
        slice.map(async ({ d, upid }) => {
          d._resolvedSku = await this.getUserProductSku(upid);
        }),
      );
    }
  }

  /** Multiget item details in batches of 20 (ML multiget cap), in parallel. */
  private async getItemsDetails(ids: string[]): Promise<any[]> {
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += 20) batches.push(ids.slice(i, i + 20));
    const attributes =
      "id,title,price,currency_id,available_quantity,sold_quantity,status," +
      "listing_type_id,health,category_id,permalink,thumbnail,pictures," +
      "date_created,last_updated,shipping,catalog_listing,catalog_product_id," +
      "seller_custom_field,seller_sku,attributes,user_product_id,variations";
    const out: any[] = [];
    // Essential call (NOT behind withBudget) — keep concurrency gentle (3) to
    // avoid provoking ML's 429 throttle on accounts with many listings, since a
    // failure here is what used to crash the whole Anúncios page.
    const concurrency = 3;
    for (let i = 0; i < batches.length; i += concurrency) {
      const slice = batches.slice(i, i + concurrency);
      const results = await Promise.all(
        slice.map((batch) => this.get(`/items?ids=${batch.join(",")}&attributes=${attributes}`)),
      );
      for (const data of results) {
        if (Array.isArray(data)) {
          for (const row of data) {
            if (row?.code === 200 && row?.body) out.push(row.body);
          }
        }
      }
    }
    return out;
  }

  /** Lifetime (~2 years) total visits for many items at once via
   *  /visits/items?ids= . Cheap (20 ids/call) but NOT period-accurate.
   *  Response shape: { "MLB123": 552, ... }. Kept as a fallback only. */
  private async getVisitsBatch(ids: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20);
      const data = await this.get(`/visits/items?ids=${batch.join(",")}`);
      if (data && typeof data === "object") {
        for (const [id, v] of Object.entries(data)) {
          if (typeof v === "number") map.set(id, v);
        }
      }
    }
    return map;
  }

  /** Real visits for a single item over the last N days, via the dated
   *  time_window endpoint. Returns null on failure so callers can distinguish
   *  "no data" from a genuine zero. */
  private async getItemVisits(itemId: string, lastDays = 30): Promise<number | null> {
    try {
      const data = await this.get(
        `/items/${itemId}/visits/time_window?last=${lastDays}&unit=day`,
      );
      return typeof data?.total_visits === "number" ? data.total_visits : null;
    } catch {
      return null;
    }
  }

  /** Period-accurate visits for many items, using the per-item dated endpoint
   *  with bounded concurrency. The ML API only allows ONE item per dated
   *  request, so we fan out in parallel batches. Capped to stay within the
   *  request timeout. Items beyond the cap (or that error) get null. */
  private async getVisitsWindow(
    ids: string[],
    lastDays: number,
    cap = 300,
  ): Promise<Map<string, number | null>> {
    const map = new Map<string, number | null>();
    const targets = ids.slice(0, cap);
    // Gentler concurrency (4) reduces the chance of tripping ML's 429 throttle.
    const concurrency = 4;
    for (let i = 0; i < targets.length; i += concurrency) {
      const batch = targets.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (id) => [id, await this.getItemVisits(id, lastDays)] as const),
      );
      for (const [id, v] of results) map.set(id, v);
    }
    return map;
  }

  /** Daily visits time-series for a single item over the last N days.
   *  Returns { ok, days } where `ok` means ML actually ANSWERED for this item
   *  (so a genuine zero-visits item still counts as resolved), and `days` is the
   *  Map<isoDate, visits>. `ok:false` means the call failed (timeout/429/error)
   *  and the item did NOT contribute — distinct from a real zero. This split is
   *  what stops the chart from being stuck "pending": a small store whose items
   *  legitimately had 0 visits on some days now correctly resolves instead of
   *  looking like a total miss. */
  private async getItemVisitsSeries(
    itemId: string,
    lastDays = 30,
  ): Promise<{ ok: boolean; days: Map<string, number> }> {
    const days = new Map<string, number>();
    // Per-item failures (e.g. a 429 mid fan-out) must NEVER reject and zero the
    // whole aggregated series — swallow into ok:false so we keep the visits we
    // DID collect from the other items. Mirrors getItemVisits().
    let data: any;
    try {
      data = await this.get(
        `/items/${itemId}/visits/time_window?last=${lastDays}&unit=day`,
      );
    } catch {
      return { ok: false, days };
    }
    // A null body (network/HTTP failure after retries) is NOT a valid answer.
    // A valid answer has the time_window shape (item_id + results array), even
    // when results is empty / all-zero.
    const answered =
      data != null &&
      typeof data === "object" &&
      (Array.isArray(data.results) || typeof data.total_visits === "number");
    if (!answered) return { ok: false, days };
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    for (const r of results) {
      // ML returns { date: "2026-06-01T00:00:00.000-04:00", total: 12 }
      const iso = typeof r?.date === "string" ? r.date.slice(0, 10) : null;
      const total = typeof r?.total === "number" ? r.total : 0;
      if (iso) days.set(iso, (days.get(iso) ?? 0) + total);
    }
    return { ok: true, days };
  }

  /** Aggregated daily visits series (last `lastDays` days) across the provided
   *  item ids, with bounded concurrency and a hard cap. Always returns one entry
   *  per calendar day in the window (zero-filled), so the chart shows every day. */
  private async getVisitsSeries(
    ids: string[],
    lastDays = 30,
    cap = 200,
  ): Promise<{ series: VisitsDayPoint[]; attempted: number; resolved: number }> {
    const totals = new Map<string, number>();
    const targets = ids.slice(0, cap);
    let resolved = 0;
    // The dated endpoint is 1 item per call, but real stores are small (tens of
    // active listings), so a moderate concurrency finishes in a couple seconds
    // without provoking 429. The get() network/429 retries absorb the rest.
    const concurrency = 6;
    for (let i = 0; i < targets.length; i += concurrency) {
      const batch = targets.slice(i, i + concurrency);
      const series = await Promise.all(
        batch.map((id) => this.getItemVisitsSeries(id, lastDays)),
      );
      for (const m of series) {
        // `ok` means ML actually answered for that item — even a genuine all-zero
        // item counts as resolved. Only a failed call (ok:false) is excluded, so
        // a quiet day no longer looks like a total miss / endless "pending".
        if (m.ok) resolved += 1;
        for (const [iso, v] of Array.from(m.days.entries())) totals.set(iso, (totals.get(iso) ?? 0) + v);
      }
    }
    // Zero-fill every day in the window so the chart axis is continuous.
    //
    // IMPORTANT — TIMEZONE: ML's time_window returns dates already in Brazil's
    // offset (e.g. `2026-06-14T00:00:00.000-03:00`), so `slice(0,10)` above keys
    // each item's visits by its BRT calendar day. The AXIS must be anchored the
    // SAME way, otherwise it drifts: at night in Brazil (UTC-3) `Date.now()` in
    // UTC has already rolled over to the next day, which used to add a spurious
    // FUTURE point (e.g. Monday while it's still Sunday evening in Brazil). We
    // anchor "today" to the current BRT calendar day so the last point is always
    // today (still partial), never a day that hasn't started yet.
    const out: VisitsDayPoint[] = [];
    const DAY = 24 * 60 * 60 * 1000;
    // BRT midnight for a given day key is 03:00:00Z (UTC-3).
    const endAnchor = Date.parse(`${brtDateKey(Date.now())}T03:00:00.000Z`);
    const startAnchor = endAnchor - (lastDays - 1) * DAY;
    for (let t = startAnchor; t <= endAnchor; t += DAY) {
      const key = brtDateKey(t);
      out.push({ date: key, visits: totals.get(key) ?? 0 });
    }
    return { series: out, attempted: targets.length, resolved };
  }

  /**
   * Lean collector for the daily visits CHART only — used by the dedicated
   * `account.visitsSeries` procedure that serves it via a stale-while-revalidate
   * cache. It fetches just the ACTIVE item ids and their dated visits, skipping
   * the expensive item-details / orders work that `getListings` does. This keeps
   * the chart fully decoupled from the rest of the dashboard so it can be
   * refreshed in the background without blocking the page.
   */
  async getVisitsSeriesOnly(
    lastDays = 30,
    cap = 200,
  ): Promise<{ series: VisitsDayPoint[]; attempted: number; resolved: number }> {
    const { ids } = await this.getActiveItemIds(cap);
    return this.getVisitsSeries(ids, lastDays, cap);
  }

  /**
   * Per-item DAILY visits breakdown for the last `lastDays` days (default 4 =
   * hoje + 3 dias atrás). NON-BLOCKING and progressive: reads whatever the
   * background collector (visitsDailyStore) has gathered so far and kicks a
   * collection for the items still missing/stale. Each item's series is
   * zero-filled and BRT-anchored so every requested day is present (the last
   * point is always today, still partial).
   *
   * Returns one entry per item id that ML has already answered for; items not
   * yet collected are simply absent from the map (the UI shows "—" and keeps
   * polling). `collecting` lets the client know to poll again.
   */
  getDailyVisitsBreakdown(
    ids: string[],
    lastDays = 4,
  ): {
    perItem: Map<string, VisitsDayPoint[]>;
    attempted: number;
    resolved: number;
    collecting: boolean;
  } {
    const snapshot = readDailyVisits(this.userId, lastDays, ids);
    // Kick the background collector for missing/stale items. Gentle concurrency
    // (2) because the dated endpoint is 1 item/call and ML throttles bursts.
    ensureCollectingDaily(
      this.userId,
      lastDays,
      ids,
      (id) => this.getItemVisitsSeries(id, lastDays),
      { concurrency: 2 },
    );

    // Build the BRT-anchored day axis for the window: oldest -> today.
    const DAY = 24 * 60 * 60 * 1000;
    const endAnchor = Date.parse(`${brtDateKey(Date.now())}T03:00:00.000Z`);
    const startAnchor = endAnchor - (lastDays - 1) * DAY;
    const axis: string[] = [];
    for (let t = startAnchor; t <= endAnchor; t += DAY) axis.push(brtDateKey(t));

    const perItem = new Map<string, VisitsDayPoint[]>();
    for (const [id, days] of Array.from(snapshot.map.entries())) {
      const series: VisitsDayPoint[] = axis.map((key) => ({
        date: key,
        visits: days.get(key) ?? 0,
      }));
      perItem.set(id, series);
    }
    return {
      perItem,
      attempted: snapshot.attempted,
      resolved: snapshot.resolved,
      collecting: snapshot.collecting || snapshot.resolved < snapshot.attempted,
    };
  }

  private mapStatus(s: string | undefined): ListingStatus {
    switch (s) {
      case "active":
        return "active";
      case "paused":
        return "paused";
      case "closed":
        return "closed";
      case "under_review":
        return "under_review";
      default:
        return "inactive";
    }
  }

  async getListings(
    opts: { lastDays?: number; maxItems?: number; includeVisitsSeries?: boolean } = {},
  ): Promise<ListingsResult> {
    const lastDays = opts.lastDays ?? 30;
    const maxItems = opts.maxItems ?? 600;
    // The daily visits CHART is only needed on the Anúncios page. The Painel just
    // shows the visits TOTAL, so it skips the chart fan-out (~200 extra per-item
    // requests) to avoid provoking a 429. Defaults to false (cheaper).
    const includeVisitsSeries = opts.includeVisitsSeries ?? false;
    const { ids, capped } = await this.getAllItemIds(maxItems);
    const details = await this.getItemsDetails(ids);
    await this.resolveMissingSkus(details);
    const detailIds = details.map((d) => d.id);

    // Visits strategy (PROGRESSIVE, non-blocking):
    //  The ML dated endpoint (time_window) only allows ONE item per request and
    //  ML throttles bursts (429). Computing the visits total for ~130 listings
    //  inside this request used to run a 13s fan-out and THROW AWAY the partial
    //  result every time — under throttling it resolved zero items, so the card
    //  was stuck forever on "carregando".
    //
    //  Now we use an ACCUMULATING per-item store (server/ml/visitsStore.ts):
    //   - read whatever has been collected so far (instant, never blocks), and
    //   - kick a background collector for the items still missing/stale.
    //  Each poll therefore shows MORE visits than the last until complete, and
    //  the collection can never be permanently stuck because progress is
    //  persisted item-by-item across requests.
    const snapshot = readVisits(this.userId, lastDays, detailIds);
    ensureCollecting(
      this.userId,
      lastDays,
      detailIds,
      (id) => this.getItemVisits(id, lastDays),
      // Concorrência baixa: o endpoint de visitas é 1 item por request e o ML
      // estrangula (429) rajadas. 2 em paralelo coleta mais devagar porém de
      // forma CONFIÁVEL (sem disparar 429), então a progressão realmente avança.
      { concurrency: 2 },
    );
    const windowMap: Map<string, number | null> = new Map(snapshot.map);

    const items: ListingRow[] = details.map((d) => {
      const wv = windowMap.get(d.id);
      // A real number means ML answered (even a genuine 0). undefined/null means
      // the data did NOT arrive (timeout / rate limit) and must NOT be shown as 0.
      const visitsAvailable = typeof wv === "number";
      const visits = typeof wv === "number" ? wv : 0;
      const soldQuantity = d.sold_quantity ?? 0;
      const price = d.price ?? 0;
      const availableQuantity = d.available_quantity ?? 0;
      const thumb =
        d.thumbnail ||
        (Array.isArray(d.pictures) && d.pictures.length ? d.pictures[0].url : undefined);
      const freeShipping = d.shipping?.free_shipping === true;
      const logisticType = d.shipping?.logistic_type ?? null;
      const catalogListing =
        d.catalog_listing === true || (typeof d.catalog_product_id === "string" && d.catalog_product_id.length > 0);
      // SKU resolution: inline (root/variation) first, then the value resolved
      // from the user-product catalog for variation listings (see resolveMissingSkus).
      const skuAttr = Array.isArray(d.attributes)
        ? d.attributes.find((a: any) => a?.id === "SELLER_SKU")?.value_name
        : undefined;
      const sku = String(
        d._resolvedSku || d.seller_custom_field || d.seller_sku || skuAttr || "",
      ).trim();
      // Peso da embalagem do vendedor (SELLER_PACKAGE_WEIGHT) — o ML usa este peso
      // para o frete. Vem como string com unidade (ex.: "1920 g", "2.5 kg").
      const packageWeightGrams = extractPackageWeightGrams(d.attributes);
      return {
        itemId: d.id,
        title: d.title ?? "",
        price,
        currency: d.currency_id ?? this.currency,
        availableQuantity,
        soldQuantity,
        status: this.mapStatus(d.status),
        listingType: d.listing_type_id ?? "",
        visits,
        visitsAvailable,
        conversion: visitsAvailable && visits > 0 ? soldQuantity / visits : null,
        thumbnail: thumb,
        permalink: d.permalink ?? undefined,
        health: typeof d.health === "number" ? d.health : null,
        categoryId: d.category_id ?? undefined,
        createdMs: d.date_created ? new Date(d.date_created).getTime() : null,
        updatedMs: d.last_updated ? new Date(d.last_updated).getTime() : null,
        freeShipping,
        logisticType,
        catalogListing,
        stockValue: price * availableQuantity,
        sku,
        packageWeightGrams,
      };
    });

    const active = items.filter((i) => i.status === "active").length;
    const paused = items.filter((i) => i.status === "paused").length;
    const closed = items.filter((i) => i.status === "closed").length;
    const stagnant = items.filter((i) => i.availableQuantity > 0 && i.soldQuantity === 0).length;
    const outOfStock = items.filter((i) => i.availableQuantity === 0).length;
    const totalVisits = items.reduce((s, i) => s + i.visits, 0);
    const visitsActive = items.filter((i) => i.status === "active").reduce((s, i) => s + i.visits, 0);
    const visitsPaused = items.filter((i) => i.status === "paused").reduce((s, i) => s + i.visits, 0);
    const visitsClosed = items.filter((i) => i.status === "closed").reduce((s, i) => s + i.visits, 0);
    const activeItems = items.filter((i) => i.status === "active");
    const activeWithVisits = activeItems.filter((i) => i.visitsAvailable && i.visits > 0).length;
    const activeNoVisits = activeItems.filter((i) => i.visitsAvailable && i.visits === 0).length;
    // Visit availability: how many items actually got REAL visit data back from ML.
    // If none (or only a fraction) resolved, visit-derived KPIs are pending, not 0.
    const visitsAttempted = items.length;
    const visitsResolved = items.filter((i) => i.visitsAvailable).length;
    // Pending when ML returned visit data for NO item at all (the all-zero case the
    // user saw). Partial resolution still renders, but a full miss must show "carregando".
    const visitsPending = visitsAttempted > 0 && visitsResolved === 0;
    // Still collecting in the background: either a run is active, or not every
    // item has a fresh value yet. The client uses this to keep polling so the
    // total fills in progressively WITHOUT the user clicking refresh.
    const visitsCollecting =
      visitsAttempted > 0 && (snapshot.collecting || visitsResolved < visitsAttempted);
    const avgVisitsPerActive = active > 0 ? Math.round(visitsActive / active) : 0;
    const totalStockValue = items.reduce((s, i) => s + i.stockValue, 0);
    const totalSold = items.reduce((s, i) => s + i.soldQuantity, 0);

    // Evolution chart: daily visits over the last 30 days, aggregated across
    // ACTIVE listings only. Fixed 30-day window regardless of the KPI window
    // selector. Best-effort (capped) so it never blocks the page.
    const activeIds = items.filter((i) => i.status === "active").map((i) => i.itemId);
    // Bounded like the window map above: the daily visits chart is a nice-to-have,
    // never a blocker. If it can't finish in the budget, return an empty series.
    // Skipped entirely unless requested (Painel doesn't need it) to cut ML load.
    const visitsAgg = includeVisitsSeries
      ? await this.withBudget(
          this.getVisitsSeries(activeIds, 30),
          13000,
          { series: [] as VisitsDayPoint[], attempted: activeIds.length, resolved: 0 },
        )
      : { series: [] as VisitsDayPoint[], attempted: 0, resolved: 0 };
    const visitsSeries = visitsAgg.series;
    // Pending = we ASKED for the series and there ARE active listings to fetch,
    // but NOT A SINGLE one returned data (timeout / 429). That is the false
    // "sem visitas" case the user reported — surface it as "carregando" instead.
    const visitsSeriesPending =
      includeVisitsSeries && visitsAgg.attempted > 0 && visitsAgg.resolved === 0;

    return {
      visitsSeriesPending,
      summary: {
        total: items.length,
        active,
        paused,
        closed,
        stagnant,
        outOfStock,
        totalVisits,
        visitsPending,
        visitsCollecting,
        visitsAttempted,
        visitsResolved,
        visitsActive,
        visitsPaused,
        visitsClosed,
        activeWithVisits,
        activeNoVisits,
        avgVisitsPerActive,
        totalStockValue,
        totalSold,
        windowDays: lastDays,
        capped,
      },
      items,
      visitsSeries,
    };
  }

  // ---- Sales / orders ----------------------------------------------------

  /**
   * Page through ALL orders for a given ML order status, using the official
   * `order.status` server-side filter. This is far more reliable than fetching
   * everything and filtering client-side (which previously stopped paging too
   * early because orders are not strictly date-ordered).
   *
   * `status` is an ML order status such as "paid" or "cancelled". When omitted,
   * all orders are returned.
   */
  private async getOrdersByStatus(status?: string, maxOrders = 1000): Promise<any[]> {
    const out: any[] = [];
    let offset = 0;
    const limit = 50;
    const statusParam = status ? `&order.status=${status}` : "";
    while (out.length < maxOrders) {
      const data = await this.get(
        `/orders/search?seller=${this.userId}&sort=date_desc&limit=${limit}&offset=${offset}${statusParam}`,
      );
      const results: any[] = Array.isArray(data?.results) ? data.results : [];
      if (results.length === 0) break;
      out.push(...results);
      const total = data?.paging?.total ?? out.length;
      offset += limit;
      if (offset >= total) break;
    }
    return out;
  }

  /** Count orders for a status via the API paging total (cheap, 1 request). */
  private async countOrdersByStatus(status: string): Promise<number> {
    const data = await this.get(
      `/orders/search?seller=${this.userId}&order.status=${status}&limit=1`,
    );
    return data?.paging?.total ?? 0;
  }

  async getSalesDashboard(opts: {
    fromMs: number;
    toMs: number;
    /** When true, the daily series includes every calendar day in [fromMs,toMs]
     *  (days without sales are filled with zeros) so a bar chart shows the full
     *  month. When false (default), only days with activity are returned. */
    fill?: boolean;
    /** Maximum number of ranked products to return. Defaults to 10 (Top 10).
     *  Pass a large number (or 0 = no limit) to get the FULL ranking of every
     *  distinct product sold in the period. */
    topLimit?: number;
  }): Promise<SalesDashboard> {
    const { fromMs, toMs } = opts;
    // Fetch PAID orders via the official server-side status filter. This is the
    // reliable source of truth for revenue (previously a client-side filter
    // missed orders because they are not strictly date-ordered).
    const paidAll = await this.getPaidOrders();

    let revenue = 0;
    let unitsSold = 0;
    const paidOrders: any[] = [];
    const dailyMap = new Map<string, { revenue: number; orders: number; cancelled: number; cancelledAmount: number }>();
    const productMap = new Map<string, TopProduct>();

    for (const o of paidAll) {
      const created = o.date_created ? new Date(o.date_created).getTime() : 0;
      // Keep within the requested window (toMs guards against clock skew /
      // future dates; fromMs lets callers scope to a period when desired).
      if (created && (created < fromMs || created > toMs)) continue;

      // Revenue: prefer the sum of approved payments; fall back to total_amount.
      const approvedTotal = (o.payments ?? []).reduce(
        (s: number, p: any) =>
          s + (p.status === "approved" || p.status === "accredited" ? p.transaction_amount ?? 0 : 0),
        0,
      );
      const value = approvedTotal > 0 ? approvedTotal : o.total_amount ?? 0;

      paidOrders.push(o);
      revenue += value;

      const dayKey = brtDateKey(created || Date.now());
      const day = dailyMap.get(dayKey) ?? { revenue: 0, orders: 0, cancelled: 0, cancelledAmount: 0 };
      day.revenue += value;
      day.orders += 1;
      dailyMap.set(dayKey, day);

      for (const oi of o.order_items ?? []) {
        const qty = oi.quantity ?? 0;
        unitsSold += qty;
        const item = oi.item ?? {};
        const id = item.id ?? "?";
        // Order items sometimes carry a thumbnail under different keys; pick the
        // first real (https) URL and upgrade http -> https for mixed-content safety.
        const rawThumb: string =
          item.thumbnail ?? item.secure_thumbnail ?? item.picture_url ?? "";
        const thumb = rawThumb ? rawThumb.replace(/^http:\/\//, "https://") : undefined;
        const existing = productMap.get(id) ?? {
          itemId: id,
          title: item.title ?? "",
          unitsSold: 0,
          revenue: 0,
          thumbnail: thumb,
          permalink: item.permalink ?? (id !== "?" ? `https://produto.mercadolivre.com.br/${id}` : undefined),
        };
        // Backfill thumbnail/permalink if a later order item exposes it.
        if (!existing.thumbnail && thumb) existing.thumbnail = thumb;
        existing.unitsSold += qty;
        existing.revenue += (oi.unit_price ?? 0) * qty;
        productMap.set(id, existing);
      }
    }

    // Fold cancelled orders into the same daily map so the bar chart can mark
    // which days had cancellations (count + amount), bucketed by BRT date.
    // Also count cancelled orders WITHIN the requested period (not the global
    // all-time total, which previously inflated the KPI).
    const cancelledOrders = await this.getCancelledOrders();
    let cancelled = 0;
    let cancelledAmount = 0;
    for (const o of cancelledOrders) {
      const created = o.date_created ? new Date(o.date_created).getTime() : 0;
      if (created && (created < fromMs || created > toMs)) continue;
      cancelled += 1;
      const amount = o.total_amount ?? 0;
      cancelledAmount += amount;
      const dayKey = brtDateKey(created || Date.now());
      const day = dailyMap.get(dayKey) ?? { revenue: 0, orders: 0, cancelled: 0, cancelledAmount: 0 };
      day.cancelled += 1;
      day.cancelledAmount += amount;
      dailyMap.set(dayKey, day);
    }

    let daily: SalesDayPoint[] = Array.from(dailyMap.entries())
      .map(([date, v]) => ({
        date,
        revenue: v.revenue,
        orders: v.orders,
        cancelled: v.cancelled,
        cancelledAmount: v.cancelledAmount,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Optionally fill every calendar day in the window with zeros so the bar
    // chart can show the entire month (including days with no sales).
    if (opts.fill) {
      daily = fillDailySeries(dailyMap, fromMs, toMs);
    }

    // Default = Top 10. topLimit <= 0 means "no limit" (full ranking).
    const rankedAll = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue);
    const limit = opts.topLimit === undefined ? 10 : opts.topLimit;
    const topProducts = limit > 0 ? rankedAll.slice(0, limit) : rankedAll;

    // Enrich the ranking with real thumbnails/permalinks via multiget.
    // Order items rarely carry a picture, so we fetch the ranked items missing one.
    // Cap enrichment to the top 80 ranked items so a huge full ranking (e.g. 500
    // distinct products) never blows the request budget; lower-ranked rows still
    // render (text-only) and most carry a permalink fallback already.
    const ENRICH_CAP = 80;
    const missing = topProducts
      .slice(0, ENRICH_CAP)
      .filter((p) => !p.thumbnail && p.itemId && p.itemId !== "?");
    if (missing.length > 0) {
      try {
        const details = await this.getItemsDetails(missing.map((p) => p.itemId));
        const byId = new Map<string, any>(details.map((d: any) => [d.id, d]));
        for (const p of topProducts) {
          const d = byId.get(p.itemId);
          if (!d) continue;
          const raw: string =
            d.thumbnail ?? d.secure_thumbnail ?? (d.pictures?.[0]?.secure_url ?? d.pictures?.[0]?.url) ?? "";
          if (!p.thumbnail && raw) p.thumbnail = raw.replace(/^http:\/\//, "https://");
          if (!p.permalink && d.permalink) p.permalink = d.permalink;
        }
      } catch {
        // Non-fatal: ranking still renders without pictures.
      }
    }

    const ordersCount = paidOrders.length;
    return {
      kpis: {
        revenue,
        orders: ordersCount,
        unitsSold,
        avgTicket: ordersCount > 0 ? revenue / ordersCount : 0,
        cancelled,
        cancelledAmount,
        currency: this.currency,
      },
      daily,
      topProducts,
      from: fromMs,
      to: toMs,
    };
  }

  /**
   * Lightweight KPI summary for an arbitrary [fromMs,toMs] window. Reuses the
   * cached paid orders, so building "this month" + "last month" cards costs a
   * single orders fetch. No thumbnails/daily series here — just the numbers.
   */
  async getPeriodSummary(opts: { fromMs: number; toMs: number }): Promise<PeriodSummary> {
    const { fromMs, toMs } = opts;
    const paidAll = await this.getPaidOrders();
    let revenue = 0;
    let unitsSold = 0;
    let orders = 0;
    for (const o of paidAll) {
      const created = o.date_created ? new Date(o.date_created).getTime() : 0;
      if (created && (created < fromMs || created > toMs)) continue;
      const approvedTotal = (o.payments ?? []).reduce(
        (s: number, p: any) =>
          s + (p.status === "approved" || p.status === "accredited" ? p.transaction_amount ?? 0 : 0),
        0,
      );
      revenue += approvedTotal > 0 ? approvedTotal : o.total_amount ?? 0;
      orders += 1;
      for (const oi of o.order_items ?? []) unitsSold += oi.quantity ?? 0;
    }
    return {
      revenue,
      orders,
      unitsSold,
      avgTicket: orders > 0 ? revenue / orders : 0,
      from: fromMs,
      to: toMs,
    };
  }

  /**
   * Lifetime store stats. The first effective sale is the OLDEST paid order
   * (queried directly with sort=date_asc&limit=1 so it is correct even when the
   * store has more than 1000 orders). Total orders comes from the paid paging
   * total (cheap, exact); total revenue sums the paid orders we have cached.
   * Recomputed on every call, so it reflects "today" without a stored snapshot.
   */
  async getStoreLifetime(): Promise<StoreLifetime> {
    // Oldest paid order = first effective sale.
    const firstData = await this.get(
      `/orders/search?seller=${this.userId}&order.status=paid&sort=date_asc&limit=1`,
    );
    const firstOrder = Array.isArray(firstData?.results) ? firstData.results[0] : undefined;
    const firstSaleMs = firstOrder?.date_created
      ? new Date(firstOrder.date_created).getTime()
      : null;
    const totalOrders = firstData?.paging?.total ?? 0;

    // Total revenue: sum the paid orders cache (best-effort; capped at the same
    // 1000-order window used elsewhere, which covers typical stores).
    const paidAll = await this.getPaidOrders();
    let totalRevenue = 0;
    for (const o of paidAll) {
      const approvedTotal = (o.payments ?? []).reduce(
        (s: number, p: any) =>
          s + (p.status === "approved" || p.status === "accredited" ? p.transaction_amount ?? 0 : 0),
        0,
      );
      totalRevenue += approvedTotal > 0 ? approvedTotal : o.total_amount ?? 0;
    }

    // Cancelled (lifetime): exact count via paging total (cheap) + accumulated
    // value from the cancelled orders cache (best-effort, capped like paid).
    const canceledOrders = await this.countOrdersByStatus("cancelled");
    const cancelledAll = await this.getCancelledOrders();
    let canceledRevenue = 0;
    for (const o of cancelledAll) {
      canceledRevenue += o.total_amount ?? 0;
    }

    return {
      firstSaleMs,
      totalRevenue,
      totalOrders,
      canceledOrders,
      canceledRevenue,
      currency: this.currency,
    };
  }

  /**
   * Products sold on a single BRT calendar day. Reuses the cached paid orders
   * and aggregates the order items by product, ranked by revenue. The `dayIso`
   * is a yyyy-mm-dd string interpreted in BRT (matching `brtDateKey`).
   */
  async getProductsByDay(dayIso: string): Promise<DayProducts> {
    const paidAll = await this.getPaidOrders();
    const productMap = new Map<string, TopProduct>();
    let revenue = 0;
    let unitsSold = 0;
    let orders = 0;

    for (const o of paidAll) {
      const created = o.date_created ? new Date(o.date_created).getTime() : 0;
      if (!created) continue;
      if (brtDateKey(created) !== dayIso) continue;

      const approvedTotal = (o.payments ?? []).reduce(
        (s: number, p: any) =>
          s + (p.status === "approved" || p.status === "accredited" ? p.transaction_amount ?? 0 : 0),
        0,
      );
      revenue += approvedTotal > 0 ? approvedTotal : o.total_amount ?? 0;
      orders += 1;

      for (const oi of o.order_items ?? []) {
        const qty = oi.quantity ?? 0;
        unitsSold += qty;
        const item = oi.item ?? {};
        const id = item.id ?? "?";
        const rawThumb: string =
          item.thumbnail ?? item.secure_thumbnail ?? item.picture_url ?? "";
        const thumb = rawThumb ? rawThumb.replace(/^http:\/\//, "https://") : undefined;
        const existing = productMap.get(id) ?? {
          itemId: id,
          title: item.title ?? "",
          unitsSold: 0,
          revenue: 0,
          thumbnail: thumb,
          permalink: item.permalink ?? (id !== "?" ? `https://produto.mercadolivre.com.br/${id}` : undefined),
        };
        if (!existing.thumbnail && thumb) existing.thumbnail = thumb;
        existing.unitsSold += qty;
        existing.revenue += (oi.unit_price ?? 0) * qty;
        productMap.set(id, existing);
      }
    }

    const products = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue);

    // ---- Cancelled orders created on this same BRT day ----
    const cancelledMap = new Map<string, TopProduct>();
    let cancelledOrders = 0;
    let cancelledRevenue = 0;
    let cancelledUnits = 0;
    const cancelledAll = await this.getCancelledOrders();
    for (const o of cancelledAll) {
      const created = o.date_created ? new Date(o.date_created).getTime() : 0;
      if (!created) continue;
      if (brtDateKey(created) !== dayIso) continue;
      cancelledOrders += 1;
      cancelledRevenue += o.total_amount ?? 0;
      for (const oi of o.order_items ?? []) {
        const qty = oi.quantity ?? 0;
        cancelledUnits += qty;
        const item = oi.item ?? {};
        const id = item.id ?? "?";
        const rawThumb: string =
          item.thumbnail ?? item.secure_thumbnail ?? item.picture_url ?? "";
        const thumb = rawThumb ? rawThumb.replace(/^http:\/\//, "https://") : undefined;
        const existing = cancelledMap.get(id) ?? {
          itemId: id,
          title: item.title ?? "",
          unitsSold: 0,
          revenue: 0,
          thumbnail: thumb,
          permalink: item.permalink ?? (id !== "?" ? `https://produto.mercadolivre.com.br/${id}` : undefined),
        };
        if (!existing.thumbnail && thumb) existing.thumbnail = thumb;
        existing.unitsSold += qty;
        existing.revenue += (oi.unit_price ?? 0) * qty;
        cancelledMap.set(id, existing);
      }
    }
    const cancelledProducts = Array.from(cancelledMap.values()).sort((a, b) => b.revenue - a.revenue);

    // Enrich missing thumbnails via multiget (best-effort) for BOTH lists.
    const missing = [...products, ...cancelledProducts].filter((p) => !p.thumbnail && p.itemId && p.itemId !== "?");
    if (missing.length > 0) {
      try {
        const details = await this.getItemsDetails(missing.map((p) => p.itemId));
        const byId = new Map<string, any>(details.map((d: any) => [d.id, d]));
        for (const p of products) {
          const d = byId.get(p.itemId);
          if (!d) continue;
          const raw: string =
            d.thumbnail ?? d.secure_thumbnail ?? (d.pictures?.[0]?.secure_url ?? d.pictures?.[0]?.url) ?? "";
          if (!p.thumbnail && raw) p.thumbnail = raw.replace(/^http:\/\//, "https://");
          if (!p.permalink && d.permalink) p.permalink = d.permalink;
        }
      } catch {
        // Non-fatal.
      }
    }

    return {
      date: dayIso,
      orders,
      revenue,
      unitsSold,
      products,
      cancelledOrders,
      cancelledRevenue,
      cancelledUnits,
      cancelledProducts,
      currency: this.currency,
    };
  }

  // ---- Post-sale (claims / cancellations) -------------------------------

  async getPostSale(opts: { fromMs: number; ordersTotal?: number } = { fromMs: 0 }): Promise<PostSaleResult> {
    // Claims require at least one filter; query a few statuses and merge.
    const statuses = ["opened", "closed"];
    const items: PostSaleItem[] = [];
    let openClaims = 0;
    let totalClaims = 0;

    for (const st of statuses) {
      const data = await this.get(`/post-purchase/v1/claims/search?status=${st}&limit=50`);
      const rows: any[] = Array.isArray(data?.data) ? data.data : [];
      totalClaims += data?.paging?.total ?? rows.length;
      if (st === "opened") openClaims += data?.paging?.total ?? rows.length;
      for (const c of rows.slice(0, 50)) {
        items.push({
          id: String(c.id ?? c.claim_id ?? ""),
          type: c.type ?? "claim",
          status: c.status ?? st,
          reason: c.reason_id ?? c.reason ?? undefined,
          dateCreated: c.date_created ? new Date(c.date_created).getTime() : undefined,
        });
      }
    }

    // Cancellations come from orders search (status cancelled).
    const cancelledData = await this.get(
      `/orders/search?seller=${this.userId}&order.status=cancelled&limit=1`,
    );
    const cancellations = cancelledData?.paging?.total ?? 0;

    const ordersTotal = opts.ordersTotal ?? 0;
    const claimRate = ordersTotal > 0 ? totalClaims / ordersTotal : null;

    return {
      summary: {
        openClaims,
        totalClaims,
        cancellations,
        returns: 0,
        claimRate,
      },
      items: items.sort((a, b) => (b.dateCreated ?? 0) - (a.dateCreated ?? 0)),
    };
  }

  // ---- Technical sheet (Raio-X da Ficha Técnica) ------------------------

  /** Fetch the full attribute catalog of a category (cached per instance). */
  private categoryAttrCache = new Map<string, RawCategoryAttribute[]>();

  private async getCategoryAttributes(
    categoryId: string,
  ): Promise<RawCategoryAttribute[]> {
    const cached = this.categoryAttrCache.get(categoryId);
    if (cached) return cached;
    const data = await this.get(`/categories/${categoryId}/attributes`);
    const list: RawCategoryAttribute[] = Array.isArray(data) ? data : [];
    this.categoryAttrCache.set(categoryId, list);
    return list;
  }

  /** Multiget item details INCLUDING their own attributes (separate from the
   *  listings card, which omits attributes for speed). Batched + parallel. */
  private async getItemsWithAttributes(ids: string[]): Promise<any[]> {
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += 20) batches.push(ids.slice(i, i + 20));
    const attributes =
      "id,title,status,category_id,permalink,thumbnail,pictures,attributes";
    const out: any[] = [];
    const concurrency = 5;
    for (let i = 0; i < batches.length; i += concurrency) {
      const slice = batches.slice(i, i + concurrency);
      const results = await Promise.all(
        slice.map((batch) =>
          this.get(`/items?ids=${batch.join(",")}&attributes=${attributes}`),
        ),
      );
      for (const data of results) {
        if (Array.isArray(data)) {
          for (const row of data) {
            if (row?.code === 200 && row?.body) out.push(row.body);
          }
        }
      }
    }
    return out;
  }

  /**
   * Raio-X da Ficha Técnica — diagnose every listing's technical sheet against
   * its category attribute catalog. Reads-only (the inline edit is phase 2).
   *
   * For each listing we cross-reference the category's user-fillable attributes
   * with the values present on the item, flagging what is missing (and which of
   * those are REQUIRED). Categories are fetched once and cached.
   */
  async getTechnicalSpecs(
    opts: { maxItems?: number } = {},
  ): Promise<TechSpecsResult> {
    // Analyse ALL of the seller's ACTIVE listings (high cap for safety).
    const maxItems = opts.maxItems ?? 5000;
    const { ids, capped } = await this.getActiveItemIds(maxItems);
    const details = await this.getItemsWithAttributes(ids);

    // Fetch all distinct category attribute catalogs (cached, bounded).
    const categories = Array.from(
      new Set(
        details
          .map((d) => d.category_id)
          .filter((c): c is string => typeof c === "string" && c.length > 0),
      ),
    );
    const concurrency = 6;
    for (let i = 0; i < categories.length; i += concurrency) {
      const slice = categories.slice(i, i + concurrency);
      await Promise.all(slice.map((c) => this.getCategoryAttributes(c)));
    }

    const items: TechSpecListing[] = details
      .filter((d) => this.mapStatus(d.status) === "active")
      .map((d) => {
      const categoryId: string | undefined = d.category_id ?? undefined;
      const categoryAttributes = categoryId
        ? this.categoryAttrCache.get(categoryId) ?? []
        : [];
      const itemAttributes: RawItemAttribute[] = Array.isArray(d.attributes)
        ? d.attributes.map((a: any) => ({
            id: a.id,
            name: a.name,
            value_name: a.value_name ?? null,
            value_id: a.value_id ?? null,
          }))
        : [];
      const thumb =
        d.thumbnail ||
        (Array.isArray(d.pictures) && d.pictures.length
          ? d.pictures[0].url
          : undefined);
      return diagnoseListing({
        itemId: d.id,
        title: d.title ?? "",
        status: this.mapStatus(d.status),
        thumbnail: thumb,
        permalink: d.permalink ?? undefined,
        categoryId,
        categoryAttributes,
        itemAttributes,
      });
    });

    return buildTechSpecsResult(items, capped);
  }

  /** Quick connection probe — returns nickname when the token works. */
  async probe(): Promise<{ ok: boolean; nickname?: string }> {
    const me = await this.get("/users/me");
    if (!me?.id) return { ok: false };
    return { ok: true, nickname: me.nickname };
  }

}

/**
 * Build a dense daily series covering every calendar day in [fromMs,toMs].
 * Days without sales are emitted with revenue/orders = 0 so a bar chart can
 * render the whole month. Days are keyed by UTC ISO date (yyyy-mm-dd) to match
 * how the aggregation buckets orders.
 */
/**
 * Convert a Unix-ms timestamp to a BRT (GMT-3 fixed) calendar-day key
 * (yyyy-mm-dd). Brazil no longer observes DST, so a fixed -3h offset is exact.
 */
export function brtDateKey(ms: number): string {
  return new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function fillDailySeries(
  dailyMap: Map<
    string,
    { revenue: number; orders: number; cancelled?: number; cancelledAmount?: number }
  >,
  fromMs: number,
  toMs: number,
): SalesDayPoint[] {
  const out: SalesDayPoint[] = [];
  const DAY = 24 * 60 * 60 * 1000;
  // Iterate by BRT calendar day so keys match the aggregation buckets.
  // Anchor at the BRT start-of-day for the first day in the window.
  const startKey = brtDateKey(fromMs);
  const endKey = brtDateKey(toMs);
  // Build from the BRT midnight (which is 03:00 UTC) of the start day.
  let t = Date.parse(`${startKey}T03:00:00.000Z`);
  const endAnchor = Date.parse(`${endKey}T03:00:00.000Z`);
  for (; t <= endAnchor; t += DAY) {
    const key = brtDateKey(t);
    const v = dailyMap.get(key) ?? { revenue: 0, orders: 0, cancelled: 0, cancelledAmount: 0 };
    out.push({
      date: key,
      revenue: v.revenue,
      orders: v.orders,
      cancelled: v.cancelled ?? 0,
      cancelledAmount: v.cancelledAmount ?? 0,
    });
  }
  return out;
}
