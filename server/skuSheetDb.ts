import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  InsertSkuSheetRow,
  SkuSheetRow,
  skuSheetRows,
  SkuSheetCustomColumn,
  skuSheetCustomColumns,
  skuProductNumberReservations,
  skuVariantNumberReservations,
  skuValueReservations,
  skuChangeLog,
} from "../drizzle/schema";
import {
  normalizeVariantNumbers,
  buildSku,
  buildSkuKit,
  normalizeVariantText,
  normalizeProductName,
  normalizeSku,
  resolveProductNumber,
  type VariantFix,
  type SkuMode,
} from "../shared/skuSheet";

/** Lista somente as linhas ativas da planilha, ordenadas por posição. */
export async function listSkuRows(): Promise<SkuSheetRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(skuSheetRows)
    .where(eq(skuSheetRows.isDeleted, false))
    .orderBy(asc(skuSheetRows.position), asc(skuSheetRows.id));
}

/** Lista inclusive tombstones; usada em numeração permanente e backup técnico. */
export async function listAllSkuRows(): Promise<SkuSheetRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(skuSheetRows).orderBy(asc(skuSheetRows.position), asc(skuSheetRows.id));
}

/** Lista a sequência permanente de Nº Produto, inclusive reservas anuladas. */
export async function listSkuProductNumberReservationsForBackup() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(skuProductNumberReservations)
    .orderBy(asc(skuProductNumberReservations.productNumber));
}

/** Lista as reservas permanentes de variantes para o backup técnico. */
export async function listSkuVariantNumberReservationsForBackup() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(skuVariantNumberReservations)
    .orderBy(asc(skuVariantNumberReservations.id));
}

/** Lista as reservas globais e append-only de valores de SKU. */
export async function listSkuValueReservationsForBackup() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(skuValueReservations)
    .orderBy(asc(skuValueReservations.id));
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

function resultAffectedRows(result: unknown): number | null {
  const direct = (result as { affectedRows?: number })?.affectedRows;
  if (typeof direct === "number") return direct;
  if (Array.isArray(result)) {
    const nested = (result[0] as { affectedRows?: number } | undefined)?.affectedRows;
    if (typeof nested === "number") return nested;
  }
  return null;
}

/**
 * O DrizzleQueryError guarda o erro original do MySQL em `cause`. Verificar só
 * `error.code` deixa uma colisão idempotente escapar como "Failed query".
 */
function isDuplicateEntryError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;

  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || (typeof current !== "object" && typeof current !== "function")) {
      return false;
    }
    if (seen.has(current)) return false;
    seen.add(current);

    const candidate = current as {
      code?: unknown;
      errno?: unknown;
      cause?: unknown;
      originalError?: unknown;
      driverError?: unknown;
    };
    if (
      candidate.code === "ER_DUP_ENTRY" ||
      candidate.errno === 1062 ||
      candidate.errno === "1062"
    ) {
      return true;
    }

    current = candidate.cause ?? candidate.originalError ?? candidate.driverError;
  }

  return false;
}

/**
 * Reserva de forma permanente o próximo Nº Produto comercial.
 *
 * Nunca usa o valor gerado pelo AUTO_INCREMENT: bancos distribuídos como TiDB
 * podem saltar blocos inteiros (ex.: 29 -> 30002). O número comercial é sempre
 * o maior número válido já reservado + 1. Reservas anuladas continuam no banco
 * para nunca serem recicladas, mas não avançam a sequência comercial.
 */
async function reserveNextProductNumber(skuRowId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

  const alreadyReserved = await db
    .select()
    .from(skuProductNumberReservations)
    .where(eq(skuProductNumberReservations.skuRowId, skuRowId))
    .limit(1);
  if (alreadyReserved[0] && !alreadyReserved[0].isVoided) {
    return alreadyReserved[0].productNumber;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const maximum = await db
      .select({ max: sql<number>`COALESCE(MAX(${skuProductNumberReservations.productNumber}), 0)` })
      .from(skuProductNumberReservations)
      .where(eq(skuProductNumberReservations.isVoided, false));
    let candidate = (maximum[0]?.max ?? 0) + 1;

    // Uma reserva anulada não dita o próximo número, mas também nunca pode ser
    // reciclada. Carregamos as ocupações em uma consulta e pulamos localmente,
    // evitando uma query por tombstone consecutivo.
    const occupiedRows = await db
      .select({ productNumber: skuProductNumberReservations.productNumber })
      .from(skuProductNumberReservations)
      .orderBy(asc(skuProductNumberReservations.productNumber));
    const occupiedNumbers = new Set(occupiedRows.map((row) => row.productNumber));
    while (occupiedNumbers.has(candidate)) candidate += 1;

    try {
      await db.insert(skuProductNumberReservations).values({
        productNumber: candidate,
        skuRowId,
        isVoided: false,
      });
      return candidate;
    } catch (error: any) {
      // Outra requisição pode ter reservado o mesmo número ou skuRowId.
      if (!isDuplicateEntryError(error)) throw error;
      const concurrent = await db
        .select()
        .from(skuProductNumberReservations)
        .where(eq(skuProductNumberReservations.skuRowId, skuRowId))
        .limit(1);
      if (concurrent[0] && !concurrent[0].isVoided) return concurrent[0].productNumber;
    }
  }
  throw new Error("Não foi possível reservar o Nº Produto após tentativas concorrentes.");
}

/**
 * Reserva o próximo Nº Variante do grupo. O índice único do grupo elimina a
 * corrida entre abas: em colisão, a função relê o máximo e tenta o próximo.
 */
async function reserveNextVariantNumber(input: {
  skuRowId: number;
  tipoSku: string;
  categoryName: string;
  productNumber: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const tipoSku = input.tipoSku.trim();
  const categoryKey = input.categoryName.trim().toLowerCase();
  if (!tipoSku || !categoryKey) throw new Error("DADOS_SKU_INCOMPLETOS");

  const existing = await db
    .select()
    .from(skuVariantNumberReservations)
    .where(eq(skuVariantNumberReservations.skuRowId, input.skuRowId))
    .limit(1);
  if (existing[0]) return existing[0].variantNumber;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const maximum = await db
      .select({ max: sql<number>`coalesce(max(${skuVariantNumberReservations.variantNumber}), 0)` })
      .from(skuVariantNumberReservations)
      .where(
        and(
          eq(skuVariantNumberReservations.tipoSku, tipoSku),
          eq(skuVariantNumberReservations.categoryKey, categoryKey),
          eq(skuVariantNumberReservations.productNumber, input.productNumber),
        ),
      );
    const candidate = (maximum[0]?.max ?? 0) + 1;
    try {
      await db.insert(skuVariantNumberReservations).values({
        skuRowId: input.skuRowId,
        tipoSku,
        categoryKey,
        productNumber: input.productNumber,
        variantNumber: candidate,
      });
      return candidate;
    } catch (error: any) {
      if (!isDuplicateEntryError(error)) throw error;
      const concurrent = await db
        .select()
        .from(skuVariantNumberReservations)
        .where(eq(skuVariantNumberReservations.skuRowId, input.skuRowId))
        .limit(1);
      if (concurrent[0]) return concurrent[0].variantNumber;
    }
  }
  throw new Error("Não foi possível reservar o Nº Variante após tentativas concorrentes.");
}

/** Reserva global e append-only do valor normalizado de um SKU. */
async function reserveUniqueSkuValue(input: {
  sku: string;
  sourceType: "main" | "variation";
  sourceKey: string;
}, dbOverride?: any): Promise<boolean> {
  const db = dbOverride ?? (await getDb());
  if (!db) throw new Error("DB indisponível");
  const normalizedSku = normalizeSku(input.sku);
  if (!normalizedSku) throw new Error("SKU_MANUAL_OBRIGATORIO");
  try {
    await db.insert(skuValueReservations).values({
      normalizedSku,
      originalSku: input.sku,
      sourceType: input.sourceType,
      sourceKey: input.sourceKey,
    });
    return true;
  } catch (error: any) {
    if (!isDuplicateEntryError(error)) throw error;
  }

  const existing = await db
    .select()
    .from(skuValueReservations)
    .where(eq(skuValueReservations.normalizedSku, normalizedSku))
    .limit(1);
  if (
    existing[0]?.sourceType === input.sourceType &&
    existing[0]?.sourceKey === input.sourceKey
  ) {
    return false;
  }
  throw new Error("SKU_VALUE_ALREADY_RESERVED");
}

/**
 * Registra o valor no histórico global quando ainda é inédito. Em uma edição
 * manual, uma reserva já existente significa repetição intencional e não é
 * erro; a primeira reserva continua preservando o uso histórico do valor.
 */
async function reserveManualSkuValueIfAvailable(input: {
  sku: string;
  sourceType: "main" | "variation";
  sourceKey: string;
}, dbOverride?: any): Promise<boolean> {
  try {
    return await reserveUniqueSkuValue(input, dbOverride);
  } catch (error: any) {
    if (error?.message === "SKU_VALUE_ALREADY_RESERVED") return false;
    throw error;
  }
}

async function resolvePermanentProductNumber(
  skuRowId: number,
  productName: string,
  currentProductNumber: number | null,
): Promise<number | null> {
  const key = normalizeProductName(productName);
  if (!key) return null;
  if (currentProductNumber != null && currentProductNumber > 0) return currentProductNumber;

  const allRows = await listAllSkuRows();
  const activeRows = allRows.filter((row) => !row.isDeleted);
  const reused = resolveProductNumber(
    activeRows.map((row) => ({
      id: row.id,
      produto: row.produto,
      productNumber: row.productNumber,
    })),
    skuRowId,
    productName,
    null,
  );
  const sameNameExists = activeRows.some(
    (row) =>
      row.id !== skuRowId &&
      row.productNumber != null &&
      normalizeProductName(row.produto) === key,
  );
  if (sameNameExists) return reused;
  return reserveNextProductNumber(skuRowId);
}

/** Cria uma nova linha (em branco ou com valores parciais) no fim da planilha. */
export async function createSkuRow(
  values: Partial<InsertSkuSheetRow> = {},
): Promise<SkuSheetRow> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const position = values.position ?? (await nextPosition());
  const safeValues = {
    ...values,
    productNumber: null,
    variantNumber: null,
    sku: "",
    skuKit: "",
    skuMode: "pending",
    skuSourceRowId: null,
    skuDecisionAt: null,
  } as const;
  await db.insert(skuSheetRows).values({ ...safeValues, position });
  const created = await db
    .select()
    .from(skuSheetRows)
    .orderBy(sql`${skuSheetRows.id} DESC`)
    .limit(1);
  const row = created[0];

  return row;
}

type SkuIdentity = {
  tipoSku: string;
  categoryName: string | null;
  produto: string;
  variante: string;
  caracteristicas?: string | null;
};

function sameSkuIdentity(row: SkuIdentity, candidate: SkuIdentity): boolean {
  return (
    (row.tipoSku ?? "").trim() === (candidate.tipoSku ?? "").trim() &&
    normalizeProductName(row.categoryName) === normalizeProductName(candidate.categoryName) &&
    normalizeProductName(row.produto) === normalizeProductName(candidate.produto) &&
    normalizeVariantText(row.variante) === normalizeVariantText(candidate.variante) &&
    normalizeProductName(row.caracteristicas) === normalizeProductName(candidate.caracteristicas)
  );
}

/** Localiza produtos/variantes idênticos ativos; tombstones nunca são reutilizados. */
async function findMatchingSkuRows(
  rowId: number,
  merged: SkuIdentity,
): Promise<SkuSheetRow[]> {
  if (!normalizeProductName(merged.produto) || !normalizeVariantText(merged.variante)) return [];
  const allRows = await listAllSkuRows();
  return allRows.filter(
    (row) => !row.isDeleted && row.id !== rowId && Boolean(row.sku) && sameSkuIdentity(merged, row),
  );
}

/** Atualiza campos de uma linha existente. */
export async function updateSkuRow(
  id: number,
  patch: Partial<InsertSkuSheetRow>,
  expectedRevision: number,
): Promise<SkuSheetRow | null> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const currentRows = await db
    .select()
    .from(skuSheetRows)
    .where(eq(skuSheetRows.id, id))
    .limit(1);
  const before = currentRows[0];
  if (!before || before.isDeleted) return null;
  if (before.revision !== expectedRevision) throw new Error("SKU_DECISION_STALE");

  // Campos de controle só podem ser alterados pelos procedimentos específicos.
  const {
    id: _ignore,
    createdAt: _ignore2,
    isDeleted: _ignore3,
    deletedAt: _ignore4,
    skuMode: _ignore5,
    skuSourceRowId: _ignore6,
    skuDecisionAt: _ignore7,
    productNumber: _ignore8,
    variantNumber: _ignore9,
    sku: _ignore10,
    skuKit: _ignore11,
    revision: _ignore12,
    ...safe
  } = patch as Record<string, unknown>;

  const identityFields = [
    "tipoSku",
    "categoryId",
    "categoryName",
    "subCategoryId",
    "subCategoryName",
    "produto",
    "variante",
    "caracteristicas",
    "gerarSkuKit",
  ];
  if (before.skuMode !== "pending") {
    const changedIdentity = identityFields.some(
      (field) => field in safe && safe[field] !== (before as unknown as Record<string, unknown>)[field],
    );
    if (changedIdentity) throw new Error("SKU_FINALIZADO_IMUTAVEL");
    for (const field of identityFields) delete safe[field];
  }

  if ("gerarSkuKit" in safe && before.skuMode !== "pending") {
    safe.skuKit = buildSkuKit(before.sku, Boolean(safe.gerarSkuKit));
  }

  // Nº Produto é atribuído no servidor e nunca depende apenas das linhas visíveis.
  if ("produto" in safe && before.productNumber == null) {
    safe.productNumber = await resolvePermanentProductNumber(
      id,
      String(safe.produto ?? before.produto),
      before.productNumber,
    );
  }

  // Uma nova linha que se torne idêntica fica pendente de escolha explícita no
  // card. Não bloqueamos o preenchimento e também não gravamos um SKU ambíguo.
  const touchesIdentity = identityFields.some((f) => f in safe);
  if (touchesIdentity) {
    const merged: SkuIdentity = {
      tipoSku: (safe.tipoSku as string) ?? before.tipoSku,
      categoryName: (safe.categoryName as string | null) ?? before.categoryName,
      produto: (safe.produto as string) ?? before.produto,
      variante: (safe.variante as string) ?? before.variante,
      caracteristicas: (safe.caracteristicas as string | null) ?? before.caracteristicas,
    };
    const matches = await findMatchingSkuRows(id, merged);
    if (matches.length > 0) {
      if (before.skuMode === "pending") {
        safe.sku = "";
        safe.skuKit = "";
        safe.skuSourceRowId = null;
        safe.skuDecisionAt = null;
      } else if (before.skuMode !== "reuse") {
        throw new Error(
          `SKU_DECISION_REQUIRED|Este produto já existe (linha #${matches[0].position}). Abra o card do SKU e escolha manter, gerar novo ou editar manualmente.`
        );
      }
    }
  }

  if (Object.keys(safe).length > 0) {
    const updated = await db
      .update(skuSheetRows)
      .set({ ...safe, revision: sql`${skuSheetRows.revision} + 1` })
      .where(and(eq(skuSheetRows.id, id), eq(skuSheetRows.revision, expectedRevision)));
    if (resultAffectedRows(updated) === 0) throw new Error("SKU_DECISION_STALE");
  }
  const rows = await db.select().from(skuSheetRows).where(eq(skuSheetRows.id, id)).limit(1);
  // Uma linha nova nunca é finalizada por digitação/blur. Produto e Variante
  // permanecem editáveis enquanto skuMode="pending". A reserva de Nº Variante,
  // o valor do SKU e o congelamento da identidade acontecem exclusivamente em
  // applySkuDecision, depois de uma escolha explícita no card.
  return rows[0] ?? null;
}

/**
 * Exclui logicamente uma linha sem tocar nos seus dados, números ou variações.
 * A operação é idempotente e não depende da revisão vista no navegador: qualquer
 * usuário autenticado que confirmar a exclusão consegue concluir a ação mesmo
 * quando outra pessoa acabou de editar a linha.
 */
export async function deleteSkuRow(id: number): Promise<SkuSheetRow | null> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const rows = await db.select().from(skuSheetRows).where(eq(skuSheetRows.id, id)).limit(1);
  const row = rows[0] ?? null;
  if (!row || row.isDeleted) return row;
  const deleted = await db
    .update(skuSheetRows)
    .set({
      isDeleted: true,
      deletedAt: Date.now(),
      revision: sql`${skuSheetRows.revision} + 1`,
    })
    .where(and(eq(skuSheetRows.id, id), eq(skuSheetRows.isDeleted, false)));
  if (resultAffectedRows(deleted) === 0) {
    return { ...row, isDeleted: true };
  }
  return row;
}

export type SkuDecisionMode = "reuse" | "auto" | "manual";

export type SkuDecisionContext = {
  rowId: number;
  mode: SkuMode;
  currentSku: string;
  revision: number;
  identityComplete: boolean;
  requiresDecision: boolean;
  matches: Array<{
    id: number;
    position: number;
    produto: string;
    variante: string;
    sku: string;
    isDeleted: boolean;
  }>;
};

/** Retorna as opções válidas para a decisão mostrada no card do SKU. */
export async function getSkuDecisionContext(skuRowId: number): Promise<SkuDecisionContext> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const rows = await db
    .select()
    .from(skuSheetRows)
    .where(eq(skuSheetRows.id, skuRowId))
    .limit(1);
  const row = rows[0];
  if (!row || row.isDeleted) throw new Error("LINHA_SKU_NAO_ENCONTRADA");

  const identityComplete = Boolean(
    normalizeProductName(row.produto) && normalizeVariantText(row.variante),
  );
  const matches = identityComplete ? await findMatchingSkuRows(row.id, row) : [];
  return {
    rowId: row.id,
    mode: row.skuMode as SkuMode,
    currentSku: row.sku,
    revision: row.revision,
    identityComplete,
    requiresDecision: row.skuMode === "pending" && identityComplete,
    matches: matches.map((match) => ({
      id: match.id,
      position: match.position,
      produto: match.produto,
      variante: match.variante,
      sku: match.sku,
      isDeleted: match.isDeleted,
    })),
  };
}

/**
 * Aplica somente à linha indicada a escolha explícita feita no card do SKU.
 * Nenhuma outra linha ou variação é atualizada.
 */
export async function applySkuDecision(input: {
  skuRowId: number;
  mode: SkuDecisionMode;
  sourceRowId?: number;
  manualSku?: string;
  expectedRevision: number;
}): Promise<SkuSheetRow> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

  const currentRows = await db
    .select()
    .from(skuSheetRows)
    .where(eq(skuSheetRows.id, input.skuRowId))
    .limit(1);
  const current = currentRows[0];
  if (!current || current.isDeleted) throw new Error("LINHA_SKU_NAO_ENCONTRADA");
  if (current.revision !== input.expectedRevision) throw new Error("SKU_DECISION_STALE");
  if (current.skuMode !== "pending") throw new Error("SKU_DECISION_NOT_ALLOWED");
  if (!normalizeProductName(current.produto) || !normalizeVariantText(current.variante)) {
    throw new Error("IDENTIDADE_SKU_INCOMPLETA");
  }

  let updateData: Partial<InsertSkuSheetRow>;
  if (input.mode === "reuse") {
    if (!input.sourceRowId || input.sourceRowId === current.id) {
      throw new Error("FONTE_SKU_INVALIDA");
    }
    const sourceRows = await db
      .select()
      .from(skuSheetRows)
      .where(eq(skuSheetRows.id, input.sourceRowId))
      .limit(1);
    const source = sourceRows[0];
    if (!source || source.isDeleted || !source.sku || !sameSkuIdentity(current, source)) {
      throw new Error("FONTE_SKU_INVALIDA");
    }
    updateData = {
      productNumber: source.productNumber,
      variantNumber: source.variantNumber,
      sku: source.sku,
      skuKit: buildSkuKit(source.sku, current.gerarSkuKit),
      skuMode: "reuse",
      skuSourceRowId: source.id,
      skuDecisionAt: Date.now(),
    };
  } else if (input.mode === "auto") {
    const matches = await findMatchingSkuRows(current.id, current);
    const matchedProductNumber = matches.find((match) => match.productNumber != null)?.productNumber;
    const productNumber = matchedProductNumber ?? await resolvePermanentProductNumber(
      current.id,
      current.produto,
      current.productNumber,
    );
    if (productNumber == null) throw new Error("DADOS_SKU_INCOMPLETOS");
    const variantNumber = await reserveNextVariantNumber({
      skuRowId: current.id,
      tipoSku: current.tipoSku,
      categoryName: current.categoryName ?? "",
      productNumber,
    });
    const sku = buildSku({
      tipoSku: current.tipoSku,
      categoryName: current.categoryName,
      productNumber,
      variantNumber,
    });
    if (!sku) throw new Error("DADOS_SKU_INCOMPLETOS");
    await reserveUniqueSkuValue({
      sku,
      sourceType: "main",
      sourceKey: String(current.id),
    });
    updateData = {
      productNumber,
      variantNumber,
      sku,
      skuKit: buildSkuKit(sku, current.gerarSkuKit),
      skuMode: "auto",
      skuSourceRowId: null,
      skuDecisionAt: Date.now(),
    };
  } else {
    const manualSku = (input.manualSku ?? "").trim();
    if (!manualSku) throw new Error("SKU_MANUAL_OBRIGATORIO");
    await reserveManualSkuValueIfAvailable({
      sku: manualSku,
      sourceType: "main",
      sourceKey: String(current.id),
    });
    updateData = {
      sku: manualSku,
      skuKit: buildSkuKit(manualSku, current.gerarSkuKit),
      skuMode: "manual",
      skuSourceRowId: null,
      skuDecisionAt: Date.now(),
    };
  }

  const applied = await db
    .update(skuSheetRows)
    .set({ ...updateData, revision: sql`${skuSheetRows.revision} + 1` })
    .where(and(eq(skuSheetRows.id, current.id), eq(skuSheetRows.revision, input.expectedRevision)));
  if (resultAffectedRows(applied) === 0) {
    throw new Error("SKU_DECISION_STALE");
  }
  const updated = await db
    .select()
    .from(skuSheetRows)
    .where(eq(skuSheetRows.id, current.id))
    .limit(1);
  if (!updated[0]) throw new Error("LINHA_SKU_NAO_ENCONTRADA");
  if (updated[0].revision !== input.expectedRevision + 1) throw new Error("SKU_DECISION_STALE");
  return updated[0];
}

/**
 * Edita somente o texto do SKU principal de uma linha já existente.
 * Nº Produto, Nº Variante e variações permanecem intocados. O novo valor fica
 * reservado para esta linha; valores antigos continuam reservados no histórico.
 */
export async function editMainSkuManually(input: {
  skuRowId: number;
  newSku: string;
  expectedRevision: number;
  actor: string;
}): Promise<{ previousSku: string; updated: SkuSheetRow }> {
  const rootDb = await getDb();
  if (!rootDb) throw new Error("DB indisponível");
  return rootDb.transaction(async (db) => {

  const currentRows = await db
    .select()
    .from(skuSheetRows)
    .where(eq(skuSheetRows.id, input.skuRowId))
    .limit(1);
  const current = currentRows[0];
  if (!current || current.isDeleted) throw new Error("LINHA_SKU_NAO_ENCONTRADA");
  if (current.revision !== input.expectedRevision) throw new Error("SKU_DECISION_STALE");

  const newSku = input.newSku.trim();
  if (!newSku) throw new Error("SKU_MANUAL_OBRIGATORIO");
  const previousSku = current.sku;
  if (newSku === previousSku) return { previousSku, updated: current };

  const normalized = normalizeSku(newSku);
  const sameNormalizedValue = normalized === normalizeSku(previousSku);
  if (!sameNormalizedValue) {
    await reserveManualSkuValueIfAvailable({
      sku: newSku,
      sourceType: "main",
      sourceKey: String(current.id),
    }, db);
  }

  const applied = await db
    .update(skuSheetRows)
    .set({
      sku: newSku,
      skuMode: "manual",
      skuSourceRowId: null,
      skuDecisionAt: Date.now(),
      revision: sql`${skuSheetRows.revision} + 1`,
    })
    .where(
      and(
        eq(skuSheetRows.id, current.id),
        eq(skuSheetRows.revision, input.expectedRevision),
      ),
    );
  if (resultAffectedRows(applied) === 0) {
    throw new Error("SKU_DECISION_STALE");
  }

  const updatedRows = await db
    .select()
    .from(skuSheetRows)
    .where(eq(skuSheetRows.id, current.id))
    .limit(1);
  const updated = updatedRows[0];
  if (!updated) throw new Error("LINHA_SKU_NAO_ENCONTRADA");
  await db.insert(skuChangeLog).values({
    action: "manual_sku_edit",
    authorizedBy: "Guilherme",
    description: `SKU principal da linha ${updated.id} editado manualmente por ${input.actor}. Repetição intencional é permitida neste fluxo; números e variações não foram alterados.`,
    affectedRowIds: JSON.stringify([updated.id]),
    oldValues: JSON.stringify({ sku: previousSku }),
    newValues: JSON.stringify({ sku: updated.sku }),
    affectedCount: 1,
    timestamp: Date.now(),
  });
  return { previousSku, updated };
  });
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
 * Diagnóstico somente leitura de variantes potencialmente conflitantes.
 * A aplicação automática foi removida para garantir que SKUs históricos nunca
 * sejam reescritos por uma rotina de reparo.
 */
export async function repairVariantNumbers(): Promise<VariantRepairResult> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

  const rows = await listAllSkuRows();
  const fixes: VariantFix[] = normalizeVariantNumbers(
    rows.map((r) => ({
      id: r.id,
      tipoSku: r.tipoSku,
      categoryName: r.categoryName,
      productNumber: r.productNumber,
      variantNumber: r.variantNumber,
      skuMode: r.skuMode,
      skuSourceRowId: r.skuSourceRowId,
    })),
  );

  const byId = new Map(rows.map((r) => [r.id, r]));
  const changes: VariantRepairResult["changes"] = [];

  for (const fix of fixes) {
    const r = byId.get(fix.id);
    if (!r || r.isDeleted || r.skuMode === "reuse") continue;
    const toSku = buildSku({
      tipoSku: r.tipoSku,
      categoryName: r.categoryName,
      productNumber: r.productNumber,
      variantNumber: fix.to,
    });
    changes.push({
      id: r.id,
      produto: r.produto,
      fromVariant: fix.from,
      toVariant: fix.to,
      fromSku: r.sku,
      toSku,
    });
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
  const key = String(columnId);

  // Compare-and-swap no próprio JSON: se outra pessoa salvar outra coluna entre
  // a leitura e a escrita, a condição falha, relê o JSON novo e tenta o merge
  // novamente. Assim duas chaves diferentes nunca apagam uma à outra.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rows = await db
      .select({ customValues: skuSheetRows.customValues })
      .from(skuSheetRows)
      .where(eq(skuSheetRows.id, rowId))
      .limit(1);
    if (rows.length === 0) return null;

    const snapshot = rows[0].customValues;
    let parsed: Record<string, string> = {};
    if (snapshot) {
      try {
        parsed = JSON.parse(snapshot) as Record<string, string>;
      } catch {
        parsed = {};
      }
    }
    parsed[key] = value;
    const updated = await db
      .update(skuSheetRows)
      .set({ customValues: JSON.stringify(parsed) })
      .where(
        and(
          eq(skuSheetRows.id, rowId),
          snapshot === null
            ? isNull(skuSheetRows.customValues)
            : eq(skuSheetRows.customValues, snapshot),
        ),
      );
    if (resultAffectedRows(updated) === 0) continue;

    const fresh = await db
      .select()
      .from(skuSheetRows)
      .where(eq(skuSheetRows.id, rowId))
      .limit(1);
    return fresh[0] ?? null;
  }
  throw new Error("CUSTOM_VALUE_CONCURRENT");
}

// ---------------------------------------------------------------------------
// Variações SKU (10 sub-variações por linha)
// ---------------------------------------------------------------------------

import { skuVariations, SkuVariation } from "../drizzle/schema";

export interface SkuVariationData {
  variationIndex: number;
  variationSku: string;
  ean: string;
  mlb: string;
  done: boolean;
  revision: number;
}

/**
 * Retorna todas as variações persistidas para backup técnico, inclusive as
 * excluídas logicamente. Esta consulta nunca é usada na UI e não altera dados.
 */
export async function listSkuVariationsForBackup(): Promise<SkuVariation[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(skuVariations)
    .orderBy(asc(skuVariations.skuRowId), asc(skuVariations.variationIndex));
}

/**
 * Retorna as variações ativas de uma linha SKU. As 10 posições iniciais são
 * exibidas como placeholders enquanto ainda não foram persistidas. Posições
 * excluídas logicamente permanecem reservadas e nunca são exibidas/reutilizadas.
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
  const maxIndex = Math.max(10, ...rows.map((r) => r.variationIndex));
  for (let i = 1; i <= maxIndex; i++) {
    const existing = byIndex.get(i);
    if (existing?.isDeleted) continue;
    const suffix = String(i).padStart(2, "0");
    const derivedSku = baseSku ? `${baseSku}-${suffix}` : "";
    result.push({
      variationIndex: i,
      variationSku: existing?.variationSku || derivedSku,
      ean: existing?.ean ?? "",
      mlb: existing?.mlb ?? "",
      done: existing?.done ?? false,
      revision: existing ? (existing.revision ?? 1) : 0,
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
      revision: 0,
    };
  });
}

/** Persistência interna. `explicitSku` só pode ser usado pelo fluxo manual auditado. */
async function persistVariation(
  skuRowId: number,
  variationIndex: number,
  baseSku: string,
  data: {
    explicitSku?: string;
    ean?: string;
    mlb?: string;
    done?: boolean;
    expectedRevision: number;
  },
  dbOverride?: any,
): Promise<SkuVariationData> {
  const db = dbOverride ?? (await getDb());
  if (!db) throw new Error("DB indisponível");

  const suffix = String(variationIndex).padStart(2, "0");

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

  const variationSku = (
    data.explicitSku ??
    existing[0]?.variationSku ??
    (baseSku ? `${baseSku}-${suffix}` : "")
  ).trim();

  if (existing[0]?.isDeleted) {
    throw new Error("VARIACAO_EXCLUIDA_PERMANENTE");
  }
  const existingRevision = existing[0] ? (existing[0].revision ?? 1) : 0;
  if (existingRevision !== data.expectedRevision) {
    throw new Error("VARIACAO_CONCORRENTE");
  }

  if (!variationSku) {
    throw new Error("SKU_VARIACAO_OBRIGATORIO");
  }

  // Metadados de uma variação já existente não precisam reservar novamente seu
  // SKU. Uma criação automática continua estrita; somente `explicitSku`, vindo
  // do lápis auditado, pode repetir intencionalmente um valor já reservado.
  if (existing.length === 0 || data.explicitSku !== undefined) {
    try {
      const reserve = data.explicitSku !== undefined
        ? reserveManualSkuValueIfAvailable
        : reserveUniqueSkuValue;
      await reserve({
        sku: variationSku,
        sourceType: "variation",
        sourceKey: `${skuRowId}:${variationIndex}`,
      }, db);
    } catch (error: any) {
      if (error?.message === "SKU_VALUE_ALREADY_RESERVED") {
        throw new Error("SKU_VARIACAO_DUPLICADO");
      }
      throw error;
    }
  }

  if (existing.length > 0) {
    const updateData: Record<string, unknown> = { variationSku, isDeleted: false };
    if (data.ean !== undefined) updateData.ean = data.ean;
    if (data.mlb !== undefined) updateData.mlb = data.mlb;
    if (data.done !== undefined) updateData.done = data.done;
    updateData.revision = sql`${skuVariations.revision} + 1`;
    const updated = await db
      .update(skuVariations)
      .set(updateData)
      .where(
        and(
          eq(skuVariations.skuRowId, skuRowId),
          eq(skuVariations.variationIndex, variationIndex),
          eq(skuVariations.revision, data.expectedRevision),
        ),
      );
    if (resultAffectedRows(updated) === 0) {
      throw new Error("VARIACAO_CONCORRENTE");
    }
  } else {
    try {
      await db.insert(skuVariations).values({
        skuRowId,
        variationIndex,
        variationSku,
        ean: data.ean ?? "",
        mlb: data.mlb ?? "",
        done: data.done ?? false,
        isDeleted: false,
        revision: 1,
      });
    } catch (err: any) {
      if (isDuplicateEntryError(err)) {
        throw new Error("VARIACAO_CONCORRENTE");
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
    revision: row?.revision ?? 1,
  };
}

/**
 * Insere ou atualiza somente metadados da variação. Este contrato não aceita
 * `variationSku`; mudanças de SKU passam exclusivamente pelo fluxo auditado.
 */
export async function upsertVariation(
  skuRowId: number,
  variationIndex: number,
  baseSku: string,
  data: {
    ean?: string;
    mlb?: string;
    done?: boolean;
    expectedRevision: number;
  },
): Promise<SkuVariationData> {
  return persistVariation(skuRowId, variationIndex, baseSku, data);
}

/**
 * Edita exclusivamente o texto do SKU de uma variação. Repetições são aceitas
 * apenas aqui, como escolha manual auditada; números e demais campos não mudam.
 */
export async function editVariationSkuManually(input: {
  skuRowId: number;
  variationIndex: number;
  baseSku: string;
  newSku: string;
  expectedRevision: number;
  actor: string;
}): Promise<{ previousSku: string; updated: SkuVariationData }> {
  const rootDb = await getDb();
  if (!rootDb) throw new Error("DB indisponível");
  return rootDb.transaction(async (db) => {
  const existing = await db
    .select()
    .from(skuVariations)
    .where(
      and(
        eq(skuVariations.skuRowId, input.skuRowId),
        eq(skuVariations.variationIndex, input.variationIndex),
      ),
    )
    .limit(1);
  if (existing[0]?.isDeleted) throw new Error("VARIACAO_EXCLUIDA_PERMANENTE");
  const previousSku =
    existing[0]?.variationSku ||
    (input.baseSku
      ? `${input.baseSku}-${String(input.variationIndex).padStart(2, "0")}`
      : "");
  const updated = await persistVariation(
    input.skuRowId,
    input.variationIndex,
    input.baseSku,
    {
      explicitSku: input.newSku,
      expectedRevision: input.expectedRevision,
    },
    db,
  );
  if (previousSku !== updated.variationSku) {
    await db.insert(skuChangeLog).values({
      action: "manual_variation_sku_edit",
      authorizedBy: "Guilherme",
      description: `SKU da variação ${input.variationIndex} da linha ${input.skuRowId} editado manualmente por ${input.actor}. Repetição intencional é permitida neste fluxo; não houve renumeração.`,
      affectedRowIds: JSON.stringify([input.skuRowId]),
      oldValues: JSON.stringify({
        variationIndex: input.variationIndex,
        variationSku: previousSku,
      }),
      newValues: JSON.stringify({
        variationIndex: input.variationIndex,
        variationSku: updated.variationSku,
      }),
      affectedCount: 1,
      timestamp: Date.now(),
    });
  }
  return { previousSku, updated };
  });
}

/**
 * Adiciona uma nova variação sem reutilizar índices já usados ou excluídos.
 * Os 10 slots iniciais ficam reservados; a primeira adição manual é a posição 11.
 */
export async function addVariation(
  skuRowId: number,
  baseSku: string,
): Promise<SkuVariationData> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const rows = await db
      .select()
      .from(skuVariations)
      .where(eq(skuVariations.skuRowId, skuRowId));
    const maxUsedIndex = rows.reduce((max, row) => Math.max(max, row.variationIndex), 10);
    const variationIndex = maxUsedIndex + 1;
    const variationSku = `${baseSku}-${String(variationIndex).padStart(2, "0")}`;
    try {
      await reserveUniqueSkuValue({
        sku: variationSku,
        sourceType: "variation",
        sourceKey: `${skuRowId}:${variationIndex}`,
      });
    } catch (error: any) {
      if (error?.message === "SKU_VALUE_ALREADY_RESERVED") {
        throw new Error("SKU_VARIACAO_DUPLICADO");
      }
      throw error;
    }
    try {
      await db.insert(skuVariations).values({
        skuRowId,
        variationIndex,
        variationSku,
        ean: "",
        mlb: "",
        done: false,
        isDeleted: false,
        revision: 1,
      });
      return { variationIndex, variationSku, ean: "", mlb: "", done: false, revision: 1 };
    } catch (error: any) {
      if (!isDuplicateEntryError(error)) throw error;
    }
  }
  throw new Error("Não foi possível reservar uma nova variação após tentativas concorrentes.");
}

/**
 * Exclui uma variação logicamente. O índice e o SKU permanecem reservados no
 * banco, impedindo renumeração ou reutilização acidental no futuro.
 */
export async function deleteVariation(
  skuRowId: number,
  variationIndex: number,
  baseSku: string,
): Promise<{ ok: true }> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

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
    if (existing[0].isDeleted) return { ok: true };
    await db
      .update(skuVariations)
      .set({ isDeleted: true, revision: sql`${skuVariations.revision} + 1` })
      .where(
        and(
          eq(skuVariations.skuRowId, skuRowId),
          eq(skuVariations.variationIndex, variationIndex),
          eq(skuVariations.isDeleted, false),
        ),
      );
  } else {
    const suffix = String(variationIndex).padStart(2, "0");
    const variationSku = baseSku ? `${baseSku}-${suffix}` : "";
    await reserveUniqueSkuValue({
      sku: variationSku,
      sourceType: "variation",
      sourceKey: `${skuRowId}:${variationIndex}`,
    });
    try {
      await db.insert(skuVariations).values({
        skuRowId,
        variationIndex,
        variationSku,
        ean: "",
        mlb: "",
        done: false,
        isDeleted: true,
        revision: 1,
      });
    } catch (error: any) {
      if (isDuplicateEntryError(error)) {
        // A outra aba criou o registro entre o SELECT e o INSERT. A intenção de
        // exclusão continua válida: aplica o tombstone ao registro vencedor.
        await db
          .update(skuVariations)
          .set({ isDeleted: true, revision: sql`${skuVariations.revision} + 1` })
          .where(
            and(
              eq(skuVariations.skuRowId, skuRowId),
              eq(skuVariations.variationIndex, variationIndex),
              eq(skuVariations.isDeleted, false),
            ),
          );
        return { ok: true };
      }
      throw error;
    }
  }

  return { ok: true };
}
