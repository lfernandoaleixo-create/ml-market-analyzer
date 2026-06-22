import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getUsdBrlRate } from "../fx";
import {
  insertPricingSimulation,
  listPricingSimulations,
  deletePricingSimulation,
  updatePricingSimulation,
} from "../pricingDb";
import type { PricingSimulation } from "../../drizzle/schema";
import {
  calculateTargetCost,
  type PricingInput,
  type Marketplace,
  type MlListingType,
  type MlLogisticType,
  type MlReputation,
} from "../../shared/pricing";

/** Alíquotas de imposto por regime de TTS. */
const TTS_TAX_PERCENT = 14;
const NO_TTS_TAX_PERCENT = 24;

/**
 * Recalcula os resultados (custo a pagar à Matriz por margem) a partir dos
 * params salvos, usando a mesma lógica pura da calculadora. Reaproveitado pelo
 * toggle de regime (COM/SEM TTS).
 */
function recomputeResults(
  params: Record<string, unknown>,
  sellingPrice: number,
  margins: number[],
) {
  const num = (v: unknown, fallback = 0) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const input: PricingInput = {
    mode: "preco_para_margem",
    marketplace: (params.marketplace as Marketplace) ?? "mercado_livre",
    mlListingType: (params.listingType as MlListingType) ?? "classico",
    desiredMargin: 0,
    productCost: 0,
    taxPercent: num(params.taxPercent),
    tacosPercent: num(params.tacosPercent),
    affiliatePercent: num(params.affiliatePercent),
    otherCostKind: "reais",
    otherCostValue: 0,
    commissionPercent: num(params.commissionPercent, 12),
    fixedFee: num(params.fixedFee),
    shippingCost: num(params.shippingCost),
    autoFees: params.autoFees !== false,
    mlLogisticType: (params.logisticType as MlLogisticType) ?? "padrao",
    freeShippingFast: Boolean(params.freeShippingFast),
    highlightCampaign: false,
    weightIndex: num(params.weightIndex),
    reputation: (params.reputation as MlReputation) ?? "verde",
    manualShipping: Boolean(params.manualShipping),
    sellingPrice,
    promoPercent: 0,
  };
  const res = calculateTargetCost(input, sellingPrice, margins, 1);
  return res.perMargin.map((p) => ({
    marginPct: p.marginPct,
    productCostBRL: p.productCostBRL,
    productCostUSD: 0,
    netProfitBRL: p.netProfitBRL,
    feasible: p.feasible,
  }));
}

/** Schema do resultado por margem persistido (espelha TargetCostMarginResult). */
const marginResultSchema = z.object({
  marginPct: z.number(),
  productCostBRL: z.number(),
  productCostUSD: z.number(),
  productCostCNY: z.number().optional(),
  netProfitBRL: z.number(),
  feasible: z.boolean(),
});

/** Normaliza a linha do banco para o cliente (converte centavos/milis e tipa os JSON). */
function toClient(row: PricingSimulation) {
  return {
    id: row.id,
    productName: row.productName,
    sku: row.sku,
    notes: row.notes,
    sellingPrice: row.sellingPriceCents / 100,
    usdToBrl: row.usdToBrlMilli / 10000,
    cnyToBrl: (row.params as Record<string, unknown>)?.cnyToBrl as number | undefined,
    margins: row.margins as number[],
    params: row.params as Record<string, unknown>,
    results: row.results as Array<z.infer<typeof marginResultSchema>>,
    createdAt: row.createdAt,
  };
}

export const pricingRouter = router({
  /** Cotações USD->BRL e CNY->BRL em tempo real (cache curto + fallback). Público. */
  fxRate: publicProcedure.query(async () => {
    const rate = await getUsdBrlRate();
    return rate;
  }),

  history: router({
    /** Lista o histórico do usuário logado. */
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await listPricingSimulations(ctx.user.id);
      return rows.map(toClient);
    }),

    /** Salva uma simulação no histórico. */
    save: protectedProcedure
      .input(
        z.object({
          productName: z.string().trim().min(1, "Informe o nome do produto").max(200),
          sku: z.string().trim().max(100).optional(),
          notes: z.string().trim().max(2000).optional(),
          sellingPrice: z.number().positive(),
          usdToBrl: z.number().positive(),
          cnyToBrl: z.number().positive().optional(),
          margins: z.array(z.number()).min(1).max(10),
          params: z.record(z.string(), z.any()),
          results: z.array(marginResultSchema).min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const row = await insertPricingSimulation({
          userId: ctx.user.id,
          productName: input.productName,
          sku: input.sku ?? null,
          notes: input.notes ?? null,
          sellingPriceCents: Math.round(input.sellingPrice * 100),
          usdToBrlMilli: Math.round(input.usdToBrl * 10000),
          margins: input.margins,
          params: { ...input.params, cnyToBrl: input.cnyToBrl },
          results: input.results,
        });
        if (!row) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível salvar o histórico." });
        }
        return toClient(row);
      }),

    /** Alterna o regime COM TTS (14%) <-> SEM TTS (24%) de uma variação salva e recalcula. */
    toggleRegime: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const rows = await listPricingSimulations(ctx.user.id);
        const row = rows.find((r) => r.id === input.id);
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Simulação não encontrada." });
        }
        const params = { ...(row.params as Record<string, unknown>) };
        const wasTts = params.hasTts !== false;
        const nextTts = !wasTts;
        params.hasTts = nextTts;
        params.taxPercent = nextTts ? TTS_TAX_PERCENT : NO_TTS_TAX_PERCENT;
        const sellingPrice = row.sellingPriceCents / 100;
        const margins = row.margins as number[];
        const results = recomputeResults(params, sellingPrice, margins);
        const updated = await updatePricingSimulation(ctx.user.id, input.id, { params, results });
        if (!updated) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível atualizar o regime." });
        }
        return toClient(updated);
      }),

    /** Exclui uma simulação do histórico. */
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const ok = await deletePricingSimulation(ctx.user.id, input.id);
        if (!ok) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Simulação não encontrada." });
        }
        return { success: true };
      }),
  }),
});
