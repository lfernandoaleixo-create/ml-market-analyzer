import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import type { AlphaPdfExport } from "../../drizzle/alphaSchema";
import type { TrpcContext } from "../_core/context";
import { MAX_PDF_BYTES, attachPdfInputSchema, preparePdf, type AttachPdfInput, type PreparedPdf } from "./documentContracts";
import { PDF_LEASE_MS, type PdfExportStore, type StoredUpload } from "./documentStore";
import { createDocumentsRouter } from "./documentsRouter";

// No database or network operations are permitted in this suite.
vi.mock("../db", () => ({ getDb: vi.fn(() => { throw new Error("Real DB forbidden in Alpha unit tests"); }) }));
vi.mock("../storage", () => ({ storagePut: vi.fn(() => { throw new Error("Real upload forbidden in Alpha unit tests"); }) }));

const exportId = "22222222-2222-4222-8222-222222222222";
const pdf = Buffer.from("%PDF-1.7\nmock document\n%%EOF");
const input = (overrides: Partial<AttachPdfInput> = {}): AttachPdfInput => ({
  exportId, reportId: "report-uuid-not-catalog-id", filename: "Relatorio Alpha.pdf",
  base64: pdf.toString("base64"), description: "Produto histórico", sku: "SKU-01",
  options: { scope: "selected", printMode: "duplex", includeProductSheet: true }, ...overrides,
});
const ctx = (id: number | null = 1, isCron = false): TrpcContext => ({
  user: id === null ? null : { id, isCron, openId: `owner-${id}`, name: null, email: null,
    role: "admin", loginMethod: "password", createdAt: new Date(0), updatedAt: new Date(0), lastSignedIn: new Date(0) },
  req: {} as TrpcContext["req"], res: {} as TrpcContext["res"],
});
const conflict = () => new TRPCError({ code: "CONFLICT" });

/** Atomic in-memory equivalent of the store boundary; test doubles never perform I/O. */
class MemoryStore implements PdfExportStore {
  rows = new Map<string, AlphaPdfExport>();
  products = new Map([[42, { createdBy: 999 }]]); // shared project, not actor-owned
  documents: { id: number; productId: number; uploadedBy: number; createdAt: Date }[] = [];
  failFinalize = 0;
  failCheckpoint = 0;
  failMark = 0;
  private key(owner: number, id: string) { return `${owner}:${id}`; }
  async list(ownerId: number) {
    return [...this.rows.values()].filter(row => row.ownerId === ownerId && row.status === "ready")
      .sort((a, b) => b.createdAt - a.createdAt).map(row => structuredClone(row));
  }
  async reserve(ownerId: number, metadata: PreparedPdf, token: string, now: number) {
    const key = this.key(ownerId, metadata.exportId);
    const existing = this.rows.get(key);
    if (existing) {
      if (existing.sha256 !== metadata.sha256 || existing.byteSize !== metadata.byteSize ||
          existing.contextHash !== metadata.contextHash) throw conflict();
      if (existing.status === "ready") return { row: structuredClone(existing), alreadyExists: true };
      if (existing.status === "pending" && (existing.leaseExpiresAt ?? 0) > now) throw conflict();
    }
    if (metadata.projectId !== null && !this.products.has(metadata.projectId)) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    const row: AlphaPdfExport = { ownerId, ...metadata, createdAt: now, documentId: null,
      key: null, url: null, uploadedAt: null, ...existing, status: "pending",
      leaseToken: token, leaseExpiresAt: now + PDF_LEASE_MS, updatedAt: now, lastError: null };
    this.rows.set(key, row);
    return { row: structuredClone(row), alreadyExists: false };
  }
  private leased(ownerId: number, id: string, token: string) {
    const row = this.rows.get(this.key(ownerId, id));
    if (!row || row.status !== "pending" || row.leaseToken !== token) throw conflict();
    return row;
  }
  async checkpoint(ownerId: number, id: string, token: string, upload: StoredUpload, now: number) {
    if (this.failCheckpoint-- > 0) throw new Error("DB checkpoint down");
    Object.assign(this.leased(ownerId, id, token), upload, { uploadedAt: now, updatedAt: now,
      leaseExpiresAt: now + PDF_LEASE_MS });
  }
  async finalize(ownerId: number, id: string, token: string, now: number) {
    const row = this.leased(ownerId, id, token);
    if (row.projectId !== null && !this.products.has(row.projectId)) throw new TRPCError({ code: "NOT_FOUND" });
    // Model a transaction failure after hypothetical insert: neither document nor ready commits.
    if (this.failFinalize-- > 0) throw new Error("DB finalization rollback");
    if (!row.key || !row.url) throw new Error("Checkpoint required");
    if (row.projectId !== null) {
      row.documentId = 1_500_000_001 + this.documents.length;
      this.documents.push({ id: row.documentId, productId: row.projectId, uploadedBy: ownerId, createdAt: new Date(now) });
    }
    Object.assign(row, { status: "ready", leaseToken: null, leaseExpiresAt: null, updatedAt: now });
    return structuredClone(row);
  }
  async fail(ownerId: number, id: string, token: string, now: number) {
    if (this.failMark-- > 0) throw new Error("DB down");
    const row = this.rows.get(this.key(ownerId, id));
    if (row?.status === "pending" && row.leaseToken === token) Object.assign(row,
      { status: "failed", leaseToken: null, leaseExpiresAt: null, updatedAt: now });
  }
}

function setup() {
  const store = new MemoryStore();
  let clock = Date.UTC(2026, 10, 6, 11, 0, 0);
  let tokens = 0;
  const put = vi.fn(async () => ({ key: "alpha/staged.pdf", url: "/manus-storage/alpha/staged.pdf" }));
  const getStore = vi.fn(async () => store);
  const api = createDocumentsRouter({ getStore, put, now: () => clock, token: () => `lease-${++tokens}` });
  return { store, put, getStore, api, caller: api.createCaller(ctx()), advance: (ms: number) => { clock += ms; } };
}

describe("Alpha PDF documents exact API (mock dependencies only)", () => {
  it("always saves centrally, returns only exact public fields, and lists newest owner entries", async () => {
    const { caller, api, put, store, advance } = setup();
    const first = await caller.attachPdf(input());
    expect(first).toEqual({ exportId, reportId: "report-uuid-not-catalog-id", filename: "Relatorio Alpha.pdf",
      url: "/manus-storage/alpha/staged.pdf", key: "alpha/staged.pdf", sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      byteSize: pdf.length, projectProductId: null, documentId: null, description: "Produto histórico", sku: "SKU-01",
      createdAt: Date.UTC(2026, 10, 6, 11, 0, 0), alreadyExists: false });
    expect(put).toHaveBeenCalledWith(`alpha/1/pdf/${exportId}/Relatorio Alpha.pdf`, pdf, "application/pdf");
    advance(1000);
    const newerId = "33333333-3333-4333-8333-333333333333";
    await caller.attachPdf(input({ exportId: newerId }));
    expect((await caller.list(undefined)).map(row => row.exportId)).toEqual([newerId, exportId]);
    expect(await api.createCaller(ctx(2)).list(undefined)).toEqual([]);
    expect(store.documents).toHaveLength(0);
  });

  it("attaches to existing shared project by numeric ID using real document ID and actor", async () => {
    const { caller, store } = setup();
    const result = await caller.attachPdf(input({ projectProductId: 42 }));
    expect(result.projectProductId).toBe(42);
    expect(result.documentId).toBe(1_500_000_001);
    expect(store.documents).toEqual([{ id: 1_500_000_001, productId: 42, uploadedBy: 1, createdAt: expect.any(Date) }]);
    expect(store.products.get(42)?.createdBy).toBe(999);
  });

  it("same export/hash/context is idempotent without duplicate uploads/documents", async () => {
    const { caller, put, store } = setup();
    const first = await caller.attachPdf(input({ projectProductId: 42 }));
    const second = await caller.attachPdf(input({ projectProductId: 42 }));
    expect(second).toEqual({ ...first, alreadyExists: true });
    expect(put).toHaveBeenCalledTimes(1);
    expect(store.documents).toHaveLength(1);
  });

  it.each([
    { base64: Buffer.from("%PDF-1.7\ndifferent").toString("base64") },
    { description: "Alterado" }, { sku: "OUTRO" }, { reportId: "other-report" },
    { filename: "Outro.pdf" }, { projectProductId: 42 }, { snapshotPayload: "{}" },
    { options: { scope: "complete" as const, printMode: "duplex" as const, includeProductSheet: true } },
  ])("rejects same exportId with changed hash or context: %j", async override => {
    const { caller, put } = setup();
    await caller.attachPdf(input());
    await expect(caller.attachPdf(input(override))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("storage failure marks failed and retry succeeds", async () => {
    const { caller, put, store } = setup();
    put.mockRejectedValueOnce(new Error("Upload failed"));
    await expect(caller.attachPdf(input())).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect([...store.rows.values()][0]).toMatchObject({ status: "failed", key: null });
    const result = await caller.attachPdf(input());
    expect(result.alreadyExists).toBe(false);
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("transient checkpoint failure retries metadata persistence, not external upload", async () => {
    const { caller, put, store } = setup();
    store.failCheckpoint = 1;
    await caller.attachPdf(input());
    expect(put).toHaveBeenCalledTimes(1);
    expect([...store.rows.values()][0]).toMatchObject({ status: "ready", key: "alpha/staged.pdf" });
  });

  it("DB finalization failure rolls back document+ready and retry reuses staged file", async () => {
    const { caller, put, store } = setup();
    store.failFinalize = 1;
    await expect(caller.attachPdf(input({ projectProductId: 42 }))).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect([...store.rows.values()][0]).toMatchObject({ status: "failed", key: "alpha/staged.pdf", documentId: null });
    expect(store.documents).toHaveLength(0);
    expect(await caller.list()).toEqual([]);
    await caller.attachPdf(input({ projectProductId: 42 }));
    expect(put).toHaveBeenCalledTimes(1);
    expect(store.documents).toHaveLength(1);
  });

  it("in-flight upload collision returns CONFLICT and never starts another upload", async () => {
    const { caller, put } = setup();
    let resolveUpload!: (value: StoredUpload) => void;
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    put.mockImplementationOnce(() => { started(); return new Promise(resolve => { resolveUpload = resolve; }); });
    const pending = caller.attachPdf(input());
    await entered;
    await expect(caller.attachPdf(input())).rejects.toMatchObject({ code: "CONFLICT" });
    resolveUpload({ key: "staged.pdf", url: "/manus-storage/staged.pdf" });
    await pending;
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("stale lease after database outage is reclaimable and staged upload is reused", async () => {
    const { caller, put, store, advance } = setup();
    store.failFinalize = 1; store.failMark = 1;
    await expect(caller.attachPdf(input())).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    await expect(caller.attachPdf(input())).rejects.toMatchObject({ code: "CONFLICT" });
    advance(PDF_LEASE_MS + 1);
    await caller.attachPdf(input());
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("old worker cannot finalize or fail a newer lease", async () => {
    const { store } = setup();
    const { metadata } = preparePdf(input());
    await store.reserve(1, metadata, "old", 0);
    await store.reserve(1, metadata, "new", PDF_LEASE_MS + 1);
    await expect(store.checkpoint(1, exportId, "old", { key: "old", url: "/old" }, PDF_LEASE_MS + 2)).rejects.toMatchObject({ code: "CONFLICT" });
    await store.fail(1, exportId, "old", PDF_LEASE_MS + 2);
    expect([...store.rows.values()][0]?.leaseToken).toBe("new");
  });

  it("same exportId belongs independently to owner namespace and cannot reveal another owner", async () => {
    const { caller, api, put } = setup();
    await caller.attachPdf(input());
    const ownerTwo = api.createCaller(ctx(2));
    await ownerTwo.attachPdf(input({ description: "Owner two different context" }));
    expect(await ownerTwo.list()).toEqual([expect.objectContaining({ description: "Owner two different context" })]);
    expect(await caller.list()).toEqual([expect.objectContaining({ description: "Produto histórico" })]);
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("missing project never creates products or uploads and cannot identify projects by SKU/name", async () => {
    const { caller, put, store } = setup();
    await expect(caller.attachPdf(input({ projectProductId: 123 }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(put).not.toHaveBeenCalled(); expect(store.rows.size).toBe(0); expect(store.products.size).toBe(1);
    const central = await caller.attachPdf(input({ sku: "42", description: "Existing project name" }));
    expect(central.projectProductId).toBeNull(); expect(central.documentId).toBeNull();
  });

  it("project removal after checkpoint prevents finalization but retains staged bytes for recovery", async () => {
    const { caller, put, store } = setup();
    put.mockImplementationOnce(async () => { store.products.delete(42); return { key: "staged", url: "/staged" }; });
    await expect(caller.attachPdf(input({ projectProductId: 42 }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.documents).toHaveLength(0);
    expect([...store.rows.values()][0]?.key).toBe("staged");
  });

  it("rejects unauthenticated, cron and synthetic actors before resolving storage dependencies", async () => {
    const { api, getStore, put } = setup();
    for (const context of [ctx(null), ctx(-1, true), ctx(0), ctx(1, true)]) {
      const caller = api.createCaller(context);
      const code = context.user === null ? "UNAUTHORIZED" : "FORBIDDEN";
      await expect(caller.list()).rejects.toMatchObject({ code });
      await expect(caller.attachPdf(input())).rejects.toMatchObject({ code });
    }
    expect(getStore).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
  });

  it("client cannot submit user/owner/createdAt or unexpected fields", async () => {
    const { caller, getStore } = setup();
    for (const fields of [{ ownerId: 2 }, { user: { id: 2 } }, { uploadedBy: 2 }, { createdAt: 999 }]) {
      await expect(caller.attachPdf({ ...input(), ...fields })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(getStore).not.toHaveBeenCalled();
  });
});

describe("Strict PDF input validation", () => {
  it.each(["", "not pdf", "JVBERi0=\n", "data:application/pdf;base64,JVBERi0=", "JVBERi0===", "JVBE=Ri0", "JVBERi1=",
    Buffer.from("not a PDF").toString("base64"), Buffer.from([0xa5, 0xd0, 0xc4, 0xc6, 0xad]).toString("base64")])(
    "rejects invalid base64/signature %s", async base64 => {
      const { caller, getStore } = setup();
      await expect(caller.attachPdf(input({ base64 }))).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(getStore).not.toHaveBeenCalled();
    });
  it.each(["../bad.pdf", "foo/bar.pdf", "foo\\bar.pdf", "bad\n.pdf", ".hidden.pdf", "report.txt", " report.pdf", "evil<script>.pdf"])(
    "rejects unsafe filename %s", filename => {
      expect(attachPdfInputSchema.safeParse(input({ filename })).success).toBe(false);
    });
  it("allows exactly 15 MB binary PDF and rejects anything larger before store I/O", async () => {
    const bytes = Buffer.alloc(MAX_PDF_BYTES, 0x20); Buffer.from("%PDF-").copy(bytes);
    expect(preparePdf(attachPdfInputSchema.parse(input({ base64: bytes.toString("base64") }))).metadata.byteSize).toBe(MAX_PDF_BYTES);
    const { caller, getStore } = setup();
    await expect(caller.attachPdf(input({ base64: Buffer.concat([bytes, Buffer.from("x")]).toString("base64") })))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getStore).not.toHaveBeenCalled();
  });
  it("validates options, snapshot size, UUID and real numeric project ID", () => {
    for (const bad of [input({ exportId: "SKU-01" }), input({ projectProductId: -1 }), input({ snapshotPayload: "x".repeat(1_048_577) }),
      { ...input(), options: { ...input().options, compactMargins: [NaN] } }]) {
      expect(attachPdfInputSchema.safeParse(bad).success).toBe(false);
    }
  });
});
