import * as XLSX from "xlsx";
import {
  listSkuRows,
  listAllSkuRows,
  listCustomColumns,
  listSkuVariationsForBackup,
  listSkuProductNumberReservationsForBackup,
  listSkuVariantNumberReservationsForBackup,
  listSkuValueReservationsForBackup,
} from "../skuSheetDb";
import { listKitRows, listKitCustomColumns } from "../kitSheetDb";
import { listEmbalagemRows, listEmbalagemCustomColumns } from "../embalagemSheetDb";
import { listSkuChangeLogForBackup } from "../skuProtection";

/**
 * Colunas fixas (na ordem da planilha) compartilhadas por SKU e Kits, que usam
 * o mesmo formato. Cada par é [cabeçalho, chave da linha].
 */
const SHARED_COLUMNS: Array<[string, string]> = [
  ["#", "position"],
  ["CADASTRADO ML", "cadastradoMl"],
  ["TIPO SKU", "tipoSku"],
  ["CATEGORIA", "categoryName"],
  ["SUBCATEGORIA", "subCategoryName"],
  ["Nº PRODUTO", "productNumber"],
  ["PRODUTO", "produto"],
  ["Nº VARIANTE", "variantNumber"],
  ["VARIANTE", "variante"],
  ["SKU", "sku"],
  ["GERAR KIT?", "gerarSkuKit"],
  ["SKU KIT", "skuKit"],
  ["EAN/GTIN", "eanGtin"],
  ["NCM", "ncm"],
  ["GPC", "gpc"],
  ["CEST", "cest"],
  ["PREÇO CLÁSSICO", "precoClassico"],
  ["PREÇO PREMIUM", "precoPremium"],
  ["PREÇO ATACADO", "precoAtacado"],
  ["EMB. PROF.", "embProfundidade"],
  ["EMB. LARG.", "embLargura"],
  ["EMB. ALT.", "embAltura"],
  ["PESO", "embPeso"],
  ["CARACTERÍSTICAS", "caracteristicas"],
];

const EMBALAGEM_COLUMNS: Array<[string, string]> = [
  ["#", "position"],
  ["PRODUTO", "produto"],
  ["SKU", "sku"],
  ["EAN/GTIN", "eanGtin"],
  ["NCM", "ncm"],
  ["CARACTERÍSTICAS", "caracteristicas"],
];

const SKU_RAW_FIELDS = [
  "id", "position", "productNumber", "variantNumber", "cadastradoMl", "tipoSku",
  "categoryId", "categoryName", "subCategoryId", "subCategoryName", "produto",
  "variante", "sku", "gerarSkuKit", "skuKit", "skuMode", "skuSourceRowId",
  "skuDecisionAt", "mainMlb", "mainDone", "eanGtin",
  "ncm", "gpc", "cest", "precoClassico", "precoPremium", "precoAtacado",
  "embProfundidade", "embLargura", "embAltura", "embPeso", "caracteristicas",
  "rowColor", "isDeleted", "deletedAt", "revision", "customValues", "createdAt", "updatedAt",
] as const;

const KIT_RAW_FIELDS = [
  "id", "position", "productNumber", "variantNumber", "cadastradoMl", "tipoSku",
  "categoryId", "categoryName", "subCategoryId", "subCategoryName", "produto",
  "variante", "eanGtin", "sku", "gerarSkuKit", "skuKit", "ncm", "gpc", "cest",
  "precoClassico", "precoPremium", "precoAtacado", "embProfundidade",
  "embLargura", "embAltura", "embPeso", "caracteristicas", "kit", "embalagem",
  "profundidade", "largura", "alturaComprimento", "kg", "categoria",
  "dimensoesGs1", "baseAjustado", "mlAjustado", "formadoPor", "observacao",
  "rowColor", "customValues", "createdAt", "updatedAt",
] as const;

const EMBALAGEM_RAW_FIELDS = [
  "id", "position", "produto", "eanGtin", "sku", "embalagem", "ncm", "gpc",
  "cest", "precoClassico", "precoPremium", "altura", "largura", "comprimento",
  "kg", "categoria", "observacao", "rowColor", "customValues", "createdAt",
  "updatedAt",
] as const;

const CUSTOM_COLUMN_FIELDS = ["id", "name", "position", "createdAt", "updatedAt"] as const;
const VARIATION_FIELDS = [
  "id", "skuRowId", "variationIndex", "variationSku", "ean", "mlb", "done",
  "isDeleted", "revision", "createdAt", "updatedAt",
] as const;
const CHANGE_LOG_FIELDS = [
  "id", "action", "authorizedBy", "description", "affectedRowIds", "oldValues",
  "newValues", "affectedCount", "timestamp", "idempotencyKey", "createdAt",
] as const;
const PRODUCT_NUMBER_RESERVATION_FIELDS = [
  "productNumber", "skuRowId", "isVoided", "createdAt",
] as const;
const VARIANT_NUMBER_RESERVATION_FIELDS = [
  "id", "skuRowId", "tipoSku", "categoryKey", "productNumber", "variantNumber", "createdAt",
] as const;
const SKU_VALUE_RESERVATION_FIELDS = [
  "id", "normalizedSku", "originalSku", "sourceType", "sourceKey", "createdAt",
] as const;

function cell(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "SIM" : "NÃO";
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

type AnyRow = Record<string, unknown> & { customValues?: string | null };
type CustomCol = { id: number; name: string };

function buildAoa(
  fixed: Array<[string, string]>,
  rows: AnyRow[],
  customCols: CustomCol[],
): (string | number)[][] {
  const header = [...fixed.map(([h]) => h), ...customCols.map((c) => c.name)];
  const body = rows.map((row, idx) => {
    const base = fixed.map(([, key]) => {
      if (key === "position") return idx + 1;
      return cell(row[key]);
    });
    let parsed: Record<string, string> = {};
    if (row.customValues) {
      try {
        parsed = JSON.parse(row.customValues) as Record<string, string>;
      } catch {
        parsed = {};
      }
    }
    const extra = customCols.map((c) => cell(parsed[String(c.id)]));
    return [...base, ...extra];
  });
  return [header, ...body];
}

function buildRawAoa(rows: AnyRow[], fields: readonly string[]): (string | number)[][] {
  return [
    [...fields],
    ...rows.map((row) => fields.map((field) => cell(row[field]))),
  ];
}

function appendSheet(
  workbook: XLSX.WorkBook,
  name: string,
  rows: (string | number)[][],
): void {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
}

/**
 * Gera o workbook XLSX de segurança.
 *
 * As três primeiras abas são amigáveis para uso diário. As abas prefixadas por
 * "_" são cópias técnicas completas, preservando IDs, metadados, colunas
 * personalizadas, variações (inclusive tombstones) e histórico de SKU para uma
 * restauração fiel sem renumeração ou reconstrução automática.
 */
export async function buildSheetsWorkbookBuffer(): Promise<Buffer> {
  const [
    skuRows,
    allSkuRows,
    skuCols,
    kitRows,
    kitCols,
    embRows,
    embCols,
    skuVariations,
    skuHistory,
    numberReservations,
    variantReservations,
    skuValueReservations,
  ] = await Promise.all([
    listSkuRows(),
    listAllSkuRows(),
    listCustomColumns(),
    listKitRows(),
    listKitCustomColumns(),
    listEmbalagemRows(),
    listEmbalagemCustomColumns(),
    listSkuVariationsForBackup(),
    listSkuChangeLogForBackup(),
    listSkuProductNumberReservationsForBackup(),
    listSkuVariantNumberReservationsForBackup(),
    listSkuValueReservationsForBackup(),
  ]);

  const wb = XLSX.utils.book_new();
  appendSheet(
    wb,
    "Produtos",
    buildAoa(SHARED_COLUMNS, skuRows as AnyRow[], skuCols as unknown as CustomCol[]),
  );
  appendSheet(
    wb,
    "Kits",
    buildAoa(SHARED_COLUMNS, kitRows as AnyRow[], kitCols as unknown as CustomCol[]),
  );
  appendSheet(
    wb,
    "Embalagens",
    buildAoa(EMBALAGEM_COLUMNS, embRows as AnyRow[], embCols as unknown as CustomCol[]),
  );

  appendSheet(wb, "_Produtos_Tecnico", buildRawAoa(allSkuRows as AnyRow[], SKU_RAW_FIELDS));
  appendSheet(wb, "_Kits_Tecnico", buildRawAoa(kitRows as AnyRow[], KIT_RAW_FIELDS));
  appendSheet(wb, "_Embalagens_Tecnico", buildRawAoa(embRows as AnyRow[], EMBALAGEM_RAW_FIELDS));
  appendSheet(wb, "_Colunas_Produtos", buildRawAoa(skuCols as AnyRow[], CUSTOM_COLUMN_FIELDS));
  appendSheet(wb, "_Colunas_Kits", buildRawAoa(kitCols as AnyRow[], CUSTOM_COLUMN_FIELDS));
  appendSheet(wb, "_Colunas_Embalagens", buildRawAoa(embCols as AnyRow[], CUSTOM_COLUMN_FIELDS));
  appendSheet(wb, "_Variacoes_SKU", buildRawAoa(skuVariations as AnyRow[], VARIATION_FIELDS));
  appendSheet(wb, "_Historico_SKU", buildRawAoa(skuHistory as AnyRow[], CHANGE_LOG_FIELDS));
  appendSheet(
    wb,
    "_Reservas_Num_Produto",
    buildRawAoa(numberReservations as AnyRow[], PRODUCT_NUMBER_RESERVATION_FIELDS),
  );
  appendSheet(
    wb,
    "_Reservas_Num_Variante",
    buildRawAoa(variantReservations as AnyRow[], VARIANT_NUMBER_RESERVATION_FIELDS),
  );
  appendSheet(
    wb,
    "_Reservas_Valor_SKU",
    buildRawAoa(skuValueReservations as AnyRow[], SKU_VALUE_RESERVATION_FIELDS),
  );

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(out);
}

/** Nome do arquivo de backup com a data (fuso de Brasília). */
export function backupFileName(date = new Date()): string {
  const br = new Date(date.getTime() - 3 * 60 * 60 * 1000); // UTC-3
  const y = br.getUTCFullYear();
  const m = String(br.getUTCMonth() + 1).padStart(2, "0");
  const d = String(br.getUTCDate()).padStart(2, "0");
  const hh = String(br.getUTCHours()).padStart(2, "0");
  const mm = String(br.getUTCMinutes()).padStart(2, "0");
  return `Planilha-SKU-${y}-${m}-${d}_${hh}h${mm}.xlsx`;
}
