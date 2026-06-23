import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for resolveMlOwnerUserId — the single-store resolver that makes the
 * Mercado Livre connection shared across every Manus login.
 *
 * The whole point: this app drives ONE seller store. The ML credential row is
 * keyed by Manus userId, but ANY login (the owner's Apple login, a staff login
 * like gestao@grupo-fox.com, the shared-password login) must read/refresh the
 * SAME connection. Before this resolver, switching logins showed a false
 * "desconectado" because the new user had no credential row of its own.
 *
 * We mock the DB layer (./db) at its primitives — getDb (the drizzle handle) and
 * getOwnerUser. The resolver calls getCredentials internally (same module), and
 * getCredentials itself goes through getDb, so controlling getDb is enough to
 * drive BOTH the owner lookup AND the "any row with a refresh token" fallback.
 * Deterministic, no network/DB, and faithful to the real call graph.
 */

// ---- In-memory fixtures driven per-test --------------------------------------
let ownerUser: { id: number } | undefined;
// Per-user credential rows (what getCredentials returns for a given userId).
let credsByUser: Record<number, { refreshToken?: string | null } | undefined>;
// Rows returned by the "any row with a refresh_token" fallback query.
let rowsWithRefresh: { userId: number }[];
let dbAvailable = true;

/**
 * Build a drizzle-like query object mirroring the two shapes dbMl uses:
 *   getCredentials:  db.select().from(table).where(eq(userId, X)).limit(1)
 *   fallback query:  db.select({userId}).from(table).where(isNotNull(rt)).limit(1)
 *
 * We disambiguate by whether `select` got a projection argument (fallback) or
 * not (getCredentials), and capture the userId passed to the real `eq(...)`
 * comparator object so getCredentials returns the right per-user row.
 */
function makeDb() {
  return {
    select: (projection?: unknown) => {
      const isFallbackQuery = projection !== undefined;
      return {
        from: () => ({
          // The real code calls .where(eq(mlCredentials.userId, userId)); drizzle
          // builds a comparator object. We don't parse it — instead getCredentials
          // is exercised once per candidate userId, so we stash the userId via a
          // closure set by a thin wrapper below. Simpler: return based on query type.
          where: (cond: unknown) => ({
            limit: async () => {
              if (isFallbackQuery) return rowsWithRefresh;
              // getCredentials path: the comparator carries the userId in its
              // serialized form. We expose it through a symbol the test sets.
              const uid = (cond as { __uid?: number })?.__uid;
              if (uid != null) {
                const row = credsByUser[uid];
                return row ? [row] : [];
              }
              return [];
            },
          }),
        }),
      };
    },
  };
}

// Intercept eq() so we can recover which userId getCredentials filtered by.
vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: (_col: unknown, value: unknown) => ({ __uid: value }) as never,
  };
});

vi.mock("./db", () => ({
  getDb: vi.fn(async () => (dbAvailable ? makeDb() : null)),
  getOwnerUser: vi.fn(async () => ownerUser),
}));

import * as dbMl from "./dbMl";

beforeEach(() => {
  ownerUser = undefined;
  credsByUser = {};
  rowsWithRefresh = [];
  dbAvailable = true;
});

describe("resolveMlOwnerUserId", () => {
  it("returns the owner id when the owner has a renewable connection (refresh token)", async () => {
    ownerUser = { id: 1 };
    credsByUser[1] = { refreshToken: "RT-owner" };

    const resolved = await dbMl.resolveMlOwnerUserId(12960016);
    expect(resolved).toBe(1);
  });

  it("falls back to ANY row that has a refresh token when the owner has none", async () => {
    ownerUser = { id: 1 };
    credsByUser[1] = { refreshToken: null }; // owner row exists but is not renewable
    rowsWithRefresh = [{ userId: 777 }];

    const resolved = await dbMl.resolveMlOwnerUserId(12960016);
    expect(resolved).toBe(777);
  });

  it("falls back to the requesting user id when no shared connection exists", async () => {
    ownerUser = { id: 1 };
    credsByUser[1] = undefined; // no owner creds
    rowsWithRefresh = []; // and no row anywhere has a refresh token

    const resolved = await dbMl.resolveMlOwnerUserId(4242);
    expect(resolved).toBe(4242);
  });

  it("returns the requesting user id when the database is unavailable", async () => {
    dbAvailable = false;
    const resolved = await dbMl.resolveMlOwnerUserId(4242);
    expect(resolved).toBe(4242);
  });
});
