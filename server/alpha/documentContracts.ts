import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { AlphaPdfExport } from "../../drizzle/alphaSchema";

export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_SNAPSHOT_BYTES = 1024 * 1024;
export const MAX_PDF_BASE64_CHARS = 4 * Math.ceil(MAX_PDF_BYTES / 3);

export const pdfExportOptionsSchema = z.object({
  scope: z.enum(["selected", "compact", "complete"]),
  printMode: z.enum(["duplex", "twoSheets"]),
  includeProductSheet: z.boolean(),
  compactMargins: z.array(z.number().finite().min(0).max(100)).max(8).optional(),
}).strict();

/** Reject paths, control characters and unsafe names rather than changing idempotency context. */
export const attachPdfInputSchema = z.object({
  exportId: z.string().uuid().transform(value => value.toLowerCase()),
  reportId: z.string().min(1).max(256),
  filename: z.string().min(5).max(255).refine(value =>
    value === value.trim() && /^[A-Za-z0-9\u00C0-\u024F _().-]+\.pdf$/i.test(value) &&
    !value.startsWith(".") && !value.includes(".."), "Nome de PDF inválido ou inseguro."),
  base64: z.string().min(1).max(MAX_PDF_BASE64_CHARS),
  projectProductId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  description: z.string().max(2000),
  sku: z.string().max(256),
  options: pdfExportOptionsSchema,
  snapshotPayload: z.string().refine(value => Buffer.byteLength(value, "utf8") <= MAX_SNAPSHOT_BYTES,
    "O snapshot deve ter no máximo 1 MB.").optional(),
}).strict();

export type AttachPdfInput = z.infer<typeof attachPdfInputSchema>;
export type PreparedPdf = Pick<AlphaPdfExport,
  "exportId" | "reportId" | "filename" | "description" | "sku" | "projectId" |
  "sha256" | "byteSize" | "contextHash" | "optionsPayload" | "snapshotPayload">;

const sha256 = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");

export function preparePdf(input: AttachPdfInput): { metadata: PreparedPdf; bytes: Buffer } {
  // Buffer.from alone silently accepts garbage. Require canonical, padded RFC4648 base64.
  const paddingAt = input.base64.indexOf("=");
  if (input.base64.length > MAX_PDF_BASE64_CHARS || input.base64.length % 4 !== 0 ||
      /[^A-Za-z0-9+/=]/.test(input.base64) ||
      (paddingAt !== -1 && !/^={1,2}$/.test(input.base64.slice(paddingAt)))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "PDF base64 inválido (base64 puro e estrito é obrigatório)." });
  }
  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.length > MAX_PDF_BYTES || bytes.toString("base64") !== input.base64 ||
      !bytes.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "PDF inválido: assinatura %PDF- obrigatória e limite binário de 15 MB." });
  }
  const optionsPayload = JSON.stringify({
    scope: input.options.scope,
    printMode: input.options.printMode,
    includeProductSheet: input.options.includeProductSheet,
    ...(input.options.compactMargins === undefined ? {} : { compactMargins: input.options.compactMargins }),
  });
  const context = {
    reportId: input.reportId,
    filename: input.filename,
    description: input.description,
    sku: input.sku,
    projectId: input.projectProductId ?? null,
    optionsPayload,
    snapshotPayload: input.snapshotPayload ?? null,
  };
  return { bytes, metadata: {
    exportId: input.exportId, ...context,
    sha256: sha256(bytes), byteSize: bytes.length, contextHash: sha256(JSON.stringify(context)),
  } };
}

export type PdfDocument = {
  exportId: string; reportId: string; filename: string; url: string; key: string;
  sha256: string; byteSize: number; projectProductId: number | null; documentId: number | null;
  description: string; sku: string; createdAt: number;
};

export function toPdfDocument(row: AlphaPdfExport): PdfDocument {
  if (row.status !== "ready" || !row.url || !row.key) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Exportação PDF ainda não finalizada." });
  }
  return {
    exportId: row.exportId, reportId: row.reportId, filename: row.filename,
    url: row.url, key: row.key, sha256: row.sha256, byteSize: row.byteSize,
    projectProductId: row.projectId, documentId: row.documentId,
    description: row.description, sku: row.sku, createdAt: row.createdAt,
  };
}
