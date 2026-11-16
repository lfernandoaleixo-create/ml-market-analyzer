import { and, asc, desc, eq, or, sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import {
  embalagemSheetRows, kitSheetRows, projectDocuments, projectProducts,
  skuSheetCustomColumns, skuSheetRows, skuVariations,
} from "../../drizzle/schema";
import { alphaCatalogProducts, alphaPdfExports } from "../../drizzle/alphaSchema";
import type { ReadApiQuery, ReadApiResult } from "../../shared/readApi";
import { parseCatalogProducts } from "../../shared/alpha/productCatalog";
import { getDb } from "../db";
import { getCredentials, resolveMlOwnerUserId } from "../dbMl";
import { ensureUserAccessToken } from "../ml/oauthMl";
import { AccountProvider } from "../ml/accountProvider";
import { AdsProvider } from "../ml/adsProvider";
import { cachedAccountResilient } from "../ml/accountCache";

const SELLER_ID = 3308178634;
const CACHE_TTL_MS = 5 * 60_000;
const HTTP_DEADLINE_MS = 12_000;
// Mirror the provider's existing bounds; never request an unlimited collection.
const SALES_ORDERS_PER_STATUS_CAP = 1000;
const SALES_TOP_PRODUCTS_LIMIT = 100;
const EXTERNAL_PATHS = new Set(["/store", "/listings", "/visits", "/technical-specs", "/sales", "/ads"]);
const LOCAL_PATHS = new Set(["/products", "/sku", "/sku/variations", "/sku/columns", "/kits", "/packaging", "/documents", "/pricing/products", "/pricing/pdfs"]);

/** Only these messages/codes may cross the HTTP boundary; never retain a raw cause. */
export class ReadApiDataError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "ReadApiDataError";
  }
}
function unavailable(): ReadApiDataError {
  return new ReadApiDataError(503, "DATA_UNAVAILABLE", "Os dados não estão disponíveis agora. Tente novamente em instantes.");
}
function mlUnavailable(): ReadApiDataError {
  return new ReadApiDataError(502, "ML_UNAVAILABLE", "Não foi possível confirmar os dados no Mercado Livre. Tente novamente em instantes.");
}
function mismatch(): ReadApiDataError {
  return new ReadApiDataError(403, "ML_SELLER_MISMATCH", "A conexão não corresponde à loja autorizada para esta API.");
}
function normalizeQuery(query: ReadApiQuery): ReadApiQuery {
  const integer = (v: number, fallback: number) => Number.isSafeInteger(v) ? v : fallback;
  return {
    limit: Math.max(1, Math.min(100, integer(query.limit, 50))),
    offset: Math.max(0, Math.min(100_000, integer(query.offset, 0))),
    days: [7, 30, 90].includes(query.days) ? query.days : 30,
    search: typeof query.search === "string" ? query.search.trim().slice(0, 120) : undefined,
    productId: Number.isSafeInteger(query.productId) && query.productId! > 0 ? query.productId : undefined,
    rowId: Number.isSafeInteger(query.rowId) && query.rowId! > 0 ? query.rowId : undefined,
  };
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
/** Explicit allowlist, also used for response shaping (including nested provider results). */
function pick<T, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.filter(key => Object.prototype.hasOwnProperty.call(value, key))
    .map(key => [key, value[key]])) as Pick<T, K>;
}
function scalarPick(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const source = object(value);
  return Object.fromEntries(keys.filter(key => {
    const v = source[key];
    return v === null || typeof v === "string" || typeof v === "boolean" ||
      (typeof v === "number" && Number.isFinite(v));
  }).map(key => [key, source[key]]));
}
function page<T>(rows: T[], query: ReadApiQuery): ReadApiResult {
  return { data: rows.slice(0, query.limit), meta: {
    limit: query.limit, offset: query.offset, hasMore: rows.length > query.limit,
  } };
}
/** ! is an explicit MySQL escape character, independent of NO_BACKSLASH_ESCAPES. */
function searchWhere(search: string | undefined, columns: (AnyMySqlColumn | SQL)[]): SQL | undefined {
  if (!search) return undefined;
  const pattern = `%${search.replace(/[!%_\\]/g, character => `!${character}`)}%`;
  return or(...columns.map(column => sql`${column} LIKE ${pattern} ESCAPE '!'`));
}
const SHEET_FIELDS = [
  "id", "position", "productNumber", "variantNumber", "cadastradoMl", "tipoSku",
  "categoryId", "categoryName", "subCategoryId", "subCategoryName", "produto", "variante",
  "sku", "gerarSkuKit", "skuKit", "eanGtin", "ncm", "gpc", "cest", "precoClassico",
  "precoPremium", "precoAtacado", "embProfundidade", "embLargura", "embAltura", "embPeso",
  "caracteristicas", "rowColor", "customValues", "createdAt", "updatedAt",
] as const;
const PRODUCT_FIELDS = ["id", "name", "description", "priority", "currentStep", "supplier", "notes", "imageUrl", "expectedArrival", "orderDeadline", "createdAt", "updatedAt"] as const;
const VARIATION_FIELDS = ["id", "skuRowId", "variationIndex", "variationSku", "ean", "mlb", "done", "createdAt", "updatedAt"] as const;
const COLUMN_FIELDS = ["id", "name", "position", "createdAt", "updatedAt"] as const;
const KIT_FIELDS = [...SHEET_FIELDS, "kit", "embalagem", "profundidade", "largura", "alturaComprimento", "kg", "categoria", "dimensoesGs1", "baseAjustado", "mlAjustado", "formadoPor", "observacao"] as const;
const PACKAGING_FIELDS = ["id", "position", "produto", "eanGtin", "sku", "embalagem", "ncm", "gpc", "cest", "precoClassico", "precoPremium", "altura", "largura", "comprimento", "kg", "categoria", "observacao", "rowColor", "customValues", "createdAt", "updatedAt"] as const;
const DOCUMENT_FIELDS = ["id", "productId", "name", "url", "type", "createdAt"] as const;
const PDF_FIELDS = ["exportId", "reportId", "filename", "description", "sku", "projectId", "documentId", "byteSize", "status", "url", "uploadedAt", "createdAt", "updatedAt"] as const;
const PRICING_INPUT_FIELDS = [
  "description", "productSku", "kitSku", "productType", "category", "categoryDiscountEligible",
  "calculationType", "packagingPreset", "costMode", "cost", "productKg", "itemQuantity",
  "operation", "packaging", "promotion", "adsMode", "ads", "taxFederal", "taxPis", "taxCofins",
  "taxIrpj", "taxCsll", "taxIcms", "useDestinationTaxes", "saleDestination", "taxIcmsInside",
  "taxIcmsOutside", "taxIcmsTransfer", "taxDifal", "difalMode", "taxDifalValue", "listing",
  "classicRate", "premiumRate", "price", "weight", "weightInputMode", "weightExact", "length",
  "width", "height", "reputation", "condition", "logistic", "shippingMode", "automaticShippingOnly",
  "manualShipping", "manualFixedFee", "manualFixedLimit", "fullExtra", "reservePercent",
] as const;
function safeCatalogRecord(row: { id: string; recordPayload: string; version: number; createdAt: number; updatedAt: number }) {
  const records = parseCatalogProducts(row.recordPayload);
  if (records.length !== 1 || records[0].id !== row.id) throw unavailable();
  const record = records[0];
  const input = scalarPick(record.input, PRICING_INPUT_FIELDS);
  if (Array.isArray(record.input.kitItems)) {
    input.kitItems = record.input.kitItems.map(item => scalarPick(item, ["id", "description", "sku", "quantity", "unitCost"]));
  }
  return {
    id: row.id, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt,
    ...scalarPick(record, ["goal", "mode", "status", "resultPrice"]), input,
    categoryAnswer: record.categoryAnswer ? scalarPick(record.categoryAnswer, ["category", "categoryId", "source", "explanation", "confidence"]) : null,
  };
}
/** No project/SKU helpers: their list functions may backfill numbers or create variations. */
async function localData(path: string, ownerUserId: number, query: ReadApiQuery): Promise<ReadApiResult> {
  const db = await getDb();
  if (!db) throw unavailable();
  const { limit, offset, productId, rowId, search } = query;
  switch (path) {
    case "/products": {
      const rows = await db.select(pick(projectProducts, PRODUCT_FIELDS)).from(projectProducts)
        .where(and(productId ? eq(projectProducts.id, productId) : undefined,
          searchWhere(search, [projectProducts.name, projectProducts.description, projectProducts.supplier])))
        .orderBy(asc(projectProducts.id)).limit(limit + 1).offset(offset);
      return page(rows.map(row => pick(row, PRODUCT_FIELDS)), query);
    }
    case "/sku": {
      const fields = [...SHEET_FIELDS, "mainMlb", "mainDone", "skuMode"] as const;
      const rows = await db.select(pick(skuSheetRows, fields)).from(skuSheetRows)
        .where(and(eq(skuSheetRows.isDeleted, false), rowId ? eq(skuSheetRows.id, rowId) : undefined,
          productId ? eq(skuSheetRows.productNumber, productId) : undefined,
          searchWhere(search, [skuSheetRows.produto, skuSheetRows.variante, skuSheetRows.sku, skuSheetRows.skuKit, skuSheetRows.mainMlb])))
        .orderBy(asc(skuSheetRows.position), asc(skuSheetRows.id)).limit(limit + 1).offset(offset);
      return page(rows.map(row => pick(row, fields)), query);
    }
    case "/sku/variations": {
      const rows = await db.select(pick(skuVariations, VARIATION_FIELDS)).from(skuVariations)
        .innerJoin(skuSheetRows, eq(skuVariations.skuRowId, skuSheetRows.id))
        .where(and(eq(skuVariations.isDeleted, false), eq(skuSheetRows.isDeleted, false),
          rowId ? eq(skuVariations.skuRowId, rowId) : undefined,
          productId ? eq(skuSheetRows.productNumber, productId) : undefined,
          searchWhere(search, [skuVariations.variationSku, skuVariations.ean, skuVariations.mlb, skuSheetRows.produto])))
        .orderBy(asc(skuVariations.skuRowId), asc(skuVariations.variationIndex), asc(skuVariations.id))
        .limit(limit + 1).offset(offset);
      return page(rows.map(row => pick(row, VARIATION_FIELDS)), query);
    }
    case "/sku/columns": {
      const rows = await db.select(pick(skuSheetCustomColumns, COLUMN_FIELDS)).from(skuSheetCustomColumns)
        .where(searchWhere(search, [skuSheetCustomColumns.name]))
        .orderBy(asc(skuSheetCustomColumns.position), asc(skuSheetCustomColumns.id)).limit(limit + 1).offset(offset);
      return page(rows.map(row => pick(row, COLUMN_FIELDS)), query);
    }
    case "/kits": {
      const rows = await db.select(pick(kitSheetRows, KIT_FIELDS)).from(kitSheetRows)
        .where(and(rowId ? eq(kitSheetRows.id, rowId) : undefined,
          productId ? eq(kitSheetRows.productNumber, productId) : undefined,
          searchWhere(search, [kitSheetRows.produto, kitSheetRows.kit, kitSheetRows.sku, kitSheetRows.skuKit])))
        .orderBy(asc(kitSheetRows.position), asc(kitSheetRows.id)).limit(limit + 1).offset(offset);
      return page(rows.map(row => pick(row, KIT_FIELDS)), query);
    }
    case "/packaging": {
      const rows = await db.select(pick(embalagemSheetRows, PACKAGING_FIELDS)).from(embalagemSheetRows)
        .where(and(rowId ? eq(embalagemSheetRows.id, rowId) : undefined,
          searchWhere(search, [embalagemSheetRows.produto, embalagemSheetRows.sku, embalagemSheetRows.embalagem])))
        .orderBy(asc(embalagemSheetRows.position), asc(embalagemSheetRows.id)).limit(limit + 1).offset(offset);
      return page(rows.map(row => pick(row, PACKAGING_FIELDS)), query);
    }
    case "/documents": {
      const rows = await db.select(pick(projectDocuments, DOCUMENT_FIELDS)).from(projectDocuments)
        .where(and(productId ? eq(projectDocuments.productId, productId) : undefined,
          rowId ? eq(projectDocuments.id, rowId) : undefined, searchWhere(search, [projectDocuments.name])))
        .orderBy(asc(projectDocuments.id)).limit(limit + 1).offset(offset);
      return page(rows.map(row => pick(row, DOCUMENT_FIELDS)), query);
    }
    case "/pricing/products": {
      // Real schema: ownerId + versioned recordPayload (not a shared project product).
      // The payload is parsed internally, then recursively projected; it is never returned.
      const value = (key: string) => sql`COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${alphaCatalogProducts.recordPayload}, ${`$.records[0].input.${key}`})), JSON_UNQUOTE(JSON_EXTRACT(${alphaCatalogProducts.recordPayload}, ${`$.record.input.${key}`})))`;
      const rows = await db.select({ id: alphaCatalogProducts.id, recordPayload: alphaCatalogProducts.recordPayload,
        version: alphaCatalogProducts.version, createdAt: alphaCatalogProducts.createdAt, updatedAt: alphaCatalogProducts.updatedAt })
        .from(alphaCatalogProducts).where(and(eq(alphaCatalogProducts.ownerId, ownerUserId),
          productId ? eq(alphaCatalogProducts.id, String(productId)) : undefined,
          searchWhere(search, [value("description"), value("productSku"), value("kitSku")])))
        .orderBy(desc(alphaCatalogProducts.updatedAt), asc(alphaCatalogProducts.id)).limit(limit + 1).offset(offset);
      const result = page(rows, query);
      result.data = rows.slice(0, limit).map(safeCatalogRecord);
      return result;
    }
    case "/pricing/pdfs": {
      // "ready" is this schema's completed state. No storage key, lease, snapshot or error.
      const rows = await db.select(pick(alphaPdfExports, PDF_FIELDS)).from(alphaPdfExports)
        .where(and(eq(alphaPdfExports.ownerId, ownerUserId), eq(alphaPdfExports.status, "ready"),
          productId ? eq(alphaPdfExports.projectId, productId) : undefined,
          rowId ? eq(alphaPdfExports.documentId, rowId) : undefined,
          searchWhere(search, [alphaPdfExports.filename, alphaPdfExports.description, alphaPdfExports.sku])))
        .orderBy(desc(alphaPdfExports.createdAt), asc(alphaPdfExports.exportId)).limit(limit + 1).offset(offset);
      return page(rows.map(row => pick(row, PDF_FIELDS)), query);
    }
    default: throw new ReadApiDataError(404, "NOT_FOUND", "Recurso não encontrado.");
  }
}

/** Strict GET-only transport: the UI providers otherwise swallow 401/5xx into null/zeros. */
async function readMl(token: string, path: string): Promise<unknown> {
  if (!path.startsWith("/") || path.startsWith("//")) throw mlUnavailable();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(mlUnavailable()); }, HTTP_DEADLINE_MS);
  });
  try {
    return await Promise.race([(async () => {
      const response = await fetch(`https://api.mercadolibre.com${path}`, {
        method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Api-Version": "1" },
        signal: controller.signal,
      });
      if (response.status === 429) {
        throw new ReadApiDataError(429, "ML_RATE_LIMITED", "O Mercado Livre limitou as consultas. Tente novamente em instantes.");
      }
      if (!response.ok) throw mlUnavailable();
      const value: unknown = await response.json();
      if (value === null || typeof value !== "object") throw mlUnavailable();
      // Essential paged endpoints must explicitly confirm an empty result.
      if (path.startsWith("/orders/search") || path.includes("/items/search") ||
          path.includes("/product_ads/campaigns/search") || path.includes("/product_ads/ads/search")) {
        const data = object(value);
        const total = object(data.paging).total;
        if (!Array.isArray(data.results) || !Number.isSafeInteger(total) || (total as number) < 0 ||
            ((total as number) > 0 && data.results.length === 0 && !/[?&]offset=[1-9]/.test(path))) throw mlUnavailable();
        if (path.includes("/items/search") && data.results.some(value =>
          typeof value !== "string" || value.trim().length === 0)) throw mlUnavailable();
        if (path.startsWith("/orders/search") && data.results.some(value => {
          const order = object(value);
          return typeof order.date_created !== "string" || !Number.isFinite(Date.parse(order.date_created)) ||
            typeof order.total_amount !== "number" || !Number.isFinite(order.total_amount) ||
            !Array.isArray(order.order_items) || order.order_items.some(value => {
              const item = object(value);
              return typeof item.quantity !== "number" || !Number.isFinite(item.quantity) ||
                typeof item.unit_price !== "number" || !Number.isFinite(item.unit_price);
            });
        })) throw mlUnavailable();
        if (path.includes("/product_ads/") && data.results.some(value => {
          const metrics = object(object(value).metrics);
          return ["clicks", "prints", "cost", "direct_amount", "indirect_amount", "total_amount",
            "direct_units_quantity", "indirect_units_quantity", "units_quantity"].some(key =>
            metrics[key] == null || !Number.isFinite(Number(metrics[key])));
        })) throw mlUnavailable();
      }
      if (path.startsWith("/advertising/advertisers") && !Array.isArray(object(value).advertisers)) throw mlUnavailable();
      return value;
    })(), deadline]);
  } catch (error) {
    throw error instanceof ReadApiDataError ? error : mlUnavailable();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
/**
 * Reuse the providers' aggregation, not their UI-only error-swallowing transport.
 * Their TS-private (not #private) get method is the single HTTP boundary. Replacing
 * it on this instance requires no global fetch patch and no provider write callback.
 */
function readOnlyProvider<T extends object>(provider: T, token: string, onRead?: (path: string, value: unknown) => void): T {
  Object.defineProperty(provider, "get", { value: async (path: string) => {
    const value = await readMl(token, path);
    if (path === "/users/me") {
      const me = object(value);
      if (Number(me.id) !== SELLER_ID) throw mismatch();
      // getReputation uses numeric defaults for absent transactions/ratings.
      // Missing essential fields are unconfirmed, not a zero-transaction shop.
      const transactions = object(object(me.seller_reputation).transactions);
      const ratings = object(transactions.ratings);
      const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
      if (![transactions.total, transactions.completed, transactions.canceled,
        ratings.positive, ratings.neutral, ratings.negative, me.points].every(finite)) throw mlUnavailable();
    }
    onRead?.(path, value);
    return value;
  } });
  return provider;
}
async function verifiedConnection(ownerUserId: number) {
  const mlOwnerId = await resolveMlOwnerUserId(ownerUserId);
  const credentials = await getCredentials(mlOwnerId);
  if (!credentials) throw new ReadApiDataError(503, "ML_NOT_CONNECTED", "A loja não está conectada ao Mercado Livre.");
  // This helper may do a normal OAuth rotation if necessary. No force refresh,
  // connection self-heal, credential backfill or token-suffix seller inference.
  const token = await ensureUserAccessToken(mlOwnerId);
  if (!token) throw new ReadApiDataError(503, "ML_NOT_CONNECTED", "A loja não está conectada ao Mercado Livre.");
  const me = object(await readMl(token, "/users/me"));
  const id = typeof me.id === "number" ? me.id : typeof me.id === "string" && /^\d+$/.test(me.id) ? Number(me.id) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw mlUnavailable();
  if (id !== SELLER_ID) throw mismatch();
  // Nickname is diagnostic only. Persisted mlUserId can be stale and is NOT authority.
  return { token, sellerId: id, nickname: typeof me.nickname === "string" ? me.nickname : undefined };
}
const LISTING_FIELDS = ["itemId", "title", "price", "currency", "availableQuantity", "soldQuantity", "status", "listingType", "visits", "visitsAvailable", "conversion", "thumbnail", "permalink", "health", "categoryId", "createdMs", "updatedMs", "freeShipping", "logisticType", "catalogListing", "stockValue", "sku", "packageWeightGrams"] as const;
const LISTING_SUMMARY_FIELDS = ["total", "active", "paused", "closed", "stagnant", "outOfStock", "totalVisits", "visitsPending", "visitsCollecting", "visitsAttempted", "visitsResolved", "visitsActive", "visitsPaused", "visitsClosed", "activeWithVisits", "activeNoVisits", "avgVisitsPerActive", "totalStockValue", "totalSold", "windowDays", "capped"] as const;
const TECH_FIELDS = ["itemId", "title", "status", "thumbnail", "permalink", "categoryId", "totalAttributes", "filledAttributes", "missingAttributes", "missingRequired", "completeness", "complete"] as const;
const TECH_SUMMARY_FIELDS = ["total", "complete", "incomplete", "withMissingRequired", "avgCompleteness", "totalMissing", "totalMissingRequired", "capped", "allComplete"] as const;
const METRIC_FIELDS = ["clicks", "prints", "cost", "cpc", "ctr", "acos", "sov", "directAmount", "indirectAmount", "totalAmount", "directUnits", "indirectUnits", "units", "organicUnits", "organicItems"] as const;
function safeAds(raw: unknown) {
  const result = object(raw);
  if (!["connected", "no_ads_access"].includes(String(result.connection))) throw mlUnavailable();
  if (result.connection === "connected" && (!result.summary || !Array.isArray(result.topCampaigns) || !Array.isArray(result.topAds))) throw mlUnavailable();
  const summary = object(result.summary);
  const withMetrics = (value: unknown, fields: readonly string[]) => ({ ...scalarPick(value, fields), metrics: scalarPick(object(value).metrics, METRIC_FIELDS) });
  return {
    connection: result.connection,
    summary: result.summary ? {
      ...scalarPick(summary, ["advertiserId", "currency", "campaignCount", "activeCampaignCount"]),
      metrics: scalarPick(summary.metrics, METRIC_FIELDS),
      derived: scalarPick(summary.derived, ["roas", "acos", "conversionRate", "totalBudget", "organicShare"]),
    } : null,
    topCampaigns: (Array.isArray(result.topCampaigns) ? result.topCampaigns : []).map(value => withMetrics(value, ["id", "name", "status", "strategy", "acosTarget", "roasTarget", "budget", "automaticBudget", "channel", "dateCreated", "lastUpdated"])),
    topAds: (Array.isArray(result.topAds) ? result.topAds : []).map(value => withMetrics(value, ["itemId", "campaignId", "title", "price", "status", "thumbnail", "permalink", "listingTypeId", "logisticType", "buyBoxWinner", "catalogListing", "brand", "imageQuality", "hasDiscount"])),
    ...scalarPick(result, ["insightsCount"]),
  };
}
async function collectExternal(path: string, token: string, days: number, sellerId: number): Promise<ReadApiResult> {
  if (path === "/ads") {
    const provider = readOnlyProvider(new AdsProvider(token, "MLB"), token);
    return { data: safeAds(await provider.getDashboard(days)) };
  }
  let ordersCapped = false;
  const account = readOnlyProvider(new AccountProvider(token, sellerId, "BRL"), token, path === "/sales" ? (requestPath, value) => {
    // Observe validated pages for each status, including their requested offsets.
    // The provider drops paging metadata when returning its bounded aggregate.
    if (requestPath.split("?")[0] === "/orders/search" &&
        (object(object(value).paging).total as number) > SALES_ORDERS_PER_STATUS_CAP) ordersCapped = true;
  } : undefined);
  if (path === "/store") {
    const reputation = await account.getReputation();
    if (!reputation) throw mlUnavailable();
    return { data: {
      sellerId,
      ...scalarPick(reputation, ["nickname", "levelId", "powerSellerStatus", "sellerExperience", "transactionsTotal", "transactionsCompleted", "transactionsCanceled", "ratingsPositive", "ratingsNeutral", "ratingsNegative", "points", "registrationDate", "permalink"]),
      metrics: scalarPick(reputation.metrics, ["claimsRate", "delayedRate", "cancellationsRate"]),
    } };
  }
  if (path === "/visits") {
    // One bounded count confirmation; the provider still collects at most 200.
    const active = object(await readMl(token, `/users/${sellerId}/items/search?status=active&limit=1&offset=0`));
    const totalActive = object(active.paging).total as number;
    const visits = await account.getVisitsSeriesOnly(days);
    if (!Array.isArray(visits.series) || !Number.isSafeInteger(visits.attempted) || !Number.isSafeInteger(visits.resolved) ||
        visits.attempted < 0 || visits.resolved < 0 || visits.resolved > visits.attempted ||
        (visits.attempted > 0 && visits.resolved === 0)) throw mlUnavailable();
    const capped = totalActive > visits.attempted;
    return { data: {
      summary: { days, totalActive, attempted: visits.attempted, resolved: visits.resolved },
      items: visits.series.map(value => scalarPick(value, ["date", "visits"])),
    }, meta: { attempted: visits.attempted, resolved: visits.resolved, capped, partial: capped || visits.resolved < visits.attempted } };
  }
  if (path === "/listings") {
    const listings = await account.getListings({ lastDays: days, maxItems: 600, includeVisitsSeries: false });
    if (!listings.summary || !Array.isArray(listings.items)) throw mlUnavailable();
    const summary = scalarPick(listings.summary, LISTING_SUMMARY_FIELDS);
    // A not-yet-resolved visit count is null, never a fabricated zero.
    const items = listings.items.map(value => ({ ...scalarPick(value, LISTING_FIELDS),
      visits: value.visitsAvailable === true ? value.visits : null,
      conversion: value.visitsAvailable === true ? value.conversion : null,
      visitsAvailable: value.visitsAvailable === true, pending: value.visitsAvailable !== true,
    }));
    if (listings.summary.visitsAttempted > 0 && listings.summary.visitsResolved === 0) {
      for (const field of ["totalVisits", "visitsActive", "visitsPaused", "visitsClosed", "activeWithVisits", "activeNoVisits", "avgVisitsPerActive"]) summary[field] = null;
    }
    return { data: { summary, items }, meta: { partial: Boolean(listings.summary.capped || listings.summary.visitsCollecting || listings.summary.visitsPending || items.some(item => item.pending)) } };
  }
  if (path === "/technical-specs") {
    const specs = await account.getTechnicalSpecs({ maxItems: 600 });
    if (!specs.summary || !Array.isArray(specs.items)) throw mlUnavailable();
    return { data: {
      summary: scalarPick(specs.summary, TECH_SUMMARY_FIELDS),
      items: specs.items.map(value => ({ ...scalarPick(value, TECH_FIELDS),
        attributes: value.attributes.map(attribute => scalarPick(attribute, ["id", "name", "valueType", "required", "valueName", "isMissing", "defaultUnit", "multivalued", "hint"])),
      })),
    }, meta: { partial: specs.summary.capped === true } };
  }
  if (path === "/sales") {
    const toMs = Date.now();
    const sales = await account.getSalesDashboard({ fromMs: toMs - days * 86_400_000, toMs, fill: true, topLimit: SALES_TOP_PRODUCTS_LIMIT });
    if (!sales.kpis || !Array.isArray(sales.daily) || !Array.isArray(sales.topProducts)) throw mlUnavailable();
    return { data: {
      summary: { ...scalarPick(sales.kpis, ["revenue", "orders", "unitsSold", "avgTicket", "cancelled", "cancelledAmount", "currency"]), from: sales.from, to: sales.to },
      daily: sales.daily.map(value => scalarPick(value, ["date", "revenue", "orders", "cancelled", "cancelledAmount"])),
      topProducts: sales.topProducts.map(value => scalarPick(value, ["itemId", "title", "unitsSold", "revenue", "thumbnail", "permalink"])),
    }, meta: {
      partial: ordersCapped, capped: ordersCapped,
      // No pre-slice ranking count in the provider response: reaching 100 means
      // potentially truncated ranking, not necessarily incomplete sales totals.
      topProductsCapped: sales.topProducts.length >= SALES_TOP_PRODUCTS_LIMIT,
    } };
  }
  throw new ReadApiDataError(404, "NOT_FOUND", "Recurso não encontrado.");
}
async function externalData(path: string, ownerUserId: number, query: ReadApiQuery): Promise<ReadApiResult> {
  // Mandatory BEFORE any cache read, including a fresh hit or stale fallback.
  const identity = await verifiedConnection(ownerUserId);
  // Cache aggregate snapshots, not arbitrary searches/pages: at most 6 routes x
  // 3 windows per seller, in a separate public-API namespace. Pagination/search
  // is applied after cache; these parameters cannot create unbounded entries.
  const key = `public-read-api:v1:${identity.sellerId}:${path}:${query.days}`;
  const cached = await cachedAccountResilient(identity.sellerId, key,
    async () => ({ sellerId: identity.sellerId, result: await collectExternal(path, identity.token, query.days, identity.sellerId) }), CACHE_TTL_MS);
  if (cached.value.sellerId !== identity.sellerId) throw mismatch();
  const result = cached.value.result;
  const meta = { ...result.meta, stale: cached.stale, asOf: cached.asOf, sellerId: identity.sellerId, days: query.days };
  if (["/listings", "/technical-specs", "/visits"].includes(path)) {
    const data = object(result.data);
    if (!Array.isArray(data.items)) throw mlUnavailable();
    const search = query.search?.toLocaleLowerCase("pt-BR");
    const items = search ? data.items.filter(value => {
      const item = object(value);
      return [item.itemId, item.title, item.sku, item.date].some(field => typeof field === "string" && field.toLocaleLowerCase("pt-BR").includes(search));
    }) : data.items;
    const paged = page(items.slice(query.offset, query.offset + query.limit + 1), query);
    return { data: { summary: data.summary, items: paged.data }, meta: { ...meta, ...paged.meta } };
  }
  return { data: result.data, meta };
}
/** Authorization/scopes belong exclusively to the HTTP layer; owner must be the key owner's account. */
export async function loadReadApiData(path: string, ownerUserId: number, query: ReadApiQuery): Promise<ReadApiResult> {
  const salesDetail = path === "/sales/orders" || path === "/sales/history";
  if (!salesDetail && !LOCAL_PATHS.has(path) && !EXTERNAL_PATHS.has(path)) throw new ReadApiDataError(404, "NOT_FOUND", "Recurso não encontrado.");
  if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) throw new ReadApiDataError(403, "INVALID_OWNER", "Conta não autorizada.");
  if (salesDetail) {
    const { loadPublicSalesData } = await import("./publicSalesData");
    return loadPublicSalesData(path as "/sales/orders" | "/sales/history", ownerUserId, query);
  }
  const bounded = normalizeQuery(query);
  try {
    return EXTERNAL_PATHS.has(path) ? await externalData(path, ownerUserId, bounded) : await localData(path, ownerUserId, bounded);
  } catch (error) {
    throw error instanceof ReadApiDataError ? error : unavailable();
  }
}
