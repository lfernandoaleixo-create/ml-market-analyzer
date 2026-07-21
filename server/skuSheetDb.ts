import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  InsertSkuSheetRow,
  SkuSheetRow,
  skuSheetRows,
  SkuSheetCustomColumn,
  skuSheetCustomColumns,
} from "../drizzle/schema";
import {
  resolveVariantNumber,
  normalizeVariantNumbers,
  buildSku,
  buildSkuKit,
  type VariantNumberRow,
  type VariantFix,
} from "../shared/skuSheet";

// Campos cuja alteração afeta o SKU final (prefixo do grupo + variante).
const SKU_AFFECTING_FIELDS = [
  "tipoSku",
  "categoryName",
  "productNumber",
  "variantNumber",
  "gerarSkuKit",
] as const;

/**
 * TRAVA de unicidade (última linha de defesa no servidor).
 * Recebe o estado FINAL pretendido de uma linha (merge do patch) e o conjunto
 * de linhas existentes; recalcula a variante para o próximo Nº livre no grupo
 * (tipo+categoria+Nº produto) e recompõe sku/skuKit. Assim o banco nunca grava
 * um SKU duplicado — mesmo via colagem, importação ou edição concorrente.
 *
 * Retorna os campos que devem ser efetivamente persistidos (variantNumber, sku,
 * skuKit). Se o grupo for inválido (faltando tipo/categoria/Nº produto),
 * apenas recompõe o sku a partir dos dados atuais sem forçar variante.
 */
function enforceUniqueSku(
  finalRow: {
    id: number;
    tipoSku: string;
    categoryName: string | null;
    productNumber: number | null;
    variantNumber: number | null;
    gerarSkuKit: boolean;
  },
  existingRows: VariantNumberRow[],
): { variantNumber: number | null; sku: string; skuKit: string } {
  const variantNumber = resolveVariantNumber(existingRows, finalRow.id, {
    tipoSku: finalRow.tipoSku,
    categoryName: finalRow.categoryName,
    productNumber: finalRow.productNumber,
    variantNumber: finalRow.variantNumber,
  });
  const sku = buildSku({
    tipoSku: finalRow.tipoSku,
    categoryName: finalRow.categoryName,
    productNumber: finalRow.productNumber,
    variantNumber,
  });
  const skuKit = buildSkuKit(sku, finalRow.gerarSkuKit);
  return { variantNumber, sku, skuKit };
}

/** Carrega as linhas necessárias para o cálculo de unicidade (formato enxuto). */
async function loadVariantRows(): Promise<VariantNumberRow[]> {
  const rows = await listSkuRows();
  return rows.map((r) => ({
    id: r.id,
    tipoSku: r.tipoSku,
    categoryName: r.categoryName,
    productNumber: r.productNumber,
    variantNumber: r.variantNumber,
  }));
}

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
  const row = created[0];

  // TRAVA: se a linha nasceu com dados suficientes para um SKU, garante que
  // ele seja único (recalcula variante/sku considerando as demais linhas).
  const tipo = (row.tipoSku ?? "").trim();
  if (tipo && row.categoryName && row.productNumber != null) {
    const existing = await loadVariantRows();
    const enforced = enforceUniqueSku(
      {
        id: row.id,
        tipoSku: row.tipoSku,
        categoryName: row.categoryName,
        productNumber: row.productNumber,
        variantNumber: row.variantNumber,
        gerarSkuKit: row.gerarSkuKit,
      },
      existing,
    );
    if (
      enforced.variantNumber !== row.variantNumber ||
      enforced.sku !== row.sku ||
      enforced.skuKit !== row.skuKit
    ) {
      await db.update(skuSheetRows).set(enforced).where(eq(skuSheetRows.id, row.id));
      return { ...row, ...enforced };
    }
  }
  return row;
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
  let rows = await db.select().from(skuSheetRows).where(eq(skuSheetRows.id, id)).limit(1);
  const current = rows[0] ?? null;
  if (!current) return null;

  // TRAVA: quando o patch toca qualquer campo que compõe o SKU, revalida a
  // unicidade no servidor e corrige automaticamente a variante/sku se preciso.
  const touchesSku = SKU_AFFECTING_FIELDS.some((f) => f in safe);
  const tipo = (current.tipoSku ?? "").trim();
  if (touchesSku && tipo && current.categoryName && current.productNumber != null) {
    const existing = await loadVariantRows();
    const enforced = enforceUniqueSku(
      {
        id: current.id,
        tipoSku: current.tipoSku,
        categoryName: current.categoryName,
        productNumber: current.productNumber,
        variantNumber: current.variantNumber,
        gerarSkuKit: current.gerarSkuKit,
      },
      existing,
    );
    if (
      enforced.variantNumber !== current.variantNumber ||
      enforced.sku !== current.sku ||
      enforced.skuKit !== current.skuKit
    ) {
      await db.update(skuSheetRows).set(enforced).where(eq(skuSheetRows.id, id));
      rows = await db.select().from(skuSheetRows).where(eq(skuSheetRows.id, id)).limit(1);
    }
  }
  return rows[0] ?? null;
}

/** Exclui uma linha. */
export async function deleteSkuRow(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(skuSheetRows).where(eq(skuSheetRows.id, id));
}

// ---------------------------------------------------------------------------
// Reparo em massa das variantes (elimina SKUs duplicados)
// ---------------------------------------------------------------------------

export interface VariantRepairResult {
  /** Alterações aplicadas (antes/depois), com o SKU resultante. */
  changes: Array<{
    id: number;
    produto: string;
    fromVariant: number | null;
    toVariant: number;
    fromSku: string;
    toSku: string;
  }>;
}

/**
 * Recalcula e persiste as variantes de todas as linhas para garantir SKUs
 * únicos por grupo (tipo+categoria+Nº produto). Quando `dryRun` é true, apenas
 * calcula as mudanças (antes/depois) sem gravar.
 */
export async function repairVariantNumbers(
  dryRun = false,
): Promise<VariantRepairResult> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

  const rows = await listSkuRows();
  const fixes: VariantFix[] = normalizeVariantNumbers(
    rows.map((r) => ({
      id: r.id,
      tipoSku: r.tipoSku,
      categoryName: r.categoryName,
      productNumber: r.productNumber,
      variantNumber: r.variantNumber,
    })),
  );

  const byId = new Map(rows.map((r) => [r.id, r]));
  const changes: VariantRepairResult["changes"] = [];

  for (const fix of fixes) {
    const r = byId.get(fix.id);
    if (!r) continue;
    const toSku = buildSku({
      tipoSku: r.tipoSku,
      categoryName: r.categoryName,
      productNumber: r.productNumber,
      variantNumber: fix.to,
    });
    const toSkuKit = buildSkuKit(toSku, r.gerarSkuKit);
    changes.push({
      id: r.id,
      produto: r.produto,
      fromVariant: fix.from,
      toVariant: fix.to,
      fromSku: r.sku,
      toSku,
    });
    if (!dryRun) {
      await db
        .update(skuSheetRows)
        .set({ variantNumber: fix.to, sku: toSku, skuKit: toSkuKit })
        .where(eq(skuSheetRows.id, r.id));
    }
  }

  return { changes };
}

// ---------------------------------------------------------------------------
// Colunas personalizadas (criadas pelo usuário)
// ---------------------------------------------------------------------------

/** Lista as colunas personalizadas, ordenadas por posição. */
export async function listCustomColumns(): Promise<SkuSheetCustomColumn[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(skuSheetCustomColumns)
    .orderBy(asc(skuSheetCustomColumns.position), asc(skuSheetCustomColumns.id));
}

/** Cria uma nova coluna personalizada no fim da lista. */
export async function createCustomColumn(name: string): Promise<SkuSheetCustomColumn> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const rows = await db
    .select({ max: sql<number>`COALESCE(MAX(${skuSheetCustomColumns.position}), 0)` })
    .from(skuSheetCustomColumns);
  const position = (rows[0]?.max ?? 0) + 1;
  await db.insert(skuSheetCustomColumns).values({ name: name.trim() || "Nova coluna", position });
  const created = await db
    .select()
    .from(skuSheetCustomColumns)
    .orderBy(sql`${skuSheetCustomColumns.id} DESC`)
    .limit(1);
  return created[0];
}

/** Renomeia uma coluna personalizada. */
export async function renameCustomColumn(
  id: number,
  name: string,
): Promise<SkuSheetCustomColumn | null> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db
    .update(skuSheetCustomColumns)
    .set({ name: name.trim() })
    .where(eq(skuSheetCustomColumns.id, id));
  const rows = await db
    .select()
    .from(skuSheetCustomColumns)
    .where(eq(skuSheetCustomColumns.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Exclui uma coluna personalizada e remove seus valores de todas as linhas
 * (limpa a chave correspondente no JSON customValues).
 */
export async function deleteCustomColumn(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(skuSheetCustomColumns).where(eq(skuSheetCustomColumns.id, id));

  // Remove a chave desta coluna dos valores de cada linha que a contenha.
  const key = String(id);
  const rows = await db
    .select({ id: skuSheetRows.id, customValues: skuSheetRows.customValues })
    .from(skuSheetRows);
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
        .update(skuSheetRows)
        .set({ customValues: JSON.stringify(parsed) })
        .where(eq(skuSheetRows.id, r.id));
    }
  }
}

/**
 * Define o valor de uma coluna personalizada para uma linha específica.
 * Faz merge no JSON customValues (preserva os demais valores).
 */
export async function setCustomValue(
  rowId: number,
  columnId: number,
  value: string,
): Promise<SkuSheetRow | null> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const rows = await db
    .select({ customValues: skuSheetRows.customValues })
    .from(skuSheetRows)
    .where(eq(skuSheetRows.id, rowId))
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
    .update(skuSheetRows)
    .set({ customValues: JSON.stringify(parsed) })
    .where(eq(skuSheetRows.id, rowId));
  const updated = await db
    .select()
    .from(skuSheetRows)
    .where(eq(skuSheetRows.id, rowId))
    .limit(1);
  return updated[0] ?? null;
}

// ---------------------------------------------------------------------------
// Variações SKU (10 sub-variações por linha)
// ---------------------------------------------------------------------------

import { and } from "drizzle-orm";
import { skuVariations, SkuVariation } from "../drizzle/schema";

export interface SkuVariationData {
  variationIndex: number;
  variationSku: string;
  ean: string;
  mlb: string;
  done: boolean;
}

/**
 * Retorna as 10 variações de uma linha SKU. Se alguma não existir no banco,
 * retorna um placeholder com valores vazios (para preencher a tabela no front).
 */
export async function getVariations(
  skuRowId: number,
  baseSku: string,
): Promise<SkuVariationData[]> {
  const db = await getDb();
  if (!db) return buildEmptyVariations(baseSku);

  const rows = await db
    .select()
    .from(skuVariations)
    .where(eq(skuVariations.skuRowId, skuRowId))
    .orderBy(asc(skuVariations.variationIndex));

  const byIndex = new Map<number, SkuVariation>(rows.map((r) => [r.variationIndex, r]));
  const result: SkuVariationData[] = [];
  for (let i = 1; i <= 10; i++) {
    const existing = byIndex.get(i);
    const suffix = String(i).padStart(2, "0");
    result.push({
      variationIndex: i,
      variationSku: baseSku ? `${baseSku}-${suffix}` : "",
      ean: existing?.ean ?? "",
      mlb: existing?.mlb ?? "",
      done: existing?.done ?? false,
    });
  }
  return result;
}

function buildEmptyVariations(baseSku: string): SkuVariationData[] {
  return Array.from({ length: 10 }, (_, i) => {
    const idx = i + 1;
    const suffix = String(idx).padStart(2, "0");
    return {
      variationIndex: idx,
      variationSku: baseSku ? `${baseSku}-${suffix}` : "",
      ean: "",
      mlb: "",
      done: false,
    };
  });
}

/**
 * Insere ou atualiza uma variação específica de uma linha SKU.
 * Recalcula o variationSku com base no baseSku atual.
 */
export async function upsertVariation(
  skuRowId: number,
  variationIndex: number,
  baseSku: string,
  data: { ean?: string; mlb?: string; done?: boolean },
): Promise<SkuVariationData> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

  const suffix = String(variationIndex).padStart(2, "0");
  const variationSku = baseSku ? `${baseSku}-${suffix}` : "";

  // Check if row already exists
  const existing = await db
    .select()
    .from(skuVariations)
    .where(
      and(
        eq(skuVariations.skuRowId, skuRowId),
        eq(skuVariations.variationIndex, variationIndex),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing row
    const updateData: Record<string, unknown> = { variationSku };
    if (data.ean !== undefined) updateData.ean = data.ean;
    if (data.mlb !== undefined) updateData.mlb = data.mlb;
    if (data.done !== undefined) updateData.done = data.done;
    await db
      .update(skuVariations)
      .set(updateData)
      .where(
        and(
          eq(skuVariations.skuRowId, skuRowId),
          eq(skuVariations.variationIndex, variationIndex),
        ),
      );
  } else {
    // Insert new row (UNIQUE constraint prevents duplicates from race conditions)
    try {
      await db.insert(skuVariations).values({
        skuRowId,
        variationIndex,
        variationSku,
        ean: data.ean ?? "",
        mlb: data.mlb ?? "",
        done: data.done ?? false,
      });
    } catch (err: any) {
      // If duplicate key error, another request inserted first — do an update instead
      if (err?.code === "ER_DUP_ENTRY" || err?.errno === 1062) {
        const updateData: Record<string, unknown> = { variationSku };
        if (data.ean !== undefined) updateData.ean = data.ean;
        if (data.mlb !== undefined) updateData.mlb = data.mlb;
        if (data.done !== undefined) updateData.done = data.done;
        await db
          .update(skuVariations)
          .set(updateData)
          .where(
            and(
              eq(skuVariations.skuRowId, skuRowId),
              eq(skuVariations.variationIndex, variationIndex),
            ),
          );
      } else {
        throw err;
      }
    }
  }

  // Read back the actual stored row to return accurate data
  const readBack = await db
    .select()
    .from(skuVariations)
    .where(
      and(
        eq(skuVariations.skuRowId, skuRowId),
        eq(skuVariations.variationIndex, variationIndex),
      ),
    )
    .limit(1);

  const row = readBack[0];
  return {
    variationIndex,
    variationSku,
    ean: row?.ean ?? data.ean ?? "",
    mlb: row?.mlb ?? data.mlb ?? "",
    done: row?.done ?? data.done ?? false,
  };
}
