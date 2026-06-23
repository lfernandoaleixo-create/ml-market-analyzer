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
  /** Whether REAL visit data was obtained for this item from ML in this window.
   *  When false, `visits` is NOT a real zero — ML did not return the data in time
   *  (rate limit / timeout). The UI must show "carregando", never "0". */
  visitsAvailable: boolean;
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
  /** Seller SKU (from seller_custom_field / seller_sku / SELLER_SKU attribute),
   *  used to match the product cost in BaseLinker. Empty string when absent. */
  sku?: string;
  /** Peso da embalagem do vendedor (gramas), do atributo SELLER_PACKAGE_WEIGHT do
   *  ML — é o que o ML usa para o frete. null quando o anúncio não declara. */
  packageWeightGrams?: number | null;
  /** Visitas discriminadas por dia (BRT) para os últimos dias — hoje, ontem,
   *  anteontem e 3 dias atrás. Ordenado do mais ANTIGO para o mais RECENTE
   *  (o último item é HOJE, ainda parcial). Ausente/undefined enquanto o ML não
   *  respondeu (a UI mostra "—" e mantém o poll). */
  dailyVisits?: VisitsDayPoint[];
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
  /** True when ML did NOT return visit data for ALL items within the time budget
   *  (rate limit / congestion). In this case visit-derived numbers are NOT real
   *  zeros and the UI must show a "carregando" state with a refresh option. */
  visitsPending: boolean;
  /** True while the background visits collector is still running OR not every
   *  item has a fresh value yet. The client polls while this is true so the
   *  total fills in progressively without the user clicking refresh. */
  visitsCollecting: boolean;
  /** How many items we tried to fetch visits for, and how many actually resolved
   *  with real data. visitsResolved < visitsAttempted => partial/pending. */
  visitsAttempted: number;
  visitsResolved: number;
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
  /** True when the series was REQUESTED but NO active item returned visit data
   *  (timeout / rate limit). Lets the UI show "carregando" instead of falsely
   *  claiming "sem visitas". Undefined/false means the empty/zero series is real. */
  visitsSeriesPending?: boolean;
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

/* -------------------------------------------------------------------------- */
/* Raio-X da Ficha Técnica (Technical Specifications X-Ray)                    */
/* -------------------------------------------------------------------------- */

/** The kind of editor a ML attribute uses (mirrors ML `value_type`). */
export type TechAttrValueType =
  | "string"
  | "number"
  | "number_unit"
  | "list"
  | "boolean";

/** One attribute of a listing's technical sheet, with its current value and
 *  whether it is filled. Mirrors what ML exposes via
 *  GET /categories/{cat}/technical_specs + the item's own attributes. */
export interface TechAttribute {
  /** ML attribute id (e.g. "BRAND", "MODEL", "ANVISA_PRODUCT_..."). */
  id: string;
  /** Human-readable attribute name. */
  name: string;
  /** Editor type. */
  valueType: TechAttrValueType;
  /** Whether ML marks this attribute as required for the category. */
  required: boolean;
  /** Current value name on the item (null when not filled). */
  valueName: string | null;
  /** True when the attribute has no value on the item (i.e. it's missing). */
  isMissing: boolean;
  /** Allowed values for `list` attributes (so the correction form offers a
   *  dropdown instead of free text). Empty for non-list attributes. */
  allowedValues?: string[];
  /** Allowed units for `number_unit` attributes (e.g. ["cm","mm"]). */
  allowedUnits?: string[];
  /** Optional default unit suggested by ML for `number_unit`. */
  defaultUnit?: string;
  /** Whether multiple values are allowed (ML `multivalued`). */
  multivalued?: boolean;
  /** Short hint/example to guide the seller while filling. */
  hint?: string;
}

/** Technical-sheet diagnosis for a single listing. */
export interface TechSpecListing {
  itemId: string;
  title: string;
  status: ListingStatus;
  thumbnail?: string;
  permalink?: string;
  categoryId?: string;
  /** Total relevant attributes considered for the category. */
  totalAttributes: number;
  /** How many of those are filled. */
  filledAttributes: number;
  /** How many are missing (totalAttributes - filledAttributes). */
  missingAttributes: number;
  /** How many REQUIRED attributes are still missing (the critical ones). */
  missingRequired: number;
  /** Completeness 0..1 (filled / total). */
  completeness: number;
  /** True when there are no missing attributes at all. */
  complete: boolean;
  /** Full attribute list (filled + missing) for the detail panel. */
  attributes: TechAttribute[];
}

/** Aggregated summary across all diagnosed listings. */
export interface TechSpecsSummary {
  /** Listings analysed. */
  total: number;
  /** Listings with a complete technical sheet (no missing attributes). */
  complete: number;
  /** Listings with at least one missing attribute. */
  incomplete: number;
  /** Listings with at least one REQUIRED missing attribute (critical). */
  withMissingRequired: number;
  /** Average completeness across analysed listings (0..1). */
  avgCompleteness: number;
  /** Total number of missing attributes across all listings. */
  totalMissing: number;
  /** Total number of missing REQUIRED attributes across all listings. */
  totalMissingRequired: number;
  /** True when the analysis hit the safety cap (more listings exist). */
  capped: boolean;
  /** True when EVERY analysed listing has a 100% complete sheet. */
  allComplete: boolean;
}

export interface TechSpecsResult {
  summary: TechSpecsSummary;
  items: TechSpecListing[];
}
