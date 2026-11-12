import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { readApiKeys } from "../../drizzle/schema";
import { getDb } from "../db";
import { READ_API_SCOPES, type ReadApiScope, type ReadApiKeyMetadata } from "../../shared/readApi";

export interface ReadApiPrincipal { id: number; ownerUserId: number; scopes: ReadApiScope[]; }
export function hashReadApiKey(key: string): string { return createHash("sha256").update(key).digest("hex"); }
export function generateReadApiKey() {
  const key = `mrc_read_${randomBytes(32).toString("base64url")}`;
  return { key, keyHash: hashReadApiKey(key), prefix: key.slice(0, 20) };
}
export function parseReadApiScopes(value: unknown): ReadApiScope[] | null {
  let parsed = value;
  if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch { return null; } }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some(s => !READ_API_SCOPES.includes(s))) return null;
  return [...new Set(parsed)] as ReadApiScope[];
}
export function activeReadApiKey(row: { id: number; ownerUserId: number; scopes: unknown; expiresAt: Date; revokedAt: Date | null } | undefined, now = Date.now()): ReadApiPrincipal | null {
  if (!row || row.revokedAt !== null || !Number.isSafeInteger(row.ownerUserId) || row.ownerUserId <= 0) return null;
  const expiry = new Date(row.expiresAt).getTime();
  const scopes = parseReadApiScopes(row.scopes);
  if (!Number.isFinite(expiry) || expiry <= now || !scopes) return null;
  return { id: row.id, ownerUserId: row.ownerUserId, scopes };
}
function metadata(row: typeof readApiKeys.$inferSelect): ReadApiKeyMetadata {
  return { id: row.id, name: row.name, prefix: row.prefix, scopes: parseReadApiScopes(row.scopes) ?? [], createdAt: row.createdAt, expiresAt: row.expiresAt, revokedAt: row.revokedAt };
}
async function dbOrThrow() { const db = await getDb(); if (!db) throw new Error("READ_API_DATABASE_UNAVAILABLE"); return db; }
export async function authenticateReadApiKey(authorization: string | undefined): Promise<ReadApiPrincipal | null> {
  // Accept only a header token, never cookies, a login password or URL parameters.
  const match = /^Bearer (mrc_read_[A-Za-z0-9_-]{43})$/i.exec(authorization ?? "");
  if (!match) return null;
  const db = await dbOrThrow();
  const rows = await db.select().from(readApiKeys).where(eq(readApiKeys.keyHash, hashReadApiKey(match[1]))).limit(1);
  return activeReadApiKey(rows[0]);
}
export async function listReadApiKeys(ownerUserId: number) {
  const db = await dbOrThrow();
  // Administrative metadata only. Never silently hide a still-active old key:
  // every generated key must remain discoverable and revocable in the UI.
  const rows = await db.select().from(readApiKeys).where(eq(readApiKeys.ownerUserId, ownerUserId)).orderBy(desc(readApiKeys.createdAt));
  return rows.map(metadata);
}
export async function createReadApiKey(ownerUserId: number, createdBy: number, input: { name: string; scopes: ReadApiScope[]; expiresDays: number }) {
  const db = await dbOrThrow();
  const generated = generateReadApiKey();
  const expiresAt = new Date(Date.now() + input.expiresDays * 24 * 60 * 60 * 1000);
  await db.insert(readApiKeys).values({ ownerUserId, createdBy, name: input.name, prefix: generated.prefix, keyHash: generated.keyHash, scopes: input.scopes, expiresAt });
  const rows = await db.select().from(readApiKeys).where(eq(readApiKeys.keyHash, generated.keyHash)).limit(1);
  if (!rows[0]) throw new Error("READ_API_KEY_CREATION_FAILED");
  // Plaintext exists only in this response. Never persist, log, or recover it.
  return { key: generated.key, metadata: metadata(rows[0]) };
}
export async function revokeReadApiKey(ownerUserId: number, id: number) {
  const db = await dbOrThrow();
  const rows = await db.select({ id: readApiKeys.id }).from(readApiKeys).where(and(eq(readApiKeys.ownerUserId, ownerUserId), eq(readApiKeys.id, id))).limit(1);
  if (!rows.length) return false;
  await db.update(readApiKeys).set({ revokedAt: new Date() }).where(and(eq(readApiKeys.ownerUserId, ownerUserId), eq(readApiKeys.id, id), isNull(readApiKeys.revokedAt)));
  return true;
}
