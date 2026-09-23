import "dotenv/config";
import { createHash } from "node:crypto";
import { asc } from "drizzle-orm";
import { getDb } from "../server/db";
import {
  skuChangeLog,
  skuProductNumberReservations,
  skuSheetRows,
  skuValueReservations,
  skuVariantNumberReservations,
  skuVariations,
} from "../drizzle/schema";
import { buildSheetsWorkbookBuffer } from "../server/backup/sheetsXlsx";
import * as XLSX from "xlsx";

const BASELINE_SKU_ROWS = 71;

const db = await getDb();
if (!db) throw new Error("Banco indisponível");

const [rows, variations, productReservations, variantReservations, valueReservations, logs] = await Promise.all([
  db.select().from(skuSheetRows).orderBy(asc(skuSheetRows.id)),
  db.select().from(skuVariations).orderBy(asc(skuVariations.id)),
  db.select().from(skuProductNumberReservations).orderBy(asc(skuProductNumberReservations.productNumber)),
  db.select().from(skuVariantNumberReservations).orderBy(asc(skuVariantNumberReservations.id)),
  db.select().from(skuValueReservations).orderBy(asc(skuValueReservations.id)),
  db.select().from(skuChangeLog).orderBy(asc(skuChangeLog.id)),
]);

const canonicalRows = rows.map((row) => ({
  id: row.id,
  position: row.position,
  productNumber: row.productNumber,
  variantNumber: row.variantNumber,
  sku: row.sku,
  skuKit: row.skuKit,
  produto: row.produto,
  variante: row.variante,
}));
const dataHash = createHash("sha256").update(JSON.stringify(canonicalRows)).digest("hex");
const normalized = rows
  .filter((row) => row.sku)
  .map((row) => row.sku.trim().toLowerCase().replace(/\./g, "-").replace(/\s+/g, ""));
const duplicateSkuCount = normalized.length - new Set(normalized).size;
const allHistoricalNormalized = new Set(
  [...rows.map((row) => row.sku), ...variations.map((row) => row.variationSku)]
    .filter(Boolean)
    .map((sku) => sku.trim().toLowerCase().replace(/\./g, "-").replace(/\s+/g, "")),
);
const reservedNormalized = new Set(valueReservations.map((row) => row.normalizedSku));
const missingValueReservations = [...allHistoricalNormalized].filter(
  (sku) => !reservedNormalized.has(sku),
);
const policyLogs = logs.filter((row) => row.idempotencyKey === "sku-immutable-v1-guilherme");
const manualEditPolicyLogs = logs.filter(
  (row) => row.idempotencyKey === "manual-sku-edit-guilherme-2026-09-23",
);

const workbookBuffer = await buildSheetsWorkbookBuffer();
const workbook = XLSX.read(workbookBuffer, { type: "buffer" });
const technicalRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
  workbook.Sheets["_Produtos_Tecnico"],
  { defval: "" },
);

const report = {
  skuRows: {
    total: rows.length,
    baselineExpected: BASELINE_SKU_ROWS,
    countPreserved: rows.length === BASELINE_SKU_ROWS,
    active: rows.filter((row) => !row.isDeleted).length,
    deleted: rows.filter((row) => row.isDeleted).length,
    legacy: rows.filter((row) => row.skuMode === "legacy").length,
    nonLegacy: rows.filter((row) => row.skuMode !== "legacy").length,
    maxProductNumber: Math.max(0, ...rows.map((row) => row.productNumber ?? 0)),
    normalizedDuplicateSkuCount: duplicateSkuCount,
    immutableFieldsSha256: dataHash,
  },
  variations: {
    total: variations.length,
    active: variations.filter((row) => !row.isDeleted).length,
    deletedTombstones: variations.filter((row) => row.isDeleted).length,
  },
  reservations: {
    productNumbers: productReservations.length,
    maxProductNumber: Math.max(0, ...productReservations.map((row) => row.productNumber)),
    variantNumbers: variantReservations.length,
    skuValues: valueReservations.length,
    historicalUniqueSkuValues: allHistoricalNormalized.size,
    missingSkuValues: missingValueReservations.length,
  },
  authorization: {
    matchingPolicyLogs: policyLogs.length,
    authorizedBy: policyLogs[0]?.authorizedBy ?? null,
    affectedCount: policyLogs[0]?.affectedCount ?? null,
    manualEditMatchingPolicyLogs: manualEditPolicyLogs.length,
    manualEditAuthorizedBy: manualEditPolicyLogs[0]?.authorizedBy ?? null,
    manualEditAffectedCount: manualEditPolicyLogs[0]?.affectedCount ?? null,
  },
  backup: {
    sheets: workbook.SheetNames,
    technicalProductRows: technicalRows.length,
    includesAllSkuRows: technicalRows.length === rows.length,
    includesProductReservations: workbook.SheetNames.includes("_Reservas_Num_Produto"),
    includesVariantReservations: workbook.SheetNames.includes("_Reservas_Num_Variante"),
    includesSkuValueReservations: workbook.SheetNames.includes("_Reservas_Valor_SKU"),
  },
};

if (!report.skuRows.countPreserved) throw new Error(`Quantidade de linhas mudou: ${rows.length}`);
if (report.skuRows.deleted !== 0) throw new Error("Uma linha existente foi marcada como excluída durante a implementação.");
if (report.skuRows.nonLegacy !== 0) throw new Error("Uma linha existente recebeu uma nova política durante a implementação.");
if (duplicateSkuCount !== 0) throw new Error("Foram encontradas duplicidades não autorizadas no estado atual.");
if (missingValueReservations.length !== 0) {
  throw new Error(`Há ${missingValueReservations.length} SKU(s) históricos sem reserva global.`);
}
if (policyLogs.length !== 1 || policyLogs[0]?.affectedCount !== 0) {
  throw new Error("Registro idempotente da autorização de Guilherme está inconsistente.");
}
if (
  manualEditPolicyLogs.length !== 1 ||
  manualEditPolicyLogs[0]?.authorizedBy !== "Guilherme" ||
  manualEditPolicyLogs[0]?.affectedCount !== 0
) {
  throw new Error("Registro idempotente da edição manual autorizada por Guilherme está inconsistente.");
}
if (!report.backup.includesAllSkuRows || !report.backup.includesProductReservations || !report.backup.includesVariantReservations || !report.backup.includesSkuValueReservations) {
  throw new Error("O backup técnico não cobre todo o estado de SKU.");
}

console.log(JSON.stringify(report, null, 2));
process.exit(0);
