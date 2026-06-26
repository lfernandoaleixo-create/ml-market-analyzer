import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  InsertSkuSheetRow,
  SkuSheetRow,
  skuSheetRows,
} from "../drizzle/schema";

/** Lista todas as linhas da planilha, ordenadas por posição. */
export async function listSkuRows(): Promise<SkuSheetRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(skuSheetRows).orderBy(asc(skuSheetRows.position), asc(skuSheetRows.id));
}

/** Próxima posição (final da lista). */
async function nextPosition(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ max: sql<number>`COALESCE(MAX(${skuSheetRows.position}), 0)` })
    .from(skuSheetRows);
  return (rows[0]?.max ?? 0) + 1;
}

/** Cria uma nova linha (em branco ou com valores parciais) no fim da planilha. */
export async function createSkuRow(
  values: Partial<InsertSkuSheetRow> = {},
): Promise<SkuSheetRow> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const position = values.position ?? (await nextPosition());
  await db.insert(skuSheetRows).values({ ...values, position });
  const created = await db
    .select()
    .from(skuSheetRows)
    .orderBy(sql`${skuSheetRows.id} DESC`)
    .limit(1);
  return created[0];
}

/** Atualiza campos de uma linha existente. */
export async function updateSkuRow(
  id: number,
  patch: Partial<InsertSkuSheetRow>,
): Promise<SkuSheetRow | null> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  // Nunca permitir sobrescrever id/createdAt acidentalmente.
  const { id: _ignore, createdAt: _ignore2, ...safe } = patch as Record<string, unknown>;
  if (Object.keys(safe).length > 0) {
    await db.update(skuSheetRows).set(safe).where(eq(skuSheetRows.id, id));
  }
  const rows = await db.select().from(skuSheetRows).where(eq(skuSheetRows.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Exclui uma linha. */
export async function deleteSkuRow(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(skuSheetRows).where(eq(skuSheetRows.id, id));
}
