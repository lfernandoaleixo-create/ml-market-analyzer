import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { alphaCatalogProducts as catalogProducts } from "../../drizzle/alphaSchema";
import {
  parseCatalogProducts,
  serializeCatalogProducts,
  type ProductCatalogRecord,
} from "@shared/alpha/productCatalog";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const MAX_PAYLOAD_BYTES = 1_048_576;
const CATALOG_ACCESS_MESSAGE =
  "O catálogo de produtos exige uma conta de usuário autenticada.";
const DATABASE_UNAVAILABLE_MESSAGE =
  "O banco de dados do catálogo de produtos está indisponível.";

export type StoredCatalogRow = {
  ownerId: number;
  id: string;
  recordPayload: string;
  version: number;
  createdAt: number;
  updatedAt: number;
};

/**
 * Small storage boundary used by the router. Keeping it separate from the
 * Drizzle adapter makes the CRUD contract unit-testable without database I/O.
 */
export interface CatalogStore {
  list(ownerId: number): Promise<StoredCatalogRow[]>;
  find(ownerId: number, id: string): Promise<StoredCatalogRow | undefined>;
  create(
    row: Omit<StoredCatalogRow, "createdAt" | "updatedAt"> &
      Partial<Pick<StoredCatalogRow, "createdAt" | "updatedAt">>
  ): Promise<void>;
  update(
    ownerId: number,
    id: string,
    expectedVersion: number,
    recordPayload: string
  ): Promise<number>;
  delete(ownerId: number, id: string, expectedVersion: number): Promise<number>;
}

type CatalogDatabase = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type CatalogInput = {
  payload: string;
  expectedVersion?: number | null;
};

const saveInput = z.object({
  payload: z.string().superRefine((payload, ctx) => {
    if (new TextEncoder().encode(payload).byteLength > MAX_PAYLOAD_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: `O payload deve ter no máximo ${MAX_PAYLOAD_BYTES} bytes.`,
      });
    }
  }),
  expectedVersion: z.number().int().positive().nullable().optional(),
}) satisfies z.ZodType<CatalogInput>;

const deleteInput = z.object({
  id: z.string().min(1).max(256),
  expectedVersion: z.number().int().positive(),
});

function trpcError(
  code:
    | "BAD_REQUEST"
    | "CONFLICT"
    | "FORBIDDEN"
    | "INTERNAL_SERVER_ERROR"
    | "NOT_FOUND"
    | "PRECONDITION_FAILED",
  message: string
): TRPCError {
  return new TRPCError({ code, message });
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    errno?: unknown;
    message?: unknown;
  };
  return (
    candidate.code === "ER_DUP_ENTRY" ||
    candidate.code === "1062" ||
    candidate.errno === 1062 ||
    (typeof candidate.message === "string" &&
      /duplicate entry|duplicate key/i.test(candidate.message))
  );
}

function affectedRows(result: unknown): number {
  // Drizzle's mysql2 adapter returns [ResultSetHeader, FieldPacket[]]. Keep
  // the direct ResultSetHeader form too for compatible test/driver adapters.
  const header = Array.isArray(result) ? result[0] : result;
  if (!header || typeof header !== "object") return 0;
  const value = (header as { affectedRows?: unknown }).affectedRows;
  return typeof value === "number" ? value : Number(value ?? 0);
}

function parseSingleRecord(payload: string): ProductCatalogRecord {
  try {
    const records = parseCatalogProducts(payload);
    if (records.length !== 1 || !records[0]) {
      throw new Error(
        "O payload deve conter exatamente um registro de produto."
      );
    }
    return records[0];
  } catch (error) {
    throw trpcError("BAD_REQUEST", "O payload do produto é inválido.");
  }
}

function parseStoredSingleRecord(row: StoredCatalogRow): ProductCatalogRecord {
  try {
    const records = parseCatalogProducts(row.recordPayload);
    if (records.length !== 1 || !records[0]) {
      throw new Error(
        "O payload armazenado não contém exatamente um registro de produto."
      );
    }
    return records[0];
  } catch {
    throw trpcError(
      "INTERNAL_SERVER_ERROR",
      "Um registro armazenado do catálogo de produtos é inválido."
    );
  }
}

function serverRecord(
  record: ProductCatalogRecord,
  createdAt: string | undefined
): ProductCatalogRecord {
  const now = new Date().toISOString();
  return {
    ...record,
    createdAt: createdAt ?? now,
    updatedAt: now,
  };
}

function assertRealUser(user: { id: number; isCron?: boolean }): number {
  if (user.isCron || !Number.isInteger(user.id) || user.id <= 0) {
    throw trpcError("FORBIDDEN", CATALOG_ACCESS_MESSAGE);
  }
  return user.id;
}

function createDrizzleStore(db: CatalogDatabase): CatalogStore {
  return {
    async list(ownerId) {
      return db
        .select()
        .from(catalogProducts)
        .where(eq(catalogProducts.ownerId, ownerId))
        .orderBy(desc(catalogProducts.updatedAt));
    },

    async find(ownerId, id) {
      const rows = await db
        .select()
        .from(catalogProducts)
        .where(
          and(eq(catalogProducts.ownerId, ownerId), eq(catalogProducts.id, id))
        )
        .limit(1);
      return rows[0];
    },

    async create(row) {
      await db.insert(catalogProducts).values({
        ownerId: row.ownerId,
        id: row.id,
        recordPayload: row.recordPayload,
        version: row.version,
        createdAt: row.createdAt ?? Date.now(),
        updatedAt: row.updatedAt ?? Date.now(),
      });
    },

    async update(ownerId, id, expectedVersion, recordPayload) {
      const result = await db
        .update(catalogProducts)
        .set({
          recordPayload,
          updatedAt: Date.now(),
          version: sql`${catalogProducts.version} + 1`,
        })
        .where(
          and(
            eq(catalogProducts.ownerId, ownerId),
            eq(catalogProducts.id, id),
            eq(catalogProducts.version, expectedVersion)
          )
        );
      return affectedRows(result);
    },

    async delete(ownerId, id, expectedVersion) {
      const result = await db
        .delete(catalogProducts)
        .where(
          and(
            eq(catalogProducts.ownerId, ownerId),
            eq(catalogProducts.id, id),
            eq(catalogProducts.version, expectedVersion)
          )
        );
      return affectedRows(result);
    },
  };
}

async function defaultStore(): Promise<CatalogStore> {
  let db: CatalogDatabase | null;
  try {
    db = await getDb();
  } catch {
    db = null;
  }
  if (!db) {
    throw trpcError("PRECONDITION_FAILED", DATABASE_UNAVAILABLE_MESSAGE);
  }
  return createDrizzleStore(db);
}

type CatalogRouterDependencies = {
  getStore?: () => Promise<CatalogStore>;
};

export function createCatalogRouter(
  dependencies: CatalogRouterDependencies = {}
) {
  const resolveStore = dependencies.getStore ?? defaultStore;

  return router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const ownerId = assertRealUser(ctx.user);
      const store = await resolveStore();
      const rows = await store.list(ownerId);
      return rows.map(row => ({
        record: parseStoredSingleRecord(row),
        version: row.version,
      }));
    }),

    save: protectedProcedure
      .input(saveInput)
      .mutation(async ({ ctx, input }) => {
        const ownerId = assertRealUser(ctx.user);
        const record = parseSingleRecord(input.payload);
        const store = await resolveStore();
        const expectedVersion = input.expectedVersion ?? null;

        if (expectedVersion === null) {
          const normalized = serverRecord(record, undefined);
          try {
            await store.create({
              ownerId,
              id: normalized.id,
              recordPayload: serializeCatalogProducts([normalized]),
              version: 1,
            });
          } catch (error) {
            if (isDuplicateKeyError(error)) {
              throw trpcError("CONFLICT", "Já existe um produto com este id.");
            }
            throw error;
          }
          return { record: normalized, version: 1 };
        }

        // Read only this owner's row to carry forward its authoritative creation
        // timestamp. A missing row is reported generically and never probes other
        // owners' records.
        const existing = await store.find(ownerId, record.id);
        if (!existing) {
          throw trpcError(
            "NOT_FOUND",
            "Registro do catálogo de produtos não encontrado."
          );
        }
        const existingRecord = parseStoredSingleRecord(existing);
        const normalized = serverRecord(record, existingRecord.createdAt);
        const updated = await store.update(
          ownerId,
          record.id,
          expectedVersion,
          serializeCatalogProducts([normalized])
        );

        if (updated === 0) {
          // Re-check only the same owner/id. A present row means the expected
          // version was stale; absence remains a generic not-found result.
          const current = await store.find(ownerId, record.id);
          throw trpcError(
            current ? "CONFLICT" : "NOT_FOUND",
            current
              ? "O registro do catálogo de produtos mudou; recarregue antes de salvar novamente."
              : "Registro do catálogo de produtos não encontrado."
          );
        }

        return { record: normalized, version: expectedVersion + 1 };
      }),

    delete: protectedProcedure
      .input(deleteInput)
      .mutation(async ({ ctx, input }) => {
        const ownerId = assertRealUser(ctx.user);
        const store = await resolveStore();
        const deleted = await store.delete(
          ownerId,
          input.id,
          input.expectedVersion
        );
        if (deleted === 0) {
          const current = await store.find(ownerId, input.id);
          throw trpcError(
            current ? "CONFLICT" : "NOT_FOUND",
            current
              ? "O registro do catálogo de produtos mudou; recarregue antes de excluir."
              : "Registro do catálogo de produtos não encontrado."
          );
        }
        return { success: true } as const;
      }),
  });
}

export const catalogRouter = createCatalogRouter();
