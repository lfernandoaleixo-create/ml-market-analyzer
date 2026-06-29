import {
  getDriveBackupConfig,
  updateDriveBackupConfig,
  isConnected,
} from "../driveBackupDb";
import { buildSheetsWorkbookBuffer, backupFileName } from "./sheetsXlsx";
import { refreshAccessToken, ensureFolder, uploadXlsx } from "./googleDrive";

const DEFAULT_FOLDER = "Backups Planilha SKU";

export type RunBackupResult = {
  ok: boolean;
  fileId?: string;
  fileName?: string;
  error?: string;
};

/**
 * Executa um backup completo: gera o XLSX das 3 planilhas, garante a pasta no
 * Drive e faz o upload. Atualiza o status na configuração.
 */
export async function runDriveBackup(): Promise<RunBackupResult> {
  const cfg = await getDriveBackupConfig();
  if (!isConnected(cfg) || !cfg.refreshToken) {
    return { ok: false, error: "Google Drive não está conectado." };
  }

  try {
    const accessToken = await refreshAccessToken(cfg.refreshToken);
    const folderName = cfg.folderName || DEFAULT_FOLDER;
    const folderId = await ensureFolder(accessToken, folderName, cfg.folderId || undefined);

    const buffer = await buildSheetsWorkbookBuffer();
    const fileName = backupFileName();
    const uploaded = await uploadXlsx(accessToken, folderId, fileName, buffer);

    await updateDriveBackupConfig({
      folderId,
      folderName,
      lastBackupAt: Date.now(),
      lastStatus: "ok",
      lastError: null,
      lastFileId: uploaded.id,
      lastFileName: uploaded.name,
    });
    return { ok: true, fileId: uploaded.id, fileName: uploaded.name };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateDriveBackupConfig({
      lastBackupAt: Date.now(),
      lastStatus: "error",
      lastError: message,
    });
    return { ok: false, error: message };
  }
}
