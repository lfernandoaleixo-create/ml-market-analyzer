import { z } from "zod";
import { parse as parseCookie } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createHeartbeatJob,
  deleteHeartbeatJob,
  updateHeartbeatJob,
} from "../_core/heartbeat";
import {
  getDriveBackupConfig,
  updateDriveBackupConfig,
  isConnected,
} from "../driveBackupDb";
import { runDriveBackup } from "../backup/runBackup";

/** Monta a expressão cron diária (segundos incluídos) para uma hora UTC. */
function dailyCron(hourUtc: number): string {
  const h = Math.max(0, Math.min(23, Math.floor(hourUtc)));
  return `0 0 ${h} * * *`;
}

export const driveBackupRouter = router({
  /** Estado atual da integração (sem expor o refresh token). */
  status: protectedProcedure.query(async () => {
    const cfg = await getDriveBackupConfig();
    return {
      connected: isConnected(cfg),
      accountEmail: cfg.accountEmail,
      folderName: cfg.folderName,
      enabled: cfg.enabled,
      scheduleHourUtc: cfg.scheduleHourUtc,
      lastBackupAt: cfg.lastBackupAt ?? null,
      lastStatus: cfg.lastStatus,
      lastError: cfg.lastError ?? null,
      lastFileName: cfg.lastFileName,
    };
  }),

  /** Desconecta a conta (remove o refresh token e desliga o agendamento). */
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    const cfg = await getDriveBackupConfig();
    const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
    if (cfg.scheduleCronTaskUid) {
      try {
        await deleteHeartbeatJob(cfg.scheduleCronTaskUid, sessionToken);
      } catch {
        /* ignore */
      }
    }
    await updateDriveBackupConfig({
      refreshToken: null,
      accountEmail: "",
      enabled: false,
      scheduleCronTaskUid: null,
    });
    return { ok: true };
  }),

  /** Executa um backup imediato ("Fazer backup agora"). */
  backupNow: protectedProcedure.mutation(async () => {
    const result = await runDriveBackup();
    if (!result.ok) {
      return { ok: false, error: result.error ?? "Falha desconhecida" };
    }
    return { ok: true, fileName: result.fileName };
  }),

  /**
   * Liga/desliga o backup diário automático. O cron chama
   * /api/scheduled/driveBackup no site publicado (sandboxes de dev não são
   * alcançáveis pela plataforma).
   */
  setSchedule: protectedProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        hourUtc: z.number().int().min(0).max(23).default(9),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cfg = await getDriveBackupConfig();
      if (!isConnected(cfg)) {
        return { enabled: false, error: "Conecte o Google Drive antes de agendar." };
      }
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      const existingUid = cfg.scheduleCronTaskUid ?? null;
      const cron = dailyCron(input.hourUtc);

      if (input.enabled) {
        if (existingUid) {
          await updateHeartbeatJob(existingUid, { cron, enable: true }, sessionToken);
          await updateDriveBackupConfig({ enabled: true, scheduleHourUtc: input.hourUtc });
          return { enabled: true, taskUid: existingUid };
        }
        const job = await createHeartbeatJob(
          {
            name: "drive-backup-diario",
            cron,
            path: "/api/scheduled/driveBackup",
            description: "Backup diário das planilhas (Produtos/Kits/Embalagens) no Google Drive",
          },
          sessionToken,
        );
        await updateDriveBackupConfig({
          enabled: true,
          scheduleHourUtc: input.hourUtc,
          scheduleCronTaskUid: job.taskUid,
        });
        return { enabled: true, taskUid: job.taskUid };
      } else {
        if (existingUid) {
          await deleteHeartbeatJob(existingUid, sessionToken);
        }
        await updateDriveBackupConfig({ enabled: false, scheduleCronTaskUid: null });
        return { enabled: false, taskUid: null };
      }
    }),
});
