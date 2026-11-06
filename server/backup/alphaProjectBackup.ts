import {
  alphaCatalogProducts,
  alphaPdfExports,
  type AlphaCatalogProduct,
  type AlphaPdfExport,
} from "../../drizzle/alphaSchema";
import {
  projectProducts,
  projectDocuments,
  type ProjectProduct,
  type ProjectDocument,
} from "../../drizzle/schema";
import { getDb } from "../db";

/** Below Excel's 32767 UTF-16 code-unit limit, including astral characters. */
export const BACKUP_JSON_CHUNK_SIZE = 30_000;
export const BACKUP_JSON_CHUNK_FIELDS = [
  "formatVersion",
  "recordId",
  "ownerId",
  "chunkIndex",
  "chunkCount",
  "jsonChunk",
] as const;

export type AlphaProjectBackupRecords = {
  alphaCatalogProducts: AlphaCatalogProduct[];
  alphaPdfExports: AlphaPdfExport[];
  projectProducts: ProjectProduct[];
  projectDocuments: ProjectDocument[];
};

/** Preserve the column, but never export the transient PDF processing token. */
function withoutLeaseToken<T extends object>(row: T): T {
  return Object.prototype.hasOwnProperty.call(row, "leaseToken")
    ? { ...row, leaseToken: null }
    : row;
}

/**
 * Read all four tables through the application's real DB connection. No owner
 * filter, pagination, user joins, storage calls or writes. Connection/query
 * failures must propagate rather than presenting an incomplete backup as valid.
 * Only owner/creator/uploader numeric references are retained, not user profiles.
 * PDFs/documents are references and metadata, NOT independent binary copies.
 */
export async function loadAlphaProjectBackupRecords(): Promise<AlphaProjectBackupRecords> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable for Alpha/Project backup");

  const [catalog, pdfs, products, documents] = await Promise.all([
    db
      .select()
      .from(alphaCatalogProducts)
      .orderBy(alphaCatalogProducts.ownerId, alphaCatalogProducts.id),
    db
      .select()
      .from(alphaPdfExports)
      .orderBy(alphaPdfExports.ownerId, alphaPdfExports.exportId),
    db.select().from(projectProducts).orderBy(projectProducts.id),
    db.select().from(projectDocuments).orderBy(projectDocuments.id),
  ]);

  return {
    alphaCatalogProducts: catalog,
    alphaPdfExports: pdfs.map(withoutLeaseToken),
    projectProducts: products,
    projectDocuments: documents,
  };
}

/** Split only between Unicode characters; length is measured in UTF-16 units. */
export function splitBackupJson(json: string): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < json.length; ) {
    let end = Math.min(start + BACKUP_JSON_CHUNK_SIZE, json.length);
    if (end < json.length) {
      const last = json.charCodeAt(end - 1);
      const next = json.charCodeAt(end);
      if (
        last >= 0xd800 &&
        last <= 0xdbff &&
        next >= 0xdc00 &&
        next <= 0xdfff
      ) {
        end -= 1;
      }
    }
    chunks.push(json.slice(start, end));
    start = end;
  }
  return chunks;
}

/**
 * Technical-sheet format v1: one or more rows per FULL record, all columns
 * inside JSON (including nulls and payload strings, which are never parsed or
 * truncated). Dates serialize to ISO via Date.toJSON; numeric bigint timestamps
 * remain UTC Unix milliseconds. Native JS bigint uses lossless decimal strings.
 *
 * Restore by grouping within a sheet by (ownerId, recordId), checking chunkCount,
 * sorting the 1-based chunkIndex, joining jsonChunk WITHOUT a delimiter, then
 * JSON.parse ONCE. Individual chunks need not be valid JSON. Empty tables retain
 * the header. Alpha leaseToken is deliberately null, not a restorable secret.
 * key/url/hash/metadata restore references only; no file fetch/copy is attempted.
 */
export function buildBackupJsonAoa(
  rows: readonly object[],
  idField: "id" | "exportId",
  ownerField?: "ownerId"
): (string | number)[][] {
  const result: (string | number)[][] = [[...BACKUP_JSON_CHUNK_FIELDS]];
  for (const row of rows) {
    const record = withoutLeaseToken(row) as Record<string, unknown>;
    const json = JSON.stringify(record, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value
    );
    const chunks = splitBackupJson(json);
    const recordId = String(record[idField]);
    const ownerId = ownerField ? String(record[ownerField]) : "";
    chunks.forEach((chunk, index) => {
      result.push([1, recordId, ownerId, index + 1, chunks.length, chunk]);
    });
  }
  return result;
}
