import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  InsertEmbalagemSheetRow,
  EmbalagemSheetRow,
  embalagemSheetRows,
  EmbalagemSheetCustomColumn,
  embalagemSheetCustomColumns,
} from "../drizzle/schema";

/** Lista todas as linhas da planilha EMBALAGENS, ordenadas por posição. */
export async function listEmbalagemRows(): Promise<EmbalagemSheetRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(embalagemSheetRows)
    .orderBy(asc(embalagemSheetRows.position), asc(embalagemSheetRows.id));
}

async function nextPosition(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ max: sql<number>`COALESCE(MAX(${embalagemSheetRows.position}), 0)` })
    .from(embalagemSheetRows);
  return (rows[0]?.max ?? 0) + 1;
}

export async function createEmbalagemRow(
  values: Partial<InsertEmbalagemSheetRow> = {},
): Promise<EmbalagemSheetRow> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const position = values.position ?? (await nextPosition());
  await db.insert(embalagemSheetRows).values({ ...values, position });
  const created = await db
    .select()
    .from(embalagemSheetRows)
    .orderBy(sql`${embalagemSheetRows.id} DESC`)
    .limit(1);
  return created[0];
}

export async function updateEmbalagemRow(
  id: number,
  patch: Partial<InsertEmbalagemSheetRow>,
): Promise<EmbalagemSheetRow | null> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const { id: _ignore, createdAt: _ignore2, ...safe } = patch as Record<string, unknown>;
  if (Object.keys(safe).length > 0) {
    await db.update(embalagemSheetRows).set(safe).where(eq(embalagemSheetRows.id, id));
  }
  const rows = await db
    .select()
    .from(embalagemSheetRows)
    .where(eq(embalagemSheetRows.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteEmbalagemRow(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(embalagemSheetRows).where(eq(embalagemSheetRows.id, id));
}

// ---------------------------------------------------------------------------
// Colunas personalizadas (EMBALAGENS)
// ---------------------------------------------------------------------------

export async function listEmbalagemCustomColumns(): Promise<EmbalagemSheetCustomColumn[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(embalagemSheetCustomColumns)
    .orderBy(asc(embalagemSheetCustomColumns.position), asc(embalagemSheetCustomColumns.id));
}

export async function createEmbalagemCustomColumn(
  name: string,
): Promise<EmbalagemSheetCustomColumn> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const rows = await db
    .select({ max: sql<number>`COALESCE(MAX(${embalagemSheetCustomColumns.position}), 0)` })
    .from(embalagemSheetCustomColumns);
  const position = (rows[0]?.max ?? 0) + 1;
  await db
    .insert(embalagemSheetCustomColumns)
    .values({ name: name.trim() || "Nova coluna", position });
  const created = await db
    .select()
    .from(embalagemSheetCustomColumns)
    .orderBy(sql`${embalagemSheetCustomColumns.id} DESC`)
    .limit(1);
  return created[0];
}

export async function renameEmbalagemCustomColumn(
  id: number,
  name: string,
): Promise<EmbalagemSheetCustomColumn | null> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db
    .update(embalagemSheetCustomColumns)
    .set({ name: name.trim() })
    .where(eq(embalagemSheetCustomColumns.id, id));
  const rows = await db
    .select()
    .from(embalagemSheetCustomColumns)
    .where(eq(embalagemSheetCustomColumns.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteEmbalagemCustomColumn(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(embalagemSheetCustomColumns).where(eq(embalagemSheetCustomColumns.id, id));

  const key = String(id);
  const rows = await db
    .select({ id: embalagemSheetRows.id, customValues: embalagemSheetRows.customValues })
    .from(embalagemSheetRows);
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
        .update(embalagemSheetRows)
        .set({ customValues: JSON.stringify(parsed) })
        .where(eq(embalagemSheetRows.id, r.id));
    }
  }
}

export async function setEmbalagemCustomValue(
  rowId: number,
  columnId: number,
  value: string,
): Promise<EmbalagemSheetRow | null> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const rows = await db
    .select({ customValues: embalagemSheetRows.customValues })
    .from(embalagemSheetRows)
    .where(eq(embalagemSheetRows.id, rowId))
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
    .update(embalagemSheetRows)
    .set({ customValues: JSON.stringify(parsed) })
    .where(eq(embalagemSheetRows.id, rowId));
  const updated = await db
    .select()
    .from(embalagemSheetRows)
    .where(eq(embalagemSheetRows.id, rowId))
    .limit(1);
  return updated[0] ?? null;
}
