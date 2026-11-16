import { describe, expect, it } from "vitest";
import { READ_API_ROUTES } from "../../shared/readApi";
import { readApiDataSchema, readApiSchemas } from "./openapiSchemas";

type Schema = Record<string, unknown>;
function asSchema(value: unknown): Schema {
  expect(value).not.toBeNull();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  return value as Schema;
}
function resolve(value: unknown): Schema {
  const schema = asSchema(value);
  if (typeof schema.$ref !== "string") return schema;
  expect(schema.$ref).toMatch(/^#\/components\/schemas\/[^/]+$/);
  const name = schema.$ref.replace("#/components/schemas/", "");
  expect(Object.hasOwn(readApiSchemas, name), schema.$ref).toBe(true);
  return resolve(readApiSchemas[name]);
}
function properties(value: unknown): Record<string, unknown> {
  return asSchema(resolve(value).properties);
}
function child(value: unknown, field: string): Schema {
  const fields = properties(value);
  expect(Object.hasOwn(fields, field), field).toBe(true);
  return resolve(fields[field]);
}
function walk(value: unknown, visit: (schema: Schema) => void): void {
  const schema = asSchema(value);
  visit(schema);
  if (schema.properties)
    Object.values(asSchema(schema.properties)).forEach(item =>
      walk(item, visit)
    );
  if (schema.items) walk(schema.items, visit);
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(schema[key]))
      schema[key].forEach(item => walk(item, visit));
  }
  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  ) {
    walk(schema.additionalProperties, visit);
  }
}

/** Small validator for the emitted OpenAPI 3.0 subset, not a new runtime API validator. */
function accepts(value: unknown, inputSchema: unknown): boolean {
  const schema = resolve(inputSchema);
  if (value === null) return schema.nullable === true;
  if (Array.isArray(schema.anyOf))
    return schema.anyOf.some(branch => accepts(value, branch));
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  if (schema.type === "object") {
    if (typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const fields = asSchema(schema.properties);
    if (
      Array.isArray(schema.required) &&
      schema.required.some(key => !Object.hasOwn(record, String(key)))
    )
      return false;
    if (
      schema.additionalProperties === false &&
      Object.keys(record).some(key => !Object.hasOwn(fields, key))
    )
      return false;
    return Object.entries(record).every(
      ([key, item]) => Object.hasOwn(fields, key) && accepts(item, fields[key])
    );
  }
  if (schema.type === "array")
    return (
      Array.isArray(value) && value.every(item => accepts(item, schema.items))
    );
  if (schema.type === "string") {
    if (typeof value !== "string") return false;
    if (schema.format === "date")
      return (
        /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
      );
    if (schema.format === "date-time")
      return (
        /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
      );
    return true;
  }
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "integer" || schema.type === "number") {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      (schema.type !== "integer" || Number.isInteger(value)) &&
      (typeof schema.minimum !== "number" || value >= schema.minimum) &&
      (typeof schema.maximum !== "number" || value <= schema.maximum)
    );
  }
  return false;
}

const routes = [
  ["/", "object", "ReadApiIndexData"],
  ["/store", "object", "ReadApiStoreData"],
  ["/listings", "object", "ReadApiListingsData"],
  ["/visits", "object", "ReadApiVisitsData"],
  ["/technical-specs", "object", "ReadApiTechnicalData"],
  ["/sales", "object", "ReadApiSalesData"],
  ["/sales/orders", "array", "PublicSalesOrder"],
  ["/sales/history", "array", "PublicSalesHistory"],
  ["/ads", "object", "ReadApiAdsData"],
  ["/products", "array", "ReadApiProduct"],
  ["/sku", "array", "ReadApiSkuRow"],
  ["/sku/variations", "array", "ReadApiSkuVariation"],
  ["/sku/columns", "array", "ReadApiSkuColumn"],
  ["/kits", "array", "ReadApiKitRow"],
  ["/packaging", "array", "ReadApiPackagingRow"],
  ["/documents", "array", "ReadApiDocument"],
  ["/pricing/products", "array", "ReadApiPricingProduct"],
  ["/pricing/pdfs", "array", "ReadApiPricingPdf"],
] as const;

const identity = ["itemId", "title", "thumbnail", "permalink"];
const auditDates = ["createdAt", "updatedAt"];
const sheet = [
  "id",
  "position",
  "productNumber",
  "variantNumber",
  "cadastradoMl",
  "tipoSku",
  "categoryId",
  "categoryName",
  "subCategoryId",
  "subCategoryName",
  "produto",
  "variante",
  "sku",
  "gerarSkuKit",
  "skuKit",
  "eanGtin",
  "ncm",
  "gpc",
  "cest",
  "precoClassico",
  "precoPremium",
  "precoAtacado",
  "embProfundidade",
  "embLargura",
  "embAltura",
  "embPeso",
  "caracteristicas",
  "rowColor",
  "customValues",
  ...auditDates,
];
const approved: Record<string, string[]> = {
  PublicSalesItem: [
    "itemId",
    "variationId",
    "sku",
    "skuSource",
    "title",
    "quantity",
    "unitPrice",
    "listingType",
  ],
  PublicSalesCharge: ["key", "label", "category", "amount"],
  PublicSalesTax: ["type", "amount", "description"],
  PublicSalesOrder: [
    "orderId",
    "packId",
    "paymentIds",
    "createdAt",
    "saleDay",
    "paidAt",
    "status",
    "rawStatus",
    "financiallyComplete",
    "financialStatus",
    "items",
    "shipping",
    "gross",
    "net",
    "deductions",
    "charges",
    "saleFee",
    "processingFee",
    "shippingCost",
    "financingFee",
    "otherCharges",
    "taxesWithheld",
    "taxDetail",
    "taxesDisaggregated",
    "chargesExplainDeductions",
    "source",
    "asOf",
    "pendingReason",
  ],
  PublicSalesHistory: [
    "period",
    "itemId",
    "sku",
    "title",
    "orders",
    "unitsSold",
    "revenue",
    "cancelled",
    "cancelledAmount",
    "net",
    "saleFee",
    "processingFee",
    "shippingCost",
    "financingFee",
    "otherCharges",
    "taxesWithheld",
  ],
  ReadApiIndexResource: ["path", "scope", "title"],
  ReadApiIndexData: [
    "name",
    "resources",
    "documentation",
    "rateLimitPerMinute",
  ],
  ReadApiStoreMetrics: ["claimsRate", "delayedRate", "cancellationsRate"],
  ReadApiStoreData: [
    "sellerId",
    "nickname",
    "levelId",
    "powerSellerStatus",
    "sellerExperience",
    "transactionsTotal",
    "transactionsCompleted",
    "transactionsCanceled",
    "ratingsPositive",
    "ratingsNeutral",
    "ratingsNegative",
    "points",
    "registrationDate",
    "permalink",
    "metrics",
  ],
  ReadApiListingSummary: [
    "total",
    "active",
    "paused",
    "closed",
    "stagnant",
    "outOfStock",
    "totalVisits",
    "visitsPending",
    "visitsCollecting",
    "visitsAttempted",
    "visitsResolved",
    "visitsActive",
    "visitsPaused",
    "visitsClosed",
    "activeWithVisits",
    "activeNoVisits",
    "avgVisitsPerActive",
    "totalStockValue",
    "totalSold",
    "windowDays",
    "capped",
  ],
  ReadApiListing: [
    ...identity,
    "price",
    "currency",
    "availableQuantity",
    "soldQuantity",
    "status",
    "listingType",
    "visits",
    "visitsAvailable",
    "pending",
    "conversion",
    "health",
    "categoryId",
    "createdMs",
    "updatedMs",
    "freeShipping",
    "logisticType",
    "catalogListing",
    "stockValue",
    "sku",
    "packageWeightGrams",
  ],
  ReadApiListingsData: ["summary", "items"],
  ReadApiVisitsSummary: ["days", "attempted", "resolved", "totalActive"],
  ReadApiVisitDay: ["date", "visits"],
  ReadApiVisitsData: ["summary", "items"],
  ReadApiTechnicalSummary: [
    "total",
    "complete",
    "incomplete",
    "withMissingRequired",
    "avgCompleteness",
    "totalMissing",
    "totalMissingRequired",
    "capped",
    "allComplete",
  ],
  ReadApiTechnicalAttribute: [
    "id",
    "name",
    "valueType",
    "required",
    "valueName",
    "isMissing",
    "defaultUnit",
    "multivalued",
    "hint",
  ],
  ReadApiTechnicalListing: [
    ...identity,
    "status",
    "categoryId",
    "totalAttributes",
    "filledAttributes",
    "missingAttributes",
    "missingRequired",
    "completeness",
    "complete",
    "attributes",
  ],
  ReadApiTechnicalData: ["summary", "items"],
  ReadApiSalesSummary: [
    "from",
    "to",
    "revenue",
    "orders",
    "unitsSold",
    "avgTicket",
    "cancelled",
    "cancelledAmount",
    "currency",
  ],
  ReadApiSalesDay: [
    "date",
    "revenue",
    "orders",
    "cancelled",
    "cancelledAmount",
  ],
  ReadApiSalesProduct: [...identity, "unitsSold", "revenue"],
  ReadApiSalesData: ["summary", "daily", "topProducts"],
  ReadApiAdsMetrics: [
    "clicks",
    "prints",
    "cost",
    "cpc",
    "ctr",
    "acos",
    "sov",
    "directAmount",
    "indirectAmount",
    "totalAmount",
    "directUnits",
    "indirectUnits",
    "units",
    "organicUnits",
    "organicItems",
  ],
  ReadApiAdsDerived: [
    "roas",
    "acos",
    "conversionRate",
    "totalBudget",
    "organicShare",
  ],
  ReadApiAdsSummary: [
    "advertiserId",
    "currency",
    "campaignCount",
    "activeCampaignCount",
    "metrics",
    "derived",
  ],
  ReadApiAdsCampaign: [
    "id",
    "name",
    "status",
    "strategy",
    "acosTarget",
    "roasTarget",
    "budget",
    "automaticBudget",
    "channel",
    "dateCreated",
    "lastUpdated",
    "metrics",
  ],
  ReadApiAdsAd: [
    ...identity,
    "campaignId",
    "price",
    "status",
    "listingTypeId",
    "logisticType",
    "buyBoxWinner",
    "catalogListing",
    "brand",
    "imageQuality",
    "hasDiscount",
    "metrics",
  ],
  ReadApiAdsData: [
    "connection",
    "summary",
    "topCampaigns",
    "topAds",
    "insightsCount",
  ],
  ReadApiProduct: [
    "id",
    "name",
    "description",
    "priority",
    "currentStep",
    "supplier",
    "notes",
    "imageUrl",
    "expectedArrival",
    "orderDeadline",
    ...auditDates,
  ],
  ReadApiSkuRow: [...sheet, "mainMlb", "mainDone", "skuMode"],
  ReadApiSkuVariation: [
    "id",
    "skuRowId",
    "variationIndex",
    "variationSku",
    "ean",
    "mlb",
    "done",
    ...auditDates,
  ],
  ReadApiSkuColumn: ["id", "name", "position", ...auditDates],
  ReadApiKitRow: [
    ...sheet,
    "kit",
    "embalagem",
    "profundidade",
    "largura",
    "alturaComprimento",
    "kg",
    "categoria",
    "dimensoesGs1",
    "baseAjustado",
    "mlAjustado",
    "formadoPor",
    "observacao",
  ],
  ReadApiPackagingRow: [
    "id",
    "position",
    "produto",
    "eanGtin",
    "sku",
    "embalagem",
    "ncm",
    "gpc",
    "cest",
    "precoClassico",
    "precoPremium",
    "altura",
    "largura",
    "comprimento",
    "kg",
    "categoria",
    "observacao",
    "rowColor",
    "customValues",
    ...auditDates,
  ],
  ReadApiDocument: ["id", "productId", "name", "url", "type", "createdAt"],
  ReadApiPricingKitItem: ["id", "description", "sku", "quantity", "unitCost"],
  ReadApiPricingInput: [
    "description",
    "productSku",
    "kitSku",
    "productType",
    "category",
    "categoryDiscountEligible",
    "calculationType",
    "packagingPreset",
    "costMode",
    "cost",
    "productKg",
    "itemQuantity",
    "operation",
    "packaging",
    "promotion",
    "adsMode",
    "ads",
    "taxFederal",
    "taxPis",
    "taxCofins",
    "taxIrpj",
    "taxCsll",
    "taxIcms",
    "useDestinationTaxes",
    "saleDestination",
    "taxIcmsInside",
    "taxIcmsOutside",
    "taxIcmsTransfer",
    "taxDifal",
    "difalMode",
    "taxDifalValue",
    "listing",
    "classicRate",
    "premiumRate",
    "price",
    "weight",
    "weightInputMode",
    "weightExact",
    "length",
    "width",
    "height",
    "reputation",
    "condition",
    "logistic",
    "shippingMode",
    "automaticShippingOnly",
    "manualShipping",
    "manualFixedFee",
    "manualFixedLimit",
    "fullExtra",
    "reservePercent",
    "kitItems",
  ],
  ReadApiPricingCategoryAnswer: [
    "category",
    "categoryId",
    "source",
    "explanation",
    "confidence",
  ],
  ReadApiPricingProduct: [
    "id",
    "version",
    "createdAt",
    "updatedAt",
    "goal",
    "mode",
    "status",
    "resultPrice",
    "input",
    "categoryAnswer",
  ],
  ReadApiPricingPdf: [
    "exportId",
    "reportId",
    "filename",
    "description",
    "sku",
    "projectId",
    "documentId",
    "byteSize",
    "status",
    "url",
    "uploadedAt",
    ...auditDates,
  ],
};

describe("read API OpenAPI response DTOs", () => {
  it("covers exactly the existing index and resource paths", () => {
    expect(routes.map(([path]) => path).sort()).toEqual(
      ["/", ...READ_API_ROUTES.map(route => route.path)].sort()
    );
    expect(Object.keys(readApiSchemas).sort()).toEqual(
      Object.keys(approved).sort()
    );
  });
  it.each(routes)(
    "%s returns a concrete %s schema/reference",
    (path, type, name) => {
      const schema = asSchema(readApiDataSchema(path));
      expect(
        typeof schema.$ref === "string" || typeof schema.type === "string"
      ).toBe(true);
      expect(resolve(schema).type).toBe(type);
      if (type === "array")
        expect(schema.items).toEqual({ $ref: `#/components/schemas/${name}` });
      else expect(schema).toEqual({ $ref: `#/components/schemas/${name}` });
      expect(
        Object.keys(properties(type === "array" ? schema.items : schema)).length
      ).toBeGreaterThan(0);
    }
  );
  it.each([
    "/users",
    "/orders",
    "/credentials",
    "/openapi.json",
    "",
    "constructor",
    "__proto__",
    "/sku/unknown",
  ])("rejects unregistered path %s without untyped fallback", path => {
    expect(() => readApiDataSchema(path)).toThrow(
      "No read API data schema registered"
    );
  });
  it("resolves every reference and uses only typed OpenAPI 3.0 schema shapes", () => {
    const allowedKeywords = new Set([
      "$ref",
      "type",
      "description",
      "format",
      "nullable",
      "minimum",
      "maximum",
      "enum",
      "properties",
      "additionalProperties",
      "required",
      "items",
      "anyOf",
      "oneOf",
      "allOf",
    ]);
    const check = (schema: Schema) => {
      for (const key of Object.keys(schema))
        expect(allowedKeywords.has(key), key).toBe(true);
      expect(Array.isArray(schema.type)).toBe(false);
      expect(schema.type).not.toBe("null");
      expect(
        typeof schema.$ref === "string" ||
          typeof schema.type === "string" ||
          Array.isArray(schema.anyOf)
      ).toBe(true);
      if (schema.$ref) {
        expect(Object.keys(schema)).toEqual(["$ref"]); // no ignored nullable/$ref siblings
        resolve(schema);
      } else if (schema.type) {
        expect([
          "object",
          "array",
          "string",
          "integer",
          "number",
          "boolean",
        ]).toContain(schema.type);
        expect(typeof schema.description).toBe("string");
        if (schema.type === "object") {
          expect(
            Object.keys(asSchema(schema.properties)).length
          ).toBeGreaterThan(0);
          expect(schema.additionalProperties).toBe(false);
          if (Array.isArray(schema.required))
            for (const key of schema.required)
              expect(
                Object.hasOwn(asSchema(schema.properties), String(key))
              ).toBe(true);
        }
        if (schema.type === "array") expect(schema.items).toBeDefined();
        if (schema.type === "integer") expect(schema.minimum).toBe(0);
      }
    };
    for (const schema of Object.values(readApiSchemas)) walk(schema, check);
    for (const [path] of routes) walk(readApiDataSchema(path), check);
  });
  it.each(Object.entries(approved))(
    "%s exposes only the approved projection",
    (name, keys) => {
      expect(Object.keys(properties(readApiSchemas[name])).sort()).toEqual(
        [...keys].sort()
      );
      expect(new Set(keys).size).toBe(keys.length);
    }
  );
  it("contains no credentials, internal identities, raw payloads or invented examples", () => {
    const forbidden = new Set([
      "ownerId",
      "ownerUserId",
      "userId",
      "mlUserId",
      "createdBy",
      "uploadedBy",
      "supplierContact",
      "accessToken",
      "refreshToken",
      "token",
      "credentials",
      "apiKey",
      "key",
      "keyHash",
      "hash",
      "secret",
      "fileKey",
      "leaseToken",
      "leaseExpiresAt",
      "recordPayload",
      "snapshotPayload",
      "optionsPayload",
      "contextHash",
      "sha256",
      "lastError",
      "raw",
      "rawPayload",
      "rawOrders",
      "buyer",
      "email",
      "phone",
      "address",
      "isDeleted",
      "deletedAt",
      "revision",
      "skuSourceRowId",
      "skuDecisionAt",
    ]);
    for (const [name, value] of Object.entries(readApiSchemas))
      walk(value, schema => {
        if (schema.properties)
          for (const key of Object.keys(asSchema(schema.properties)))
            expect(
              forbidden.has(key) &&
                !(name === "PublicSalesCharge" && key === "key"),
              key
            ).toBe(false);
        expect(schema).not.toHaveProperty("example");
        expect(schema).not.toHaveProperty("default");
      });
    const serialized = JSON.stringify(readApiSchemas);
    expect(serialized).not.toMatch(
      /3308178634|TOUJOURS|Bearer\s+|APP_USR-|private@example/
    );
  });
  it("types counts, BRL monetary values, percentages and fractions distinctly", () => {
    expect(child(readApiSchemas.ReadApiListing, "visits")).toMatchObject({
      type: "integer",
      minimum: 0,
      nullable: true,
    });
    expect(child(readApiSchemas.ReadApiListing, "conversion")).toMatchObject({
      type: "number",
      nullable: true,
    });
    expect(
      child(readApiSchemas.ReadApiListing, "conversion")
    ).not.toHaveProperty("maximum");
    expect(
      child(readApiSchemas.ReadApiTechnicalListing, "completeness")
    ).toMatchObject({ type: "number", minimum: 0, maximum: 1 });
    expect(child(readApiSchemas.ReadApiSalesSummary, "revenue")).toMatchObject({
      type: "number",
      description: expect.stringContaining("BRL"),
    });
    expect(child(readApiSchemas.ReadApiAdsMetrics, "cost")).toMatchObject({
      type: "number",
      description: expect.stringContaining("BRL"),
    });
    expect(child(readApiSchemas.ReadApiAdsMetrics, "ctr")).toMatchObject({
      type: "number",
      description: expect.stringContaining("pontos percentuais"),
    });
    expect(child(readApiSchemas.ReadApiAdsDerived, "roas")).toMatchObject({
      type: "number",
      nullable: true,
      description: expect.stringContaining("Razão"),
    });
    expect(
      child(readApiSchemas.ReadApiPricingInput, "cost").description
    ).toContain("costMode");
    expect(
      child(readApiSchemas.ReadApiPricingInput, "ads").description
    ).toContain("adsMode");
  });
  it("preserves free-text sheet prices, measurements, custom values and headers", () => {
    for (const name of ["ReadApiSkuRow", "ReadApiKitRow"]) {
      for (const field of [
        "precoClassico",
        "precoPremium",
        "precoAtacado",
        "embPeso",
        "embAltura",
        "customValues",
      ])
        expect(child(readApiSchemas[name], field).type).toBe("string");
    }
    expect(child(readApiSchemas.ReadApiPackagingRow, "kg").type).toBe("string");
    expect(child(readApiSchemas.ReadApiSkuColumn, "name").type).toBe("string");
  });
  it("distinguishes Date serialization, daily dates and Unix milliseconds", () => {
    for (const name of [
      "ReadApiProduct",
      "ReadApiSkuRow",
      "ReadApiSkuVariation",
      "ReadApiSkuColumn",
      "ReadApiKitRow",
      "ReadApiPackagingRow",
      "ReadApiDocument",
    ])
      expect(child(readApiSchemas[name], "createdAt")).toMatchObject({
        type: "string",
        format: "date-time",
      });
    expect(
      child(readApiSchemas.ReadApiProduct, "expectedArrival")
    ).toMatchObject({ type: "string", format: "date-time", nullable: true });
    expect(
      child(readApiSchemas.ReadApiStoreData, "registrationDate").format
    ).toBe("date-time");
    expect(
      child(readApiSchemas.ReadApiAdsCampaign, "dateCreated")
    ).toMatchObject({ type: "string", format: "date-time", nullable: true });
    for (const name of ["ReadApiVisitDay", "ReadApiSalesDay"])
      expect(child(readApiSchemas[name], "date")).toMatchObject({
        type: "string",
        format: "date",
      });
    for (const name of ["ReadApiPricingProduct", "ReadApiPricingPdf"])
      expect(child(readApiSchemas[name], "createdAt")).toMatchObject({
        type: "integer",
        format: "int64",
      });
    expect(child(readApiSchemas.ReadApiSalesSummary, "from")).toMatchObject({
      type: "integer",
      format: "int64",
    });
    expect(child(readApiSchemas.ReadApiListing, "createdMs")).toMatchObject({
      type: "integer",
      format: "int64",
      nullable: true,
    });
  });
});

describe("synthetic response samples (not actual store data)", () => {
  it("accepts pending/null visits and unresolved nullable summary fields", () => {
    const sample = {
      summary: {
        visitsAttempted: 2,
        visitsResolved: 0,
        visitsPending: true,
        totalVisits: null,
        visitsActive: null,
        visitsPaused: null,
        visitsClosed: null,
        activeWithVisits: null,
        activeNoVisits: null,
        avgVisitsPerActive: null,
      },
      items: [
        {
          itemId: "SYNTHETIC",
          visits: null,
          conversion: null,
          visitsAvailable: false,
          pending: true,
          health: null,
          createdMs: null,
          updatedMs: null,
          packageWeightGrams: null,
          logisticType: null,
        },
      ],
    };
    expect(accepts(sample, readApiDataSchema("/listings"))).toBe(true);
    expect(
      accepts(
        { summary: {}, items: [{ visits: 1.5 }] },
        readApiDataSchema("/listings")
      )
    ).toBe(false);
    expect(
      accepts(
        { summary: {}, items: [{ visits: -1 }] },
        readApiDataSchema("/listings")
      )
    ).toBe(false);
    expect(
      accepts(
        {
          summary: {},
          items: [
            {
              visits: 0,
              conversion: null,
              visitsAvailable: true,
              pending: false,
            },
          ],
        },
        readApiDataSchema("/listings")
      )
    ).toBe(true);
  });
  it("accepts visit-series coverage without inventing totalActive", () => {
    expect(
      accepts(
        {
          summary: { days: 7, attempted: 2, resolved: 1 },
          items: [{ date: "2026-01-01", visits: 0 }],
        },
        readApiDataSchema("/visits")
      )
    ).toBe(true);
    expect(
      accepts(
        { summary: { totalActive: 2 }, items: [] },
        readApiDataSchema("/visits")
      )
    ).toBe(true);
    expect(
      accepts(
        { summary: {}, items: [{ date: "2026-01-01", visits: null }] },
        readApiDataSchema("/visits")
      )
    ).toBe(false);
  });
  it("accepts no_ads_access with a truly nullable inline summary", () => {
    expect(
      accepts(
        {
          connection: "no_ads_access",
          summary: null,
          topCampaigns: [],
          topAds: [],
          insightsCount: 0,
        },
        readApiDataSchema("/ads")
      )
    ).toBe(true);
    expect(child(readApiDataSchema("/ads"), "summary")).toMatchObject({
      type: "object",
      nullable: true,
    });
    expect(
      accepts(
        {
          connection: "not_connected",
          summary: null,
          topCampaigns: [],
          topAds: [],
        },
        readApiDataSchema("/ads")
      )
    ).toBe(false);
  });
  it("accepts connected Ads with nullable derived metrics, campaign targets/dates and ad fields", () => {
    expect(
      accepts(
        {
          connection: "connected",
          summary: {
            metrics: { clicks: 0, prints: 0, cost: 0 },
            derived: {
              roas: null,
              acos: null,
              conversionRate: null,
              organicShare: null,
              totalBudget: 0,
            },
          },
          topCampaigns: [
            {
              acosTarget: null,
              roasTarget: null,
              budget: null,
              dateCreated: null,
              lastUpdated: null,
              metrics: {},
            },
          ],
          topAds: [
            {
              thumbnail: null,
              permalink: null,
              listingTypeId: null,
              logisticType: null,
              brand: null,
              imageQuality: null,
              metrics: {},
            },
          ],
        },
        readApiDataSchema("/ads")
      )
    ).toBe(true);
  });
  it("accepts missing technical values and nullable store reputation without requiring absent fields", () => {
    expect(
      accepts(
        {
          summary: {},
          items: [
            { attributes: [{ id: "BRAND", valueName: null, isMissing: true }] },
          ],
        },
        readApiDataSchema("/technical-specs")
      )
    ).toBe(true);
    expect(
      accepts(
        {
          levelId: null,
          powerSellerStatus: null,
          sellerExperience: null,
          metrics: {
            claimsRate: null,
            delayedRate: null,
            cancellationsRate: null,
          },
        },
        readApiDataSchema("/store")
      )
    ).toBe(true);
    expect(
      accepts(
        { summary: {}, daily: [], topProducts: [] },
        readApiDataSchema("/sales")
      )
    ).toBe(true);
  });
  it("accepts sparse local rows and nullable SQL fields without inventing numeric sheet prices", () => {
    for (const [path, type] of routes)
      if (type === "array" && !path.startsWith("/sales/"))
        expect(accepts([{}], readApiDataSchema(path))).toBe(true);
    expect(
      accepts(
        [
          {
            description: null,
            supplier: null,
            notes: null,
            imageUrl: null,
            expectedArrival: null,
            orderDeadline: null,
          },
        ],
        readApiDataSchema("/products")
      )
    ).toBe(true);
    expect(
      accepts(
        [
          {
            productNumber: null,
            variantNumber: null,
            categoryId: null,
            categoryName: null,
            subCategoryId: null,
            subCategoryName: null,
            caracteristicas: null,
            customValues: null,
            precoClassico: "",
            embPeso: "?",
          },
        ],
        readApiDataSchema("/sku")
      )
    ).toBe(true);
    expect(accepts([{ precoClassico: 1 }], readApiDataSchema("/sku"))).toBe(
      false
    );
  });
  it("models Alpha projections, incomplete inputs and confidence union without raw records", () => {
    const sample = [
      {
        id: "synthetic-product",
        version: 1,
        createdAt: 0,
        updatedAt: 0,
        mode: "target",
        status: "draft",
        resultPrice: null,
        categoryAnswer: null,
        input: {
          description: "Produto sintético",
          kitItems: [{ id: "component", quantity: 1, unitCost: 0 }],
        },
      },
    ];
    expect(accepts(sample, readApiDataSchema("/pricing/products"))).toBe(true);
    expect(
      accepts(
        { categoryId: null, confidence: "baixa" },
        readApiSchemas.ReadApiPricingCategoryAnswer
      )
    ).toBe(true);
    expect(
      accepts(
        { categoryId: null, confidence: 0.5 },
        readApiSchemas.ReadApiPricingCategoryAnswer
      )
    ).toBe(true);
    expect(
      accepts({ confidence: 2 }, readApiSchemas.ReadApiPricingCategoryAnswer)
    ).toBe(false);
    expect(
      accepts(
        [
          {
            projectId: null,
            documentId: null,
            url: null,
            uploadedAt: null,
            status: "ready",
          },
        ],
        readApiDataSchema("/pricing/pdfs")
      )
    ).toBe(true);
    expect(
      accepts([{ status: "pending" }], readApiDataSchema("/pricing/pdfs"))
    ).toBe(false);
  });
  it("rejects unexpected internal properties at every projected level", () => {
    expect(
      accepts([{ id: 1, ownerId: 1 }], readApiDataSchema("/products"))
    ).toBe(false);
    expect(
      accepts(
        {
          summary: {},
          items: [{ attributes: [{ id: "BRAND", allowedValues: [] }] }],
        },
        readApiDataSchema("/technical-specs")
      )
    ).toBe(false);
    expect(
      accepts(
        [{ input: { credentials: "synthetic-secret" } }],
        readApiDataSchema("/pricing/products")
      )
    ).toBe(false);
    expect(
      accepts(
        [{ input: { kitItems: [{ rawPayload: {} }] } }],
        readApiDataSchema("/pricing/products")
      )
    ).toBe(false);
    expect(
      accepts([{ recordPayload: "{}" }], readApiDataSchema("/pricing/products"))
    ).toBe(false);
    expect(
      accepts(
        {
          connection: "connected",
          summary: { metrics: { accessToken: "synthetic-secret" } },
          topCampaigns: [],
          topAds: [],
        },
        readApiDataSchema("/ads")
      )
    ).toBe(false);
  });
});
