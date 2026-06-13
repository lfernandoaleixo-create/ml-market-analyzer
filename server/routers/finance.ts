import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { defaultTaxConfig, type TaxConfig } from "../../shared/finance";
import { getTaxConfigRow, upsertTaxConfigRow, listProfitSnapshots } from "../dbMl";
import type { ProfitSnapshotRow } from "../../drizzle/schema";
import {
  callBaselinker,
  isBaselinkerConfigured,
  BaselinkerError,
} from "../baselinker/client";
import { getInventories } from "../baselinker/provider";
import {
  computeProfitabilityForUser,
  hydrateConfig,
  ALL_UF_LIST,
} from "../finance/profitabilityService";
import { cachedAccountResilient } from "../ml/accountCache";

/**
 * Finance router — the "Lucratividade Real" feature.
 *
 * Combines BaseLinker (product cost + ML orders with commission/shipping/UF)
 * with the configurable tax engine to estimate REAL profit per sale and per
 * listing, in two scenarios (without / with the MG TTS benefit).
 *
 * Read-only: nothing here writes back to BaseLinker or Mercado Livre.
 */

/** Translate provider errors into honest, user-facing tRPC errors. */
function mapBlError(err: unknown): never {
  if (err instanceof BaselinkerError) {
    if (err.code === "not_configured") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: err.message });
    }
    if (err.code === "auth") {
      throw new TRPCError({ code: "UNAUTHORIZED", message: err.message });
    }
    if (err.code === "rate_limit") {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: err.message });
    }
    throw new TRPCError({ code: "BAD_GATEWAY", message: err.message });
  }
  throw err;
}

const periodDaysSchema = z
  .union([z.literal(7), z.literal(15), z.literal(30), z.literal(60), z.literal(90)])
  .optional();

export const financeRouter = router({
  /** Whether BaseLinker is configured (token present). */
  status: protectedProcedure.query(async ({ ctx }) => {
    const configured = isBaselinkerConfigured();
    const row = await getTaxConfigRow(ctx.user.id);
    return {
      baselinkerConfigured: configured,
      ttsEnabled: row?.ttsEnabled ?? false,
      inventoryId: row?.baselinkerInventoryId ?? null,
      hasConfig: !!row,
    };
  }),

  /** List BaseLinker catalogs so the user can pick which one holds the costs. */
  inventories: protectedProcedure.query(async () => {
    if (!isBaselinkerConfigured()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "BaseLinker não configurado. Informe o token de API.",
      });
    }
    try {
      return await getInventories();
    } catch (err) {
      mapBlError(err);
    }
  }),

  /** Test the BaseLinker connection (lightweight call). */
  testConnection: protectedProcedure.mutation(async () => {
    if (!isBaselinkerConfigured()) {
      return { ok: false as const, message: "Token do BaseLinker não informado." };
    }
    try {
      const res = await callBaselinker<{ inventories?: any[] }>("getInventories");
      const count = Array.isArray(res?.inventories) ? res.inventories.length : 0;
      return { ok: true as const, message: `Conectado. ${count} catálogo(s) disponível(is).` };
    } catch (err) {
      const message = err instanceof BaselinkerError ? err.message : "Falha ao conectar ao BaseLinker.";
      return { ok: false as const, message };
    }
  }),

  /** Read the current (hydrated) tax config for the user. */
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const row = await getTaxConfigRow(ctx.user.id);
    const ttsEnabled = row?.ttsEnabled ?? false;
    const config = hydrateConfig(row?.config, ttsEnabled);
    return {
      config,
      inventoryId: row?.baselinkerInventoryId ?? null,
      ufList: ALL_UF_LIST,
    };
  }),

  /** Save the full tax config (and the BaseLinker inventory id). */
  saveConfig: protectedProcedure
    .input(
      z.object({
        config: z.object({
          ttsEnabled: z.boolean(),
          originUF: z.string().length(2),
          pis: z.number().min(0).max(100),
          cofins: z.number().min(0).max(100),
          irpjEffective: z.number().min(0).max(100),
          csllEffective: z.number().min(0).max(100),
          icmsInternalOrigin: z.number().min(0).max(100),
          icmsInternalByUF: z.record(z.string(), z.number().min(0).max(100)),
          fcpByUF: z.record(z.string(), z.number().min(0).max(100)).optional(),
          ttsInterstate: z.number().min(0).max(100),
          ttsInternal: z.number().min(0).max(100),
        }),
        inventoryId: z.number().int().positive().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await upsertTaxConfigRow(ctx.user.id, {
        ttsEnabled: input.config.ttsEnabled,
        config: input.config,
        ...(input.inventoryId !== undefined ? { baselinkerInventoryId: input.inventoryId } : {}),
      });
      return { ok: true as const, ttsEnabled: row?.ttsEnabled ?? input.config.ttsEnabled };
    }),

  /** Quick toggle for the TTS scenario (the headline button). */
  toggleTts: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getTaxConfigRow(ctx.user.id);
      const cfg = hydrateConfig(existing?.config, input.enabled);
      await upsertTaxConfigRow(ctx.user.id, { ttsEnabled: input.enabled, config: cfg });
      return { ok: true as const, ttsEnabled: input.enabled };
    }),

  /**
   * The profitability dashboard. Pulls BaseLinker costs + orders, optional Ads
   * spend per item, and runs the tax engine for the selected period. Wrapped in
   * the resilient cache so a BaseLinker hiccup serves the last good snapshot
   * (clearly labelled) instead of breaking the page.
   */
  profitability: protectedProcedure
    .input(z.object({ days: periodDaysSchema }).optional())
    .query(async ({ ctx, input }) => {
      if (!isBaselinkerConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "BaseLinker não configurado. Informe o token de API nas configurações.",
        });
      }
      const days = input?.days ?? 30;
      const row = await getTaxConfigRow(ctx.user.id);
      const ttsEnabled = row?.ttsEnabled ?? false;
      const inventoryId = row?.baselinkerInventoryId ?? null;

      const TTL = 5 * 60 * 1000;
      const key = `finance:profit:${days}:${ttsEnabled ? "tts" : "no"}:${inventoryId ?? "auto"}`;

      try {
        const result = await cachedAccountResilient(
          ctx.user.id,
          key,
          () => computeProfitabilityForUser(ctx.user.id, days),
          TTL,
        );
        return { ...result.value, stale: result.stale, asOf: result.asOf };
      } catch (err) {
        mapBlError(err);
      }
    }),

  /**
   * Margin history — the daily snapshots captured by the Heartbeat job.
   * Returns chronological points so the UI can chart the evolution.
   */
  history: protectedProcedure
    .input(z.object({ days: z.number().int().min(7).max(180).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.days ?? 60;
      const rows = await listProfitSnapshots(ctx.user.id, limit);
      return rows
        .map((r: ProfitSnapshotRow) => ({
          date: r.snapshotDate,
          revenue: r.revenue,
          netProfitSemTts: r.netProfitSemTts,
          netProfitComTts: r.netProfitComTts,
          marginSemTts: r.marginSemTts,
          marginComTts: r.marginComTts,
          orderCount: r.orderCount,
          capturedAt: r.capturedAt,
        }))
        .sort((a: { date: string }, b: { date: string }) =>
          a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
        );
    }),
});

export { defaultTaxConfig };
