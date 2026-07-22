/**
 * Sistema de Proteção de SKU
 * ---------------------------
 * Toda alteração que impacta SKUs deve passar por este módulo:
 * 1. Validar senha de autorização (Luis, Guilherme, Fernando, Bruno)
 * 2. Registrar no histórico (sku_change_log) quem autorizou, quando e o que mudou
 *
 * Senhas autorizadas são os NOMES dos autorizadores (case-insensitive).
 */

import { getDb } from "./db";
import { skuChangeLog, InsertSkuChangeLog } from "../drizzle/schema";
import { desc } from "drizzle-orm";

// Nomes autorizados (case-insensitive) — funcionam como senha.
const AUTHORIZED_NAMES = ["luis", "guilherme", "fernando", "bruno"];

/**
 * Valida se a senha fornecida é um dos nomes autorizados.
 * Retorna o nome normalizado (capitalizado) ou null se inválido.
 */
export function validateSkuPassword(password: string): string | null {
  const normalized = password.trim().toLowerCase();
  if (!normalized) return null;
  if (AUTHORIZED_NAMES.includes(normalized)) {
    // Capitalizar: primeira letra maiúscula
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  return null;
}

/**
 * Registra uma alteração de SKU no histórico.
 */
export async function logSkuChange(entry: {
  action: string;
  authorizedBy: string;
  description: string;
  affectedRowIds: number[];
  oldValues?: unknown;
  newValues?: unknown;
  affectedCount: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(skuChangeLog).values({
    action: entry.action,
    authorizedBy: entry.authorizedBy,
    description: entry.description,
    affectedRowIds: JSON.stringify(entry.affectedRowIds),
    oldValues: entry.oldValues ? JSON.stringify(entry.oldValues) : null,
    newValues: entry.newValues ? JSON.stringify(entry.newValues) : null,
    affectedCount: entry.affectedCount,
    timestamp: Date.now(),
  });
}

/**
 * Lista o histórico de alterações de SKU (mais recentes primeiro).
 */
export async function listSkuChangeLog(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(skuChangeLog)
    .orderBy(desc(skuChangeLog.timestamp))
    .limit(limit);
}
