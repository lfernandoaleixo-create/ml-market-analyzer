import { salesMarginReports, salesMarginCosts } from "../../drizzle/schema";
import { getDb } from "../db";
export async function loadSalesMarginBackupRecords() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para backup da margem de vendas");
  const [reports, costs] = await Promise.all([
    db.select().from(salesMarginReports).orderBy(salesMarginReports.ownerUserId, salesMarginReports.id),
    db.select().from(salesMarginCosts).orderBy(salesMarginCosts.ownerUserId, salesMarginCosts.id),
  ]);
  return { reports, costs };
}
