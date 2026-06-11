/**
 * Shared types for the seller account "Central de Gestão" (own-account data).
 * Everything here reflects REAL data pulled from the connected ML account using
 * the owner (proprietary) token — sales, listings, post-sale and reputation.
 */

export interface SalesKpis {
  /** Total approved revenue (sum of paid amounts) in the period. */
  revenue: number;
  /** Number of orders (paid) in the period. */
  orders: number;
  /** Number of distinct units sold. */
  unitsSold: number;
  /** Average order value (revenue / orders). */
  avgTicket: number;
  /** Cancelled orders in the period. */
  cancelled: number;
  /** Total value of cancelled orders in the period. */
  cancelledAmount: number;
  currency: string;
}

export interface SalesDayPoint {
  /** ISO date (yyyy-mm-dd). */
  date: string;
  revenue: number;
  orders: number;
  /** Number of CANCELLED orders created on this day (for highlighting). */
  cancelled: number;
  /** Total amount of the cancelled orders on this day (informational). */
  cancelledAmount: number;
}

export interface TopProduct {
  itemId: string;
  title: string;
  unitsSold: number;
  revenue: number;
  thumbnail?: string;
  permalink?: string;
}

export interface SalesDashboard {
  kpis: SalesKpis;
  daily: SalesDayPoint[];
  topProducts: TopProduct[];
  /** Period bounds (unix ms). */
  from: number;
  to: number;
}

/** Compact KPIs for a period comparison (used by month-over-month cards). */
export interface PeriodSummary {
  revenue: number;
  orders: number;
  unitsSold: number;
  avgTicket: number;
  from: number;
  to: number;
}

/** Lifetime store stats: first effective sale, days in business and accumulated totals. */
export interface StoreLifetime {
  /** Timestamp (ms, UTC) of the first effective (paid) sale; null if none yet. */
  firstSaleMs: number | null;
  /** Total accumulated revenue across all paid orders (best-effort). */
  totalRevenue: number;
  /** Total number of paid orders across the store's lifetime. */
  totalOrders: number;
  /** Total number of cancelled orders across the store's lifetime. */
  canceledOrders: number;
  /** Total accumulated value of cancelled orders (best-effort). */
  canceledRevenue: number;
  currency: string;
}

/** Products sold on a single calendar day (BRT), aggregated by item. */
export interface DayProducts {
  /** ISO day (yyyy-mm-dd, BRT) queried. */
  date: string;
  /** Number of paid orders created on this day. */
  orders: number;
  /** Total approved revenue for the day. */
  revenue: number;
  /** Total units sold across all products on this day. */
  unitsSold: number;
  /** Products sold, ranked by revenue desc. */
  products: TopProduct[];
  /** Number of cancelled orders created on this day. */
  cancelledOrders: number;
  /** Total value of cancelled orders on this day. */
  cancelledRevenue: number;
  /** Total units cancelled across all products on this day. */
  cancelledUnits: number;
  /** Products from cancelled orders this day, aggregated by item, revenue desc. */
  cancelledProducts: TopProduct[];
  currency: string;
}

export type ListingStatus = "active" | "paused" | "closed" | "under_review" | "inactive";

export interface ListingRow {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  availableQuantity: number;
  soldQuantity: number;
  status: ListingStatus;
  listingType: string;
  /** Visits in the selected window (e.g. last 30 days). */
  visits: number;
  /** Conversion = soldQuantity / visits (0..1), null when no visits. */
  conversion: number | null;
  thumbnail?: string;
  permalink?: string;
  /** Health score 0..1 when provided by ML. */
  health?: number | null;
  categoryId?: string;
  /** Creation timestamp (ms, UTC) of the listing. */
  createdMs?: number | null;
  /** Last update timestamp (ms, UTC) of the listing. */
  updatedMs?: number | null;
  /** Whether the listing offers free shipping. */
  freeShipping?: boolean;
  /** Logistic mode (e.g. fulfillment, cross_docking, drop_off, self_service). */
  logisticType?: string | null;
  /** Whether the listing is associated to a catalog product. */
  catalogListing?: boolean;
  /** Total stock value for this listing (price * availableQuantity). */
  stockValue: number;
}

export interface ListingsSummary {
  total: number;
  active: number;
  paused: number;
  closed: number;
  /** Items with stock but zero sales (potentially stagnant). */
  stagnant: number;
  /** Items with zero available stock. */
  outOfStock: number;
  totalVisits: number;
  /** Visits in the selected window broken down by listing status. */
  visitsActive: number;
  visitsPaused: number;
  visitsClosed: number;
  /** Number of active listings with at least one visit in the window. */
  activeWithVisits: number;
  /** Number of active listings with zero visits in the window. */
  activeNoVisits: number;
  /** Average visits per active listing (window). */
  avgVisitsPerActive: number;
  totalStockValue: number;
  /** Total units sold across all listings (lifetime sold_quantity). */
  totalSold: number;
  /** Number of days in the visits window used to compute `visits`. */
  windowDays: number;
  /** True when the listing count hit the safety cap (more items exist). */
  capped: boolean;
}

/** A single day in the active-listings visits evolution series. */
export interface VisitsDayPoint {
  /** ISO date (yyyy-mm-dd). */
  date: string;
  /** Aggregated visits across all active listings on this day. */
  visits: number;
}

export interface ListingsResult {
  summary: ListingsSummary;
  items: ListingRow[];
  /** Daily visits evolution for ACTIVE listings over the last 30 days
   *  (aggregated across items). Empty when the data could not be fetched. */
  visitsSeries: VisitsDayPoint[];
}

export interface PostSaleSummary {
  /** Open claims/complaints. */
  openClaims: number;
  /** Total claims in history (best effort). */
  totalClaims: number;
  /** Cancelled orders. */
  cancellations: number;
  /** Returns / refunds count. */
  returns: number;
  /** Claim rate over orders (0..1). */
  claimRate: number | null;
}

export interface PostSaleItem {
  id: string;
  type: string;
  status: string;
  reason?: string;
  itemTitle?: string;
  dateCreated?: number;
}

export interface PostSaleResult {
  summary: PostSaleSummary;
  items: PostSaleItem[];
}

export interface ReputationInfo {
  nickname: string;
  levelId: string | null;
  powerSellerStatus: string | null;
  sellerExperience: string | null;
  transactionsTotal: number;
  transactionsCompleted: number;
  transactionsCanceled: number;
  ratingsPositive: number;
  ratingsNeutral: number;
  ratingsNegative: number;
  /** Metrics block (claims, delayed handling, cancellations) when present. */
  metrics?: {
    claimsRate?: number | null;
    delayedRate?: number | null;
    cancellationsRate?: number | null;
  };
  points: number;
  registrationDate?: string;
  permalink?: string;
}

export interface AccountConnectionState {
  connected: boolean;
  nickname?: string;
  message?: string;
}
