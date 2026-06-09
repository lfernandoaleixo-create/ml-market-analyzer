/**
 * Shared Mercado Livre domain types used by both server and client.
 * These shapes are provider-agnostic: the same structures are produced by
 * the demo provider today and by the official OAuth provider in the future.
 */

export type MlSeller = {
  id: string;
  nickname: string;
  /** Reputation level color, e.g. "5_green", "4_light_green". */
  reputationLevel: string;
  /** Power seller status: null | "silver" | "gold" | "platinum". */
  powerSellerStatus: string | null;
  /** Total completed transactions. */
  transactions: number;
  /** 0..1 positive rating ratio. */
  positiveRatingRatio: number;
};

export type MlProduct = {
  id: string;
  title: string;
  price: number;
  originalPrice: number | null;
  currency: string;
  /** Units sold (lifetime, as exposed by ML). */
  soldQuantity: number;
  availableQuantity: number;
  condition: "new" | "used" | "not_specified";
  thumbnail: string;
  /** Number of product images on the listing. */
  pictureCount: number;
  permalink: string;
  freeShipping: boolean;
  /** Whether the listing has a "full"/official-store badge. */
  officialStore: boolean;
  catalogPosition: number | null;
  rating: number; // 0..5
  reviewsCount: number;
  categoryId: string;
  categoryName: string;
  seller: MlSeller;
  /** Optional list of attribute name/value pairs. */
  attributes?: { name: string; value: string }[];
  /**
   * Whether the live price could be resolved from the ML API. Non-certified
   * apps cannot read listing prices for many catalog products, so the UI must
   * show "Preço sob consulta" instead of a fake R$ 0,00 when this is false.
   */
  priceAvailable?: boolean;
  /** Whether sales volume (sold_quantity) is available from the API. */
  salesAvailable?: boolean;
  /** Whether rating/reviews are available from the API. */
  ratingAvailable?: boolean;
  /** Number of live offers found for this catalog product (via /products/{id}/items). */
  offersCount?: number;
  /** When true, the displayed price is the lowest among multiple live offers. */
  priceIsFrom?: boolean;
};

export type MlCategory = {
  id: string;
  name: string;
  /** Approximate total number of items in the category. */
  totalItems: number;
  /** Demand index 0..100, higher = hotter category. */
  demandIndex: number;
};

export type MlTrend = {
  keyword: string;
  /** Relative search volume index 0..100. */
  volumeIndex: number;
  /** Week-over-week change in percent. */
  changePercent: number;
};

export type MlSearchResult = {
  query: string;
  total: number;
  products: MlProduct[];
};

/**
 * Potential score breakdown — every factor is exposed so the UI can
 * explain WHY a product is considered a short-term opportunity.
 */
export type PotentialFactor = {
  key: string;
  label: string;
  /** 0..100 normalized score for this factor. */
  score: number;
  /** Human-readable explanation shown to the user. */
  explanation: string;
  /** Weight applied to this factor in the composite score (0..1). */
  weight: number;
};

export type PotentialAnalysis = {
  product: MlProduct;
  /** Composite 0..100 potential score. */
  potentialScore: number;
  /** Price competitiveness 0..100 (real listing price vs category). */
  priceScore: number;
  /** Best-seller presence 0..100 (real catalog position in category). */
  bestSellerScore: number;
  factors: PotentialFactor[];
  /** Short verdict label. */
  verdict: "alto" | "medio" | "baixo";
};

/**
 * Side-by-side comparison: for each factor we score every product and pick
 * a winner, with an explanation of why it performs better.
 */
export type ComparisonFactor = {
  key: string;
  label: string;
  /** Per-product values keyed by product id. */
  values: Record<string, { raw: string; score: number }>;
  /** Product id of the winner for this factor. */
  winnerId: string;
  explanation: string;
};

export type ComparisonResult = {
  products: MlProduct[];
  factors: ComparisonFactor[];
  /** Overall winner product id and a summary of why. */
  overallWinnerId: string;
  summary: string;
};

export const ML_SITE_ID = "MLB";
