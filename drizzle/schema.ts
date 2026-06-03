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
  /** Alert thresholds (JSON) — percentage changes that trigger alerts. */
  alertThresholds: json("alertThresholds"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AppConfig = typeof appConfig.$inferSelect;
export type InsertAppConfig = typeof appConfig.$inferInsert;
