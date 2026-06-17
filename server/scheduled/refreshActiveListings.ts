import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { listUsersWithMlCredentials } from "../dbMl";
import { resolveAccount } from "../routers/account";
import { buildActiveListings } from "../ml/activeListings";
import { MLRateLimitError } from "../ml/accountProvider";

/**
 * Heartbeat callback: aquece diariamente (07h BRT = 10h UTC) os dados da aba
 * "Anúncios ativos" para cada usuário com o Mercado Livre conectado.
 *
 * A aba é somente-leitura e calculada on-the-fly a partir do ML + BaseLinker;
 * não há tabela própria de anúncios ativos para sincronizar. O objetivo deste
 * job é, portanto, manter os caches subjacentes (listagem do ML, visitas e
 * custos da BaseLinker) quentes, de modo que ao abrir a tela os dados já
 * estejam frescos do dia — e que anúncios que deixaram de estar `active`
 * saiam da lista (o filtro de status acontece dentro de buildActiveListings).
 *
 * Idempotente: rodar de novo apenas re-busca e re-preenche o cache (upsert por
 * chave de cache). Best-effort por usuário: rate limit/erro de um usuário nunca
 * aborta os demais. Autenticado via cron (`user.isCron`).
 */
export async function refreshActiveListingsScheduledHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const userIds = await listUsersWithMlCredentials();
    const results: Array<{
      userId: number;
      ok: boolean;
      active?: number;
      withCost?: number;
      error?: string;
    }> = [];

    for (const userId of userIds) {
      try {
        const account = await resolveAccount(userId);
        const built = await buildActiveListings(userId, account, {});
        results.push({
          userId,
          ok: true,
          active: built.summary.totalActive,
          withCost: built.summary.withCost,
        });
      } catch (err) {
        const msg =
          err instanceof MLRateLimitError
            ? "ml-rate-limited"
            : String(err instanceof Error ? err.message : err);
        // Best-effort: registra e segue para o próximo usuário.
        results.push({ userId, ok: false, error: msg });
      }
    }

    return res.json({
      ok: true,
      users: userIds.length,
      succeeded: results.filter((r) => r.ok).length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error: String(error instanceof Error ? error.message : error),
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}
