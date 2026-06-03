import { and, desc, eq, gte } from "drizzle-orm";
import {
  alerts,
  appConfig,
  mlCredentials,
  monitoredProducts,
  productSnapshots,
  type InsertAlert,
  type InsertMlCredential,
  type InsertMonitoredProduct,
  type InsertProductSnapshot,
} from "../drizzle/schema";
import { getDb } from "./db";

// ---- Credentials ---------------------------------------------------------

export async function getCredentials(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(mlCredentials)
    .where(eq(mlCredentials.userId, userId))
    .limit(1);
  return rows[0];
}

export async function upsertCredentials(userId: number, data: Partial<InsertMlCredential>) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const existing = await getCredentials(userId);
  if (existing) {
    await db.update(mlCredentials).set(data).where(eq(mlCredentials.userId, userId));
  } else {
    await db.insert(mlCredentials).values({ userId, ...data } as InsertMlCredential);
  }
  return getCredentials(userId);
}

// ---- Monitored products --------------------------------------------------

export async function listMonitored(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(monitoredProducts)
    .where(eq(monitoredProducts.userId, userId))
    .orderBy(desc(monitoredProducts.createdAt));
}

export async function listAllActiveMonitored() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(monitoredProducts)
    .where(eq(monitoredProducts.isActive, true));
}

export async function getMonitoredById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(monitoredProducts)
    .where(eq(monitoredProducts.id, id))
    .limit(1);
  return rows[0];
}

export async function findMonitored(userId: number, mlItemId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(monitoredProducts)
    .where(and(eq(monitoredProducts.userId, userId), eq(monitoredProducts.mlItemId, mlItemId)))
    .limit(1);
  return rows[0];
}

export async function addMonitored(data: InsertMonitoredProduct) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.insert(monitoredProducts).values(data);
  return findMonitored(data.userId, data.mlItemId);
}

export async function updateMonitored(id: number, data: Partial<InsertMonitoredProduct>) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(monitoredProducts).set(data).where(eq(monitoredProducts.id, id));
}

export async function removeMonitored(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db
    .delete(monitoredProducts)
    .where(and(eq(monitoredProducts.id, id), eq(monitoredProducts.userId, userId)));
}

// ---- Snapshots -----------------------------------------------------------

export async function addSnapshot(data: InsertProductSnapshot) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.insert(productSnapshots).values(data);
}

export async function listSnapshots(monitoredProductId: number, sinceMs?: number) {
  const db = await getDb();
  if (!db) return [];
  const condition = sinceMs
    ? and(
        eq(productSnapshots.monitoredProductId, monitoredProductId),
        gte(productSnapshots.capturedAt, sinceMs),
      )
    : eq(productSnapshots.monitoredProductId, monitoredProductId);
  return db
    .select()
    .from(productSnapshots)
    .where(condition)
    .orderBy(productSnapshots.capturedAt);
}

export async function latestSnapshot(monitoredProductId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(productSnapshots)
    .where(eq(productSnapshots.monitoredProductId, monitoredProductId))
    .orderBy(desc(productSnapshots.capturedAt))
    .limit(1);
  return rows[0];
}

// ---- Alerts --------------------------------------------------------------

export async function addAlert(data: InsertAlert) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.insert(alerts).values(data);
}

export async function listAlerts(userId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(alerts)
    .where(eq(alerts.userId, userId))
    .orderBy(desc(alerts.createdAt))
    .limit(limit);
}

export async function markAlertRead(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db
    .update(alerts)
    .set({ isRead: true })
    .where(and(eq(alerts.id, id), eq(alerts.userId, userId)));
}

export async function markAllAlertsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(alerts).set({ isRead: true }).where(eq(alerts.userId, userId));
}

// ---- App config ----------------------------------------------------------

export async function getAppConfig() {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(appConfig).limit(1);
  return rows[0];
}

export async function upsertAppConfig(data: Partial<typeof appConfig.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const existing = await getAppConfig();
  if (existing) {
    await db.update(appConfig).set(data).where(eq(appConfig.id, existing.id));
  } else {
    await db.insert(appConfig).values(data as typeof appConfig.$inferInsert);
  }
  return getAppConfig();
}
