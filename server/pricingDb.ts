import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { pricingSimulations, type PricingSimulation, type InsertPricingSimulation } from "../drizzle/schema";

/** Insere uma simulação no histórico e devolve a linha criada. */
export async function insertPricingSimulation(
  data: InsertPricingSimulation,
): Promise<PricingSimulation | null> {
  const db = await getDb();
  if (!db) return null;
  const [res] = await db.insert(pricingSimulations).values(data).$returningId();
  const id = (res as { id: number }).id;
  const [row] = await db
    .select()
    .from(pricingSimulations)
    .where(eq(pricingSimulations.id, id))
    .limit(1);
  return row ?? null;
}

/** Lista o histórico de um usuário (mais recentes primeiro). */
export async function listPricingSimulations(userId: number): Promise<PricingSimulation[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pricingSimulations)
    .where(eq(pricingSimulations.userId, userId))
    .orderBy(desc(pricingSimulations.createdAt));
}

/** Exclui uma simulação do usuário. Retorna true se removeu. */
export async function deletePricingSimulation(userId: number, id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: pricingSimulations.id })
    .from(pricingSimulations)
    .where(and(eq(pricingSimulations.id, id), eq(pricingSimulations.userId, userId)))
    .limit(1);
  if (!row) return false;
  await db
    .delete(pricingSimulations)
    .where(and(eq(pricingSimulations.id, id), eq(pricingSimulations.userId, userId)));
  return true;
}

/**
 * Atualiza os campos de regime/resultados de uma simulação do usuário.
 * Retorna a linha atualizada (ou null se não encontrada).
 */
export async function updatePricingSimulation(
  userId: number,
  id: number,
  patch: Pick<InsertPricingSimulation, "params" | "results">,
): Promise<PricingSimulation | null> {
  const db = await getDb();
  if (!db) return null;
  const [existing] = await db
    .select({ id: pricingSimulations.id })
    .from(pricingSimulations)
    .where(and(eq(pricingSimulations.id, id), eq(pricingSimulations.userId, userId)))
    .limit(1);
  if (!existing) return null;
  await db
    .update(pricingSimulations)
    .set({ params: patch.params, results: patch.results })
    .where(and(eq(pricingSimulations.id, id), eq(pricingSimulations.userId, userId)));
  const [row] = await db
    .select()
    .from(pricingSimulations)
    .where(eq(pricingSimulations.id, id))
    .limit(1);
  return row ?? null;
}


/* ===================== PLANILHA INVERTIDA (matrix_products) ================= */

import {
  matrixProducts,
  matrixSettings,
  type MatrixProduct,
  type InsertMatrixProduct,
  type MatrixSettings,
  type InsertMatrixSettings,
} from "../drizzle/schema";
import { asc } from "drizzle-orm";

/** Margens padrão exibidas (20% é a âncora). */
export const DEFAULT_MATRIX_MARGINS = [20, 15, 25, 30, 35, 40];

/** Lista todos os produtos da planilha de um usuário (ordem de exibição). */
export async function listMatrixProducts(userId: number): Promise<MatrixProduct[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(matrixProducts)
    .where(eq(matrixProducts.userId, userId))
    .orderBy(asc(matrixProducts.sortOrder), asc(matrixProducts.id));
}

/** Busca um produto por (userId, nome) — usado para checar duplicidade. */
export async function findMatrixProductByName(
  userId: number,
  name: string,
): Promise<MatrixProduct | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(matrixProducts)
    .where(and(eq(matrixProducts.userId, userId), eq(matrixProducts.name, name)))
    .limit(1);
  return row ?? null;
}

/** Insere um produto na planilha e devolve a linha criada. */
export async function insertMatrixProduct(
  data: InsertMatrixProduct,
): Promise<MatrixProduct | null> {
  const db = await getDb();
  if (!db) return null;
  const [res] = await db.insert(matrixProducts).values(data).$returningId();
  const id = (res as { id: number }).id;
  const [row] = await db.select().from(matrixProducts).where(eq(matrixProducts.id, id)).limit(1);
  return row ?? null;
}

/** Atualiza um produto do usuário. Retorna a linha atualizada (ou null). */
export async function updateMatrixProduct(
  userId: number,
  id: number,
  patch: Partial<Pick<InsertMatrixProduct, "name" | "sku" | "anchorPriceCents" | "anchorMarginPct" | "weightIndex" | "sortOrder">>,
): Promise<MatrixProduct | null> {
  const db = await getDb();
  if (!db) return null;
  const [existing] = await db
    .select({ id: matrixProducts.id })
    .from(matrixProducts)
    .where(and(eq(matrixProducts.id, id), eq(matrixProducts.userId, userId)))
    .limit(1);
  if (!existing) return null;
  await db
    .update(matrixProducts)
    .set(patch)
    .where(and(eq(matrixProducts.id, id), eq(matrixProducts.userId, userId)));
  const [row] = await db.select().from(matrixProducts).where(eq(matrixProducts.id, id)).limit(1);
  return row ?? null;
}

/** Exclui um produto da planilha. Retorna true se removeu. */
export async function deleteMatrixProduct(userId: number, id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: matrixProducts.id })
    .from(matrixProducts)
    .where(and(eq(matrixProducts.id, id), eq(matrixProducts.userId, userId)))
    .limit(1);
  if (!row) return false;
  await db
    .delete(matrixProducts)
    .where(and(eq(matrixProducts.id, id), eq(matrixProducts.userId, userId)));
  return true;
}

/** Lê as configurações globais do usuário (ou null se ainda não existir). */
export async function getMatrixSettings(userId: number): Promise<MatrixSettings | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(matrixSettings)
    .where(eq(matrixSettings.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Cria/atualiza (upsert) as configurações globais do usuário e devolve a linha.
 */
export async function upsertMatrixSettings(
  userId: number,
  patch: Partial<Omit<InsertMatrixSettings, "id" | "userId">>,
): Promise<MatrixSettings | null> {
  const db = await getDb();
  if (!db) return null;
  const existing = await getMatrixSettings(userId);
  if (existing) {
    await db.update(matrixSettings).set(patch).where(eq(matrixSettings.userId, userId));
  } else {
    await db.insert(matrixSettings).values({
      userId,
      margins: patch.margins ?? DEFAULT_MATRIX_MARGINS,
      ...patch,
    } as InsertMatrixSettings);
  }
  return getMatrixSettings(userId);
}
