import { and, eq } from "drizzle-orm";
import { skuSheetRows, skuVariations } from "../../drizzle/schema";
import type { PublicSaleItem } from "../../shared/publicSales";
import { getDb } from "../db";

export type PublicSkuCandidate = {
  identity: string;
  sku: string;
  itemId: string | null;
};
const nonempty = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

/** Read the existing global SKU projection only. NEVER call list/backfill/generation helpers.
 * variationIndex is a local permanent index, NOT the Mercado Livre variationId.
 * The schema does not store ML variation IDs, so it cannot disambiguate shared MLBs.
 */
export async function readPublicSkuProjection(): Promise<PublicSkuCandidate[]> {
  const db = await getDb();
  if (!db) throw new Error("Projeção SKU indisponível.");
  const [rows, variations] = await Promise.all([
    db
      .select({
        id: skuSheetRows.id,
        sku: skuSheetRows.sku,
        mainMlb: skuSheetRows.mainMlb,
      })
      .from(skuSheetRows)
      .where(eq(skuSheetRows.isDeleted, false)),
    db
      .select({
        id: skuVariations.id,
        skuRowId: skuVariations.skuRowId,
        variationSku: skuVariations.variationSku,
        mlb: skuVariations.mlb,
      })
      .from(skuVariations)
      .innerJoin(skuSheetRows, eq(skuVariations.skuRowId, skuSheetRows.id))
      .where(
        and(
          eq(skuVariations.isDeleted, false),
          eq(skuSheetRows.isDeleted, false)
        )
      ),
  ]);
  return [
    ...rows.flatMap(row =>
      nonempty(row.sku)
        ? [
            {
              identity: `row:${row.id}`,
              sku: row.sku,
              itemId: nonempty(row.mainMlb),
            },
          ]
        : []
    ),
    ...variations.flatMap(row =>
      nonempty(row.variationSku)
        ? [
            {
              identity: `variation:${row.id}`,
              sku: row.variationSku,
              itemId: nonempty(row.mlb),
            },
          ]
        : []
    ),
  ];
}

export function resolvePublicSaleSku(
  item: PublicSaleItem,
  candidates: PublicSkuCandidate[],
  warnings: Set<string>
): PublicSaleItem {
  const original = nonempty(item.sku);
  // Exact SKU text is safe to preserve even when manually reused: it is not a
  // product identity. Never trim/re-case/re-generate the value returned to clients.
  const exact = original
    ? candidates.filter(candidate => candidate.sku === original)
    : [];
  if (exact.length) {
    if (exact.length > 1)
      warnings.add(
        "SKU_REUSED_IN_SHEET: SKU exato reutilizado; groupBy=sku reúne produtos com o mesmo texto, não identifica um produto único."
      );
    return { ...item, sku: original, skuSource: "sheet" };
  }
  const mlb = item.itemId
    ? candidates.filter(candidate => candidate.itemId === item.itemId)
    : [];
  if (mlb.length === 1) return { ...item, sku: mlb[0].sku, skuSource: "sheet" };
  if (mlb.length > 1) {
    warnings.add(
      "SKU_AMBIGUOUS: múltiplas linhas/variações usam o mesmo MLB; a projeção não guarda variationId do Mercado Livre. SKU original preservado sem associação por título."
    );
    return { ...item, sku: original, skuSource: "ambiguous" };
  }
  return {
    ...item,
    sku: original,
    skuSource: original ? item.skuSource : null,
  };
}
