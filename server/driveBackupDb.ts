import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { driveBackupConfig, type DriveBackupConfig } from "../drizzle/schema";

const CONFIG_ID = 1;

/** Lê a configuração única (id=1), criando-a se necessário. */
export async function getDriveBackupConfig(): Promise<DriveBackupConfig> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const rows = await db
    .select()
    .from(driveBackupConfig)
    .where(eq(driveBackupConfig.id, CONFIG_ID))
    .limit(1);
  if (rows.length > 0) return rows[0];
  await db
    .insert(driveBackupConfig)
    .values({ id: CONFIG_ID, scheduleHourUtc: 9, enabled: false })
    .onDuplicateKeyUpdate({ set: { id: CONFIG_ID } });
  const created = await db
    .select()
    .from(driveBackupConfig)
    .where(eq(driveBackupConfig.id, CONFIG_ID))
    .limit(1);
  return created[0];
}

export async function updateDriveBackupConfig(
  patch: Partial<Omit<DriveBackupConfig, "id" | "createdAt">>,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  await getDriveBackupConfig();
  await db
    .update(driveBackupConfig)
    .set(patch)
    .where(eq(driveBackupConfig.id, CONFIG_ID));
}

/** Indica se há uma conta do Google conectada (refresh token salvo). */
export function isConnected(cfg: DriveBackupConfig): boolean {
  return !!cfg.refreshToken && cfg.refreshToken.length > 0;
}
