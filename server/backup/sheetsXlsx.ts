import * as XLSX from "xlsx";
import { listSkuRows, listCustomColumns } from "../skuSheetDb";
import { listKitRows, listKitCustomColumns } from "../kitSheetDb";
import { listEmbalagemRows, listEmbalagemCustomColumns } from "../embalagemSheetDb";

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

function cell(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "SIM" : "NÃO";
  if (typeof value === "number") return value;
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

/** Gera o workbook XLSX com as três planilhas como abas separadas. */
export async function buildSheetsWorkbookBuffer(): Promise<Buffer> {
  const [skuRows, skuCols, kitRows, kitCols, embRows, embCols] = await Promise.all([
    listSkuRows(),
    listCustomColumns(),
    listKitRows(),
    listKitCustomColumns(),
    listEmbalagemRows(),
    listEmbalagemCustomColumns(),
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(
      buildAoa(SHARED_COLUMNS, skuRows as AnyRow[], skuCols as unknown as CustomCol[]),
    ),
    "Produtos",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(
      buildAoa(SHARED_COLUMNS, kitRows as AnyRow[], kitCols as unknown as CustomCol[]),
    ),
    "Kits",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(
      buildAoa(EMBALAGEM_COLUMNS, embRows as AnyRow[], embCols as unknown as CustomCol[]),
    ),
    "Embalagens",
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
