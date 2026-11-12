import { and, desc, eq } from "drizzle-orm";
import { salesMarginCosts, salesMarginReports } from "../../drizzle/schema";
import type {
  MarginCost,
  MarginReportPreview,
  MarginSale,
} from "../../shared/salesMargin";
import { getDb } from "../db";

export type MarginReportSnapshot = {
  id: number;
  createdAt: Date;
  operations: MarginSale[];
};
const REPORT_LIMIT = 1000;
async function requiredDb() {
  const db = await getDb();
  if (!db) throw new Error("Persistência de margem indisponível.");
  return db;
}
/** Explicit projection: never persist base64, original rows, buyer identity or arbitrary parser fields. */
function financialProjection(sale: MarginSale): MarginSale {
  return {
    operationId: sale.operationId,
    saleDate: sale.saleDate,
    items: sale.items.map(item => ({
      itemId: item.itemId,
      title: item.title,
      sku: item.sku,
      quantity: item.quantity,
    })),
    gross: sale.gross,
    deductions: sale.deductions,
    net: sale.net,
    financialStatus: sale.financialStatus,
    source: "report",
    charges: sale.charges.map(charge => ({
      key: charge.key,
      label: charge.label,
      category: charge.category,
      amount: charge.amount,
    })),
    taxesWithheld: sale.taxesWithheld,
    released: sale.released,
    ...(sale.pendingReason ? { pendingReason: sale.pendingReason } : {}),
  };
}
function reportOperations(value: unknown): MarginSale[] {
  if (!Array.isArray(value)) throw new Error("Fotografia financeira inválida.");
  return value.map(raw => {
    // Never turn a corrupt stored report into an empty, apparently complete dashboard.
    const sale = raw as MarginSale;
    if (
      !sale ||
      typeof sale.operationId !== "string" ||
      !sale.operationId ||
      typeof sale.saleDate !== "string" ||
      !Number.isFinite(Date.parse(sale.saleDate)) ||
      !Array.isArray(sale.items) ||
      !Array.isArray(sale.charges) ||
      !["confirmed", "pending", "refund_pending"].includes(sale.financialStatus)
    )
      throw new Error("Fotografia financeira inválida.");
    return financialProjection(sale);
  });
}
export async function listMarginReports(
  ownerUserId: number,
  sellerId: string
): Promise<{
  reports: MarginReportSnapshot[];
  partial: boolean;
  count: number;
}> {
  const db = await requiredDb();
  const rows = await db
    .select()
    .from(salesMarginReports)
    .where(
      and(
        eq(salesMarginReports.ownerUserId, ownerUserId),
        eq(salesMarginReports.sellerId, sellerId)
      )
    )
    .orderBy(desc(salesMarginReports.createdAt), desc(salesMarginReports.id))
    .limit(REPORT_LIMIT + 1);
  const selected = rows.slice(0, REPORT_LIMIT);
  return {
    reports: selected.map(row => ({
      id: row.id,
      createdAt: row.createdAt,
      operations: reportOperations(row.operations),
    })),
    partial: rows.length > REPORT_LIMIT,
    count: selected.length,
  };
}
function decimal(value: string | number | null): number | null {
  if (value === null) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}
export async function listMarginCosts(
  ownerUserId: number,
  sellerId: string
): Promise<MarginCost[]> {
  const db = await requiredDb();
  const rows = await db
    .select()
    .from(salesMarginCosts)
    .where(
      and(
        eq(salesMarginCosts.ownerUserId, ownerUserId),
        eq(salesMarginCosts.sellerId, sellerId)
      )
    );
  return rows.map(row => ({
    operationId: row.operationId,
    productCost: decimal(row.productCost),
    extraCosts: decimal(row.extraCosts),
    note: row.note,
    updatedAt: row.updatedAt.getTime(),
  }));
}
export async function importMarginReport(
  ownerUserId: number,
  sellerId: string,
  createdBy: number,
  preview: MarginReportPreview
): Promise<{
  id: number;
  duplicate: boolean;
  rowCount: number;
  operations: number;
}> {
  const db = await requiredDb();
  const scope = and(
    eq(salesMarginReports.ownerUserId, ownerUserId),
    eq(salesMarginReports.sellerId, sellerId),
    eq(salesMarginReports.fileHash, preview.fileHash)
  );
  const existing = (
    await db.select().from(salesMarginReports).where(scope).limit(1)
  )[0];
  if (existing)
    return {
      id: existing.id,
      duplicate: true,
      rowCount: existing.rowCount,
      operations: reportOperations(existing.operations).length,
    };
  let duplicate = false;
  try {
    await db
      .insert(salesMarginReports)
      .values({
        ownerUserId,
        sellerId,
        createdBy,
        fileName: preview.fileName.slice(0, 160),
        fileHash: preview.fileHash,
        format: preview.format,
        rowCount: preview.rowCount,
        operations: preview.operations.map(financialProjection),
        fromDate: preview.fromDate.slice(0, 10),
        toDate: preview.toDate.slice(0, 10),
      });
  } catch (error) {
    // The unique(owner,seller,hash) index handles concurrent uploads atomically.
    const candidate = error as { code?: string; cause?: { code?: string } };
    if (
      candidate?.code !== "ER_DUP_ENTRY" &&
      candidate?.cause?.code !== "ER_DUP_ENTRY"
    )
      throw error;
    duplicate = true;
  }
  const stored = (
    await db.select().from(salesMarginReports).where(scope).limit(1)
  )[0];
  if (!stored) throw new Error("Relatório não persistido.");
  return {
    id: stored.id,
    duplicate,
    rowCount: stored.rowCount,
    operations: reportOperations(stored.operations).length,
  };
}
function costDecimal(value: number | null): string | null {
  if (value === null) return null;
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 999_999_999.99 ||
    !/^\d+(?:\.\d{1,2})?$/.test(String(value))
  )
    throw new Error("Custo inválido.");
  return value.toFixed(2);
}
/** Total historical costs per order. No SKU, pricing, catalog or remote writes. */
export async function saveMarginCost(
  ownerUserId: number,
  sellerId: string,
  updatedBy: number,
  input: {
    operationId: string;
    productCost: number | null;
    extraCosts: number | null;
    note?: string;
  }
): Promise<MarginCost> {
  const db = await requiredDb();
  const updatedAt = new Date();
  const fields = {
    productCost: costDecimal(input.productCost),
    extraCosts: costDecimal(input.extraCosts),
    note: input.note ?? "",
    updatedBy,
    updatedAt,
  };
  await db
    .insert(salesMarginCosts)
    .values({
      ownerUserId,
      sellerId,
      operationId: input.operationId,
      ...fields,
    })
    .onDuplicateKeyUpdate({ set: fields });
  return {
    operationId: input.operationId,
    productCost: decimal(fields.productCost),
    extraCosts: decimal(fields.extraCosts),
    note: fields.note,
    updatedAt: updatedAt.getTime(),
  };
}
