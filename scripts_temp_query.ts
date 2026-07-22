import { getDb } from "./server/db";
import { skuSheetRows } from "./drizzle/schema";
import { asc } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.error("No DB"); process.exit(1); }
  const rows = await db.select({
    id: skuSheetRows.id,
    position: skuSheetRows.position,
    produto: skuSheetRows.produto,
    tipoSku: skuSheetRows.tipoSku,
    categoryName: skuSheetRows.categoryName,
    productNumber: skuSheetRows.productNumber,
    variantNumber: skuSheetRows.variantNumber,
    sku: skuSheetRows.sku,
  }).from(skuSheetRows).orderBy(asc(skuSheetRows.position));
  
  console.log(JSON.stringify(rows));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
