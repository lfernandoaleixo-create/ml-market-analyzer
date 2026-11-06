import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../drizzle/schema";
import {
  createCatalogRouter,
  type CatalogStore,
  type StoredCatalogRow,
} from "./catalogRouter";
import { getDb } from "../db";
const appRouter = { createCaller: (ctx: TrpcContext) => ({ catalog: createCatalogRouter().createCaller(ctx) }) };
import type { TrpcContext } from "../_core/context";
import {
  createCatalogProduct,
  serializeCatalogProducts,
  type ProductCatalogRecord,
} from "@shared/alpha/productCatalog";
import { defaultInput, type PricingInput } from "@shared/alpha/pricing";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

const mockedGetDb = vi.mocked(getDb);

type CatalogInsertRow = Parameters<CatalogStore["create"]>[0];

type TestUser = User & { isCron?: boolean };

class MemoryCatalogStore implements CatalogStore {
  private readonly rows = new Map<string, StoredCatalogRow>();

  private key(ownerId: number, id: string): string {
    return `${ownerId}:${id}`;
  }

  seed(row: StoredCatalogRow): void {
    this.rows.set(this.key(row.ownerId, row.id), structuredClone(row));
  }

  async list(ownerId: number): Promise<StoredCatalogRow[]> {
    return [...this.rows.values()]
      .filter(row => row.ownerId === ownerId)
      .map(row => structuredClone(row));
  }

  async find(
    ownerId: number,
    id: string
  ): Promise<StoredCatalogRow | undefined> {
    const row = this.rows.get(this.key(ownerId, id));
    return row ? structuredClone(row) : undefined;
  }

  async create(row: CatalogInsertRow): Promise<void> {
    const key = this.key(row.ownerId, row.id);
    if (this.rows.has(key)) {
      const error = Object.assign(new Error("Duplicate entry"), {
        code: "ER_DUP_ENTRY",
      });
      throw error;
    }
    const now = Date.now();
    this.rows.set(key, {
      ownerId: row.ownerId,
      id: row.id,
      recordPayload: row.recordPayload,
      version: row.version,
      createdAt: row.createdAt ?? now,
      updatedAt: row.updatedAt ?? now,
    });
  }

  async update(
    ownerId: number,
    id: string,
    expectedVersion: number,
    recordPayload: string
  ): Promise<number> {
    const key = this.key(ownerId, id);
    const row = this.rows.get(key);
    if (!row || row.version !== expectedVersion) return 0;
    row.recordPayload = recordPayload;
    row.version += 1;
    row.updatedAt = Date.now();
    return 1;
  }

  async delete(
    ownerId: number,
    id: string,
    expectedVersion: number
  ): Promise<number> {
    const key = this.key(ownerId, id);
    const row = this.rows.get(key);
    if (!row || row.version !== expectedVersion) return 0;
    this.rows.delete(key);
    return 1;
  }
}

function context(user: TestUser | null): TrpcContext {
  return {
    user,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function user(id: number): TestUser {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id,
    openId: `user-${id}`,
    name: `User ${id}`,
    email: `user-${id}@example.test`,
    loginMethod: "manus",
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

function record(
  id: string,
  description: string,
  now = "2026-01-01T00:00:00.000Z"
): ProductCatalogRecord {
  const input: PricingInput = {
    ...structuredClone(defaultInput),
    description,
    productSku: `SKU-${id}`,
  };
  return createCatalogProduct(
    { input, goal: 120, mode: "target" },
    { id, now }
  );
}

function payload(value: ProductCatalogRecord): string {
  return serializeCatalogProducts([value]);
}

function stored(
  ownerId: number,
  value: ProductCatalogRecord,
  version = 1
): StoredCatalogRow {
  const createdAt = Date.parse(value.createdAt);
  const updatedAt = Date.parse(value.updatedAt);
  return {
    ownerId,
    id: value.id,
    recordPayload: payload(value),
    version,
    createdAt,
    updatedAt,
  };
}

function testRouter(store: MemoryCatalogStore) {
  return createCatalogRouter({ getStore: async () => store });
}

describe("catalog CRUD router", () => {
  beforeEach(() => {
    mockedGetDb.mockReset();
  });

  it("requires an authenticated user for listing, saving, and deleting", async () => {
    const caller = appRouter.createCaller(context(null));
    const sample = record("unauth", "Unauthenticated product");

    await expect(caller.catalog.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller.catalog.save({ payload: payload(sample), expectedVersion: null })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.catalog.delete({ id: sample.id, expectedVersion: 1 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects cron and non-positive synthetic identities", async () => {
    const cron = { ...user(-1), isCron: true };
    const caller = testRouter(new MemoryCatalogStore()).createCaller(
      context(cron)
    );

    await expect(caller.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("fails explicitly when the database is unavailable", async () => {
    mockedGetDb.mockResolvedValue(null);
    await expect(
      appRouter.createCaller(context(user(1))).catalog.list()
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("lists only the owner rows, preserves creation time on update, and deletes conditionally", async () => {
    const store = new MemoryCatalogStore();
    const first = record("first", "Primeiro", "2026-01-01T00:00:00.000Z");
    const second = record("second", "Segundo", "2026-01-02T00:00:00.000Z");
    const other = record("other", "Outro", "2026-01-03T00:00:00.000Z");
    store.seed(stored(1, first));
    store.seed(stored(1, second));
    store.seed(stored(2, other));
    const caller = testRouter(store).createCaller(context(user(1)));

    const listed = await caller.list();
    expect(listed.map(item => item.record.id).sort()).toEqual([
      "first",
      "second",
    ]);
    expect(listed.every(item => item.version === 1)).toBe(true);

    const spoofed = {
      ...first,
      createdAt: "2099-12-31T23:59:59.000Z",
      updatedAt: "2099-12-31T23:59:59.000Z",
      input: { ...first.input, description: "Primeiro atualizado" },
    };
    const updated = await caller.save({
      payload: payload(spoofed),
      expectedVersion: 1,
    });
    expect(updated.version).toBe(2);
    expect(updated.record.input.description).toBe("Primeiro atualizado");
    expect(updated.record.createdAt).toBe(first.createdAt);
    expect(updated.record.createdAt).not.toBe(spoofed.createdAt);

    await expect(
      caller.delete({ id: second.id, expectedVersion: 1 })
    ).resolves.toEqual({ success: true });
    expect((await caller.list()).map(item => item.record.id)).toEqual([
      "first",
    ]);
  });

  it("does not leak or mutate another owner's row", async () => {
    const store = new MemoryCatalogStore();
    const privateRecord = record("private", "Private owner two");
    store.seed(stored(2, privateRecord));
    const caller = testRouter(store).createCaller(context(user(1)));

    expect(await caller.list()).toEqual([]);
    await expect(
      caller.save({ payload: payload(privateRecord), expectedVersion: 1 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      caller.delete({ id: privateRecord.id, expectedVersion: 1 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await store.find(2, privateRecord.id)).toMatchObject({ version: 1 });
  });

  it("returns a conflict for duplicate create ids owned by the caller", async () => {
    const store = new MemoryCatalogStore();
    const existing = record("same-id", "Existing");
    store.seed(stored(1, existing));
    const caller = testRouter(store).createCaller(context(user(1)));

    await expect(
      caller.save({ payload: payload(existing), expectedVersion: null })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("detects concurrent optimistic-version writes and stale deletes", async () => {
    const store = new MemoryCatalogStore();
    const original = record("concurrent", "Original");
    store.seed(stored(1, original));
    const caller = testRouter(store).createCaller(context(user(1)));
    const nextA = {
      ...original,
      input: { ...original.input, description: "A" },
    };
    const nextB = {
      ...original,
      input: { ...original.input, description: "B" },
    };

    const results = await Promise.allSettled([
      caller.save({ payload: payload(nextA), expectedVersion: 1 }),
      caller.save({ payload: payload(nextB), expectedVersion: 1 }),
    ]);
    expect(
      results.filter(result => result.status === "fulfilled")
    ).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { code: "CONFLICT" },
    });

    await expect(
      caller.delete({ id: original.id, expectedVersion: 1 })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects oversized, malformed, and multi-record payloads", async () => {
    const store = new MemoryCatalogStore();
    const caller = testRouter(store).createCaller(context(user(1)));
    const sample = record("validation", "Validation");

    await expect(
      caller.save({ payload: "x".repeat(1_048_577), expectedVersion: null })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.save({ payload: "not-json", expectedVersion: null })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.save({
        payload: serializeCatalogProducts([sample, record("second", "Second")]),
        expectedVersion: null,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await caller.list()).toEqual([]);
  });
});
