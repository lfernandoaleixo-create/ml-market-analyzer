import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { runDriveBackup } from "../backup/runBackup";

/**
 * Heartbeat callback: executa o backup diário das três planilhas
 * (Produtos/Kits/Embalagens) para o Google Drive do dono.
 *
 * Autenticado pelo formato de sessão cron (`user.isCron`).
 */
export async function driveBackupScheduledHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const result = await runDriveBackup();
    if (!result.ok) {
      return res.status(200).json({
        ok: false,
        error: result.error,
        timestamp: new Date().toISOString(),
      });
    }
    return res.json({
      ok: true,
      fileName: result.fileName,
      fileId: result.fileId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error: String(error instanceof Error ? error.message : error),
      timestamp: new Date().toISOString(),
    });
  }
}
