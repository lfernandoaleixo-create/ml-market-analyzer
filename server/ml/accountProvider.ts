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
} from "@shared/account";

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

export class AccountProvider {
  constructor(
    private token: string,
    private userId: number,
    private currency = "BRL",
  ) {}

  /** Cache of ALL paid orders for this provider instance (one request burst per
   *  request lifecycle). Multiple period summaries reuse it without re-paging. */
  private paidOrdersCache: any[] | null = null;

  private async getPaidOrders(): Promise<any[]> {
    if (this.paidOrdersCache) return this.paidOrdersCache;
    this.paidOrdersCache = await this.getOrdersByStatus("paid");
    return this.paidOrdersCache;
  }

  private async get(path: string): Promise<any | null> {
    try {
      const res = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
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

  /** Fetch all of the seller's item ids (paged, capped for safety). */
  private async getAllItemIds(maxItems = 200): Promise<string[]> {
    const ids: string[] = [];
    let offset = 0;
    const limit = 50;
    while (ids.length < maxItems) {
      const data = await this.get(
        `/users/${this.userId}/items/search?limit=${limit}&offset=${offset}`,
      );
      const results: string[] = Array.isArray(data?.results) ? data.results : [];
      if (results.length === 0) break;
      ids.push(...results);
      const total = data?.paging?.total ?? ids.length;
      offset += limit;
      if (offset >= total) break;
    }
    return ids.slice(0, maxItems);
  }

  /** Multiget item details in batches of 20 (ML multiget cap). */
  private async getItemsDetails(ids: string[]): Promise<any[]> {
    const out: any[] = [];
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20);
      const data = await this.get(
        `/items?ids=${batch.join(",")}&attributes=id,title,price,currency_id,available_quantity,sold_quantity,status,listing_type_id,health,category_id,permalink,thumbnail,pictures`,
      );
      if (Array.isArray(data)) {
        for (const row of data) {
          if (row?.code === 200 && row?.body) out.push(row.body);
        }
      }
    }
    return out;
  }

  /** Visits in a time window for a single item (best effort). */
  private async getItemVisits(itemId: string, lastDays = 30): Promise<number> {
    const data = await this.get(
      `/items/${itemId}/visits/time_window?last=${lastDays}&unit=day`,
    );
    return typeof data?.total_visits === "number" ? data.total_visits : 0;
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

  async getListings(opts: { lastDays?: number; maxItems?: number } = {}): Promise<ListingsResult> {
    const lastDays = opts.lastDays ?? 30;
    const maxItems = opts.maxItems ?? 120;
    const ids = await this.getAllItemIds(maxItems);
    const details = await this.getItemsDetails(ids);

    // Fetch visits in parallel but capped to avoid hammering the API.
    const visitsMap = new Map<string, number>();
    const concurrency = 8;
    for (let i = 0; i < details.length; i += concurrency) {
      const batch = details.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (d) => [d.id, await this.getItemVisits(d.id, lastDays)] as const),
      );
      for (const [id, v] of results) visitsMap.set(id, v);
    }

    const items: ListingRow[] = details.map((d) => {
      const visits = visitsMap.get(d.id) ?? 0;
      const soldQuantity = d.sold_quantity ?? 0;
      const thumb =
        d.thumbnail ||
        (Array.isArray(d.pictures) && d.pictures.length ? d.pictures[0].url : undefined);
      return {
        itemId: d.id,
        title: d.title ?? "",
        price: d.price ?? 0,
        currency: d.currency_id ?? this.currency,
        availableQuantity: d.available_quantity ?? 0,
        soldQuantity,
        status: this.mapStatus(d.status),
        listingType: d.listing_type_id ?? "",
        visits,
        conversion: visits > 0 ? soldQuantity / visits : null,
        thumbnail: thumb,
        permalink: d.permalink ?? undefined,
        health: typeof d.health === "number" ? d.health : null,
        categoryId: d.category_id ?? undefined,
      };
    });

    const active = items.filter((i) => i.status === "active").length;
    const paused = items.filter((i) => i.status === "paused").length;
    const closed = items.filter((i) => i.status === "closed").length;
    const stagnant = items.filter((i) => i.availableQuantity > 0 && i.soldQuantity === 0).length;
    const outOfStock = items.filter((i) => i.availableQuantity === 0).length;
    const totalVisits = items.reduce((s, i) => s + i.visits, 0);
    const totalStockValue = items.reduce((s, i) => s + i.price * i.availableQuantity, 0);

    return {
      summary: {
        total: items.length,
        active,
        paused,
        closed,
        stagnant,
        outOfStock,
        totalVisits,
        totalStockValue,
      },
      items,
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
  }): Promise<SalesDashboard> {
    const { fromMs, toMs } = opts;
    // Fetch PAID orders via the official server-side status filter. This is the
    // reliable source of truth for revenue (previously a client-side filter
    // missed orders because they are not strictly date-ordered).
    const paidAll = await this.getPaidOrders();

    let revenue = 0;
    let unitsSold = 0;
    const paidOrders: any[] = [];
    const dailyMap = new Map<string, { revenue: number; orders: number }>();
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

      const dayKey = new Date(created || Date.now()).toISOString().slice(0, 10);
      const day = dailyMap.get(dayKey) ?? { revenue: 0, orders: 0 };
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

    // Cancelled count comes straight from the official paging total.
    const cancelled = await this.countOrdersByStatus("cancelled");

    let daily: SalesDayPoint[] = Array.from(dailyMap.entries())
      .map(([date, v]) => ({ date, revenue: v.revenue, orders: v.orders }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Optionally fill every calendar day in the window with zeros so the bar
    // chart can show the entire month (including days with no sales).
    if (opts.fill) {
      daily = fillDailySeries(dailyMap, fromMs, toMs);
    }

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Enrich the top ranking with real thumbnails/permalinks via multiget.
    // Order items rarely carry a picture, so we fetch the ~10 ranked items.
    const missing = topProducts.filter((p) => !p.thumbnail && p.itemId && p.itemId !== "?");
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
export function fillDailySeries(
  dailyMap: Map<string, { revenue: number; orders: number }>,
  fromMs: number,
  toMs: number,
): SalesDayPoint[] {
  const out: SalesDayPoint[] = [];
  const DAY = 24 * 60 * 60 * 1000;
  // Normalize to the start of the UTC day for stable iteration.
  const start = new Date(fromMs);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(toMs);
  end.setUTCHours(0, 0, 0, 0);
  for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
    const key = new Date(t).toISOString().slice(0, 10);
    const v = dailyMap.get(key) ?? { revenue: 0, orders: 0 };
    out.push({ date: key, revenue: v.revenue, orders: v.orders });
  }
  return out;
}
