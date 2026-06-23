import { z } from "zod";
import { parse as parseCookie } from "cookie";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { protectedProcedure, router } from "../_core/trpc";
import {
  addMonitored,
  addSnapshot,
  findMonitored,
  getAppConfig,
  getCredentials,
  getMonitoredById,
  listAlerts,
  listMonitored,
  listSnapshots,
  markAlertRead,
  markAllAlertsRead,
  removeMonitored,
  upsertAppConfig,
  upsertCredentials,
  resolveMlOwnerUserId,
} from "../dbMl";
import { buildBackfillSnapshots, runMonitoringForUser } from "../ml/monitoring";
import { resolveProviderForUser, isRealOrigin } from "../ml/providerSelect";
import { computeSalesVelocity } from "@shared/salesVelocity";
import {
  createHeartbeatJob,
  deleteHeartbeatJob,
  updateHeartbeatJob,
} from "../_core/heartbeat";
import {
  hasValidMlCredentialFormat,
  isConnectionStale,
  mergeCredentialsForSave,
  probeMayFlagError,
} from "../ml/credentials";


export const monitorRouter = router({
  /** List the user's monitored products with their latest values. */
  list: protectedProcedure.query(async ({ ctx }) => {
    return listMonitored(ctx.user.id);
  }),

  /** Start monitoring a product (and backfill demo history for charts). */
  add: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        trackKeyword: z.string().trim().optional(),
        categoryId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await findMonitored(ctx.user.id, input.itemId);
      if (existing) return existing;

      const { provider, origin } = await resolveProviderForUser(ctx.user.id);
      const product = await provider.getProduct(input.itemId);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado." });
      const realSource = isRealOrigin(origin);

      const created = await addMonitored({
        userId: ctx.user.id,
        mlItemId: product.id,
        title: product.title,
        thumbnail: product.thumbnail,
        permalink: product.permalink,
        categoryId: input.categoryId ?? product.categoryId,
        categoryName: product.categoryName,
        sellerName: product.seller.nickname,
        trackKeyword: input.trackKeyword ?? null,
        lastPrice: product.price,
        lastSoldQuantity: product.soldQuantity,
        lastPosition: product.catalogPosition ?? null,
        isActive: true,
      });

      if (created) {
        if (realSource) {
          // Real source: record the FIRST real snapshot immediately. The history
          // then grows honestly from daily real captures — no synthetic backfill.
          await addSnapshot({
            monitoredProductId: created.id,
            price: product.priceAvailable === false ? null : product.price,
            soldQuantity: product.salesAvailable ? product.soldQuantity : null,
            availableQuantity: product.availableQuantity ?? null,
            position: product.catalogPosition ?? null,
            reviewsCount: product.ratingAvailable ? product.reviewsCount : null,
            rating: product.ratingAvailable ? product.rating : null,
            capturedAt: Date.now(),
          });
        } else {
          // Demo mode only: backfill 14 days of synthetic history so charts render.
          const rows = buildBackfillSnapshots({
            monitoredProductId: created.id,
            itemId: product.id,
            basePrice: product.price,
            baseSold: product.soldQuantity,
            basePosition: product.catalogPosition ?? 10,
            baseRating: product.rating,
            baseReviews: product.reviewsCount,
            days: 14,
          });
          for (const r of rows) await addSnapshot(r);
        }
      }

      return created;
    }),

  /** Stop monitoring (delete) a product. */
  remove: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await removeMonitored(ctx.user.id, input.id);
      return { success: true };
    }),

  /** Historical snapshots for one monitored product. */
  history: protectedProcedure
    .input(z.object({ id: z.number().int(), days: z.number().int().min(1).max(365).optional() }))
    .query(async ({ ctx, input }) => {
      const mp = await getMonitoredById(input.id);
      if (!mp || mp.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const since = input.days ? Date.now() - input.days * 24 * 60 * 60 * 1000 : undefined;
      const snapshots = await listSnapshots(input.id, since);
      // Derive honest sales velocity from the real time-series (never fabricated).
      const velocity = computeSalesVelocity(
        snapshots.map((s) => ({ capturedAt: s.capturedAt, soldQuantity: s.soldQuantity })),
      );
      return { product: mp, snapshots, velocity };
    }),

  /** Manually trigger a monitoring run for the current user ("Run now"). */
  runNow: protectedProcedure.mutation(async ({ ctx }) => {
    const config = await getAppConfig();
    const thresholds = (config?.alertThresholds as any) ?? undefined;
    return runMonitoringForUser(ctx.user.id, thresholds);
  }),

  // ---- Alerts ------------------------------------------------------------

  alerts: protectedProcedure.query(async ({ ctx }) => {
    return listAlerts(ctx.user.id);
  }),

  markAlertRead: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await markAlertRead(ctx.user.id, input.id);
      return { success: true };
    }),

  markAllAlertsRead: protectedProcedure.mutation(async ({ ctx }) => {
    await markAllAlertsRead(ctx.user.id);
    return { success: true };
  }),

  // ---- Credentials -------------------------------------------------------

  getCredentials: protectedProcedure.query(async ({ ctx }) => {
    // SINGLE-STORE: reflect the OWNER's shared ML connection so any login (e.g.
    // gestao@grupo-fox.com) sees the real "conectado" state instead of a false
    // "desconectado" just because it has no credential row of its own.
    const ownerUserId = await resolveMlOwnerUserId(ctx.user.id);
    const creds = await getCredentials(ownerUserId);
    if (!creds) {
      return {
        configured: false,
        appId: "",
        hasSecret: false,
        status: "unconfigured" as const,
        statusMessage: null as string | null,
        siteId: "MLB",
        oauthConnected: false,
        tokenExpiresAt: null as number | null,
        tokenExpired: false,
      };
    }
    const oauthConnected = Boolean(creds.refreshToken && creds.accessToken);
    const expiresAt = creds.tokenExpiresAt ? Number(creds.tokenExpiresAt) : null;
    // Considera expirado quando há conexão OAuth mas o access token já venceu
    // (a renovação automática usa o refresh token; se ela falhar, o status sai de "connected").
    const tokenExpired = isConnectionStale({
      oauthConnected,
      status: creds.status,
      tokenExpiresAt: expiresAt,
    });
    return {
      configured: hasValidMlCredentialFormat(creds.appId, creds.clientSecret),
      appId: creds.appId,
      hasSecret: Boolean(creds.clientSecret),
      status: creds.status,
      statusMessage: creds.statusMessage,
      siteId: creds.siteId,
      oauthConnected,
      tokenExpiresAt: expiresAt,
      tokenExpired,
    };
  }),

  saveCredentials: protectedProcedure
    .input(
      z.object({
        appId: z.string().trim(),
        clientSecret: z.string().trim(),
        siteId: z.string().trim().default("MLB"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Write onto the OWNER's row when a shared connection exists, so editing
      // credentials/reconnecting always targets the real connection instead of
      // creating an orphan row on the currently-logged-in user.
      const ownerUserId = await resolveMlOwnerUserId(ctx.user.id);
      const existing = await getCredentials(ownerUserId);
      // Merge with existing: an empty form field must NEVER wipe a stored value,
      // and a healthy OAuth session must NOT be demoted. See mergeCredentialsForSave.
      const merged = mergeCredentialsForSave(
        { appId: input.appId, clientSecret: input.clientSecret },
        existing,
      );
      await upsertCredentials(ownerUserId, {
        appId: merged.appId,
        clientSecret: merged.clientSecret,
        siteId: input.siteId,
        status: merged.status,
        statusMessage:
          merged.status === "connected"
            ? "Credenciais atualizadas; conexão OAuth mantida."
            : null,
      });
      return { success: true };
    }),

  /**
   * Test the stored credentials against the ML OAuth endpoint.
   *
   * IMPORTANT: this is a non-destructive probe. It validates the app-level
   * client_credentials grant but NEVER overwrites the user OAuth access/refresh
   * tokens (those power the real seller data). It also never demotes an already
   * connected OAuth session to "error".
   */
  testCredentials: protectedProcedure.mutation(async ({ ctx }) => {
    const ownerUserId = await resolveMlOwnerUserId(ctx.user.id);
    const creds = await getCredentials(ownerUserId);
    const mayFlagError = probeMayFlagError(creds);
    const oauthConnected = !mayFlagError;

    if (!creds || !hasValidMlCredentialFormat(creds.appId, creds.clientSecret)) {
      // Only flag an error when there is no live OAuth session to protect.
      if (mayFlagError) {
        await upsertCredentials(ownerUserId, {
          status: "error",
          statusMessage: "Credenciais ausentes ou em formato inválido.",
        });
      }
      return {
        ok: false,
        message: oauthConnected
          ? "O App ID/Client Secret não estão completos para o teste, mas sua conexão OAuth segue ativa."
          : "Credenciais ausentes ou em formato inválido.",
      };
    }
    try {
      const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: creds.appId,
        client_secret: creds.clientSecret,
      });
      const res = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body,
      });
      const json = (await res.json()) as { access_token?: string; error?: string };
      if (json.access_token) {
        // Mark connected WITHOUT clobbering the user OAuth tokens.
        await upsertCredentials(ownerUserId, {
          status: "connected",
          statusMessage: "Conexão bem-sucedida.",
        });
        return { ok: true, message: "Conexão bem-sucedida com a API do Mercado Livre." };
      }
      // Probe failed, but keep a healthy OAuth session intact.
      if (mayFlagError) {
        await upsertCredentials(ownerUserId, {
          status: "error",
          statusMessage: `Falha: ${json.error ?? "desconhecida"}`,
        });
      }
      return { ok: false, message: `Falha na autenticação: ${json.error ?? "desconhecida"}` };
    } catch (err) {
      if (mayFlagError) {
        await upsertCredentials(ownerUserId, {
          status: "error",
          statusMessage: String(err),
        });
      }
      return { ok: false, message: `Erro de rede: ${String(err)}` };
    }
  }),

  // ---- Monitoring schedule (Heartbeat cron) ------------------------------

  getSchedule: protectedProcedure.query(async () => {
    const config = await getAppConfig();
    return {
      enabled: Boolean(config?.monitoringCronTaskUid),
      taskUid: config?.monitoringCronTaskUid ?? null,
      thresholds: (config?.alertThresholds as any) ?? null,
    };
  }),

  /**
   * Enable/disable the recurring monitoring cron. The cron hits
   * /api/scheduled/monitor on the deployed site. Requires the site to be
   * deployed (dev sandboxes are unreachable by the platform).
   */
  setSchedule: protectedProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        cron: z.string().default("0 0 */6 * * *"), // every 6 hours UTC
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      const config = await getAppConfig();
      const existingUid = config?.monitoringCronTaskUid ?? null;

      if (input.enabled) {
        if (existingUid) {
          await updateHeartbeatJob(existingUid, { cron: input.cron, enable: true }, sessionToken);
          return { enabled: true, taskUid: existingUid };
        }
        const job = await createHeartbeatJob(
          {
            name: "ml-monitoring",
            cron: input.cron,
            path: "/api/scheduled/monitor",
            description: "Monitoramento contínuo de produtos do Mercado Livre",
          },
          sessionToken,
        );
        await upsertAppConfig({ monitoringCronTaskUid: job.taskUid });
        return { enabled: true, taskUid: job.taskUid };
      } else {
        if (existingUid) {
          await deleteHeartbeatJob(existingUid, sessionToken);
          await upsertAppConfig({ monitoringCronTaskUid: null });
        }
        return { enabled: false, taskUid: null };
      }
    }),

  /** Persist alert thresholds. */
  setThresholds: protectedProcedure
    .input(
      z.object({
        priceChangePercent: z.number().min(1).max(100),
        salesSurgePercent: z.number().min(1).max(500),
        positionChange: z.number().int().min(1).max(50),
      }),
    )
    .mutation(async ({ input }) => {
      await upsertAppConfig({ alertThresholds: input });
      return { success: true };
    }),
});
