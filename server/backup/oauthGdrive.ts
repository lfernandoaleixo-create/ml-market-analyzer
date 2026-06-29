import type { Express, Request, Response } from "express";
import { ENV } from "../_core/env";
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  getAccountEmail,
} from "./googleDrive";
import { updateDriveBackupConfig } from "../driveBackupDb";

/**
 * Registra as rotas do fluxo OAuth do Google Drive:
 * - GET /api/oauth/gdrive/connect  -> redireciona para o consentimento Google
 * - GET /api/oauth/gdrive/callback -> troca code por tokens e salva refresh_token
 *
 * O backup usa uma conta única do dono (a planilha é um recurso compartilhado),
 * então a configuração é global (id=1), não por usuário.
 */
export function registerGdriveOAuthRoutes(app: Express): void {
  app.get("/api/oauth/gdrive/connect", (req: Request, res: Response) => {
    const returnPathEarly =
      typeof req.query.returnPath === "string" ? req.query.returnPath : "/configuracoes";
    if (!ENV.googleClientId || !ENV.googleClientSecret) {
      res.redirect(`${returnPathEarly}?gdrive=sem-credenciais`);
      return;
    }
    // returnPath: para onde voltar no app após conectar.
    const returnPath =
      typeof req.query.returnPath === "string" ? req.query.returnPath : "/configuracoes";
    const state = Buffer.from(JSON.stringify({ returnPath })).toString("base64url");
    res.redirect(buildAuthUrl(state));
  });

  app.get("/api/oauth/gdrive/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    let returnPath = "/configuracoes";
    try {
      if (typeof req.query.state === "string") {
        const parsed = JSON.parse(
          Buffer.from(req.query.state, "base64url").toString("utf8"),
        ) as { returnPath?: string };
        if (parsed.returnPath) returnPath = parsed.returnPath;
      }
    } catch {
      /* ignore */
    }

    if (!code) {
      res.redirect(`${returnPath}?gdrive=erro&reason=no_code`);
      return;
    }

    try {
      const tokens = await exchangeCodeForTokens(code);
      if (!tokens.refresh_token) {
        // Sem refresh_token (provavelmente já autorizado antes sem prompt=consent).
        res.redirect(`${returnPath}?gdrive=erro&reason=no_refresh_token`);
        return;
      }
      let email = "";
      if (tokens.access_token) {
        email = await getAccountEmail(tokens.access_token);
      }
      await updateDriveBackupConfig({
        refreshToken: tokens.refresh_token,
        accountEmail: email,
        folderName: "Backups Planilha SKU",
      });
      res.redirect(`${returnPath}?gdrive=conectado`);
    } catch (err) {
      const reason = encodeURIComponent(
        err instanceof Error ? err.message : "exchange_failed",
      );
      res.redirect(`${returnPath}?gdrive=erro&reason=${reason}`);
    }
  });
}
