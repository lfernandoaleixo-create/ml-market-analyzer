import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  kitSheetRows,
  skuSheetRows,
  migrationHistory,
  MigrationHistory,
  InsertSkuSheetRow,
  KitSheetRow,
} from "../drizzle/schema";

/**
 * Mapeia uma linha de Kit para uma nova linha pendente na Planilha SKU.
 * Preserva os dados descritivos, mas não copia nem calcula identificadores:
 * Nº Produto, Nº Variante e SKU serão definidos somente pelo fluxo protegido.
 */
export function mapKitRowToSkuInsert(row: KitSheetRow): Partial<InsertSkuSheetRow> {
  return {
    // O card protegido decide os identificadores depois da migração.
    productNumber: null,
    variantNumber: null,
    cadastradoMl: row.cadastradoMl ?? "",
    tipoSku: row.tipoSku ?? "",
    categoryId: row.categoryId ?? null,
    categoryName: row.categoryName ?? null,
    subCategoryId: row.subCategoryId ?? null,
    subCategoryName: row.subCategoryName ?? null,
    produto: row.produto ?? "",
    variante: row.variante ?? "",
    sku: "",
    gerarSkuKit: row.gerarSkuKit ?? false,
    skuKit: "",
    skuMode: "pending",
    skuSourceRowId: null,
    skuDecisionAt: null,
    eanGtin: row.eanGtin ?? "",
    ncm: row.ncm ?? "",
    gpc: row.gpc ?? "",
    cest: row.cest ?? "",
    precoClassico: row.precoClassico ?? "",
    precoPremium: row.precoPremium ?? "",
    precoAtacado: row.precoAtacado ?? "",
    embProfundidade: row.embProfundidade ?? "",
    embLargura: row.embLargura ?? "",
    embAltura: row.embAltura ?? "",
    embPeso: row.embPeso ?? "",
    caracteristicas: row.caracteristicas ?? null,
    rowColor: row.rowColor ?? "",
    // customValues não é portado por padrão: as colunas personalizadas de Kit
    // e SKU são independentes (ids diferentes). Mantemos vazio no destino para
    // evitar valores órfãos apontando para colunas inexistentes.
  };
}

/** Próxima posição livre na Planilha SKU. */
async function nextSkuPosition(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ max: sql<number>`COALESCE(MAX(${skuSheetRows.position}), 0)` })
    .from(skuSheetRows);
  return (rows[0]?.max ?? 0) + 1;
}

export interface MigrateResult {
  migratedCount: number;
  historyIds: number[];
  targetSkuRowIds: number[];
}

function resultInsertId(result: unknown): number | null {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (candidate && typeof candidate === "object" && "insertId" in candidate) {
    const value = Number((candidate as { insertId: unknown }).insertId);
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  return null;
}

/**
 * MOVE (opção B) uma ou mais linhas da planilha de Kits para a Planilha SKU:
 * 1. Lê cada linha de kit pelos ids informados.
 * 2. Insere uma linha pendente na Planilha SKU, sem SKU pré-calculado.
 * 3. Registra no histórico (migration_history) com snapshot completo.
 * 4. Remove a linha original da planilha de Kits.
 *
 * Se `ids` for vazio/omitido, migra TODAS as linhas de kit existentes.
 */
export async function migrateKitsToSku(params: {
  ids?: number[];
  migratedByOpenId?: string | null;
  migratedByName?: string | null;
}): Promise<MigrateResult> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

  // Carrega as linhas de origem.
  const allKits = await db
    .select()
    .from(kitSheetRows)
    .orderBy(asc(kitSheetRows.position), asc(kitSheetRows.id));

  const idSet = params.ids && params.ids.length > 0 ? new Set(params.ids) : null;
  const toMigrate = idSet ? allKits.filter((r) => idSet.has(r.id)) : allKits;

  const result: MigrateResult = { migratedCount: 0, historyIds: [], targetSkuRowIds: [] };
  const now = Date.now();

  let position = await nextSkuPosition();

  for (const kit of toMigrate) {
    const mapped = mapKitRowToSkuInsert(kit);
    const insertValues = { ...mapped, position };
    position += 1;

    // 1) Insere uma linha pendente na Planilha SKU. O insertId evita confundir
    // a linha criada por outra requisição concorrente.
    const insertedSku = await db.insert(skuSheetRows).values(insertValues);
    const targetSkuRowId = resultInsertId(insertedSku);
    if (!targetSkuRowId) {
      throw new Error("Não foi possível confirmar a linha SKU criada; o Kit original foi preservado.");
    }

    // 2) Registra no histórico (snapshot completo da linha original).
    const label =
      (kit.produto && kit.produto.trim()) ||
      (kit.kit && kit.kit.trim()) ||
      `Linha #${kit.id}`;
    await db.insert(migrationHistory).values({
      kind: "kit_to_sku",
      sourceKitRowId: kit.id,
      targetSkuRowId: targetSkuRowId ?? undefined,
      label: label.slice(0, 400),
      sku: "",
      snapshot: JSON.stringify(kit),
      migratedByOpenId: params.migratedByOpenId ?? undefined,
      migratedByName: params.migratedByName ?? undefined,
      migratedAt: now,
    });
    const createdHist = await db
      .select({ id: migrationHistory.id })
      .from(migrationHistory)
      .orderBy(desc(migrationHistory.id))
      .limit(1);
    if (createdHist[0]?.id) result.historyIds.push(createdHist[0].id);

    // 3) Remove a linha original de Kits (MOVE).
    await db.delete(kitSheetRows).where(eq(kitSheetRows.id, kit.id));

    if (targetSkuRowId) result.targetSkuRowIds.push(targetSkuRowId);
    result.migratedCount += 1;
  }

  return result;
}

/** Lista o histórico de migração (mais recentes primeiro). */
export async function listMigrationHistory(): Promise<MigrationHistory[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(migrationHistory)
    .orderBy(desc(migrationHistory.migratedAt), desc(migrationHistory.id));
}
