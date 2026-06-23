import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import {
  alerts,
  appConfig,
  mlCredentials,
  monitoredProducts,
  productSnapshots,
  profitSnapshots,
  taxConfigs,
  taxConfigHistory,
  type InsertAlert,
  type InsertMlCredential,
  type InsertMonitoredProduct,
  type InsertProductSnapshot,
  type InsertProfitSnapshotRow,
  type InsertTaxConfigRow,
  type InsertTaxConfigHistoryRow,
  type ProfitSnapshotRow,
  type TaxConfigRow,
  type TaxConfigHistoryRow,
} from "../drizzle/schema";
import { getDb, getOwnerUser } from "./db";

// ---- Credentials ---------------------------------------------------------

/**
 * Resolve WHICH user id actually owns the project-wide Mercado Livre connection.
 *
 * Why this exists: the ML credential row is keyed by the Manus `userId`. But
 * this app is a SINGLE-STORE tool — the whole project shares ONE Mercado Livre
 * seller account (the owner's). Different Manus logins (the owner's Apple login,
 * `gestao@grupo-fox.com`, future staff logging in via the shared password) must
 * all read/refresh the SAME ML connection. Without this, switching logins shows
 * a false "desconectado" because the new user has no credential row of its own.
 *
 * Resolution order (each a fallback for the previous):
 *   1. The canonical owner user (ENV.OWNER_OPEN_ID → admin → first user) IF its
 *      credential row carries a refresh_token (a real, renewable connection).
 *   2. ANY credential row that has a refresh_token (the connection lives on some
 *      user row — use it regardless of which login is active).
 *   3. The requesting user id itself (preserves the original per-user behavior
 *      when no shared connection exists yet, e.g. brand-new project).
 *
 * The result is intentionally NOT cached: connections can be (re)created at any
 * time and these are cheap indexed reads. Callers that need the token already
 * cache at a higher level (accountCache / in-flight refresh lock).
 */
export async function resolveMlOwnerUserId(requestUserId: number): Promise<number> {
  const db = await getDb();
  if (!db) return requestUserId;

  // 1) Canonical owner with a renewable connection.
  try {
    const owner = await getOwnerUser();
    if (owner) {
      const ownerCreds = await getCredentials(owner.id);
      if (ownerCreds?.refreshToken) return owner.id;
    }
  } catch {
    // ignore — fall through to the generic lookup
  }

  // 2) Any row that actually has a refresh_token (the live connection).
  try {
    const rows = await db
      .select({ userId: mlCredentials.userId })
      .from(mlCredentials)
      .where(isNotNull(mlCredentials.refreshToken))
      .limit(1);
    if (rows[0]?.userId) return rows[0].userId;
  } catch {
    // ignore — fall through
  }

  // 3) No shared connection yet — behave exactly as before (per-user).
  return requestUserId;
}

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

/** All user ids that have ML credentials stored (for project-wide cron jobs). */
export async function listUsersWithMlCredentials(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ userId: mlCredentials.userId })
    .from(mlCredentials);
  return rows.map((r) => r.userId);
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

// ---- Tax / Profitability config -----------------------------------------

/** Read the per-user tax config row (undefined when not set yet). */
export async function getTaxConfigRow(userId: number): Promise<TaxConfigRow | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(taxConfigs)
    .where(eq(taxConfigs.userId, userId))
    .limit(1);
  return rows[0];
}

/** Create or update the per-user tax config row. */
export async function upsertTaxConfigRow(
  userId: number,
  data: Partial<InsertTaxConfigRow>,
): Promise<TaxConfigRow | undefined> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const existing = await getTaxConfigRow(userId);
  if (existing) {
    await db.update(taxConfigs).set(data).where(eq(taxConfigs.id, existing.id));
  } else {
    await db
      .insert(taxConfigs)
      .values({ userId, ttsEnabled: false, config: {}, ...data } as InsertTaxConfigRow);
  }
  return getTaxConfigRow(userId);
}

/** Append one row to the tax-config change history. */
export async function insertTaxConfigHistory(
  userId: number,
  data: Omit<InsertTaxConfigHistoryRow, "id" | "userId" | "createdAt">,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db
    .insert(taxConfigHistory)
    .values({ userId, ...data } as InsertTaxConfigHistoryRow);
}

/** List the most recent tax-config changes for a user (newest first). */
export async function listTaxConfigHistory(
  userId: number,
  limit = 30,
): Promise<TaxConfigHistoryRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(taxConfigHistory)
    .where(eq(taxConfigHistory.userId, userId))
    .orderBy(desc(taxConfigHistory.createdAt))
    .limit(limit);
}

// ---- Profitability snapshots --------------------------------------------

/**
 * Upsert the daily profitability snapshot for a user (idempotent by day).
 * Re-running the same day overwrites the row so a re-run never duplicates.
 */
export async function upsertProfitSnapshot(
  data: InsertProfitSnapshotRow,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const existing = await db
    .select({ id: profitSnapshots.id })
    .from(profitSnapshots)
    .where(
      and(
        eq(profitSnapshots.userId, data.userId),
        eq(profitSnapshots.snapshotDate, data.snapshotDate),
      ),
    )
    .limit(1);
  if (existing[0]) {
    await db
      .update(profitSnapshots)
      .set(data)
      .where(eq(profitSnapshots.id, existing[0].id));
  } else {
    await db.insert(profitSnapshots).values(data);
  }
}

/** List the most recent profitability snapshots for a user (newest first). */
export async function listProfitSnapshots(
  userId: number,
  limit = 60,
): Promise<ProfitSnapshotRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(profitSnapshots)
    .where(eq(profitSnapshots.userId, userId))
    .orderBy(desc(profitSnapshots.snapshotDate))
    .limit(limit);
}
