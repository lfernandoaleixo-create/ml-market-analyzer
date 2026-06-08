/**
 * Shared types for the "Radar de Concorrentes" module.
 *
 * SECURITY NOTE: this module consumes a THIRD-PARTY intelligence API
 * (Unwrangle). It is completely isolated from the user's Mercado Livre seller
 * account. No ML OAuth token, CNPJ, cookies or seller identity ever flow into
 * these types or the provider that fills them. All data here is public
 * marketplace information collected by the third-party service.
 */

/** A single competitor offer / product as returned by the search API. */
export interface Competitor {
  /** Product / listing name. */
  name: string;
  /** Listing URL on Mercado Livre (public). */
  url: string;
  /** Thumbnail image URL. */
  thumbnail: string | null;
  /** Brand, when available. */
  brand: string | null;
  /** Current selling price. */
  price: number | null;
  /** Original (struck-through) price when discounted. */
  listingPrice: number | null;
  /** Currency code (e.g. BRL). */
  currency: string;
  /** Currency symbol (e.g. R$). */
  currencySymbol: string;
  /** Average rating (0..5) when available. */
  rating: number | null;
  /** Total number of ratings when available. */
  totalRatings: number | null;
}

/** Result of an active competitor search by keyword / category. */
export interface CompetitorSearchResult {
  /** The keyword that was searched. */
  query: string;
  /** Page number (1-based). */
  page: number;
  /** Total results reported by the source (best effort). */
  totalResults: number | null;
  /** Number of pages reported by the source. */
  totalPages: number | null;
  /** Mapped competitor products, already sorted by "strength". */
  results: Competitor[];
  /** Remaining API credits reported by the source, when present. */
  remainingCredits: number | null;
}

/** A seller offering a specific product (from the sellers API). */
export interface CompetitorSeller {
  price: number | null;
  currency: string;
  currencySymbol: string;
  /** Installment / bulk pricing text, when present. */
  bulkPricing: string | null;
  /** Condition text (e.g. "Novo"). */
  condition: string | null;
  /** Shipping text (e.g. "Envio para todo o país"). */
  shipping: string | null;
  sellerName: string | null;
  sellerId: number | null;
  /** URL of this seller's offer for the product. */
  offerUrl: string | null;
  /** Units sold by this seller (null when not exposed). */
  soldQuantity: number | null;
  /** Past sales hint (e.g. "+10mil vendas"). */
  pastSales: string | null;
  /** Reputation label (e.g. "MercadoLíder") when present. */
  sellerRating: string | null;
}

/** All sellers competing on a single product page. */
export interface CompetitorSellersResult {
  productUrl: string;
  productName: string | null;
  productImageUrl: string | null;
  page: number;
  totalPages: number | null;
  sellers: CompetitorSeller[];
  remainingCredits: number | null;
}

/** Full product detail (for a side-by-side diagnosis). */
export interface CompetitorProductDetail {
  name: string;
  url: string;
  image: string | null;
  price: number | null;
  listingPrice: number | null;
  currency: string;
  currencySymbol: string;
  brand: string | null;
  description: string | null;
  rating: number | null;
  totalRatings: number | null;
  images: string[];
  isAvailable: boolean | null;
  state: string | null;
  soldBy: string | null;
  sellerSales: string | null;
  sellerLabels: string[];
  remainingCredits: number | null;
}

/** Whether one side wins a given comparison factor. */
export type FactorAdvantage = "mine" | "theirs" | "tie" | "unknown";

/** Estimated weight of a factor on sales performance. */
export type FactorImpact = "high" | "medium" | "low";

/** A single explainable comparison point between my listing and a competitor. */
export interface DiagnosisFactor {
  /** Factor label (e.g. "Preço", "Reputação do vendedor"). */
  factor: string;
  /** Human-readable value for my listing ("—" when unknown). */
  myValue: string;
  /** Human-readable value for the competitor ("—" when unknown). */
  competitorValue: string;
  /** Who wins this factor. */
  advantage: FactorAdvantage;
  /** Estimated impact of this factor on sales. */
  impact: FactorImpact;
  /** Actionable recommendation in Portuguese. */
  recommendation: string;
}

/** Minimal description of MY listing used as the comparison baseline. */
export interface MyListingBaseline {
  title: string;
  price: number | null;
  /** Units sold (own account data). */
  soldQuantity: number | null;
  /** Reputation label of my account (e.g. "MercadoLíder", "Verde"). */
  reputationLabel: string | null;
  /** Whether my listing uses Mercado Envios Full. */
  hasFull: boolean | null;
  /** Whether my listing offers interest-free installments. */
  hasFreeInstallments: boolean | null;
  /** Number of photos in my listing. */
  photosCount: number | null;
  rating: number | null;
  totalRatings: number | null;
}

/** The full competitor diagnosis ("por que ele vende mais"). */
export interface CompetitorDiagnosis {
  myListing: MyListingBaseline;
  competitor: CompetitorProductDetail;
  factors: DiagnosisFactor[];
  /** A short natural-language summary in Portuguese. */
  summary: string;
}

/** Configuration / availability state of the Radar module. */
export interface CompetitorRadarStatus {
  /** True when the Unwrangle API key is configured on the server. */
  configured: boolean;
}
