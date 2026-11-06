import { describe, expect, it, vi } from "vitest";
import { alphaPdfExports, type AlphaPdfExport } from "../../drizzle/alphaSchema";
import { projectDocuments, projectProducts } from "../../drizzle/schema";
import { createDrizzlePdfExportStore, PDF_LEASE_MS } from "./documentStore";
import { preparePdf, type AttachPdfInput } from "./documentContracts";

const input: AttachPdfInput = { exportId: "44444444-4444-4444-8444-444444444444", reportId: "report",
  filename: "Alpha.pdf", base64: Buffer.from("%PDF-1.7 mock").toString("base64"), description: "produto",
  sku: "SKU", projectProductId: 42, options: { scope: "selected", printMode: "duplex", includeProductSheet: false } };
const metadata = preparePdf(input).metadata;
const row = (patch: Partial<AlphaPdfExport> = {}): AlphaPdfExport => ({ ownerId: 1, ...metadata,
  documentId: null, status: "pending", leaseToken: "token", leaseExpiresAt: 5000,
  key: "staged", url: "/manus-storage/staged", uploadedAt: 100, lastError: null, createdAt: 1, updatedAt: 100, ...patch });

/** Only a method-call recorder: does not compile or execute any SQL or connect anywhere. */
function fakeDb(selectRows: unknown[][]) {
  const selectedTables: unknown[] = [];
  const updates: { table: unknown; values: Record<string, unknown> }[] = [];
  const inserts: { table: unknown; values: Record<string, unknown> }[] = [];
  let committed = false;
  let returningId = 1_700_000_123;
  let updateError: Error | undefined;
  let insertError: Error | undefined;
  const db: Record<string, unknown> = {};
  db.select = vi.fn(() => ({ from: (table: unknown) => {
    selectedTables.push(table);
    const resolve = () => Promise.resolve(selectRows.shift() ?? []);
    const chain = { where: () => chain, limit: () => chain, for: resolve, orderBy: resolve };
    return chain;
  } }));
  db.update = vi.fn((table: unknown) => ({ set: (values: Record<string, unknown>) => {
    updates.push({ table, values });
    return { where: async () => { if (updateError) throw updateError; return [{ affectedRows: 1 }, []]; } };
  } }));
  db.insert = vi.fn((table: unknown) => ({ values: (values: Record<string, unknown>) => {
    inserts.push({ table, values });
    const result = Promise.resolve();
    return { then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      if (insertError) return Promise.reject(insertError).then(resolve, reject);
      return result.then(resolve, reject);
    }, $returningId: async () => [{ id: returningId }] };
  } }));
  db.transaction = vi.fn(async (body: (tx: unknown) => Promise<unknown>) => {
    const value = await body(db); committed = true; return value;
  });
  const store = createDrizzlePdfExportStore(db as unknown as Parameters<typeof createDrizzlePdfExportStore>[0]);
  return { store, db, selectedTables, updates, inserts, isCommitted: () => committed,
    setId: (id: number) => { returningId = id; }, setUpdateError: (error: Error) => { updateError = error; },
    setInsertError: (error: Error) => { insertError = error; } };
}

describe("Alpha Drizzle PDF adapter (no SQL, method-call mocks)", () => {
  it("transactionally inserts project_documents and marks ready with the actual returningId", async () => {
    const test = fakeDb([[row()], [{ id: 42, createdBy: 999 }]]);
    const result = await test.store.finalize(1, input.exportId, "token", 9000);
    expect(test.db.transaction).toHaveBeenCalledTimes(1);
    expect(test.selectedTables).toEqual([alphaPdfExports, projectProducts]);
    expect(test.inserts).toEqual([{ table: projectDocuments, values: {
      productId: 42, name: "Alpha.pdf", url: "/manus-storage/staged", fileKey: "staged",
      type: "documento", uploadedBy: 1, createdAt: new Date(9000),
    } }]);
    expect(test.updates[0]).toMatchObject({ table: alphaPdfExports, values: { status: "ready", documentId: 1_700_000_123 } });
    expect(result.documentId).toBe(1_700_000_123);
    expect(test.isCommitted()).toBe(true);
  });
  it("never commits if update to ready fails after the document insert", async () => {
    const test = fakeDb([[row()], [{ id: 42 }]]);
    test.setUpdateError(new Error("DB ready update failed"));
    await expect(test.store.finalize(1, input.exportId, "token", 9000)).rejects.toThrow("DB ready update failed");
    expect(test.inserts).toHaveLength(1);
    expect(test.isCommitted()).toBe(false);
  });
  it("does not insert a document for central-only export", async () => {
    const test = fakeDb([[row({ projectId: null })]]);
    const ready = await test.store.finalize(1, input.exportId, "token", 9000);
    expect(ready.documentId).toBeNull(); expect(test.inserts).toHaveLength(0);
  });
  it("requires an actual insert ID rather than guessing one", async () => {
    const test = fakeDb([[row()], [{ id: 42 }]]); test.setId(0);
    await expect(test.store.finalize(1, input.exportId, "token", 9000)).rejects.toThrow("valid id");
    expect(test.isCommitted()).toBe(false);
  });
  it("rejects vanished product before document insertion", async () => {
    const test = fakeDb([[row()], []]);
    await expect(test.store.finalize(1, input.exportId, "token", 9000)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(test.inserts).toHaveLength(0); expect(test.isCommitted()).toBe(false);
  });
  it("reserves metadata only and validates the project without imposing createdBy ownership", async () => {
    const test = fakeDb([[], [{ id: 42, createdBy: 999 }]]);
    const reserved = await test.store.reserve(1, metadata, "token", 9000);
    expect(reserved.row).toMatchObject({ ownerId: 1, status: "pending", leaseExpiresAt: 9000 + PDF_LEASE_MS });
    expect(test.inserts[0]?.table).toBe(alphaPdfExports);
    expect(test.inserts[0]?.values).not.toHaveProperty("base64");
    expect(test.inserts[0]?.values).not.toHaveProperty("bytes");
  });
  it("duplicate create race becomes CONFLICT even through a driver wrapper cause", async () => {
    const test = fakeDb([[], [{ id: 42 }]]);
    test.setInsertError(Object.assign(new Error("wrapped"), { cause: { code: "ER_DUP_ENTRY", errno: 1062 } }));
    await expect(test.store.reserve(1, metadata, "token", 9000)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("deadlock contention is a retriable conflict, not an uncategorized database error", async () => {
    const test = fakeDb([[], [{ id: 42 }]]);
    test.setInsertError(Object.assign(new Error("deadlock"), { code: "ER_LOCK_DEADLOCK", errno: 1213 }));
    await expect(test.store.reserve(1, metadata, "token", 9000)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("retry ready uses the authoritative row and does not re-check or recreate project", async () => {
    const test = fakeDb([[row({ status: "ready", documentId: 1_700_000_123 })]]);
    expect(await test.store.reserve(1, metadata, "token", 9000)).toMatchObject({ alreadyExists: true });
    expect(test.selectedTables).toEqual([alphaPdfExports]); expect(test.inserts).toHaveLength(0);
  });
  it("stale reservation keeps upload checkpoint and failed transition never clears it", async () => {
    const test = fakeDb([[row({ status: "failed" })], [{ id: 42 }]]);
    const reserved = await test.store.reserve(1, metadata, "new-token", 9000);
    expect(reserved.row).toMatchObject({ key: "staged", url: "/manus-storage/staged", leaseToken: "new-token" });
    await test.store.fail(1, input.exportId, "new-token", 9001);
    expect(test.updates.at(-1)?.values).not.toHaveProperty("key");
    expect(test.updates.at(-1)?.values).not.toHaveProperty("url");
  });
});
