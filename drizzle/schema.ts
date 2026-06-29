import {
  bigint,
  boolean,
  double,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Centralized Mercado Livre integration credentials.
 * Single row per user (the project owner). Easily replaceable from the
 * Settings page without touching code. When populated and valid, the
 * official OAuth provider is used; otherwise the demo provider runs.
 */
export const mlCredentials = mysqlTable("ml_credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  appId: varchar("appId", { length: 128 }).default("").notNull(),
  clientSecret: varchar("clientSecret", { length: 256 }).default("").notNull(),
  /**
   * The Mercado Livre seller user_id (e.g. 3308178634), returned by the OAuth
   * token exchange / refresh and by GET /users/me. This is DISTINCT from the
   * local `userId` (the app's own user row id). All ML API calls that take a
   * user id (e.g. /users/{id}/items/search) MUST use this value — using the
   * local id causes ML to reply "Searching another user items is restricted".
   */
  mlUserId: bigint("mlUserId", { mode: "number" }),
  /** Cached app-level access token (client_credentials grant). */
  accessToken: text("accessToken"),
  /** Refresh token for authorization-code grant (future use). */
  refreshToken: text("refreshToken"),
  /** Unix ms when the cached token expires. */
  tokenExpiresAt: bigint("tokenExpiresAt", { mode: "number" }),
  /** Connection status: never tested, ok, or error. */
  status: mysqlEnum("status", ["unconfigured", "connected", "error"])
    .default("unconfigured")
    .notNull(),
  statusMessage: text("statusMessage"),
  /** Default Mercado Livre site (MLB = Brasil). */
  siteId: varchar("siteId", { length: 8 }).default("MLB").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MlCredential = typeof mlCredentials.$inferSelect;
export type InsertMlCredential = typeof mlCredentials.$inferInsert;

/**
 * Products the user is actively monitoring. Each row points to a Mercado
 * Livre item (mlItemId) and accumulates a history of snapshots over time.
 */
export const monitoredProducts = mysqlTable(
  "monitored_products",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    /** Mercado Livre item id, e.g. MLB1234567890. */
    mlItemId: varchar("mlItemId", { length: 32 }).notNull(),
    title: varchar("title", { length: 512 }).notNull(),
    thumbnail: text("thumbnail"),
    permalink: text("permalink"),
    categoryId: varchar("categoryId", { length: 32 }),
    categoryName: varchar("categoryName", { length: 256 }),
    sellerName: varchar("sellerName", { length: 256 }),
    /** The search term context this product was tracked under (for ranking position). */
    trackKeyword: varchar("trackKeyword", { length: 256 }),
    /** Snapshot of the latest values for quick display. */
    lastPrice: double("lastPrice"),
    lastSoldQuantity: int("lastSoldQuantity"),
    lastPosition: int("lastPosition"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    userIdx: index("monitored_user_idx").on(t.userId),
    itemIdx: index("monitored_item_idx").on(t.mlItemId),
  }),
);

export type MonitoredProduct = typeof monitoredProducts.$inferSelect;
export type InsertMonitoredProduct = typeof monitoredProducts.$inferInsert;

/**
 * Time-series snapshots recorded by the monitoring cron job. One row per
 * product per run. This is the backbone of the historical trend charts.
 */
export const productSnapshots = mysqlTable(
  "product_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    monitoredProductId: int("monitoredProductId").notNull(),
    price: double("price"),
    soldQuantity: int("soldQuantity"),
    availableQuantity: int("availableQuantity"),
    /** Position in search results for the tracked keyword (1 = top). */
    position: int("position"),
    reviewsCount: int("reviewsCount"),
    rating: double("rating"),
    /** Unix ms timestamp of the snapshot. */
    capturedAt: bigint("capturedAt", { mode: "number" }).notNull(),
  },
  (t) => ({
    productIdx: index("snapshot_product_idx").on(t.monitoredProductId),
    capturedIdx: index("snapshot_captured_idx").on(t.capturedAt),
  }),
);

export type ProductSnapshot = typeof productSnapshots.$inferSelect;
export type InsertProductSnapshot = typeof productSnapshots.$inferInsert;

/**
 * Alerts generated when a monitored product changes significantly.
 */
export const alerts = mysqlTable(
  "alerts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    monitoredProductId: int("monitoredProductId").notNull(),
    type: mysqlEnum("type", [
      "price_drop",
      "price_rise",
      "sales_surge",
      "position_gain",
      "position_loss",
    ]).notNull(),
    severity: mysqlEnum("severity", ["info", "warning", "critical"])
      .default("info")
      .notNull(),
    title: varchar("title", { length: 256 }).notNull(),
    message: text("message").notNull(),
    /** Percentage change that triggered the alert. */
    changePercent: double("changePercent"),
    previousValue: double("previousValue"),
    currentValue: double("currentValue"),
    isRead: boolean("isRead").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("alert_user_idx").on(t.userId),
    productIdx: index("alert_product_idx").on(t.monitoredProductId),
  }),
);

export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;

/**
 * Project-level configuration row, including the monitoring cron task uid.
 * Single row (id = 1) owned by the project.
 */
export const appConfig = mysqlTable("app_config", {
  id: int("id").autoincrement().primaryKey(),
  /** Heartbeat cron task uid for the monitoring job (Facts #2). */
  monitoringCronTaskUid: varchar("monitoringCronTaskUid", { length: 65 }),
  /** Heartbeat cron task uid for the Radar background-sweep job (Facts #2). */
  radarSweepCronTaskUid: varchar("radarSweepCronTaskUid", { length: 65 }),
  /** Alert thresholds (JSON) — percentage changes that trigger alerts. */
  alertThresholds: json("alertThresholds"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AppConfig = typeof appConfig.$inferSelect;
export type InsertAppConfig = typeof appConfig.$inferInsert;

/**
 * Competitor search jobs (async + cache).
 *
 * One row per normalized search term. The collection runs in the background
 * (one or more scraping sources), so the UI starts a search, then polls this
 * row for status. A finished row acts as a cache: repeating the same term
 * returns instantly until the user explicitly refreshes it.
 */
export const competitorSearches = mysqlTable(
  "competitor_searches",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    /** Original query as typed by the user. */
    query: varchar("query", { length: 256 }).notNull(),
    /** Lowercased / trimmed term used as the cache key. */
    normalizedQuery: varchar("normalizedQuery", { length: 256 }).notNull(),
    status: mysqlEnum("status", ["pending", "running", "done", "failed"])
      .default("pending")
      .notNull(),
    /** Number of unified competitors found (after triangulation). */
    resultCount: int("resultCount").default(0).notNull(),
    /** Whether more than one source contributed (triangulated result). */
    triangulated: boolean("triangulated").default(false).notNull(),
    /** Per-source health snapshot for this run (SourceStatus[] as JSON). */
    sourcesUsed: json("sourcesUsed"),
    /** Human-friendly error note when status = failed. */
    errorNote: text("errorNote"),
    /** Unix ms when the collection finished (done or failed). */
    finishedAt: bigint("finishedAt", { mode: "number" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    userIdx: index("comp_search_user_idx").on(t.userId),
    normalizedIdx: index("comp_search_norm_idx").on(t.normalizedQuery),
  }),
);

export type CompetitorSearch = typeof competitorSearches.$inferSelect;
export type InsertCompetitorSearch = typeof competitorSearches.$inferInsert;

/**
 * Unified competitor results for a finished search. Each row stores one
 * UnifiedCompetitor (name, consolidated price, consensus, per-source detail)
 * as JSON so the triangulation shape can evolve without migrations.
 */
export const competitorResults = mysqlTable(
  "competitor_results",
  {
    id: int("id").autoincrement().primaryKey(),
    searchId: int("searchId").notNull(),
    /** Display rank (0 = strongest competitor). */
    rank: int("rank").default(0).notNull(),
    name: varchar("name", { length: 512 }).notNull(),
    /** Consolidated price value (BRL), null when no source had a price. */
    price: double("price"),
    /** Full UnifiedCompetitor object as JSON (consensus + per-source detail). */
    payload: json("payload").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    searchIdx: index("comp_result_search_idx").on(t.searchId),
  }),
);

export type CompetitorResult = typeof competitorResults.$inferSelect;
export type InsertCompetitorResult = typeof competitorResults.$inferInsert;


/**
 * Daily snapshot of each Mercado Ads campaign's auditable state + metrics.
 * One row per (campaign, captureDay). Powers the Mamba audit (diffing the
 * controllable knobs day over day) and the campaign performance history.
 *
 * "captureDay" is a YYYY-MM-DD string in the America/Sao_Paulo timezone so a
 * day always groups the same calendar date the seller experiences, regardless
 * of when the snapshot is taken.
 */
export const adsCampaignSnapshots = mysqlTable(
  "ads_campaign_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    captureDay: varchar("captureDay", { length: 10 }).notNull(),
    campaignId: bigint("campaignId", { mode: "number" }).notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    /** Controllable knobs we audit for changes. */
    status: varchar("status", { length: 32 }).notNull(),
    strategy: varchar("strategy", { length: 64 }),
    acosTarget: double("acosTarget"),
    roasTarget: double("roasTarget"),
    budget: double("budget"),
    automaticBudget: boolean("automaticBudget").default(false).notNull(),
    /** ML's own last_updated timestamp for the campaign (string as returned). */
    mlLastUpdated: varchar("mlLastUpdated", { length: 40 }),
    /** Full metrics block for the trailing window as JSON. */
    metrics: json("metrics"),
    capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  },
  (t) => ({
    dayIdx: index("ads_camp_snap_day_idx").on(t.userId, t.captureDay),
    campIdx: index("ads_camp_snap_camp_idx").on(t.campaignId),
  }),
);

export type AdsCampaignSnapshot = typeof adsCampaignSnapshots.$inferSelect;
export type InsertAdsCampaignSnapshot = typeof adsCampaignSnapshots.$inferInsert;

/**
 * Daily snapshot of each advertised item (ad) with its metrics and the
 * inferred category group. Powers the category tracker time series.
 */
export const adsItemSnapshots = mysqlTable(
  "ads_item_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    captureDay: varchar("captureDay", { length: 10 }).notNull(),
    itemId: varchar("itemId", { length: 32 }).notNull(),
    campaignId: bigint("campaignId", { mode: "number" }),
    title: varchar("title", { length: 512 }).notNull(),
    /** Inferred category group key (espetos, manicure, aroma_fibra, ...). */
    categoryKey: varchar("categoryKey", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }),
    price: double("price"),
    metrics: json("metrics"),
    capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  },
  (t) => ({
    dayIdx: index("ads_item_snap_day_idx").on(t.userId, t.captureDay),
    catIdx: index("ads_item_snap_cat_idx").on(t.userId, t.categoryKey),
    itemIdx: index("ads_item_snap_item_idx").on(t.itemId),
  }),
);

export type AdsItemSnapshot = typeof adsItemSnapshots.$inferSelect;
export type InsertAdsItemSnapshot = typeof adsItemSnapshots.$inferInsert;

/**
 * Audit log of every detected change to a campaign's controllable knobs
 * (status / acosTarget / budget / automaticBudget / strategy). Each row is one
 * field change between two consecutive snapshots, with our own coherence
 * verdict and "what we would do" recommendation attached.
 *
 * This is the heart of the Mamba audit: it answers "what did they change, when,
 * and was it a good call?".
 */
export const adsChangeLog = mysqlTable(
  "ads_change_log",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    campaignId: bigint("campaignId", { mode: "number" }).notNull(),
    campaignName: varchar("campaignName", { length: 256 }).notNull(),
    /** YYYY-MM-DD when the change was detected. */
    detectedDay: varchar("detectedDay", { length: 10 }).notNull(),
    field: varchar("field", { length: 40 }).notNull(),
    oldValue: varchar("oldValue", { length: 128 }),
    newValue: varchar("newValue", { length: 128 }),
    /** coherent | questionable | neutral — our verdict on the change. */
    verdict: mysqlEnum("verdict", ["coherent", "questionable", "neutral"])
      .default("neutral")
      .notNull(),
    /** Human-readable rationale + what we would do instead. */
    assessment: text("assessment"),
    recommendation: text("recommendation"),
    detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("ads_change_user_idx").on(t.userId),
    dayIdx: index("ads_change_day_idx").on(t.userId, t.detectedDay),
    campIdx: index("ads_change_camp_idx").on(t.campaignId),
  }),
);

export type AdsChangeLog = typeof adsChangeLog.$inferSelect;
export type InsertAdsChangeLog = typeof adsChangeLog.$inferInsert;

/**
 * Per-user tax/profitability configuration backing the "Lucratividade Real"
 * feature. Single row per user. The `config` JSON stores the full, editable
 * TaxConfig (federal rates, ICMS per UF, FCP, TTS effective rates). The TTS
 * toggle is duplicated as a column for cheap querying, but `config.ttsEnabled`
 * is the source of truth used by the engine.
 */
export const taxConfigs = mysqlTable(
  "tax_config",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    /** Master TTS switch (mirrors config.ttsEnabled for quick reads). */
    ttsEnabled: boolean("ttsEnabled").default(false).notNull(),
    /** Full TaxConfig object (shared/finance.ts) as JSON — fully editable. */
    config: json("config").notNull(),
    /** BaseLinker inventory (catalog) id to pull product costs from. */
    baselinkerInventoryId: bigint("baselinkerInventoryId", { mode: "number" }),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("tax_config_user_idx").on(t.userId),
  }),
);

export type TaxConfigRow = typeof taxConfigs.$inferSelect;
export type InsertTaxConfigRow = typeof taxConfigs.$inferInsert;

/**
 * Tax-config change history — one row per save.
 *
 * Every time the user saves the tax configuration we append a row here with a
 * full snapshot of the config plus an optional note describing what changed.
 * This lets the seller (and their accountant) see WHEN each change was made.
 */
export const taxConfigHistory = mysqlTable(
  "tax_config_history",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    /** Whether the TTS scenario was ON in this saved version. */
    ttsEnabled: boolean("ttsEnabled").default(false).notNull(),
    /** Full TaxConfig snapshot (shared/finance.ts) as JSON. */
    config: json("config").notNull(),
    /** BaseLinker inventory id selected in this version, when set. */
    baselinkerInventoryId: bigint("baselinkerInventoryId", { mode: "number" }),
    /** Optional free-text note describing what changed (max ~500 chars). */
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("tax_config_history_user_idx").on(t.userId),
  }),
);

export type TaxConfigHistoryRow = typeof taxConfigHistory.$inferSelect;
export type InsertTaxConfigHistoryRow = typeof taxConfigHistory.$inferInsert;


/**
 * Daily profitability snapshot — one row per user per day.
 *
 * Captures the period totals (last 30 days as of the capture) under BOTH tax
 * scenarios so we can chart the margin evolution over time. Re-running the same
 * day overwrites the row (idempotent), keyed by (userId, snapshotDate).
 */
export const profitSnapshots = mysqlTable(
  "profit_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    /** Local snapshot day as YYYY-MM-DD (America/Sao_Paulo). */
    snapshotDate: varchar("snapshotDate", { length: 10 }).notNull(),
    /** Window the totals refer to (rolling period end = capture time). */
    periodDays: int("periodDays").default(30).notNull(),
    /** Whether TTS was ON for the user's "current" scenario at capture time. */
    ttsEnabled: boolean("ttsEnabled").default(false).notNull(),
    orderCount: int("orderCount").default(0).notNull(),
    /** Revenue (gross) in the period, BRL. */
    revenue: double("revenue").default(0).notNull(),
    /** Net profit under each scenario, BRL. */
    netProfitSemTts: double("netProfitSemTts").default(0).notNull(),
    netProfitComTts: double("netProfitComTts").default(0).notNull(),
    /** Margin (%) under each scenario. */
    marginSemTts: double("marginSemTts").default(0).notNull(),
    marginComTts: double("marginComTts").default(0).notNull(),
    /** Cost breakdown (BRL) for the selected/current scenario. */
    commission: double("commission").default(0).notNull(),
    shipping: double("shipping").default(0).notNull(),
    cmv: double("cmv").default(0).notNull(),
    taxes: double("taxes").default(0).notNull(),
    ads: double("ads").default(0).notNull(),
    capturedAt: bigint("capturedAt", { mode: "number" }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    userDateIdx: index("profit_snapshots_user_date_idx").on(t.userId, t.snapshotDate),
  }),
);

export type ProfitSnapshotRow = typeof profitSnapshots.$inferSelect;
export type InsertProfitSnapshotRow = typeof profitSnapshots.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════════
// Aba "Projeto" — Portfólio de Importação (recriação do app importado).
// Tabelas prefixadas com `project_` para não colidir com as do Mercato.
// ═══════════════════════════════════════════════════════════════════════════

const PROJECT_STEP_ENUM = [
  "fornecedor",
  "amostra",
  "aprovacao",
  "embalagem",
  "pedido",
  "producao",
  "inspecao",
  "embarque",
  "chegada",
  "lancamento",
] as const;

/** Produtos em pipeline de importação. */
export const projectProducts = mysqlTable("project_products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  priority: mysqlEnum("priority", ["alta", "media", "baixa"]).default("media").notNull(),
  currentStep: mysqlEnum("currentStep", PROJECT_STEP_ENUM).default("fornecedor").notNull(),
  supplier: varchar("supplier", { length: 255 }),
  supplierContact: varchar("supplierContact", { length: 255 }),
  notes: text("notes"),
  imageUrl: text("imageUrl"),
  expectedArrival: timestamp("expectedArrival"),
  orderDeadline: timestamp("orderDeadline"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
});

export type ProjectProduct = typeof projectProducts.$inferSelect;
export type InsertProjectProduct = typeof projectProducts.$inferInsert;

/** Etapas da linha do tempo de cada produto. */
export const projectTimelineSteps = mysqlTable(
  "project_timeline_steps",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    step: mysqlEnum("step", PROJECT_STEP_ENUM).notNull(),
    status: mysqlEnum("status", ["pendente", "em_andamento", "concluido"]).default("pendente").notNull(),
    notes: text("notes"),
    completedAt: timestamp("completedAt"),
    targetDate: timestamp("targetDate"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    productIdx: index("project_timeline_product_idx").on(t.productId),
  }),
);

export type ProjectTimelineStep = typeof projectTimelineSteps.$inferSelect;
export type InsertProjectTimelineStep = typeof projectTimelineSteps.$inferInsert;

/** Documentos/fotos anexados a um produto. */
export const projectDocuments = mysqlTable(
  "project_documents",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    url: text("url").notNull(),
    fileKey: text("fileKey").notNull(),
    type: mysqlEnum("type", ["documento", "foto"]).default("documento").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    uploadedBy: int("uploadedBy"),
  },
  (t) => ({
    productIdx: index("project_documents_product_idx").on(t.productId),
  }),
);

export type ProjectDocument = typeof projectDocuments.$inferSelect;
export type InsertProjectDocument = typeof projectDocuments.$inferInsert;

/** Tarefas (to-dos) associadas a um produto. */
export const projectTodos = mysqlTable(
  "project_todos",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    completed: boolean("completed").default(false).notNull(),
    assignedTo: int("assignedTo"),
    dueDate: timestamp("dueDate"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    createdBy: int("createdBy"),
  },
  (t) => ({
    productIdx: index("project_todos_product_idx").on(t.productId),
  }),
);

export type ProjectTodo = typeof projectTodos.$inferSelect;
export type InsertProjectTodo = typeof projectTodos.$inferInsert;

/** Comentários em um produto (suporta visitante por nome). */
export const projectComments = mysqlTable(
  "project_comments",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    userId: int("userId"),
    guestName: varchar("guestName", { length: 100 }),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    productIdx: index("project_comments_product_idx").on(t.productId),
  }),
);

export type ProjectComment = typeof projectComments.$inferSelect;
export type InsertProjectComment = typeof projectComments.$inferInsert;


/**
 * Histórico de simulações de precificação / custo-alvo (China).
 * Cada linha registra um cenário salvo durante reuniões: nome do produto,
 * preço de venda no ML, margens testadas, snapshot dos parâmetros usados
 * (impostos, comissão, frete, logística, peso, etc.), os resultados por
 * margem (custo-alvo em BRL e USD) e a cotação USD->BRL do momento.
 */
export const pricingSimulations = mysqlTable(
  "pricing_simulations",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    productName: varchar("productName", { length: 200 }).notNull(),
    sku: varchar("sku", { length: 100 }),
    notes: text("notes"),
    /** Preço de venda no ML (centavos para precisão). */
    sellingPriceCents: int("sellingPriceCents").notNull(),
    /** Cotação USD->BRL usada, x10000 (ex.: 5.4321 -> 54321). */
    usdToBrlMilli: int("usdToBrlMilli").notNull(),
    /** Margens testadas (array de %), ex.: [15,20,30]. */
    margins: json("margins").notNull(),
    /** Snapshot completo dos parâmetros (PricingInput parcial) usados. */
    params: json("params").notNull(),
    /** Resultados por margem (TargetCostMarginResult[]). */
    results: json("results").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    userIdx: index("pricing_simulations_user_idx").on(t.userId),
  }),
);
export type PricingSimulation = typeof pricingSimulations.$inferSelect;
export type InsertPricingSimulation = typeof pricingSimulations.$inferInsert;


/**
 * Planilha invertida "Preço a ser pago para a Matriz" (v3).
 *
 * Cada linha é um PRODUTO (nome único por usuário). O usuário informa o preço
 * de venda no ML que produz a margem âncora (ex.: 20%); a partir disso o sistema
 * deriva o CUSTO FIXO a pagar à Matriz e recalcula o preço de venda necessário
 * para cada outra margem. Os controles globais (COM/SEM TTS e tipo de anúncio
 * Clássico/Premium) são salvos por usuário em `matrix_settings` e aplicam-se a
 * TODAS as linhas de uma vez.
 */
export const matrixProducts = mysqlTable(
  "matrix_products",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    /** Nome do produto (único por usuário). */
    name: varchar("name", { length: 200 }).notNull(),
    /** SKU opcional (apenas informativo). */
    sku: varchar("sku", { length: 100 }),
    /** Tipo do preço informado: 'medio' | 'melhor' | null (vazio). Apenas informativo. */
    priceType: varchar("priceType", { length: 20 }),
    /** Preço de venda âncora no ML (centavos), que produz a margem âncora. */
    anchorPriceCents: int("anchorPriceCents").notNull(),
    /** Margem âncora (%) usada para derivar o custo da Matriz. Default 20. */
    anchorMarginPct: double("anchorMarginPct").default(20).notNull(),
    /** Índice da faixa de peso do produto embalado (0..27). */
    weightIndex: int("weightIndex").default(0).notNull(),
    /** Ordem de exibição na planilha. */
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    userIdx: index("matrix_products_user_idx").on(t.userId),
    userNameIdx: index("matrix_products_user_name_idx").on(t.userId, t.name),
  }),
);

export type MatrixProduct = typeof matrixProducts.$inferSelect;
export type InsertMatrixProduct = typeof matrixProducts.$inferInsert;

/**
 * Configurações globais da planilha invertida por usuário (uma linha por user).
 * Guardam os controles globais que recalculam todas as linhas: regime de imposto
 * (COM TTS = 14% / SEM TTS = 24%), tipo de anúncio (Clássico/Premium), as margens
 * exibidas (array de %), e os defaults de TACoS/afiliados/frete grátis.
 */
export const matrixSettings = mysqlTable(
  "matrix_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().unique(),
    /** Regime de imposto: com_tts (14%) ou sem_tts (24%). */
    ttsRegime: mysqlEnum("ttsRegime", ["com_tts", "sem_tts"]).default("com_tts").notNull(),
    /** Tipo de anúncio do ML: classico (12%) ou premium (17%). */
    listingType: mysqlEnum("listingType", ["classico", "premium"]).default("classico").notNull(),
    /** Margens exibidas na planilha (array de %), ex.: [20,15,25,30,35,40]. */
    margins: json("margins").notNull(),
    /** Margem âncora global (%). Default 20. */
    anchorMarginPct: double("anchorMarginPct").default(20).notNull(),
    /** TACoS/ADS (%) aplicado a todas as linhas. Default 3. */
    tacosPercent: double("tacosPercent").default(3).notNull(),
    /** Afiliados (%) aplicado a todas as linhas. Default 0. */
    affiliatePercent: double("affiliatePercent").default(0).notNull(),
    /** Frete grátis (full/flex) ligado. Default true. */
    freeShipping: boolean("freeShipping").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
);

export type MatrixSettings = typeof matrixSettings.$inferSelect;
export type InsertMatrixSettings = typeof matrixSettings.$inferInsert;


// ─── Linha do Tempo Luís ──────────────────────────────────────────────────────
// Modelo único e editável de etapas (bolinhas) usado por TODOS os produtos na
// aba "Linha do Tempo Luís". Independente do Cronograma original do Projeto.
export const luisTimelineStages = mysqlTable(
  "luis_timeline_stages",
  {
    id: int("id").autoincrement().primaryKey(),
    label: varchar("label", { length: 255 }).notNull(),
    position: int("position").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    positionIdx: index("luis_timeline_stages_position_idx").on(t.position),
  }),
);

export type LuisTimelineStage = typeof luisTimelineStages.$inferSelect;
export type InsertLuisTimelineStage = typeof luisTimelineStages.$inferInsert;

// Fornecedores de cada produto na Linha do Tempo Luís. Um produto pode ter
// vários fornecedores, e cada fornecedor tem sua própria linha do tempo.
export const luisSuppliers = mysqlTable(
  "luis_suppliers",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    position: int("position").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    productIdx: index("luis_suppliers_product_idx").on(t.productId),
    positionIdx: index("luis_suppliers_position_idx").on(t.position),
  }),
);

export type LuisSupplier = typeof luisSuppliers.$inferSelect;
export type InsertLuisSupplier = typeof luisSuppliers.$inferInsert;

// Progresso por produto + fornecedor + etapa: concluído (tique) e observação
// livre editável. supplierId permite que cada fornecedor tenha sua própria
// linha do tempo dentro do mesmo produto.
export const luisProductStepProgress = mysqlTable(
  "luis_product_step_progress",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    supplierId: int("supplierId"),
    stageId: int("stageId").notNull(),
    done: boolean("done").default(false).notNull(),
    note: text("note"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    productIdx: index("luis_progress_product_idx").on(t.productId),
    supplierIdx: index("luis_progress_supplier_idx").on(t.supplierId),
    stageIdx: index("luis_progress_stage_idx").on(t.stageId),
  }),
);

export type LuisProductStepProgress = typeof luisProductStepProgress.$inferSelect;
export type InsertLuisProductStepProgress = typeof luisProductStepProgress.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════════
// Aba "Linha do Tempo Pedro" — Portfólio TOTALMENTE INDEPENDENTE do Projeto/Luís.
// Espelha a estrutura de project_* + luis_* mas com tabelas próprias (pedro_*),
// para que produtos, etapas, progresso, tarefas, documentos e comentários do
// Pedro não compartilhem dados com nenhum outro módulo.
// ═══════════════════════════════════════════════════════════════════════════

const PEDRO_STEP_ENUM = [
  "fornecedor",
  "amostra",
  "aprovacao",
  "embalagem",
  "pedido",
  "producao",
  "inspecao",
  "embarque",
  "chegada",
  "lancamento",
] as const;

/** Produtos em pipeline de importação do Pedro. */
export const pedroProducts = mysqlTable("pedro_products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  priority: mysqlEnum("priority", ["alta", "media", "baixa"]).default("media").notNull(),
  currentStep: mysqlEnum("currentStep", PEDRO_STEP_ENUM).default("fornecedor").notNull(),
  supplier: varchar("supplier", { length: 255 }),
  supplierContact: varchar("supplierContact", { length: 255 }),
  notes: text("notes"),
  imageUrl: text("imageUrl"),
  expectedArrival: timestamp("expectedArrival"),
  orderDeadline: timestamp("orderDeadline"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
});

export type PedroProduct = typeof pedroProducts.$inferSelect;
export type InsertPedroProduct = typeof pedroProducts.$inferInsert;

/** Etapas da linha do tempo (Cronograma clássico) de cada produto do Pedro. */
export const pedroTimelineSteps = mysqlTable(
  "pedro_timeline_steps",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    step: mysqlEnum("step", PEDRO_STEP_ENUM).notNull(),
    status: mysqlEnum("status", ["pendente", "em_andamento", "concluido"]).default("pendente").notNull(),
    notes: text("notes"),
    completedAt: timestamp("completedAt"),
    targetDate: timestamp("targetDate"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    productIdx: index("pedro_timeline_product_idx").on(t.productId),
  }),
);

export type PedroTimelineStep = typeof pedroTimelineSteps.$inferSelect;
export type InsertPedroTimelineStep = typeof pedroTimelineSteps.$inferInsert;

/** Documentos/fotos anexados a um produto do Pedro. */
export const pedroDocuments = mysqlTable(
  "pedro_documents",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    url: text("url").notNull(),
    fileKey: text("fileKey").notNull(),
    type: mysqlEnum("type", ["documento", "foto"]).default("documento").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    uploadedBy: int("uploadedBy"),
  },
  (t) => ({
    productIdx: index("pedro_documents_product_idx").on(t.productId),
  }),
);

export type PedroDocument = typeof pedroDocuments.$inferSelect;
export type InsertPedroDocument = typeof pedroDocuments.$inferInsert;

/** Tarefas (to-dos) associadas a um produto do Pedro. */
export const pedroTodos = mysqlTable(
  "pedro_todos",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    completed: boolean("completed").default(false).notNull(),
    assignedTo: int("assignedTo"),
    dueDate: timestamp("dueDate"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    createdBy: int("createdBy"),
  },
  (t) => ({
    productIdx: index("pedro_todos_product_idx").on(t.productId),
  }),
);

export type PedroTodo = typeof pedroTodos.$inferSelect;
export type InsertPedroTodo = typeof pedroTodos.$inferInsert;

/** Comentários em um produto do Pedro (suporta visitante por nome). */
export const pedroComments = mysqlTable(
  "pedro_comments",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    userId: int("userId"),
    guestName: varchar("guestName", { length: 100 }),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    productIdx: index("pedro_comments_product_idx").on(t.productId),
  }),
);

export type PedroComment = typeof pedroComments.$inferSelect;
export type InsertPedroComment = typeof pedroComments.$inferInsert;

// ─── Cronograma horizontal do Pedro (espelho de luis_*) ──────────────────────
// Modelo único e editável de etapas (bolinhas) usado por TODOS os produtos do
// Pedro na sub-aba "Cronograma". Independente do Luís e do Projeto.
export const pedroTimelineStages = mysqlTable(
  "pedro_timeline_stages",
  {
    id: int("id").autoincrement().primaryKey(),
    label: varchar("label", { length: 255 }).notNull(),
    category: varchar("category", { length: 64 }),
    details: text("details"),
    position: int("position").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    positionIdx: index("pedro_timeline_stages_position_idx").on(t.position),
  }),
);

export type PedroTimelineStage = typeof pedroTimelineStages.$inferSelect;
export type InsertPedroTimelineStage = typeof pedroTimelineStages.$inferInsert;

// Progresso por produto + etapa do Cronograma do Pedro: concluído (tique) e
// observação livre editável. supplierId mantido por compatibilidade (NULL).
export const pedroProductStepProgress = mysqlTable(
  "pedro_product_step_progress",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    supplierId: int("supplierId"),
    stageId: int("stageId").notNull(),
    done: boolean("done").default(false).notNull(),
    note: text("note"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    productIdx: index("pedro_progress_product_idx").on(t.productId),
    supplierIdx: index("pedro_progress_supplier_idx").on(t.supplierId),
    stageIdx: index("pedro_progress_stage_idx").on(t.stageId),
  }),
);

export type PedroProductStepProgress = typeof pedroProductStepProgress.$inferSelect;
export type InsertPedroProductStepProgress = typeof pedroProductStepProgress.$inferInsert;

// ─── Checklist / perguntas por etapa do Cronograma do Pedro ─────────────────
// Itens-PADRÃO de cada etapa (valem para todos os produtos por padrão).
// type: "checkbox" (só marcar) | "text" (pergunta com resposta livre).
export const pedroStageItems = mysqlTable(
  "pedro_stage_items",
  {
    id: int("id").autoincrement().primaryKey(),
    stageId: int("stageId").notNull(),
    type: varchar("type", { length: 16 }).notNull().default("checkbox"),
    label: varchar("label", { length: 500 }).notNull(),
    position: int("position").notNull(),
    groupName: varchar("groupName", { length: 120 }),
    groupColor: varchar("groupColor", { length: 24 }),
    groupPosition: int("groupPosition").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    stageIdx: index("pedro_stage_items_stage_idx").on(t.stageId),
    positionIdx: index("pedro_stage_items_position_idx").on(t.position),
  }),
);

export type PedroStageItem = typeof pedroStageItems.$inferSelect;
export type InsertPedroStageItem = typeof pedroStageItems.$inferInsert;

// Override de itens por PRODUTO+etapa. Quando existe ao menos 1 linha para
// (productId, stageId), esse conjunto SUBSTITUI o padrão naquele produto.
// hidden=true permite "esvaziar" uma etapa em um produto específico.
export const pedroProductStageItems = mysqlTable(
  "pedro_product_stage_items",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    stageId: int("stageId").notNull(),
    type: varchar("type", { length: 16 }).notNull().default("checkbox"),
    label: varchar("label", { length: 500 }).notNull(),
    position: int("position").notNull(),
    groupName: varchar("groupName", { length: 120 }),
    groupColor: varchar("groupColor", { length: 24 }),
    groupPosition: int("groupPosition").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    productStageIdx: index("pedro_pstage_items_product_stage_idx").on(t.productId, t.stageId),
  }),
);

export type PedroProductStageItem = typeof pedroProductStageItems.$inferSelect;
export type InsertPedroProductStageItem = typeof pedroProductStageItems.$inferInsert;

// Respostas por PRODUTO de cada item de checklist/pergunta.
// itemSource: "default" (refere pedro_stage_items.id) | "product" (refere
// pedro_product_stage_items.id) — para não colidir ids entre as duas origens.
export const pedroItemAnswers = mysqlTable(
  "pedro_item_answers",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    stageId: int("stageId").notNull(),
    itemSource: varchar("itemSource", { length: 16 }).notNull().default("default"),
    itemId: int("itemId").notNull(),
    checked: boolean("checked").default(false).notNull(),
    textValue: text("textValue"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    productStageIdx: index("pedro_item_answers_product_stage_idx").on(t.productId, t.stageId),
    lookupIdx: index("pedro_item_answers_lookup_idx").on(
      t.productId,
      t.stageId,
      t.itemSource,
      t.itemId,
    ),
  }),
);

export type PedroItemAnswer = typeof pedroItemAnswers.$inferSelect;
export type InsertPedroItemAnswer = typeof pedroItemAnswers.$inferInsert;


// ============================================================================
// PLANILHA SKU (Cronograma do Pedro) — planilha ÚNICA, editável.
// Cada linha é um SKU/variante. Categoria/subcategoria referenciam a árvore
// oficial do Mercado Livre (shared/mlCategories.json). Os seletores de
// CADASTRADO ML e TIPO SKU são fixos (ver shared/skuSheet.ts).
// ============================================================================
export const skuSheetRows = mysqlTable(
  "sku_sheet_rows",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Ordem de exibição/edição na planilha (drag opcional no futuro). */
    position: int("position").default(0).notNull(),
    /** Número sequencial do PRODUTO (mesmo nome => mesmo número). */
    productNumber: int("productNumber"),
    /** Número sequencial da VARIANTE dentro do produto. */
    variantNumber: int("variantNumber"),

    /** CADASTRADO ML: ATIVO | PENDENTE | PAUSADO | EXCLUIDO | "" (vazio). */
    cadastradoMl: varchar("cadastradoMl", { length: 16 }).default("").notNull(),
    /** TIPO SKU: "1" INSUMO | "2" PRODUTO | "3" KIT | "4" CATALOGO | "". */
    tipoSku: varchar("tipoSku", { length: 4 }).default("").notNull(),

    /** Categoria ML (id + nome desnormalizado para exibição estável). */
    categoryId: varchar("categoryId", { length: 24 }),
    categoryName: varchar("categoryName", { length: 160 }),
    /** Subcategoria ML (id + nome). */
    subCategoryId: varchar("subCategoryId", { length: 24 }),
    subCategoryName: varchar("subCategoryName", { length: 160 }),

    /** PRODUTO (nome) e VARIANTE. */
    produto: varchar("produto", { length: 300 }).default("").notNull(),
    variante: varchar("variante", { length: 300 }).default("").notNull(),

    /** SKU e geração de SKU KIT. */
    sku: varchar("sku", { length: 120 }).default("").notNull(),
    gerarSkuKit: boolean("gerarSkuKit").default(false).notNull(),
    skuKit: varchar("skuKit", { length: 120 }).default("").notNull(),

    /** Códigos fiscais/identificação. */
    eanGtin: varchar("eanGtin", { length: 60 }).default("").notNull(),
    ncm: varchar("ncm", { length: 20 }).default("").notNull(),
    gpc: varchar("gpc", { length: 30 }).default("").notNull(),
    cest: varchar("cest", { length: 20 }).default("").notNull(),

    /** Preços (texto livre para preservar formatação R$ / vazio). */
    precoClassico: varchar("precoClassico", { length: 40 }).default("").notNull(),
    precoPremium: varchar("precoPremium", { length: 40 }).default("").notNull(),
    precoAtacado: varchar("precoAtacado", { length: 40 }).default("").notNull(),

    /** Embalagem (dimensões + peso). Texto livre para aceitar cm/kg/"?"/"x". */
    embProfundidade: varchar("embProfundidade", { length: 40 }).default("").notNull(),
    embLargura: varchar("embLargura", { length: 40 }).default("").notNull(),
    embAltura: varchar("embAltura", { length: 40 }).default("").notNull(),
    embPeso: varchar("embPeso", { length: 40 }).default("").notNull(),

    /** Características do produto líquido (medidas internas/qualitativas). */
    caracteristicas: text("caracteristicas"),

    /** Cor de fundo da linha (estilo Excel). Vazio = sem cor. */
    rowColor: varchar("rowColor", { length: 20 }).default("").notNull(),

    /**
     * Valores das COLUNAS PERSONALIZADAS desta linha.
     * JSON no formato { [customColumnId: string]: string }.
     * Mantido como texto para flexibilidade (colunas livres criadas pelo usuário).
     */
    customValues: text("customValues"),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    positionIdx: index("sku_sheet_position_idx").on(t.position),
    productNumberIdx: index("sku_sheet_product_number_idx").on(t.productNumber),
  }),
);

export type SkuSheetRow = typeof skuSheetRows.$inferSelect;
export type InsertSkuSheetRow = typeof skuSheetRows.$inferInsert;

/**
 * Colunas PERSONALIZADAS criadas pelo usuário na Planilha SKU.
 * São colunas de texto livre que aparecem para todas as linhas.
 * Os valores ficam em sku_sheet_rows.customValues (JSON por id de coluna).
 */
export const skuSheetCustomColumns = mysqlTable(
  "sku_sheet_custom_columns",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Nome exibido no cabeçalho da coluna. */
    name: varchar("name", { length: 120 }).default("").notNull(),
    /** Ordem de exibição entre as colunas personalizadas. */
    position: int("position").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    positionIdx: index("sku_sheet_custom_col_position_idx").on(t.position),
  }),
);

export type SkuSheetCustomColumn = typeof skuSheetCustomColumns.$inferSelect;
export type InsertSkuSheetCustomColumn = typeof skuSheetCustomColumns.$inferInsert;

// ============================================================================
// PLANILHA KITS (aba "KITS" da planilha do Pedro) — planilha ÚNICA, editável.
// Cada linha é um kit (composto por SKUs). Colunas fixas da aba original +
// colunas personalizadas (mesma mecânica da Planilha SKU).
// ============================================================================
export const kitSheetRows = mysqlTable(
  "kit_sheet_rows",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Ordem de exibição/edição na planilha. */
    position: int("position").default(0).notNull(),

    // ===================================================================
    // FORMATO SKU — a aba Kits agora usa as MESMAS colunas da Planilha SKU.
    // As colunas legadas (kit, embalagem, profundidade, etc.) permanecem
    // abaixo para preservar 100% dos dados originais (zero perda).
    // ===================================================================
    /** Número sequencial do PRODUTO (formato SKU). */
    productNumber: int("productNumber"),
    /** Número sequencial da VARIANTE dentro do produto (formato SKU). */
    variantNumber: int("variantNumber"),
    /** CADASTRADO ML: ATIVO | PENDENTE | PAUSADO | EXCLUIDO | "". */
    cadastradoMl: varchar("cadastradoMl", { length: 60 }).default("").notNull(),
    /** TIPO SKU: "1" INSUMO | "2" PRODUTO | "3" KIT | "4" CATALOGO | "". */
    tipoSku: varchar("tipoSku", { length: 4 }).default("").notNull(),
    /** Categoria ML (id + nome). */
    categoryId: varchar("categoryId", { length: 24 }),
    categoryName: varchar("categoryName", { length: 160 }),
    /** Subcategoria ML (id + nome). */
    subCategoryId: varchar("subCategoryId", { length: 24 }),
    subCategoryName: varchar("subCategoryName", { length: 160 }),
    /** PRODUTO (nome) e VARIANTE (formato SKU). */
    produto: varchar("produto", { length: 300 }).default("").notNull(),
    variante: varchar("variante", { length: 300 }).default("").notNull(),
    /** EAN/GTIN. */
    eanGtin: varchar("eanGtin", { length: 60 }).default("").notNull(),
    /** SKU (digitado manualmente, padrão próprio). */
    sku: varchar("sku", { length: 120 }).default("").notNull(),
    /** Geração de SKU KIT (formato SKU). */
    gerarSkuKit: boolean("gerarSkuKit").default(false).notNull(),
    skuKit: varchar("skuKit", { length: 120 }).default("").notNull(),
    /** NCM. */
    ncm: varchar("ncm", { length: 20 }).default("").notNull(),
    /** GPC / CEST (formato SKU). */
    gpc: varchar("gpc", { length: 30 }).default("").notNull(),
    cest: varchar("cest", { length: 20 }).default("").notNull(),
    /** PREÇO > CLÁSSICO / PREMIUM / ATACADO (texto livre p/ preservar R$). */
    precoClassico: varchar("precoClassico", { length: 40 }).default("").notNull(),
    precoPremium: varchar("precoPremium", { length: 40 }).default("").notNull(),
    precoAtacado: varchar("precoAtacado", { length: 40 }).default("").notNull(),
    /** Embalagem do formato SKU (dimensões + peso). */
    embProfundidade: varchar("embProfundidade", { length: 40 }).default("").notNull(),
    embLargura: varchar("embLargura", { length: 40 }).default("").notNull(),
    embAltura: varchar("embAltura", { length: 40 }).default("").notNull(),
    embPeso: varchar("embPeso", { length: 40 }).default("").notNull(),
    /** Características do produto líquido (formato SKU). */
    caracteristicas: text("caracteristicas"),

    // ===================================================================
    // COLUNAS LEGADAS (planilha de Kits original) — preservadas p/ não
    // perder nada. Não são mais exibidas na grade, mas continuam no banco.
    // ===================================================================
    /** [LEGADO] KIT (nome do kit). Migrado para `produto`. */
    kit: varchar("kit", { length: 400 }).default("").notNull(),
    /** [LEGADO] EMBALAGEM ("ESTOQUE: X" etc.). */
    embalagem: varchar("embalagem", { length: 200 }).default("").notNull(),
    /** [LEGADO] PROFUNDIDADE. Migrado para `embProfundidade`. */
    profundidade: varchar("profundidade", { length: 40 }).default("").notNull(),
    /** [LEGADO] LARGURA. Migrado para `embLargura`. */
    largura: varchar("largura", { length: 40 }).default("").notNull(),
    /** [LEGADO] ALTURA-COMPRIMENTO. Migrado para `embAltura`. */
    alturaComprimento: varchar("alturaComprimento", { length: 40 }).default("").notNull(),
    /** [LEGADO] KG. Migrado para `embPeso`. */
    kg: varchar("kg", { length: 40 }).default("").notNull(),
    /** [LEGADO] CATEGORIA (BAMBU/MADEIRA/FIBRA...). */
    categoria: varchar("categoria", { length: 120 }).default("").notNull(),
    /** [LEGADO] Flags V/F da planilha. */
    dimensoesGs1: varchar("dimensoesGs1", { length: 12 }).default("").notNull(),
    baseAjustado: varchar("baseAjustado", { length: 12 }).default("").notNull(),
    mlAjustado: varchar("mlAjustado", { length: 12 }).default("").notNull(),
    /** [LEGADO] FORMADO POR (composição do kit). */
    formadoPor: varchar("formadoPor", { length: 300 }).default("").notNull(),
    /** [LEGADO] OBSERVAÇÃO. */
    observacao: text("observacao"),

    /** Cor de fundo da linha (estilo Excel). Vazio = sem cor. */
    rowColor: varchar("rowColor", { length: 20 }).default("").notNull(),

    /** Valores das COLUNAS PERSONALIZADAS (JSON { [customColumnId]: string }). */
    customValues: text("customValues"),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    positionIdx: index("kit_sheet_position_idx").on(t.position),
  }),
);

export type KitSheetRow = typeof kitSheetRows.$inferSelect;
export type InsertKitSheetRow = typeof kitSheetRows.$inferInsert;

export const kitSheetCustomColumns = mysqlTable(
  "kit_sheet_custom_columns",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 120 }).default("").notNull(),
    position: int("position").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    positionIdx: index("kit_sheet_custom_col_position_idx").on(t.position),
  }),
);

export type KitSheetCustomColumn = typeof kitSheetCustomColumns.$inferSelect;
export type InsertKitSheetCustomColumn = typeof kitSheetCustomColumns.$inferInsert;

// ============================================================================
// PLANILHA EMBALAGENS (aba "EMBALAGENS" da planilha do Pedro) — editável.
// ============================================================================
export const embalagemSheetRows = mysqlTable(
  "embalagem_sheet_rows",
  {
    id: int("id").autoincrement().primaryKey(),
    position: int("position").default(0).notNull(),

    /** PRODUTO (nome da embalagem). */
    produto: varchar("produto", { length: 400 }).default("").notNull(),
    /** EAN/GTIN. */
    eanGtin: varchar("eanGtin", { length: 60 }).default("").notNull(),
    /** SKU (digitado manualmente). */
    sku: varchar("sku", { length: 120 }).default("").notNull(),
    /** EMBALAGEM. */
    embalagem: varchar("embalagem", { length: 200 }).default("").notNull(),
    /** NCM / GPC / CEST. */
    ncm: varchar("ncm", { length: 20 }).default("").notNull(),
    gpc: varchar("gpc", { length: 30 }).default("").notNull(),
    cest: varchar("cest", { length: 20 }).default("").notNull(),

    /** PREÇO > CLÁSSICO / PREMIUM. */
    precoClassico: varchar("precoClassico", { length: 40 }).default("").notNull(),
    precoPremium: varchar("precoPremium", { length: 40 }).default("").notNull(),

    /** CARACTERÍSTICAS LÍQUIDO > ALTURA / LARGURA / COMPRIMENTO / KG. */
    altura: varchar("altura", { length: 40 }).default("").notNull(),
    largura: varchar("largura", { length: 40 }).default("").notNull(),
    comprimento: varchar("comprimento", { length: 40 }).default("").notNull(),
    kg: varchar("kg", { length: 40 }).default("").notNull(),

    /** CATEGORIA. */
    categoria: varchar("categoria", { length: 120 }).default("").notNull(),
    /** OBSERVAÇÃO. */
    observacao: text("observacao"),

    rowColor: varchar("rowColor", { length: 20 }).default("").notNull(),
    customValues: text("customValues"),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    positionIdx: index("embalagem_sheet_position_idx").on(t.position),
  }),
);

export type EmbalagemSheetRow = typeof embalagemSheetRows.$inferSelect;
export type InsertEmbalagemSheetRow = typeof embalagemSheetRows.$inferInsert;

export const embalagemSheetCustomColumns = mysqlTable(
  "embalagem_sheet_custom_columns",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 120 }).default("").notNull(),
    position: int("position").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    positionIdx: index("embalagem_sheet_custom_col_position_idx").on(t.position),
  }),
);

export type EmbalagemSheetCustomColumn = typeof embalagemSheetCustomColumns.$inferSelect;
export type InsertEmbalagemSheetCustomColumn = typeof embalagemSheetCustomColumns.$inferInsert;

// ============================================================================
// HISTÓRICO DE MIGRAÇÃO (Kits -> Planilha SKU). Cada linha registra UMA linha
// de kit que foi MOVIDA para a Planilha SKU: guarda o snapshot completo dos
// dados migrados (JSON), o id de origem (kit) e o id de destino (sku criado),
// além de quem migrou e quando. É um log somente-acréscimo (append-only).
// ============================================================================
export const migrationHistory = mysqlTable(
  "migration_history",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Tipo de migração. Por ora: "kit_to_sku". */
    kind: varchar("kind", { length: 32 }).default("kit_to_sku").notNull(),
    /** id da linha original na planilha de Kits (antes de ser removida). */
    sourceKitRowId: int("sourceKitRowId"),
    /** id da linha criada na Planilha SKU (destino). */
    targetSkuRowId: int("targetSkuRowId"),
    /** Nome/identificação amigável da linha migrada (produto/kit + SKU). */
    label: varchar("label", { length: 400 }).default("").notNull(),
    sku: varchar("sku", { length: 120 }).default("").notNull(),
    /** Snapshot completo (JSON) dos dados migrados, para auditoria/restauração. */
    snapshot: text("snapshot"),
    /** Quem executou a migração. */
    migratedByOpenId: varchar("migratedByOpenId", { length: 64 }),
    migratedByName: varchar("migratedByName", { length: 200 }),
    /** Quando ocorreu (Unix ms). */
    migratedAt: bigint("migratedAt", { mode: "number" }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    kindIdx: index("migration_history_kind_idx").on(t.kind),
    migratedAtIdx: index("migration_history_migrated_at_idx").on(t.migratedAt),
  }),
);

export type MigrationHistory = typeof migrationHistory.$inferSelect;
export type InsertMigrationHistory = typeof migrationHistory.$inferInsert;

/**
 * Configuração (linha única, id = 1) do backup automático para o Google Drive.
 * Guarda o refresh_token de longa duração (nunca exposto ao frontend), a pasta
 * de destino e o estado do último backup. Escopo OAuth: drive.file.
 */
export const driveBackupConfig = mysqlTable("drive_backup_config", {
  id: int("id").primaryKey(),
  /** refresh_token do Google (longa duração) — usado para renovar o acesso. */
  refreshToken: text("refreshToken"),
  /** E-mail da conta conectada (apenas exibição no painel). */
  accountEmail: varchar("accountEmail", { length: 200 }).default("").notNull(),
  /** id da pasta criada pelo app no Drive (reusada nos próximos backups). */
  folderId: varchar("folderId", { length: 120 }).default("").notNull(),
  /** nome da pasta de destino. */
  folderName: varchar("folderName", { length: 200 }).default("").notNull(),
  /** se o backup diário automático está ligado. */
  enabled: boolean("enabled").default(false).notNull(),
  /** uid da tarefa agendada (Heartbeat) ativa. */
  scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }),
  /** hora do dia (UTC) em que o backup diário roda. */
  scheduleHourUtc: int("scheduleHourUtc").default(9).notNull(),
  /** quando ocorreu o último backup (Unix ms). */
  lastBackupAt: bigint("lastBackupAt", { mode: "number" }),
  /** "ok" | "error" | "". */
  lastStatus: varchar("lastStatus", { length: 16 }).default("").notNull(),
  lastError: text("lastError"),
  lastFileId: varchar("lastFileId", { length: 120 }).default("").notNull(),
  lastFileName: varchar("lastFileName", { length: 200 }).default("").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DriveBackupConfig = typeof driveBackupConfig.$inferSelect;
export type InsertDriveBackupConfig = typeof driveBackupConfig.$inferInsert;
