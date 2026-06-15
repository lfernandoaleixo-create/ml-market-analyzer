import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Resolve the "owner" user (the account that has the store connected).
 *
 * Resolution order (each step is a fallback for the previous one):
 *   1. The user whose openId matches ENV.ownerOpenId (the canonical owner).
 *   2. The first user with role = 'admin' (by id).
 *   3. The first user overall (lowest id).
 *
 * This keeps the shared-password login working even if the OWNER_OPEN_ID
 * environment variable is missing or out of sync in a given deployment.
 */
export async function getOwnerUser() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get owner user: database not available");
    return undefined;
  }

  // 1) Canonical owner by openId.
  if (ENV.ownerOpenId) {
    const byOpenId = await db
      .select()
      .from(users)
      .where(eq(users.openId, ENV.ownerOpenId))
      .limit(1);
    if (byOpenId.length > 0) return byOpenId[0];
  }

  // 2) First admin user.
  const admins = await db
    .select()
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(asc(users.id))
    .limit(1);
  if (admins.length > 0) return admins[0];

  // 3) First user overall.
  const anyUser = await db
    .select()
    .from(users)
    .orderBy(asc(users.id))
    .limit(1);
  return anyUser.length > 0 ? anyUser[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
