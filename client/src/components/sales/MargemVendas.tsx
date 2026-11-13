import {
  Fragment,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { trpc } from "@/lib/trpc";
import { KpiCard, SectionCard } from "@/components/account/AccountUI";
import { ProductCell } from "@/components/account/ProductCell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Calculator,
  ChevronDown,
  ChevronUp,
  DollarSign,
  ExternalLink,
  Percent,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import {
  MARGIN_REPORT_SOURCES,
  type MarginChargeCategory,
  type MarginDashboard,
  type MarginReportPreview,
  type MarginRow,
} from "@shared/salesMargin";

const MAX_REPORT_BYTES = 2 * 1024 * 1024;
const CHARGE_LABELS: Record<MarginChargeCategory, string> = {
  sale: "Tarifa de venda",
  processing: "Processamento do pagamento",
  shipping: "Frete / envio",
  financing: "Financiamento / parcelamento",
  tax: "Impostos retidos",
  other: "Outros descontos ou ajustes",
};
const finite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);
const costKnown = (value: number | null | undefined): value is number =>
  finite(value) && value >= 0;
const percent = (value: number | null | undefined) =>
  finite(value)
    ? `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`
    : "—";
const money = (value: number | null | undefined) =>
  finite(value) ? formatBRL(value) : "—";
const hasSku = (row: MarginRow) =>
  row.items.length > 0 && row.items.every(item => !!item.sku?.trim());
const financialKnown = (row: MarginRow) =>
  row.financialStatus === "confirmed" && finite(row.gross) && finite(row.net);
const resultKnown = (row: MarginRow) =>
  financialKnown(row) &&
  hasSku(row) &&
  costKnown(row.productCost) &&
  costKnown(row.extraCosts) &&
  row.resultStatus === "confirmed" &&
  finite(row.result);

function dateLabel(value: string) {
  // Date-only report fields must not drift to the previous day in BRT.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return value.split("-").reverse().join("/");
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : value || "—";
}
function snapshotLabel(asOf: number) {
  return Number.isFinite(asOf)
    ? new Date(asOf).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "não informado";
}
function Notice({
  children,
  danger = false,
}: {
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-xl border p-3 text-sm",
        danger
          ? "border-rose-500/20 bg-rose-500/5 text-rose-700"
          : "border-amber-500/20 bg-amber-500/5 text-amber-800"
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1 break-words">{children}</div>
    </div>
  );
}

export type MargemVendasProps = {
  fromMs: number;
  toMs: number;
  title: string;
  enabled: boolean;
};

export function marginRefreshNotice(data: MarginDashboard): string {
  if (data.stale)
    return "Consulta refeita; a fotografia continua desatualizada. Confira os avisos e a data dos dados.";
  if (data.partial || data.capped)
    return "Consulta refeita; ainda há coleta parcial ou limitada. Os totais do período não estão confirmados.";
  if (data.warning || data.rows.some(row => !resultKnown(row)))
    return "Consulta refeita; ainda há avisos ou pendências financeiras, de SKU ou de custos. Confira a fotografia abaixo.";
  return "Consulta refeita. Confira a data da fotografia e os valores confirmados abaixo.";
}

/** Mounted only in the active tab. A failed financial API never hides report import. */
export function MargemVendas({
  fromMs,
  toMs,
  title,
  enabled,
}: MargemVendasProps) {
  const dashboard = trpc.salesMargin.dashboard.useQuery(
    { fromMs, toMs },
    {
      enabled,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const refresh = trpc.salesMargin.refresh.useMutation();
  const saveCost = trpc.salesMargin.saveCost.useMutation();
  const [editing, setEditing] = useState<MarginRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refreshFinancials() {
    if (!enabled || refresh.isPending) return;
    setActionError(null);
    setNotice(null);
    try {
      await refresh.mutateAsync({ fromMs, toMs });
      const updated = await dashboard.refetch({ throwOnError: true });
      if (updated.error || !updated.data)
        throw (
          updated.error ??
          new Error(
            "Consulta refeita sem fotografia confirmada. Os dados anteriores não confirmam a atualização."
          )
        );
      setNotice(marginRefreshNotice(updated.data));
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar os dados financeiros."
      );
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex min-w-0 flex-col items-start justify-between gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-display text-lg">Margem por pedido</h2>
          <p className="text-sm text-muted-foreground">
            {title} · Descontos reais do ML/MP e custos informados por você.
          </p>
          <p className="max-w-3xl text-xs text-muted-foreground">
            Período pela data da venda/operação, não pela liberação do dinheiro.
            O líquido financeiro informado pela API ou pelo relatório é a
            referência; tarifas e impostos já descontados não são subtraídos de
            novo.
          </p>
          <p className="max-w-3xl text-xs text-muted-foreground">
            Resultado após custos conhecidos, não lucro líquido contábil. Não
            estimamos tarifas, impostos ou alíquotas. Valores desconhecidos
            aparecem como —, nunca como zero.
          </p>
          <p className="max-w-3xl text-xs text-muted-foreground">
            Cobranças posteriores ou em fatura separada, como publicidade e
            armazenamento Full, podem não constar no líquido do pagamento.
            Concilie pelo relatório e informe despesas ainda não incluídas,
            sem descontá-las duas vezes.
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-11 w-full gap-2 bg-background sm:min-h-9 sm:w-auto"
          disabled={!enabled || refresh.isPending || dashboard.isFetching}
          onClick={refreshFinancials}
        >
          <RefreshCw
            className={cn("h-4 w-4", refresh.isPending && "animate-spin")}
          />{" "}
          Atualizar dados
        </Button>
      </div>
      {!enabled && (
        <Notice>
          A conta precisa estar conectada para consultar e importar relatórios
          da loja Toujours.
        </Notice>
      )}
      {actionError && <Notice danger>{actionError}</Notice>}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-primary/5 p-3 text-sm text-primary"
        >
          {notice}
        </p>
      )}
      <MarginDashboardView
        data={dashboard.data}
        loading={enabled && dashboard.isLoading}
        error={dashboard.error?.message}
        onEditCost={row => {
          saveCost.reset();
          setEditing(row);
        }}
        canEdit={enabled}
      />
      <ReportImporter
        enabled={enabled}
        onImported={() => {
          void dashboard.refetch();
        }}
      />
      <Dialog
        open={editing !== null}
        onOpenChange={open => {
          if (!open && !saveCost.isPending) setEditing(null);
        }}
      >
        <DialogContent className="min-w-0 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain p-4 sm:p-6">
          <DialogHeader className="min-w-0 pr-6">
            <DialogTitle>Custos totais do pedido</DialogTitle>
            <DialogDescription>
              Informe o CMV de todos os produtos e as despesas extras da
              operação. Não são custos unitários e não alteram SKU nem anúncio.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <OrderCostForm
              key={editing.operationId}
              row={editing}
              saving={saveCost.isPending}
              onCancel={() => setEditing(null)}
              onSave={async values => {
                await saveCost.mutateAsync({
                  operationId: editing.operationId,
                  ...values,
                });
                setEditing(null);
                setNotice(
                  "Custos totais do pedido salvos. Campos em branco continuam desconhecidos."
                );
                void dashboard.refetch();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Pure SSR-friendly view: unknown totals are never replaced by known subtotals. */
export function MarginDashboardView({
  data,
  loading = false,
  error,
  onEditCost,
  canEdit = false,
}: {
  data?: MarginDashboard;
  loading?: boolean;
  error?: string | null;
  onEditCost?: (row: MarginRow) => void;
  canEdit?: boolean;
}) {
  const [search, setSearch] = useState("");
  const searchId = useId();
  const summary = data?.summary;
  const collectionPartial = !!(data?.partial || data?.capped);
  const gross =
    !collectionPartial &&
    data?.rows.every(row => finite(row.gross)) &&
    finite(summary?.gross)
      ? summary.gross
      : null;
  const net =
    !collectionPartial &&
    data?.rows.every(financialKnown) &&
    finite(summary?.net)
      ? summary.net
      : null;
  const result =
    !collectionPartial &&
    data?.rows.every(resultKnown) &&
    finite(summary?.result)
      ? summary.result
      : null;
  const netPercent =
    gross !== null && net !== null ? summary?.netPercent : null;
  const confirmedFinancial = data?.rows.filter(financialKnown) ?? [];
  const confirmedResults = data?.rows.filter(resultKnown) ?? [];
  const knownNet =
    Math.round(
      confirmedFinancial.reduce((total, row) => total + row.net!, 0) * 100
    ) / 100;
  const knownResult =
    Math.round(
      confirmedResults.reduce((total, row) => total + row.result!, 0) * 100
    ) / 100;
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const rows =
    data?.rows.filter(row =>
      [
        row.operationId,
        ...row.items.flatMap(item => [
          item.title,
          item.sku ?? "",
          item.itemId ?? "",
        ]),
      ].some(value => value.toLocaleLowerCase("pt-BR").includes(query))
    ) ?? [];
  const financialPending =
    data?.rows.filter(row => !financialKnown(row)).length ?? 0;
  const skuPending = data?.rows.filter(row => !hasSku(row)).length ?? 0;
  const costPending =
    data?.rows.filter(
      row => !costKnown(row.productCost) || !costKnown(row.extraCosts)
    ).length ?? 0;

  return (
    <div className="min-w-0 space-y-4">
      {error && (
        <Notice danger>
          <p>
            Consulta financeira não confirmada.{" "}
            {data
              ? "Exibindo a fotografia anterior, sem confirmar a atualização."
              : "Não há total financeiro confirmado para exibir."}
          </p>
          <p>A importação de relatório continua disponível abaixo.</p>
          <p className="text-xs">{error}</p>
        </Notice>
      )}
      {collectionPartial && (
        <Notice>
          <p>
            Coleta parcial{data?.capped ? " / limite de consulta atingido" : ""}
            : os totais do período não estão confirmados.
          </p>
          <p>
            Os subtotais consideram apenas as operações retornadas, não o
            período inteiro. Tente um intervalo menor ou importe um relatório
            oficial.
          </p>
        </Notice>
      )}
      {data?.stale && (
        <Notice>
          Fotografia desatualizada: dados de {snapshotLabel(data.asOf)}.
          Atualize antes de tomar decisões.
        </Notice>
      )}
      {data?.warning && <Notice>{data.warning}</Notice>}
      {data && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Fotografia em {snapshotLabel(data.asOf)} (horário de Brasília)
          </span>
          <span>
            · {summary?.operations} operações · {data.reportCount} relatórios
            importados
          </span>
          {financialPending > 0 && (
            <Badge
              variant="outline"
              className="border-amber-500/30 text-amber-800"
            >
              Financeiro pendente: {financialPending}
            </Badge>
          )}
          {skuPending > 0 && (
            <Badge
              variant="outline"
              className="border-rose-500/30 text-rose-700"
            >
              SKU ausente: {skuPending}
            </Badge>
          )}
          {costPending > 0 && (
            <Badge
              variant="outline"
              className="border-amber-500/30 text-amber-800"
            >
              Custos pendentes: {costPending}
            </Badge>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Valor das operações"
          value={money(gross)}
          loading={loading}
          icon={DollarSign}
          accent="emerald"
          sublabel={
            gross === null
              ? "Total do período não confirmado"
              : "Valor bruto das operações"
          }
        />
        <KpiCard
          label="Líquido após descontos ML"
          value={money(net)}
          loading={loading}
          icon={DollarSign}
          accent="emerald"
          sublabel={
            net === null && summary && confirmedFinancial.length > 0
              ? `Subtotal confirmado de ${confirmedFinancial.length}/${summary.operations}: ${money(knownNet)}`
              : net === null
                ? "Aguardando confirmação financeira"
                : "Não desconta CMV ou despesas extras"
          }
        />
        <KpiCard
          label="% que restou"
          value={percent(netPercent)}
          loading={loading}
          icon={Percent}
          accent="emerald"
          sublabel="Líquido após descontos ML ÷ bruto"
        />
        <KpiCard
          label="Resultado após custos"
          value={money(result)}
          loading={loading}
          icon={Calculator}
          accent={result !== null && result < 0 ? "rose" : "emerald"}
          sublabel={
            result === null && summary && confirmedResults.length > 0
              ? `Subtotal confirmado de ${confirmedResults.length}/${summary.operations}: ${money(knownResult)}`
              : result === null
                ? "Requer financeiro, SKU e custos conhecidos"
                : "Líquido − CMV total − despesas extras"
          }
        />
      </div>
      {financialPending > 0 && (
        <Notice>
          Há operações com financeiro pendente ou estorno em apuração. Líquido,
          percentual e resultado dessas operações não estão confirmados.
        </Notice>
      )}
      {skuPending > 0 && (
        <Notice danger>
          Há produtos sem SKU no dado de origem. O resultado permanece
          desconhecido mesmo com custos informados. Esta tela não cria, corrige
          nem altera SKUs.
        </Notice>
      )}
      {costPending > 0 && (
        <Notice>
          Faltam custos totais de pedidos. Campo em branco não significa R$
          0,00: informe o CMV e as despesas extras ou confirme explicitamente um
          valor zero.
        </Notice>
      )}
      <SectionCard
        title="Operações do período"
        description="Uma linha por pedido/operação, sem somar fotografias duplicadas. Descontos e créditos são os valores registrados na fonte."
      >
        <div className="mb-4 max-w-md">
          <Label htmlFor={searchId} className="text-xs">
            Buscar pedido, produto ou SKU
          </Label>
          <div className="relative mt-1">
            <Search
              className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              id={searchId}
              className="pl-9"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Nome, SKU exato ou número da operação"
            />
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : !data ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Dados financeiros ainda não confirmados. Você pode importar um
            relatório oficial abaixo.
          </p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {data.rows.length
              ? "Nenhuma operação corresponde à busca."
              : collectionPartial
                ? "Nenhuma operação retornada na coleta parcial; isso não confirma ausência de vendas."
                : "Nenhuma operação retornada para este período."}
          </p>
        ) : (
          <div className="min-w-0 max-w-full overflow-x-auto" role="region" aria-label="Margem por operação, com rolagem horizontal" tabIndex={0}>
            <table className="w-full min-w-[1180px] text-sm">
              <caption className="sr-only">
                Margem por operação; valores desconhecidos são representados por
                travessão.
              </caption>
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="p-2">Data / pedido</th>
                  <th className="p-2">Produtos / SKUs</th>
                  <th className="p-2 text-right">Bruto</th>
                  <th className="p-2 text-right">Descontos ML</th>
                  <th className="p-2 text-right">Líquido</th>
                  <th className="p-2 text-right">CMV total</th>
                  <th className="p-2 text-right">Extras</th>
                  <th className="p-2 text-right">Resultado</th>
                  <th className="p-2 text-right">Resultado %</th>
                  <th className="p-2">Fonte / ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <MarginOrderRow
                    key={row.operationId}
                    row={row}
                    onEditCost={onEditCost}
                    canEdit={canEdit}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Resultado % = resultado após custos ÷ valor bruto. Valores negativos
          indicam perda ou crédito/ajuste, conforme a coluna; não aplicamos
          tarifas ou impostos estimados.
        </p>
      </SectionCard>
    </div>
  );
}

function MarginOrderRow({
  row,
  onEditCost,
  canEdit,
}: {
  row: MarginRow;
  onEditCost?: (row: MarginRow) => void;
  canEdit: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const confirmed = financialKnown(row);
  const result = resultKnown(row) ? row.result : null;
  const pending = !confirmed
    ? "Financeiro pendente"
    : !hasSku(row)
      ? "SKU ausente — resultado não calculado"
      : !resultKnown(row)
        ? "Custos pendentes / resultado não confirmado"
        : null;
  return (
    <Fragment>
      <tr className="border-b align-top transition-colors hover:bg-primary/5">
        <td className="p-2">
          <span className="whitespace-nowrap">{dateLabel(row.saleDate)}</span>
          <div className="mt-1 max-w-[160px] break-all font-mono text-xs text-muted-foreground">
            {row.operationId}
          </div>
        </td>
        <td className="min-w-[250px] space-y-2 p-2">
          {row.items.map((item, index) => (
            <div key={index}>
              <ProductCell
                title={item.title}
                titleClassName="max-w-[300px] whitespace-pre-wrap break-words"
                clampTitle={false}
              />
              <p className="mt-1 whitespace-pre-wrap break-all text-xs text-muted-foreground">
                SKU:{" "}
                <span
                  className={cn(
                    "font-mono",
                    !item.sku?.trim() && "font-semibold text-rose-700"
                  )}
                >
                  {item.sku?.trim() ? item.sku : "Ausente na fonte"}
                </span>{" "}
                · Qtd.: {item.quantity ?? "—"}
              </p>
            </div>
          ))}
          {row.items.length === 0 && (
            <p className="text-xs text-rose-700">
              Produto / SKU ausente na fonte
            </p>
          )}
          {pending && (
            <p
              className={cn(
                "text-xs font-semibold",
                !hasSku(row) ? "text-rose-700" : "text-amber-800"
              )}
            >
              {pending}
            </p>
          )}
          {!confirmed && row.pendingReason && (
            <p className="text-xs text-amber-800">{row.pendingReason}</p>
          )}
          {row.financialStatus === "refund_pending" && (
            <p className="text-xs text-amber-800">Estorno em apuração</p>
          )}
        </td>
        <td className="p-2 text-right tabular-nums whitespace-nowrap">
          {money(row.gross)}
        </td>
        <td className="p-2 text-right tabular-nums whitespace-nowrap">
          {money(row.deductions)}
        </td>
        <td className="p-2 text-right tabular-nums whitespace-nowrap">
          {money(confirmed ? row.net : null)}
        </td>
        <td className="p-2 text-right tabular-nums whitespace-nowrap">
          {money(costKnown(row.productCost) ? row.productCost : null)}
        </td>
        <td className="p-2 text-right tabular-nums whitespace-nowrap">
          {money(costKnown(row.extraCosts) ? row.extraCosts : null)}
        </td>
        <td
          className={cn(
            "p-2 text-right font-semibold tabular-nums whitespace-nowrap",
            result !== null && result < 0
              ? "text-rose-600"
              : result !== null
                ? "text-primary"
                : "text-muted-foreground"
          )}
        >
          {money(result)}
        </td>
        <td className="p-2 text-right tabular-nums whitespace-nowrap">
          {percent(result !== null ? row.resultPercent : null)}
        </td>
        <td className="space-y-2 p-2">
          <Badge
            variant="outline"
            className={
              row.source === "report"
                ? "border-primary/25 bg-primary/5 text-primary"
                : "text-muted-foreground"
            }
          >
            {row.source === "report" ? "Relatório" : "API"}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex h-auto min-h-11 gap-1 px-2 py-2 text-xs sm:min-h-8 sm:px-1 sm:py-1"
            onClick={() => setExpanded(value => !value)}
            aria-expanded={expanded}
            aria-controls={detailsId}
          >
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}{" "}
            Descontos / ajustes
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-11 whitespace-normal px-2 py-2 text-xs sm:min-h-8 sm:py-1"
            disabled={!canEdit || !onEditCost}
            onClick={() => onEditCost?.(row)}
          >
            Informar custos totais
          </Button>
        </td>
      </tr>
      {expanded && (
        <tr id={detailsId} className="border-b bg-secondary/30">
          <td colSpan={10} className="p-4">
            <h3 className="mb-2 break-words text-sm font-semibold">
              Descontos e ajustes reais da operação {row.operationId}
            </h3>
            {row.charges.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                A fonte não discriminou os descontos. Isso não significa tarifa
                zero.
              </p>
            ) : (
              <ul className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                {row.charges.map((charge, index) => (
                  <li
                    key={`${charge.key}-${index}`}
                    className="flex min-w-0 flex-wrap justify-between gap-3 rounded-lg border bg-background p-2"
                  >
                    <span className="min-w-0 break-words">
                      <span className="block font-medium">
                        {CHARGE_LABELS[charge.category]}
                      </span>
                      {charge.label}
                    </span>
                    <span className="whitespace-nowrap tabular-nums">
                      {money(charge.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Impostos retidos informados na fonte: {money(row.taxesWithheld)}.
              Liberação:{" "}
              {row.released === true
                ? "liberado"
                : row.released === false
                  ? "a liberar"
                  : "não informada"}
              . Créditos/ajustes negativos são preservados; não somamos impostos
              retidos novamente.
            </p>
            {row.costNote && (
              <p className="mt-2 whitespace-pre-wrap break-words text-xs">
                Nota dos custos: {row.costNote}
              </p>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export type OrderCostValues = {
  productCost: number | null;
  extraCosts: number | null;
  note?: string;
};

/** Blank is unknown. Zero is accepted only after an explicit confirmation. */
export function parseOrderCost(value: string): number | null {
  if (!value.trim()) return null;
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized))
    throw new Error(
      "Informe valores em reais não negativos, com até duas casas decimais, ou deixe em branco se desconhecido."
    );
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error("Valor de custo inválido.");
  return parsed;
}

export function OrderCostForm({
  row,
  saving = false,
  onSave,
  onCancel,
}: {
  row: MarginRow;
  saving?: boolean;
  onSave: (values: OrderCostValues) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const id = useId();
  const [productCost, setProductCost] = useState(
    costKnown(row.productCost) ? row.productCost.toFixed(2) : ""
  );
  const [extraCosts, setExtraCosts] = useState(
    costKnown(row.extraCosts) ? row.extraCosts.toFixed(2) : ""
  );
  const [note, setNote] = useState(row.costNote);
  const [confirmZero, setConfirmZero] = useState(false);
  const [error, setError] = useState<string | null>(null);
  let needsZero = false;
  let valuesValid = true;
  try {
    needsZero =
      parseOrderCost(productCost) === 0 || parseOrderCost(extraCosts) === 0;
  } catch {
    valuesValid = false;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    try {
      const values = {
        productCost: parseOrderCost(productCost),
        extraCosts: parseOrderCost(extraCosts),
        note: note.trim() || undefined,
      };
      if ((values.productCost === 0 || values.extraCosts === 0) && !confirmZero)
        throw new Error(
          "Confirme explicitamente os campos informados como zero."
        );
      await onSave(values);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar os custos."
      );
    }
  }
  return (
    <form className="min-w-0 space-y-4" onSubmit={submit}>
      <p className="break-all text-sm">
        Pedido/operação:{" "}
        <span className="font-mono font-semibold">{row.operationId}</span>
      </p>
      {!hasSku(row) && (
        <Notice danger>
          SKU ausente na origem. Você pode registrar os custos, mas o resultado
          não será calculado e nenhum SKU será criado ou alterado.
        </Notice>
      )}
      <p className="text-xs text-muted-foreground">
        Informe o total de todos os produtos deste pedido, considerando suas
        quantidades. Deixe em branco o que ainda não sabe; não tratamos ausência
        como zero.
      </p>
      <div className="space-y-1">
        <Label htmlFor={`${id}-product`}>CMV total do pedido (R$)</Label>
        <Input
          id={`${id}-product`}
          inputMode="decimal"
          value={productCost}
          disabled={saving}
          onChange={event => {
            setProductCost(event.target.value);
            setConfirmZero(false);
          }}
          placeholder="Desconhecido"
        />
        <p className="text-xs text-muted-foreground">
          Custo de todos os produtos; não é o custo por unidade.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-extra`}>
          Despesas extras totais do pedido (R$)
        </Label>
        <Input
          id={`${id}-extra`}
          inputMode="decimal"
          value={extraCosts}
          disabled={saving}
          onChange={event => {
            setExtraCosts(event.target.value);
            setConfirmZero(false);
          }}
          placeholder="Desconhecido"
        />
        <p className="text-xs text-muted-foreground">
          Somente gastos adicionais. Não repita descontos que já constam no
          líquido do ML/MP.
        </p>
      </div>
      {needsZero && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 p-3">
          <Checkbox
            id={`${id}-zero`}
            checked={confirmZero}
            disabled={saving}
            onCheckedChange={value => setConfirmZero(value === true)}
          />
          <Label htmlFor={`${id}-zero`} className="text-xs leading-relaxed">
            Confirmo que os campos preenchidos com 0 representam custo realmente
            zero, e não custo desconhecido.
          </Label>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor={`${id}-note`}>Nota (opcional)</Label>
        <Textarea
          id={`${id}-note`}
          value={note}
          disabled={saving}
          maxLength={1000}
          onChange={event => setNote(event.target.value)}
          placeholder="Observação sobre os custos deste pedido"
        />
      </div>
      {error && <Notice danger>{error}</Notice>}
      <div className="flex flex-col justify-end gap-2 sm:flex-row">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:min-h-9 sm:w-auto"
            disabled={saving}
            onClick={onCancel}
          >
            Cancelar
          </Button>
        )}
        <Button
          type="submit"
          className="h-auto min-h-11 w-full whitespace-normal sm:min-h-9 sm:w-auto"
          disabled={saving || !valuesValid || (needsZero && !confirmZero)}
        >
          {saving ? "Salvando…" : "Salvar custos totais"}
        </Button>
      </div>
    </form>
  );
}

export function validateMarginReportFile(file: {
  name: string;
  size: number;
}): string | null {
  if (!/\.(csv|xlsx)$/i.test(file.name))
    return "Formato não suportado. Selecione um relatório oficial CSV ou XLSX; XLS, PDF e imagens não são aceitos.";
  if (file.size > MAX_REPORT_BYTES)
    return "Arquivo acima do limite de 2 MB. Gere um relatório menor (Por venda: até 31 dias).";
  if (file.size === 0)
    return "O arquivo está vazio. Selecione um relatório CSV ou XLSX válido.";
  return null;
}
function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("Não foi possível ler o arquivo selecionado."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.slice(result.indexOf(",") + 1);
      if (!result.includes(",") || !base64)
        reject(new Error("Não foi possível ler o conteúdo do relatório."));
      else resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

function ReportImporter({
  enabled,
  onImported,
}: {
  enabled: boolean;
  onImported: () => void;
}) {
  const preview = trpc.salesMargin.previewReport.useMutation();
  const importer = trpc.salesMargin.importReport.useMutation();
  const [filePayload, setFilePayload] = useState<{
    fileName: string;
    base64: string;
  } | null>(null);
  const [parsed, setParsed] = useState<MarginReportPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileId = useId();
  const selection = useRef(0);
  const busy = reading || preview.isPending || importer.isPending;

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const version = ++selection.current;
    setParsed(null);
    setFilePayload(null);
    setConfirmed(false);
    setError(null);
    setNotice(null);
    preview.reset();
    importer.reset();
    if (!file) return;
    const invalid = validateMarginReportFile(file);
    if (invalid) {
      setError(invalid);
      event.target.value = "";
      return;
    }
    setReading(true);
    try {
      const payload = {
        fileName: file.name,
        base64: await readFileBase64(file),
      };
      const result = await preview.mutateAsync(payload);
      if (selection.current !== version) return;
      setFilePayload(payload);
      setParsed(result);
    } catch (error) {
      if (selection.current === version)
        setError(
          error instanceof Error
            ? error.message
            : "Não foi possível interpretar o relatório. Formato ou cabeçalhos não suportados."
        );
    } finally {
      if (selection.current === version) setReading(false);
    }
  }
  async function importReport() {
    if (!enabled || !confirmed || !parsed || !filePayload || busy) return;
    setError(null);
    try {
      const result = await importer.mutateAsync({
        ...filePayload,
        confirmedStore: true,
      });
      setNotice(
        result.duplicate
          ? "Este arquivo já foi importado. Importação idempotente: nenhuma operação ou valor foi somado novamente."
          : `Relatório salvo: ${result.operations} operações em ${result.rowCount} linhas. A fotografia mais recente de cada operação substitui a anterior; valores não são somados novamente.`
      );
      // Raw file remains only in memory until import; clear it after success.
      setFilePayload(null);
      setParsed(null);
      setConfirmed(false);
      onImported();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o relatório. A prévia não significa que o arquivo foi importado."
      );
    }
  }

  return (
    <SectionCard
      title="Importar relatório oficial"
      description="CSV ou XLSX, até 2 MB. Primeiro confira a prévia; só salvamos depois da sua confirmação."
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-primary/5 p-4 text-sm">
          <p className="font-medium">Como gerar no Mercado Livre</p>
          <p className="mt-1 text-muted-foreground">
            Faturamento → Conciliação → Por venda. Escolha um intervalo de até
            31 dias e baixe o arquivo oficial. Para dados financeiros do Mercado
            Pago, use o relatório de dinheiro em conta suportado.
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-xs">
            {(
              [
                ["Como gerar o relatório", MARGIN_REPORT_SOURCES.generate],
                [
                  "Conciliação de vendas e liberações",
                  MARGIN_REPORT_SOURCES.reconciliation,
                ],
                [
                  "Campos oficiais do Mercado Pago",
                  MARGIN_REPORT_SOURCES.fields,
                ],
              ] as const
            ).map(([label, href]) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {label}
                <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={fileId} className="inline-flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" /> Selecionar CSV / XLSX
          </Label>
          <Input
            id={fileId}
            type="file"
            accept=".csv,.xlsx"
            disabled={!enabled || busy}
            onChange={selectFile}
            className="min-h-11 min-w-0 max-w-lg"
          />
          <p className="text-xs text-muted-foreground">
            Não exibimos dados originais de compradores na prévia: apenas
            operações agrupadas e campos financeiros interpretados. Não
            guardamos o arquivo bruto no navegador nem em localStorage.
          </p>
        </div>
        {busy && (
          <p role="status" className="text-sm text-muted-foreground">
            {importer.isPending
              ? "Salvando o relatório confirmado…"
              : "Lendo e preparando a prévia do relatório…"}
          </p>
        )}
        {error && <Notice danger>{error}</Notice>}
        {notice && (
          <p
            role="status"
            className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary"
          >
            {notice}
          </p>
        )}
        {parsed && (
          <MarginReportPreviewPanel
            preview={parsed}
            confirmed={confirmed}
            onConfirmedChange={setConfirmed}
            importing={importer.isPending}
            enabled={enabled && !busy && filePayload !== null}
            onImport={importReport}
          />
        )}
      </div>
    </SectionCard>
  );
}

/** Only allowlisted parsed/grouped fields, never original buyer rows or raw file contents. */
export function MarginReportPreviewPanel({
  preview,
  confirmed,
  onConfirmedChange,
  importing = false,
  enabled = true,
  onImport,
}: {
  preview: MarginReportPreview;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  importing?: boolean;
  enabled?: boolean;
  onImport: () => void;
}) {
  const checkboxId = useId();
  const formatLabel =
    preview.format === "ml_sales"
      ? "Mercado Livre — conciliação por venda"
      : "Mercado Pago — dinheiro em conta";
  return (
    <div className="min-w-0 space-y-4 rounded-xl border border-primary/20 p-3 sm:p-4">
      <div>
        <h3 className="font-display text-base">
          Prévia do relatório — ainda não importado
        </h3>
        <p className="mt-1 break-all text-sm font-medium">{preview.fileName}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatLabel} · {dateLabel(preview.fromDate)} a{" "}
          {dateLabel(preview.toDate)} · {preview.operations.length} operações
          agrupadas · {preview.rowCount} linhas interpretadas
        </p>
      </div>
      {preview.warnings.map((warning, index) => (
        <Notice key={index}>{warning}</Notice>
      ))}
      <p className="text-xs text-muted-foreground">
        A última fotografia importada da mesma operação substitui a anterior.
        Não somamos relatórios sobrepostos nem duplicamos o valor de pedidos.
        Custos manuais continuam vinculados à operação.
      </p>
      <p className="text-xs text-muted-foreground">
        A fonte Relatório representa o arquivo enviado, não uma atualização
        automática do Mercado Livre. Para incluir eventos posteriores, gere e
        importe um relatório novo do mesmo período.
      </p>
      <div className="max-h-72 min-w-0 max-w-full overflow-auto overscroll-contain" role="region" aria-label="Prévia financeira do relatório, com rolagem" tabIndex={0}>
        <table className="w-full min-w-[600px] text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="p-2">Operação</th>
              <th className="p-2">Data</th>
              <th className="p-2">Produto / SKU</th>
              <th className="p-2 text-right">Bruto</th>
              <th className="p-2 text-right">Descontos</th>
              <th className="p-2 text-right">Líquido</th>
              <th className="p-2">Financeiro</th>
            </tr>
          </thead>
          <tbody>
            {preview.operations.map(operation => (
              <tr key={operation.operationId} className="border-b align-top">
                <td className="break-all p-2 font-mono">
                  {operation.operationId}
                </td>
                <td className="whitespace-nowrap p-2">
                  {dateLabel(operation.saleDate)}
                </td>
                <td className="p-2">
                  {operation.items.map((item, index) => (
                    <p key={index} className="whitespace-pre-wrap break-words">
                      {item.title} · SKU:{" "}
                      <span className="break-all font-mono">
                        {item.sku?.trim() ? item.sku : "Ausente na fonte"}
                      </span>
                    </p>
                  ))}
                </td>
                <td className="whitespace-nowrap p-2 text-right">
                  {money(operation.gross)}
                </td>
                <td className="whitespace-nowrap p-2 text-right">
                  {money(operation.deductions)}
                </td>
                <td className="whitespace-nowrap p-2 text-right">
                  {money(
                    operation.financialStatus === "confirmed"
                      ? operation.net
                      : null
                  )}
                </td>
                <td className="p-2">
                  {operation.financialStatus === "confirmed"
                    ? "Confirmado"
                    : operation.financialStatus === "refund_pending"
                      ? "Estorno pendente"
                      : "Pendente"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.operations.length === 0 && (
        <Notice>
          Nenhuma operação interpretada. Não é possível importar este arquivo.
        </Notice>
      )}
      <div className="flex items-start gap-2 rounded-xl bg-secondary/40 p-3">
        <Checkbox
          id={checkboxId}
          checked={confirmed}
          onCheckedChange={value => onConfirmedChange(value === true)}
          disabled={importing || !enabled}
        />
        <Label htmlFor={checkboxId} className="text-sm leading-relaxed">
          Confirmo que este relatório é da loja Toujours e foi baixado no
          Mercado Livre/Mercado Pago
        </Label>
      </div>
      <Button
        type="button"
        disabled={
          !enabled || !confirmed || importing || preview.operations.length === 0
        }
        onClick={onImport}
        className="h-auto min-h-11 w-full gap-2 whitespace-normal sm:min-h-9 sm:w-auto"
      >
        <Upload className="h-4 w-4" />
        {importing ? "Importando…" : "Importar relatório confirmado"}
      </Button>
    </div>
  );
}

export default MargemVendas;
