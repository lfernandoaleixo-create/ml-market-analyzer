import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { alphaPdfExports, type AlphaPdfExport } from "../../drizzle/alphaSchema";
import { projectDocuments, projectProducts } from "../../drizzle/schema";
import { getDb } from "../db";
import type { PreparedPdf } from "./documentContracts";

export const PDF_LEASE_MS = 10 * 60_000;
export type StoredUpload = { key: string; url: string };
export type PdfReservation = { row: AlphaPdfExport; alreadyExists: boolean };

/** All state-changing operations must compare leaseToken; finalize is atomic with project_documents. */
export interface PdfExportStore {
  list(ownerId: number): Promise<AlphaPdfExport[]>;
  reserve(ownerId: number, metadata: PreparedPdf, token: string, now: number): Promise<PdfReservation>;
  checkpoint(ownerId: number, exportId: string, token: string, upload: StoredUpload, now: number): Promise<void>;
  finalize(ownerId: number, exportId: string, token: string, now: number): Promise<AlphaPdfExport>;
  fail(ownerId: number, exportId: string, token: string, now: number): Promise<void>;
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
const ownerExport = (ownerId: number, exportId: string) => and(
  eq(alphaPdfExports.ownerId, ownerId), eq(alphaPdfExports.exportId, exportId));
const leasedExport = (ownerId: number, exportId: string, token: string) => and(
  ownerExport(ownerId, exportId), eq(alphaPdfExports.status, "pending"), eq(alphaPdfExports.leaseToken, token));

function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { affectedRows?: unknown } | undefined)?.affectedRows ?? 0);
}
function conflict(): never {
  throw new TRPCError({ code: "CONFLICT", message: "Exportação em processamento ou lease alterada; tente novamente em instantes." });
}
function isDuplicate(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; errno?: unknown; cause?: unknown };
  return e.code === "ER_DUP_ENTRY" || e.errno === 1062 || (!!e.cause && isDuplicate(e.cause));
}

function isLockContention(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; errno?: unknown; cause?: unknown };
  return e.code === "ER_LOCK_DEADLOCK" || e.code === "ER_LOCK_WAIT_TIMEOUT" ||
    e.errno === 1213 || e.errno === 1205 || (!!e.cause && isLockContention(e.cause));
}

export function createDrizzlePdfExportStore(db: Database): PdfExportStore {
  return {
    async list(ownerId) {
      return db.select().from(alphaPdfExports).where(and(
        eq(alphaPdfExports.ownerId, ownerId), eq(alphaPdfExports.status, "ready"),
      )).orderBy(desc(alphaPdfExports.createdAt), desc(alphaPdfExports.exportId));
    },
    async reserve(ownerId, metadata, token, now) {
      try {
        return await db.transaction(async tx => {
          const [existing] = await tx.select().from(alphaPdfExports)
            .where(ownerExport(ownerId, metadata.exportId)).limit(1).for("update");
          if (existing) {
            if (existing.sha256 !== metadata.sha256 || existing.byteSize !== metadata.byteSize ||
                existing.contextHash !== metadata.contextHash) {
              throw new TRPCError({ code: "CONFLICT", message: "exportId já utilizado com arquivo ou contexto diferente." });
            }
            if (existing.status === "ready") return { row: existing, alreadyExists: true };
            if (existing.status === "pending" && (existing.leaseExpiresAt ?? 0) > now) conflict();
          }
          // Project pipeline is shared by store: existence only, no invented createdBy ACL.
          if (metadata.projectId !== null) {
            const [product] = await tx.select({ id: projectProducts.id }).from(projectProducts)
              .where(eq(projectProducts.id, metadata.projectId)).limit(1).for("update");
            if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Produto do projeto não encontrado." });
          }
          const lease = { status: "pending" as const, leaseToken: token,
            leaseExpiresAt: now + PDF_LEASE_MS, updatedAt: now, lastError: null };
          if (existing) {
            await tx.update(alphaPdfExports).set(lease).where(ownerExport(ownerId, metadata.exportId));
            return { row: { ...existing, ...lease }, alreadyExists: false };
          }
          const row: AlphaPdfExport = {
            ownerId, ...metadata, ...lease, createdAt: now, documentId: null,
            key: null, url: null, uploadedAt: null,
          };
          await tx.insert(alphaPdfExports).values(row);
          return { row, alreadyExists: false };
        });
      } catch (error) {
        // Absent-row concurrent INSERT is fenced by the composite primary key.
        if (isDuplicate(error) || isLockContention(error)) conflict();
        throw error;
      }
    },
    async checkpoint(ownerId, exportId, token, upload, now) {
      const result = await db.update(alphaPdfExports).set({
        key: upload.key, url: upload.url, uploadedAt: now, updatedAt: now,
        leaseExpiresAt: now + PDF_LEASE_MS,
      }).where(leasedExport(ownerId, exportId, token));
      if (affectedRows(result) !== 1) conflict();
    },
    async finalize(ownerId, exportId, token, now) {
      return db.transaction(async tx => {
        const [row] = await tx.select().from(alphaPdfExports)
          .where(ownerExport(ownerId, exportId)).limit(1).for("update");
        if (!row || row.status !== "pending" || row.leaseToken !== token) conflict();
        if (!row.key || !row.url) throw new Error("PDF upload checkpoint missing");
        let documentId: number | null = row.documentId;
        if (row.projectId !== null) {
          const [product] = await tx.select({ id: projectProducts.id }).from(projectProducts)
            .where(eq(projectProducts.id, row.projectId)).limit(1).for("update");
          if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Produto do projeto não encontrado." });
          // Existing timestamp column expects Date (not an epoch number).
          const [inserted] = await tx.insert(projectDocuments).values({
            productId: row.projectId, name: row.filename, url: row.url, fileKey: row.key,
            type: "documento", uploadedBy: ownerId, createdAt: new Date(now),
          }).$returningId();
          if (!inserted || !Number.isSafeInteger(inserted.id) || inserted.id <= 0) {
            throw new Error("Project document insert did not return a valid id");
          }
          documentId = inserted.id;
        }
        const ready = { status: "ready" as const, documentId, updatedAt: now,
          leaseToken: null, leaseExpiresAt: null, lastError: null };
        const result = await tx.update(alphaPdfExports).set(ready)
          .where(leasedExport(ownerId, exportId, token));
        if (affectedRows(result) !== 1) conflict();
        return { ...row, ...ready };
      });
    },
    async fail(ownerId, exportId, token, now) {
      // Ready rows and a newer worker's lease are never overwritten; staged metadata survives.
      await db.update(alphaPdfExports).set({ status: "failed", leaseToken: null,
        leaseExpiresAt: null, updatedAt: now, lastError: "PDF_EXPORT_FAILED" })
        .where(leasedExport(ownerId, exportId, token));
    },
  };
}

export async function defaultPdfExportStore(): Promise<PdfExportStore> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Banco de exportações Alpha indisponível." });
  return createDrizzlePdfExportStore(db);
}
