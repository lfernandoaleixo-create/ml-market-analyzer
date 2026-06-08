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
  currency: string;
}

export interface SalesDayPoint {
  /** ISO date (yyyy-mm-dd). */
  date: string;
  revenue: number;
  orders: number;
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
  totalStockValue: number;
}

export interface ListingsResult {
  summary: ListingsSummary;
  items: ListingRow[];
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
