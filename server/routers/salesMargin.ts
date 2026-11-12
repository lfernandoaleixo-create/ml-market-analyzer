import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  calculateMarginRow,
  summarizeMargins,
  type MarginDashboard,
  type MarginSale,
} from "../../shared/salesMargin";
import {
  getSalesMarginCollection,
  SalesMarginProviderError,
  verifySalesMarginAccount,
  type MarginBounds,
} from "../salesMargin/provider";
import {
  importMarginReport,
  listMarginCosts,
  listMarginReports,
  saveMarginCost,
  type MarginReportSnapshot,
} from "../salesMargin/db";
import { parseMarginReport } from "../salesMargin/reportParser";

const boundsSchema = z
  .object({
    fromMs: z.number().int().min(0).max(8_640_000_000_000_000),
    toMs: z.number().int().min(0).max(8_640_000_000_000_000),
  })
  .refine(value => value.fromMs <= value.toMs, {
    message: "Período inválido.",
  });
const fileFields = {
  fileName: z.string().trim().min(1).max(160),
  base64: z
    .string()
    .min(1)
    .max(Math.ceil((2 * 1024 * 1024) / 3) * 4 + 32),
};
const moneySchema = z
  .number()
  .finite()
  .nonnegative()
  .max(999_999_999.99)
  .refine(value => /^\d+(?:\.\d{1,2})?$/.test(String(value)), {
    message: "Use custos com no máximo duas casas decimais.",
  })
  .nullable();
const SAFE_PARSER_MESSAGES = new Set([
  "Use um arquivo CSV ou XLSX.",
  "Arquivo inválido ou maior que 2 MB.",
  "Arquivo vazio ou maior que 2 MB.",
  "Base64 inválido.",
  "Relatório por liberação não é suportado; use Por venda.",
  "Cabeçalho contém colunas financeiras/identificadoras ambíguas.",
  "Cabeçalho inseguro: fórmulas não são aceitas.",
  "Importe uma única planilha de vendas por arquivo.",
  "Cabeçalho não suportado. Use ML Por venda ou MP account money com referência do pedido, valores e data da transação.",
  "Relatório excede o limite de 5000 linhas de dados.",
  "Somente valores em BRL são suportados.",
  "Relatório MP pertence a outra conta; somente a loja autorizada pode ser importada.",
  "Referência MP sem correlação inequívoca com pedido; prefira o relatório ML Por venda.",
  "Fluxo MP desconhecido ou não relacionado a venda (saque/payout/transferência); prefira ML Por venda com eventos de vendas identificados.",
  "SKU numérico inseguro; exporte como texto.",
  "Valor financeiro inválido.",
  "Valor financeiro não finito ou acima de 1 bilhão.",
  "Data inválida; use DD/MM/AAAA ou ISO.",
  "Quantidade inválida.",
  "Evento duplicado com valores ou operação conflitantes.",
  "Uma operação contém datas de venda conflitantes.",
  "Total da operação excede 1 bilhão.",
  "Relatório não contém operações.",
  "Operação sem data da venda; data de liberação/operação não substitui data da venda.",
]);
function parseReport(fileName: string, base64: string) {
  try {
    return parseMarginReport(fileName, base64);
  } catch (error) {
    if (error instanceof Error && SAFE_PARSER_MESSAGES.has(error.message)) {
      throw new SalesMarginProviderError("BAD_REQUEST", error.message);
    }
    throw new SalesMarginProviderError(
      "BAD_REQUEST",
      "Não foi possível validar o relatório. Use CSV ou XLSX de até 2 MB, com cabeçalhos ML Por venda ou MP account money e valores estáticos."
    );
  }
}
async function sanitized<T>(work: () => Promise<T>, file = false): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof SalesMarginProviderError)
      throw new TRPCError({ code: error.code, message: error.message });
    // Do not attach the original cause: it can contain SQL, report rows, URLs or tokens.
    throw new TRPCError({
      code: file ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
      message: file
        ? "Não foi possível validar ou importar o relatório. Confira o arquivo e tente novamente."
        : "Não foi possível consultar ou salvar a margem agora. Tente novamente.",
    });
  }
}
/** Only exact, unique item identifiers within the same operation may supply a missing SKU. */
function supplementSku(report: MarginSale, api?: MarginSale): MarginSale {
  if (!api || api.operationId !== report.operationId)
    return { ...report, source: "report" };
  const count = (sale: MarginSale, itemId: string) =>
    sale.items.filter(item => item.itemId === itemId).length;
  return {
    ...report,
    source: "report",
    items: report.items.map(item => {
      if (
        item.sku?.trim() ||
        !item.itemId ||
        count(report, item.itemId) !== 1 ||
        count(api, item.itemId) !== 1
      )
        return { ...item };
      const match = api.items.find(
        candidate => candidate.itemId === item.itemId
      )!;
      return { ...item, sku: match.sku?.trim() || null };
    }),
  };
}
function saleTime(sale: MarginSale): number {
  // Parser snapshots carry Brazilian calendar days; date-only ISO must not be treated as UTC midnight.
  return Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(sale.saleDate)
      ? `${sale.saleDate}T00:00:00-03:00`
      : sale.saleDate
  );
}
/** A report is a snapshot, not another event stream to add to previous uploads. */
function mergeSnapshots(
  api: MarginSale[],
  reports: MarginReportSnapshot[],
  bounds: MarginBounds
): MarginSale[] {
  const operations = new Map(api.map(sale => [sale.operationId, sale]));
  const latest = new Map<string, MarginSale>();
  const sorted = [...reports].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id
  );
  for (const report of sorted)
    for (const sale of report.operations) {
      if (!latest.has(sale.operationId)) latest.set(sale.operationId, sale);
    }
  for (const [operationId, sale] of latest)
    operations.set(
      operationId,
      supplementSku(sale, operations.get(operationId))
    );
  return [...operations.values()]
    .filter(sale => {
      const date = saleTime(sale);
      const end = /^\d{4}-\d{2}-\d{2}$/.test(sale.saleDate)
        ? date + 86_400_000 - 1
        : date;
      return (
        Number.isFinite(date) && end >= bounds.fromMs && date <= bounds.toMs
      );
    })
    .sort(
      (a, b) =>
        saleTime(b) - saleTime(a) || b.operationId.localeCompare(a.operationId)
    );
}
async function dashboard(
  userId: number,
  bounds: MarginBounds,
  force = false
): Promise<MarginDashboard> {
  const collection = await getSalesMarginCollection(userId, bounds, force);
  // Fresh on EVERY query, including a cache hit. Never cache calculated costs or report overrides.
  const [storedReports, costs] = await Promise.all([
    listMarginReports(collection.ownerUserId, collection.sellerId),
    listMarginCosts(collection.ownerUserId, collection.sellerId),
  ]);
  const costByOperation = new Map(costs.map(cost => [cost.operationId, cost]));
  const rows = mergeSnapshots(
    collection.operations,
    storedReports.reports,
    bounds
  ).map(sale =>
    calculateMarginRow(sale, costByOperation.get(sale.operationId))
  );
  const partial = collection.partial || storedReports.partial;
  const warnings = [
    collection.warning,
    storedReports.partial
      ? "Leitura limitada aos 1.000 relatórios mais recentes; o total do período pode estar incompleto."
      : undefined,
  ].filter(Boolean);
  return {
    sellerId: collection.sellerId,
    nickname: collection.nickname,
    asOf: collection.asOf,
    stale: collection.stale,
    partial,
    capped: collection.capped || storedReports.partial,
    ...(warnings.length ? { warning: warnings.join(" ") } : {}),
    reportCount: storedReports.count,
    rows,
    summary: summarizeMargins(rows, partial),
  };
}
export const salesMarginRouter = router({
  dashboard: protectedProcedure
    .input(boundsSchema)
    .query(
      ({ ctx, input }): Promise<MarginDashboard> =>
        sanitized(() => dashboard(ctx.user.id, input))
    ),
  refresh: protectedProcedure
    .input(boundsSchema)
    .mutation(
      ({ ctx, input }): Promise<MarginDashboard> =>
        sanitized(() => dashboard(ctx.user.id, input, true))
    ),
  previewReport: protectedProcedure
    .input(z.object(fileFields))
    .mutation(({ ctx, input }) =>
      sanitized(async () => {
        await verifySalesMarginAccount(ctx.user.id);
        return parseReport(input.fileName, input.base64);
      }, true)
    ),
  importReport: protectedProcedure
    .input(z.object({ ...fileFields, confirmedStore: z.literal(true) }))
    .mutation(({ ctx, input }) =>
      sanitized(async () => {
        const account = await verifySalesMarginAccount(ctx.user.id);
        const preview = parseReport(input.fileName, input.base64);
        return {
          ok: true as const,
          ...(await importMarginReport(
            account.ownerUserId,
            account.sellerId,
            ctx.user.id,
            preview
          )),
          warnings: preview.warnings,
        };
      }, true)
    ),
  saveCost: protectedProcedure
    .input(
      z.object({
        operationId: z.string().trim().min(1).max(100),
        productCost: moneySchema,
        extraCosts: moneySchema,
        note: z.string().trim().max(1000).optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      sanitized(async () => {
        const account = await verifySalesMarginAccount(ctx.user.id);
        const cost = await saveMarginCost(
          account.ownerUserId,
          account.sellerId,
          ctx.user.id,
          input
        );
        return { ok: true as const, cost };
      })
    ),
});
