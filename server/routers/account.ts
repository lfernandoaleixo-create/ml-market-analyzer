import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { ensureUserAccessToken, forceRefreshUserAccessToken } from "../ml/oauthMl";
import { AccountProvider } from "../ml/accountProvider";
import { getCredentials, upsertCredentials, resolveMlOwnerUserId } from "../dbMl";
import { resolveMlUserId } from "../ml/resolveMlUserId";
import { cachedAccount, cachedAccountResilient, swrAccount } from "../ml/accountCache";
import { MLRateLimitError } from "../ml/accountProvider";
import { buildActiveListings } from "../ml/activeListings";

/**
 * Run an account data loader and translate a Mercado Livre rate-limit signal
 * into an honest, retryable tRPC error. Without this, a 429 used to be masked
 * as an empty result (a fake all-zero dashboard). Now the UI shows a clear
 * "ML limitou as consultas, tente novamente" message + retry button instead.
 */
async function runAccount<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (err) {
    if (err instanceof MLRateLimitError) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: err.message });
    }
    throw err;
  }
}

/**
 * Account ("Central de Gestão") router — real data from the connected seller
 * account using the owner OAuth token. Every procedure is protected: it needs a
 * logged-in Manus user whose ML OAuth connection is active.
 */

/** Resolve a ready AccountProvider (token + ML user id) or throw a friendly error. */
export async function resolveAccount(manusUserId: number): Promise<AccountProvider> {
  const token = await ensureUserAccessToken(manusUserId);
  if (!token) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Conta do Mercado Livre não conectada. Vá em Configurações e conecte sua conta para ver os dados reais.",
    });
  }
  // Resolve the ML seller id. Source of truth, in order:
  //  1) the persisted `mlUserId` column (written by the OAuth token exchange)
  //  2) /users/me with the fresh token (authoritative)
  //  3) the numeric suffix of the access token (APP_USR-...-<userId>) as a
  //     last-resort heuristic
  // We DO NOT trust the local app user id — using it makes ML reply
  // "Searching another user items is restricted" and the dashboard shows zeros.
  // SINGLE-STORE: the seller id / credentials live on the OWNER's row, shared by
  // every login. Resolve it once so reads + backfill all target the same row.
  const ownerUserId = await resolveMlOwnerUserId(manusUserId);
  const creds = await getCredentials(ownerUserId);
  const { mlUserId, source } = await resolveMlUserId(token, creds?.mlUserId ?? null);
  if (!mlUserId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Não foi possível identificar a conta do Mercado Livre. Reconecte em Configurações.",
    });
  }
  // Backfill the column when it was resolved from /users/me or the token suffix
  // so subsequent requests use the fast, reliable persisted value.
  if (source !== "db" && creds && creds.mlUserId !== mlUserId) {
    await upsertCredentials(ownerUserId, { mlUserId }).catch(() => {});
  }
  return new AccountProvider(token, mlUserId, "BRL", (staleToken) =>
    forceRefreshUserAccessToken(manusUserId, staleToken),
  );
}

const periodInput = z
  .object({
    /** Number of days to look back (default 180 — comfortably covers the
     *  account's whole life so early orders are never dropped). */
    days: z.number().int().min(1).max(365).optional(),
  })
  .optional();

function periodBounds(days = 180) {
  const to = Date.now();
  const from = to - days * 24 * 60 * 60 * 1000;
  return { fromMs: from, toMs: to };
}

export const accountRouter = router({
  /** Connection probe — is the ML account linked and the token valid? */
  connection: protectedProcedure.query(async ({ ctx }) => {
    const token = await ensureUserAccessToken(ctx.user.id);
    if (!token) return { connected: false as const };
    try {
      const account = await resolveAccount(ctx.user.id);
      const probe = await account.probe();
      // Self-heal: a successful probe PROVES the token works. If the DB still
      // carries a stale status="error" (e.g. left over from a previous 429 or a
      // transient failure), reset it to "connected" so the UI stops showing a
      // false "desconectado". Best-effort: never let a write failure break the
      // probe response.
      if (probe.ok) {
        const ownerUserId = await resolveMlOwnerUserId(ctx.user.id).catch(() => ctx.user.id);
        const creds = await getCredentials(ownerUserId).catch(() => null);
        if (creds && creds.status !== "connected") {
          await upsertCredentials(ownerUserId, {
            status: "connected",
            statusMessage: "Conexão verificada automaticamente.",
          }).catch(() => {});
        }
      }
      return { connected: probe.ok, nickname: probe.nickname };
    } catch (err) {
      // A rate limit is NOT a disconnection: the account is still linked, ML is
      // just throttling us. Report it as connected-but-rate-limited so the UI
      // does not scare the user with a false "desconectado" during a demo.
      if (err instanceof MLRateLimitError) {
        return { connected: true as const, rateLimited: true as const };
      }
      return { connected: false as const };
    }
  }),

  /** Reputation + account health. */
  reputation: protectedProcedure.query(async ({ ctx }) =>
    runAccount(() =>
      cachedAccount(ctx.user.id, "reputation", async () => {
        const account = await resolveAccount(ctx.user.id);
        const rep = await account.getReputation();
        if (!rep) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Não foi possível carregar a reputação." });
        }
        return rep;
      }),
    ),
  ),

  /** Sales dashboard for a period (revenue, orders, ticket, daily, top products). */
  salesDashboard: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const days = input?.days ?? 180;
    return runAccount(() =>
      cachedAccount(ctx.user.id, `salesDashboard:${days}`, async () => {
        const account = await resolveAccount(ctx.user.id);
        const { fromMs, toMs } = periodBounds(days);
        return account.getSalesDashboard({ fromMs, toMs });
      }),
    );
  }),

  /**
   * Sales dashboard for an EXPLICIT date range [fromMs,toMs]. Used by the month
   * selector, the custom range picker and the single-day card. When `fill` is
   * true the daily series includes every day in the range (zeros for no-sale
   * days) so the bar chart can render the whole month.
   */
  salesRange: protectedProcedure
    .input(
      z.object({
        fromMs: z.number().int().nonnegative(),
        toMs: z.number().int().positive(),
        fill: z.boolean().optional(),
        /** Max ranked products to return. 0 = full ranking (every product). */
        topLimit: z.number().int().min(0).max(2000).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.toMs < input.fromMs) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Intervalo de datas inválido." });
      }
      const key = `salesRange:${input.fromMs}:${input.toMs}:${input.fill ?? false}:${input.topLimit ?? ""}`;
      return runAccount(() =>
        cachedAccount(ctx.user.id, key, async () => {
          const account = await resolveAccount(ctx.user.id);
          return account.getSalesDashboard({
            fromMs: input.fromMs,
            toMs: input.toMs,
            fill: input.fill ?? false,
            topLimit: input.topLimit,
          });
        }),
      );
    }),

  /**
   * Month-over-month comparison: KPI summaries for an explicit list of periods
   * (e.g. current month + previous month). Reuses the cached paid orders so the
   * whole comparison costs a single orders fetch.
   */
  salesPeriods: protectedProcedure
    .input(
      z.object({
        periods: z
          .array(
            z.object({
              key: z.string().min(1).max(40),
              fromMs: z.number().int().nonnegative(),
              toMs: z.number().int().positive(),
            }),
          )
          .min(1)
          .max(6),
      }),
    )
    .query(async ({ ctx, input }) =>
      runAccount(async () => {
        const account = await resolveAccount(ctx.user.id);
        const out: Record<string, Awaited<ReturnType<typeof account.getPeriodSummary>>> = {};
        for (const p of input.periods) {
          out[p.key] = await account.getPeriodSummary({ fromMs: p.fromMs, toMs: p.toMs });
        }
        return out;
      }),
    ),

  /** Lifetime store stats: first sale, days in business, total revenue & orders. */
  storeLifetime: protectedProcedure.query(async ({ ctx }) =>
    runAccount(() =>
      cachedAccount(ctx.user.id, "storeLifetime", async () => {
        const account = await resolveAccount(ctx.user.id);
        return account.getStoreLifetime();
      }),
    ),
  ),

  /** Products sold on a single BRT calendar day (yyyy-mm-dd). */
  productsByDay: protectedProcedure
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use yyyy-mm-dd).") }))
    .query(async ({ ctx, input }) =>
      runAccount(async () => {
        const account = await resolveAccount(ctx.user.id);
        return account.getProductsByDay(input.date);
      }),
    ),

  /**
   * Anúncios ATIVOS (aba da Calculadora) — somente status `active`, enriquecidos
   * com custo (BaseLinker, por SKU), comissão/frete reais, lucro real atual e
   * preços-alvo para 3 margens escolhidas. Cache curto + resiliente.
   */
  activeListings: protectedProcedure
    .input(
      z
        .object({
          /** As 3 margens (%) para os preços-alvo. */
          margins: z.array(z.number().min(0).max(95)).min(1).max(3).optional(),
          /** Imposto agregado (%) sobre o preço. Quando ausente, usa o default. */
          taxPercent: z.number().min(0).max(50).optional(),
          /** TACoS/ADS (%) opcional. */
          tacosPercent: z.number().min(0).max(50).optional(),
          /** Afiliados (%) opcional. */
          affiliatePercent: z.number().min(0).max(50).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const margins = input?.margins ?? [20, 30, 40];
      const taxKey = input?.taxPercent ?? "def";
      // SWR NÃO-BLOQUEANTE: a montagem (IDs→detalhes→SKUs→custos) pode levar dezenas
      // de segundos em contas grandes e, num cold start de produção (Cloud Run),
      // estourava o limite de 180s → "conexão interrompida" (502). Por isso não
      // esperamos a montagem: no primeiro acesso devolvemos status "loading" em ms
      // e disparamos a coleta em background; o cliente faz poll e a tela preenche
      // assim que fica pronta (mesmo padrão do gráfico de visitas diárias).
      const key = `activeListings:${margins.join("-")}:t${taxKey}:a${input?.tacosPercent ?? 0}:af${input?.affiliatePercent ?? 0}`;
      const { value, status, asOf, error } = swrAccount(
        ctx.user.id,
        key,
        async () => {
          const account = await resolveAccount(ctx.user.id);
          return buildActiveListings(ctx.user.id, account, {
            margins,
            taxPercent: input?.taxPercent,
            tacosPercent: input?.tacosPercent,
            affiliatePercent: input?.affiliatePercent,
          });
        },
        60 * 1000,
      );
      // Cold start: ainda não há dados → sinaliza loading/erro para o cliente.
      // Quando a montagem em background falhou (tipicamente ML 429/timeout) e não
      // há nada para servir, devolvemos status "error" com uma mensagem amigável,
      // em vez de deixar a tela presa em "Preparando..." para sempre.
      if (value === undefined) {
        const isRate = !!error && /rate|429|too many|limit/i.test(error);
        const message = isRate
          ? "O Mercado Livre limitou as consultas. Aguarde alguns instantes e tente novamente."
          : error
            ? "Não foi possível carregar os anúncios agora. Tente novamente em instantes."
            : undefined;
        return { ready: false as const, status, asOf, message };
      }
      return { ...value, ready: true as const, stale: status === "stale", asOf };
    }),

  /** Listings performance (visits, sales, conversion, stock, status). */
  listings: protectedProcedure
    .input(
      z
        .object({
          /** Visits window in days (real period visits via time_window). */
          lastDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).optional(),
          /** Include the per-item daily visits chart (Anúncios only; Painel skips it). */
          includeVisitsSeries: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const lastDays = input?.lastDays ?? 30;
      const includeVisitsSeries = input?.includeVisitsSeries ?? false;
      // Resilient: on a transient ML 429/timeout we serve the last known-good
      // snapshot (clearly labelled `stale`) instead of crashing the page. This is
      // what guarantees the Anúncios screen never shows "Não foi possível
      // carregar" during a live demo.
      const { value, stale, asOf } = await cachedAccountResilient(
        ctx.user.id,
        `listings:${lastDays}:vs${includeVisitsSeries ? 1 : 0}`,
        async () => {
          const account = await resolveAccount(ctx.user.id);
          return account.getListings({ lastDays, includeVisitsSeries });
        },
        // Short TTL (12s): the heavy visits work now runs in a BACKGROUND
        // collector (server/ml/visitsStore.ts), so getListings itself is cheap
        // and a short TTL lets the client poll and watch the visits total fill
        // in progressively — instead of being frozen on a 5-min cached snapshot.
        12 * 1000,
      ).catch((err) => {
        if (err instanceof MLRateLimitError) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: err.message });
        }
        throw err;
      });
      return { ...value, stale, asOf };
    }),

  /**
   * Daily visits series for the evolution chart.
   *
   * IMPORTANT — why this is NOT the non-blocking SWR pattern anymore:
   * The chart used to be served by `swrAccount`, which returns the cached series
   * instantly and refreshes in a DETACHED background task. That works on a
   * long-lived server, but our production runtime is Autoscale/Cloud Run with
   * `min-instances=0`: the instance is frozen/killed as soon as the HTTP
   * response is flushed, so the background refresh never finishes. The cache
   * then stayed pinned to whatever snapshot existed when the instance last went
   * cold — which is exactly the "o gráfico parou na quinta-feira" the user saw.
   *
   * Fix: collect in the REQUEST when there is no fresh value. `cachedAccountResilient`
   *   - serves a fresh cached series immediately (within TTL),
   *   - otherwise AWAITS the collection (a few seconds) and returns the series
   *     updated through today,
   *   - and only on a transient ML failure falls back to the last known-good
   *     snapshot (clearly labelled `stale`) instead of crashing the page.
   * The collection is light (active item ids + their dated visits) and finishes
   * well within the 180s request budget for a real store.
   */
  visitsSeries: protectedProcedure
    .input(z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      // Window anchored to BRT inside the provider. Keep a collected series
      // "fresh" for only 3 min so TODAY's partial bar updates frequently, but
      // repeated opens within that window still hit the cache (no ML burst).
      const { value, stale, asOf } = await cachedAccountResilient(
        ctx.user.id,
        `visitsSeries:${days}`,
        async () => {
          const account = await resolveAccount(ctx.user.id);
          return account.getVisitsSeriesOnly(days);
        },
        3 * 60 * 1000,
      ).catch((err) => {
        if (err instanceof MLRateLimitError) throw err;
        // No cache and the collection failed: surface an empty series rather than
        // a hard error so the chart shows its honest "sem dados ainda" state.
        return { value: { series: [], attempted: 0, resolved: 0 }, stale: false, asOf: 0 };
      });
      return {
        series: value?.series ?? [],
        // We now always return real data (or an explicit empty series); there is
        // no "cold start with nothing" anymore, so pending stays false.
        pending: false,
        status: stale ? ("stale" as const) : ("fresh" as const),
        asOf,
      };
    }),

  /**
   * Visitas DIÁRIAS por anúncio (últimos N dias, default 4 = hoje + 3 dias atrás).
   * Recebe os itemIds visíveis na lista e devolve, por anúncio, a série diária
   * (do mais antigo ao mais recente; o último é HOJE, ainda parcial). NÃO bloqueia:
   * usa o coletor progressivo (visitsDailyStore) e devolve o que já foi coletado,
   * sinalizando `collecting` para o cliente continuar o poll até completar.
   */
  visitsDaily: protectedProcedure
    .input(
      z.object({
        itemIds: z.array(z.string().min(1)).min(1).max(400),
        days: z.union([z.literal(4), z.literal(7)]).optional(),
      }),
    )
    .query(async ({ ctx, input }) =>
      runAccount(async () => {
        const days = input.days ?? 4;
        const account = await resolveAccount(ctx.user.id);
        const { perItem, attempted, resolved, collecting } =
          account.getDailyVisitsBreakdown(input.itemIds, days);
        // Mapa -> objeto serializável { itemId: VisitsDayPoint[] }.
        const items: Record<string, { date: string; visits: number }[]> = {};
        for (const [id, series] of Array.from(perItem.entries())) items[id] = series;
        return { items, days, attempted, resolved, collecting };
      }),
    ),

  /**
   * Quebra do total diário de visitas POR ANÚNCIO (últimos N dias, default 30 =
   * janela do gráfico "Evolução das visitas" do Painel). Para cada dia, o
   * cliente pode somar/listar quais anúncios produziram as visitas daquele dia.
   * NÃO bloqueia: usa o coletor progressivo (visitsDailyStore) e devolve o que
   * já foi coletado, sinalizando `collecting` para o cliente continuar o poll.
   */
  visitsByListing: protectedProcedure
    .input(
      z
        .object({
          days: z.union([z.literal(7), z.literal(30), z.literal(90)]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) =>
      runAccount(async () => {
        const days = input?.days ?? 30;
        const account = await resolveAccount(ctx.user.id);
        const result = await account.getDailyVisitsByListing(days);
        return { ...result, days };
      }),
    ),

  /** Post-sale summary (claims, cancellations). */
  postSale: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const days = input?.days ?? 180;
    return runAccount(() =>
      cachedAccount(ctx.user.id, `postSale:${days}`, async () => {
        const account = await resolveAccount(ctx.user.id);
        const { fromMs } = periodBounds(days);
        return account.getPostSale({ fromMs });
      }),
    );
  }),

  /**
   * Raio-X da Ficha Técnica — diagnose each listing's technical sheet
   * (complete vs incomplete, missing attributes, missing-required). Read-only.
   */
  technicalSpecs: protectedProcedure.query(async ({ ctx }) =>
    runAccount(() =>
      cachedAccount(ctx.user.id, "technicalSpecs", async () => {
        const account = await resolveAccount(ctx.user.id);
        return account.getTechnicalSpecs();
      }),
    ),
  ),
});
