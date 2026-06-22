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
