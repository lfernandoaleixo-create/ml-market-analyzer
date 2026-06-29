import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  InsertKitSheetRow,
  KitSheetRow,
  kitSheetRows,
  KitSheetCustomColumn,
  kitSheetCustomColumns,
} from "../drizzle/schema";

/** Lista todas as linhas da planilha KITS, ordenadas por posição. */
export async function listKitRows(): Promise<KitSheetRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(kitSheetRows).orderBy(asc(kitSheetRows.position), asc(kitSheetRows.id));
}

async function nextPosition(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ max: sql<number>`COALESCE(MAX(${kitSheetRows.position}), 0)` })
    .from(kitSheetRows);
  return (rows[0]?.max ?? 0) + 1;
}

export async function createKitRow(
  values: Partial<InsertKitSheetRow> = {},
): Promise<KitSheetRow> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const position = values.position ?? (await nextPosition());
  await db.insert(kitSheetRows).values({ ...values, position });
  const created = await db
    .select()
    .from(kitSheetRows)
    .orderBy(sql`${kitSheetRows.id} DESC`)
    .limit(1);
  return created[0];
}

export async function updateKitRow(
  id: number,
  patch: Partial<InsertKitSheetRow>,
): Promise<KitSheetRow | null> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const { id: _ignore, createdAt: _ignore2, ...safe } = patch as Record<string, unknown>;
  if (Object.keys(safe).length > 0) {
    await db.update(kitSheetRows).set(safe).where(eq(kitSheetRows.id, id));
  }
  const rows = await db.select().from(kitSheetRows).where(eq(kitSheetRows.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteKitRow(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(kitSheetRows).where(eq(kitSheetRows.id, id));
}

// ---------------------------------------------------------------------------
// Colunas personalizadas (KITS)
// ---------------------------------------------------------------------------

export async function listKitCustomColumns(): Promise<KitSheetCustomColumn[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(kitSheetCustomColumns)
    .orderBy(asc(kitSheetCustomColumns.position), asc(kitSheetCustomColumns.id));
}

export async function createKitCustomColumn(name: string): Promise<KitSheetCustomColumn> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const rows = await db
    .select({ max: sql<number>`COALESCE(MAX(${kitSheetCustomColumns.position}), 0)` })
    .from(kitSheetCustomColumns);
  const position = (rows[0]?.max ?? 0) + 1;
  await db.insert(kitSheetCustomColumns).values({ name: name.trim() || "Nova coluna", position });
  const created = await db
    .select()
    .from(kitSheetCustomColumns)
    .orderBy(sql`${kitSheetCustomColumns.id} DESC`)
    .limit(1);
  return created[0];
}

export async function renameKitCustomColumn(
  id: number,
  name: string,
): Promise<KitSheetCustomColumn | null> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db
    .update(kitSheetCustomColumns)
    .set({ name: name.trim() })
    .where(eq(kitSheetCustomColumns.id, id));
  const rows = await db
    .select()
    .from(kitSheetCustomColumns)
    .where(eq(kitSheetCustomColumns.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteKitCustomColumn(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(kitSheetCustomColumns).where(eq(kitSheetCustomColumns.id, id));

  const key = String(id);
  const rows = await db
    .select({ id: kitSheetRows.id, customValues: kitSheetRows.customValues })
    .from(kitSheetRows);
  for (const r of rows) {
    if (!r.customValues) continue;
    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(r.customValues) as Record<string, string>;
    } catch {
      continue;
    }
    if (key in parsed) {
      delete parsed[key];
      await db
        .update(kitSheetRows)
        .set({ customValues: JSON.stringify(parsed) })
        .where(eq(kitSheetRows.id, r.id));
    }
  }
}

export async function setKitCustomValue(
  rowId: number,
  columnId: number,
  value: string,
): Promise<KitSheetRow | null> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const rows = await db
    .select({ customValues: kitSheetRows.customValues })
    .from(kitSheetRows)
    .where(eq(kitSheetRows.id, rowId))
    .limit(1);
  if (rows.length === 0) return null;

  let parsed: Record<string, string> = {};
  if (rows[0].customValues) {
    try {
      parsed = JSON.parse(rows[0].customValues) as Record<string, string>;
    } catch {
      parsed = {};
    }
  }
  parsed[String(columnId)] = value;
  await db
    .update(kitSheetRows)
    .set({ customValues: JSON.stringify(parsed) })
    .where(eq(kitSheetRows.id, rowId));
  const updated = await db
    .select()
    .from(kitSheetRows)
    .where(eq(kitSheetRows.id, rowId))
    .limit(1);
  return updated[0] ?? null;
}
