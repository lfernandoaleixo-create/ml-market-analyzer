import {
  getDriveBackupConfig,
  updateDriveBackupConfig,
  isConnected,
} from "../driveBackupDb";
import { storagePut } from "../storage";
import { buildSheetsWorkbookBuffer, backupFileName } from "./sheetsXlsx";
import { refreshAccessToken, ensureFolder, uploadXlsx } from "./googleDrive";

const DEFAULT_FOLDER = "Backups Planilha SKU";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type RunBackupResult = {
  ok: boolean;
  driveOk: boolean;
  internalOk: boolean;
  fileId?: string;
  fileName?: string;
  internalKey?: string;
  error?: string;
};

/**
 * Executa um backup completo com duas camadas:
 * 1) sempre tenta salvar um XLSX versionado no armazenamento do projeto;
 * 2) quando o Google Drive está autorizado, também envia a mesma cópia ao Drive.
 *
 * A rotina só reporta falha total quando nenhuma das duas cópias é criada.
 */
export async function runDriveBackup(): Promise<RunBackupResult> {
  const cfg = await getDriveBackupConfig();
  const now = Date.now();
  const fileName = backupFileName(new Date(now));

  let buffer: Buffer;
  try {
    buffer = await buildSheetsWorkbookBuffer();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateDriveBackupConfig({
      lastBackupAt: now,
      lastStatus: "error",
      lastError: `Falha ao gerar o XLSX: ${message}`,
      lastInternalBackupError: message,
    });
    return { ok: false, driveOk: false, internalOk: false, error: message };
  }

  let internalOk = false;
  let internalKey = "";
  let internalError = "";
  try {
    const stored = await storagePut(`backups/planilha-sku/${fileName}`, buffer, XLSX_MIME);
    internalOk = true;
    internalKey = stored.key;
  } catch (error) {
    internalError = error instanceof Error ? error.message : String(error);
  }

  let driveOk = false;
  let driveFileId = "";
  let driveFileName = "";
  let driveError = "";
  let folderId = cfg.folderId || "";
  if (!isConnected(cfg) || !cfg.refreshToken) {
    driveError = "Google Drive não está conectado.";
  } else {
    try {
      const accessToken = await refreshAccessToken(cfg.refreshToken);
      const folderName = cfg.folderName || DEFAULT_FOLDER;
      folderId = await ensureFolder(accessToken, folderName, folderId || undefined);
      const uploaded = await uploadXlsx(accessToken, folderId, fileName, buffer);
      driveOk = true;
      driveFileId = uploaded.id;
      driveFileName = uploaded.name;
    } catch (error) {
      driveError = error instanceof Error ? error.message : String(error);
    }
  }

  const ok = internalOk || driveOk;
  const warningParts = [
    driveOk ? "" : `Drive: ${driveError}`,
    internalOk ? "" : `armazenamento interno: ${internalError}`,
  ].filter(Boolean);

  await updateDriveBackupConfig({
    folderId,
    folderName: cfg.folderName || DEFAULT_FOLDER,
    lastBackupAt: now,
    lastStatus: driveOk && internalOk ? "ok" : ok ? "warning" : "error",
    lastError: warningParts.length > 0 ? warningParts.join(" | ") : null,
    ...(driveOk ? { lastFileId: driveFileId, lastFileName: driveFileName } : {}),
    lastInternalBackupAt: internalOk ? now : cfg.lastInternalBackupAt,
    lastInternalBackupKey: internalOk ? internalKey : cfg.lastInternalBackupKey,
    lastInternalBackupFileName: internalOk ? fileName : cfg.lastInternalBackupFileName,
    lastInternalBackupError: internalOk ? null : internalError || null,
  });

  return {
    ok,
    driveOk,
    internalOk,
    fileId: driveFileId || undefined,
    fileName,
    internalKey: internalKey || undefined,
    error: warningParts.length > 0 ? warningParts.join(" | ") : undefined,
  };
}
