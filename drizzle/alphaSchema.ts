import { bigint, index, int, mediumtext, mysqlEnum, mysqlTable, primaryKey, text, varchar } from "drizzle-orm/mysql-core";

/** Payload/identity/version match Alpha. Commercial timestamps are UTC Unix ms. */
export const alphaCatalogProducts = mysqlTable("alpha_catalog_products", {
  ownerId: int("ownerId").notNull(),
  id: varchar("id", { length: 256 }).notNull(),
  recordPayload: mediumtext("recordPayload").notNull(),
  version: int("version").notNull().default(1),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, t => [
  primaryKey({ columns: [t.ownerId, t.id], name: "alpha_catalog_owner_id_pk" }),
  index("alpha_catalog_owner_updated_idx").on(t.ownerId, t.updatedAt),
]);

/** No file bytes: storagePut owns binary storage, this table only checkpoints metadata. */
export const alphaPdfExports = mysqlTable("alpha_pdf_exports", {
  ownerId: int("ownerId").notNull(),
  exportId: varchar("exportId", { length: 36 }).notNull(),
  reportId: varchar("reportId", { length: 256 }).notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  description: text("description").notNull(),
  sku: varchar("sku", { length: 256 }).notNull(),
  projectId: int("projectId"),
  documentId: int("documentId"),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  byteSize: int("byteSize").notNull(),
  contextHash: varchar("contextHash", { length: 64 }).notNull(),
  optionsPayload: text("optionsPayload").notNull(),
  snapshotPayload: mediumtext("snapshotPayload"),
  status: mysqlEnum("status", ["pending", "failed", "ready"]).notNull(),
  leaseToken: varchar("leaseToken", { length: 36 }),
  leaseExpiresAt: bigint("leaseExpiresAt", { mode: "number" }),
  key: text("key"),
  url: text("url"),
  uploadedAt: bigint("uploadedAt", { mode: "number" }),
  lastError: varchar("lastError", { length: 100 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, t => [
  primaryKey({ columns: [t.ownerId, t.exportId], name: "alpha_pdf_owner_export_pk" }),
  index("alpha_pdf_owner_created_idx").on(t.ownerId, t.createdAt),
]);

export type AlphaCatalogProduct = typeof alphaCatalogProducts.$inferSelect;
export type InsertAlphaCatalogProduct = typeof alphaCatalogProducts.$inferInsert;
export type AlphaPdfExport = typeof alphaPdfExports.$inferSelect;
export type InsertAlphaPdfExport = typeof alphaPdfExports.$inferInsert;
