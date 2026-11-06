import { createHash } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import { asc } from "drizzle-orm";
import { getDb } from "../server/db";
import {
  skuSheetRows, skuVariations, skuSheetCustomColumns, skuProductNumberReservations,
  skuVariantNumberReservations, skuValueReservations, skuChangeLog,
  kitSheetRows, embalagemSheetRows, projectProducts, projectDocuments,
} from "../drizzle/schema";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível; auditoria não concluída.");
  const entries = [
    ["sku_sheet_rows", skuSheetRows, [skuSheetRows.id]],
    ["sku_variations", skuVariations, [skuVariations.id]],
    ["sku_sheet_custom_columns", skuSheetCustomColumns, [skuSheetCustomColumns.id]],
    ["sku_product_number_reservations", skuProductNumberReservations, [skuProductNumberReservations.productNumber]],
    ["sku_variant_number_reservations", skuVariantNumberReservations, [skuVariantNumberReservations.id]],
    ["sku_value_reservations", skuValueReservations, [skuValueReservations.id]],
    ["sku_change_log", skuChangeLog, [skuChangeLog.id]],
    ["kit_sheet_rows", kitSheetRows, [kitSheetRows.id]],
    ["embalagem_sheet_rows", embalagemSheetRows, [embalagemSheetRows.id]],
    ["project_products", projectProducts, [projectProducts.id]],
    ["project_documents", projectDocuments, [projectDocuments.id]],
  ] as const;
  const signatures: Record<string, { count: number; sha256: string }> = {};
  for (const [name, table, order] of entries) {
    const rows = await db.select().from(table).orderBy(...order.map(column => asc(column)));
    signatures[name] = { count: rows.length, sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
  }
  const snapshot = { capturedAt: new Date().toISOString(), readOnly: true, signatures };
  const args = process.argv.slice(2);
  if (args[0] === "--record" && args[1]) await writeFile(args[1], JSON.stringify(snapshot, null, 2) + "\n");
  if (args[0] === "--compare" && args[1]) {
    const baseline = JSON.parse(await readFile(args[1], "utf8"));
    const changed = Object.keys(signatures).filter(name => JSON.stringify(signatures[name]) !== JSON.stringify(baseline.signatures[name]));
    console.log(JSON.stringify({ readOnly: true, changed, preservedAll: changed.length === 0, signatures }, null, 2));
    if (changed.length) throw new Error("Há dados alterados após a assinatura inicial; conferir atividade real da equipe antes de atribuir causa.");
  } else console.log(JSON.stringify(snapshot, null, 2));
}
main().then(() => process.exit(0)).catch(error => { console.error(error instanceof Error ? error.message : "Falha de auditoria"); process.exit(1); });
