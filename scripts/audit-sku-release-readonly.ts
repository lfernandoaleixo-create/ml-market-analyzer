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
const correctedVariantLogs = logs.filter(
  (row) => row.idempotencyKey === "authorized-fix-row330001-variant-20260924",
);
const explicitFinalizationLogs = logs.filter(
  (row) => row.idempotencyKey === "authorized-explicit-sku-finalization-20260924",
);
const manualDuplicatePolicyLogs = logs.filter(
  (row) => row.idempotencyKey === "policy-manual-duplicate-sku-2026-09-24",
);

const workbookBuffer = await buildSheetsWorkbookBuffer();
const workbook = XLSX.read(workbookBuffer, { type: "buffer" });
const technicalRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
  workbook.Sheets["_Produtos_Tecnico"],
  { defval: "" },
);
const productReservationRows = XLSX.utils.sheet_to_json<unknown[]>(
  workbook.Sheets["_Reservas_Num_Produto"],
  { header: 1, defval: "" },
);
const commercialReservations = productReservations.filter((row) => !row.isVoided);
const correctedRow = rows.find((row) => row.id === 330001);
const correctedReservation = productReservations.find((row) => row.productNumber === 30);
const voidedTechnicalReservation = productReservations.find((row) => row.productNumber === 30_002);
const maxCommercialProductNumber = Math.max(
  0,
  ...commercialReservations.map((row) => row.productNumber),
);

const report = {
  skuRows: {
    total: rows.length,
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
    commercialProductNumbers: commercialReservations.length,
    voidedProductNumbers: productReservations.filter((row) => row.isVoided).length,
    maxCommercialProductNumber,
    nextCommercialProductNumber: maxCommercialProductNumber + 1,
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
    correctedVariantLogs: correctedVariantLogs.length,
    correctedVariantAuthorizedBy: correctedVariantLogs[0]?.authorizedBy ?? null,
    explicitFinalizationLogs: explicitFinalizationLogs.length,
    explicitFinalizationAffectedCount: explicitFinalizationLogs[0]?.affectedCount ?? null,
    manualDuplicatePolicyLogs: manualDuplicatePolicyLogs.length,
    manualDuplicateAuthorizedBy: manualDuplicatePolicyLogs[0]?.authorizedBy ?? null,
    manualDuplicateAffectedCount: manualDuplicatePolicyLogs[0]?.affectedCount ?? null,
  },
  backup: {
    sheets: workbook.SheetNames,
    technicalProductRows: technicalRows.length,
    includesAllSkuRows: technicalRows.length === rows.length,
    includesProductReservations: workbook.SheetNames.includes("_Reservas_Num_Produto"),
    includesVariantReservations: workbook.SheetNames.includes("_Reservas_Num_Variante"),
    includesSkuValueReservations: workbook.SheetNames.includes("_Reservas_Valor_SKU"),
    includesProductNumberVoidMarker: productReservationRows[0]?.includes("isVoided") ?? false,
  },
  productNumberCorrection: {
    rowId: correctedRow?.id ?? null,
    productNumber: correctedRow?.productNumber ?? null,
    variantNumber: correctedRow?.variantNumber ?? null,
    variante: correctedRow?.variante ?? null,
    sku: correctedRow?.sku ?? null,
    activeReservationOwner: correctedReservation?.skuRowId ?? null,
    technical30002Voided: voidedTechnicalReservation?.isVoided ?? false,
    technical30002Owner: voidedTechnicalReservation?.skuRowId ?? null,
  },
};

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
if (
  correctedVariantLogs.length !== 1 ||
  correctedVariantLogs[0]?.authorizedBy !== "Guilherme" ||
  correctedVariantLogs[0]?.affectedCount !== 1 ||
  explicitFinalizationLogs.length !== 1 ||
  explicitFinalizationLogs[0]?.authorizedBy !== "Guilherme" ||
  explicitFinalizationLogs[0]?.affectedCount !== 0
) {
  throw new Error("A autorização da Variante/finalização explícita está inconsistente.");
}
if (
  manualDuplicatePolicyLogs.length !== 1 ||
  manualDuplicatePolicyLogs[0]?.authorizedBy !== "Guilherme" ||
  manualDuplicatePolicyLogs[0]?.affectedCount !== 0
) {
  throw new Error("A autorização da repetição manual de SKU está inconsistente.");
}
if (!report.backup.includesAllSkuRows || !report.backup.includesProductReservations || !report.backup.includesVariantReservations || !report.backup.includesSkuValueReservations || !report.backup.includesProductNumberVoidMarker) {
  throw new Error("O backup técnico não cobre todo o estado de SKU.");
}
if (
  correctedRow?.productNumber !== 30 ||
  correctedRow?.variantNumber !== 1 ||
  correctedRow?.variante !== "LIGADEZINCO - CONJUNTO CORAÇÃO - CHINA" ||
  correctedRow?.sku !== "2-JOIAS-30-1" ||
  correctedReservation?.skuRowId !== 330001 ||
  correctedReservation?.isVoided ||
  !voidedTechnicalReservation?.isVoided ||
  voidedTechnicalReservation?.skuRowId != null ||
  maxCommercialProductNumber !== 30
) {
  throw new Error("A correção comercial 30002 → 30 ou suas reservas está inconsistente.");
}

console.log(JSON.stringify(report, null, 2));
process.exit(0);
