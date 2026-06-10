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

  /** Cache of ALL cancelled orders (with their date_created) for this instance,
   *  used to mark which days had cancellations in the daily series. */
  private cancelledOrdersCache: any[] | null = null;

  private async getCancelledOrders(): Promise<any[]> {
    if (this.cancelledOrdersCache) return this.cancelledOrdersCache;
    this.cancelledOrdersCache = await this.getOrdersByStatus("cancelled");
    return this.cancelledOrdersCache;
  }

  private async get(path: string, timeoutMs = 12000): Promise<any | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
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

  /** Multiget item details in batches of 20 (ML multiget cap), in parallel. */
  private async getItemsDetails(ids: string[]): Promise<any[]> {
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += 20) batches.push(ids.slice(i, i + 20));
    const attributes =
      "id,title,price,currency_id,available_quantity,sold_quantity,status," +
      "listing_type_id,health,category_id,permalink,thumbnail,pictures," +
      "date_created,last_updated,shipping,catalog_listing,catalog_product_id";
    const out: any[] = [];
    const concurrency = 5;
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

  /** Total visits for many items at once via /visits/items?ids= (best effort).
   *  Used for the default window where ML reports lifetime/recent totals; for a
   *  custom day window we fall back to the per-item time_window endpoint. */
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

  async getListings(opts: { lastDays?: number; maxItems?: number; windowVisits?: boolean } = {}): Promise<ListingsResult> {
    const lastDays = opts.lastDays ?? 30;
    const maxItems = opts.maxItems ?? 600;
    const { ids, capped } = await this.getAllItemIds(maxItems);
    const details = await this.getItemsDetails(ids);
    const detailIds = details.map((d) => d.id);

    // Visits strategy — performance critical:
    //  The page must load fast for 500+ items, so we ALWAYS use the cheap batch
    //  endpoint (/visits/items?ids=, 1 call / 20 items, total visits). The ML
    //  dated endpoint only accepts ONE item per request, so fetching a custom
    //  window for every item would mean hundreds of sequential calls (80-100s
    //  and frequent timeouts). We therefore expose total visits by default and
    //  only opt into the slow per-item window when explicitly requested AND the
    //  catalog is small enough to stay responsive.
    const visitsMap = new Map<string, number>();
    const windowVisits = opts.windowVisits === true;
    const PER_ITEM_WINDOW_CAP = 120; // keep well under the request timeout
    if (windowVisits && lastDays !== 30 && detailIds.length <= PER_ITEM_WINDOW_CAP) {
      const concurrency = 10;
      for (let i = 0; i < detailIds.length; i += concurrency) {
        const batch = detailIds.slice(i, i + concurrency);
        const results = await Promise.all(
          batch.map(async (id) => [id, await this.getItemVisits(id, lastDays)] as const),
        );
        for (const [id, v] of results) visitsMap.set(id, v);
      }
    } else {
      const batch = await this.getVisitsBatch(detailIds);
      batch.forEach((v, id) => visitsMap.set(id, v));
    }

    const items: ListingRow[] = details.map((d) => {
      const visits = visitsMap.get(d.id) ?? 0;
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
        conversion: visits > 0 ? soldQuantity / visits : null,
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
      };
    });

    const active = items.filter((i) => i.status === "active").length;
    const paused = items.filter((i) => i.status === "paused").length;
    const closed = items.filter((i) => i.status === "closed").length;
    const stagnant = items.filter((i) => i.availableQuantity > 0 && i.soldQuantity === 0).length;
    const outOfStock = items.filter((i) => i.availableQuantity === 0).length;
    const totalVisits = items.reduce((s, i) => s + i.visits, 0);
    const totalStockValue = items.reduce((s, i) => s + i.stockValue, 0);
    const totalSold = items.reduce((s, i) => s + i.soldQuantity, 0);

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
        totalSold,
        windowDays: lastDays,
        capped,
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
