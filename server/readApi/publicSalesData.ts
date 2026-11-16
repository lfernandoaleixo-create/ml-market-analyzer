import type { ReadApiResult } from "../../shared/readApi";
import type {
  MarginCharge,
  MarginChargeCategory,
} from "../../shared/salesMargin";
import type {
  PublicSaleItem,
  PublicSalesBounds,
  PublicSalesGranularity,
  PublicSalesGroupBy,
  PublicSalesHistoryRow,
  PublicSalesOrder,
  PublicSalesQuery,
  PublicTaxDetail,
} from "../../shared/publicSales";
import { ReadApiDataError } from "./data";
import { listMarginReports } from "../salesMargin/db";
import { getPublicSalesSnapshot } from "./publicSalesProvider";
import { SalesMarginProviderError } from "../salesMargin/provider";
import {
  advancePublicSalesDate,
  publicSalesDate,
  publicSalesDayStart,
  resolvePublicSalesBounds,
} from "./publicSalesQuery";
import { mergePublicSalesReports } from "./publicSalesReports";
import {
  readPublicSkuProjection,
  resolvePublicSaleSku,
} from "./publicSalesSku";

const DAY = 86_400_000;
/** Large history windows collect orders without per-order payment fan-out.
 * Financial history requires the trusted flag supplied by the HTTP principal.
 * Long windows suppress financial fields even in imported photographs.
 */
export const PUBLIC_HISTORY_FINANCIAL_MAX_DAYS = 31;
const FINANCIAL_FIELDS = [
  "net",
  "saleFee",
  "processingFee",
  "shippingCost",
  "financingFee",
  "otherCharges",
  "taxesWithheld",
] as const;
type FinancialField = (typeof FINANCIAL_FIELDS)[number];
const categories = new Set<MarginChargeCategory>([
  "sale",
  "processing",
  "shipping",
  "financing",
  "tax",
  "other",
]);
const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;
const number = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const money = (v: unknown): number | null =>
  number(v) !== null && (v as number) >= 0 ? (v as number) : null;
const quantity = (v: unknown): number | null =>
  Number.isSafeInteger(v) && (v as number) > 0 ? (v as number) : null;
const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
function iso(v: unknown): string | null {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)
  )
    return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
function day(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const ms = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === v
    ? v
    : null;
}
function safeItem(value: unknown): PublicSaleItem {
  const v = record(value);
  return {
    itemId: text(v.itemId),
    variationId: text(v.variationId),
    sku: text(v.sku),
    skuSource: ["sheet", "mercado_livre", "ambiguous"].includes(
      String(v.skuSource)
    )
      ? (v.skuSource as PublicSaleItem["skuSource"])
      : null,
    title: text(v.title),
    quantity: quantity(v.quantity),
    unitPrice: money(v.unitPrice),
    listingType: text(v.listingType),
  };
}
function safeCharges(value: unknown): MarginCharge[] {
  return (Array.isArray(value) ? value : []).flatMap(raw => {
    const v = record(raw);
    return typeof v.key === "string" &&
      typeof v.label === "string" &&
      categories.has(v.category as MarginChargeCategory) &&
      number(v.amount) !== null
      ? [
          {
            key: v.key,
            label: v.label,
            category: v.category as MarginChargeCategory,
            amount: v.amount as number,
          },
        ]
      : [];
  });
}
function safeTax(value: unknown): PublicTaxDetail[] | null {
  return Array.isArray(value)
    ? value.map(raw => {
        const v = record(raw);
        return {
          type: text(v.type),
          amount: number(v.amount),
          description: text(v.description),
        };
      })
    : null;
}
/** Entire response body is projected explicitly, including all nested objects.
 * Pending/refund-pending photographs never expose settlement totals as confirmed.
 */
function safeOrder(value: PublicSalesOrder): PublicSalesOrder {
  const v = record(value),
    shipping = record(v.shipping);
  const createdAt = iso(v.createdAt);
  const gross = number(v.gross),
    net = number(v.net);
  const complete =
    v.financialStatus === "confirmed" &&
    v.financiallyComplete === true &&
    gross !== null &&
    net !== null;
  return {
    orderId: text(v.orderId) ?? "",
    packId: text(v.packId),
    paymentIds: Array.isArray(v.paymentIds)
      ? v.paymentIds.filter(
          (id): id is string => typeof id === "string" && !!id.trim()
        )
      : null,
    createdAt,
    saleDay: createdAt
      ? publicSalesDate(Date.parse(createdAt))
      : day(v.saleDay),
    paidAt: iso(v.paidAt),
    status: text(v.status),
    rawStatus: text(v.rawStatus),
    financiallyComplete: complete,
    financialStatus: complete
      ? "confirmed"
      : v.financialStatus === "refund_pending"
        ? "refund_pending"
        : "pending",
    items: (Array.isArray(v.items) ? v.items : []).map(safeItem),
    shipping: {
      logisticType: text(shipping.logisticType),
      payer: ["buyer", "seller", "both"].includes(String(shipping.payer))
        ? (shipping.payer as "buyer" | "seller" | "both")
        : null,
    },
    gross,
    net: complete ? net : null,
    deductions: complete ? number(v.deductions) : null,
    charges: complete ? safeCharges(v.charges) : [],
    saleFee: complete ? number(v.saleFee) : null,
    processingFee: complete ? number(v.processingFee) : null,
    shippingCost: complete ? number(v.shippingCost) : null,
    financingFee: complete ? number(v.financingFee) : null,
    otherCharges: complete ? number(v.otherCharges) : null,
    taxesWithheld: complete ? number(v.taxesWithheld) : null,
    taxDetail: complete ? safeTax(v.taxDetail) : null,
    taxesDisaggregated: complete ? safeTax(v.taxesDisaggregated) : null,
    chargesExplainDeductions:
      complete && typeof v.chargesExplainDeductions === "boolean"
        ? v.chargesExplainDeductions
        : null,
    source: v.source === "imported_report" ? "imported_report" : "automatic",
    asOf: iso(v.asOf) ?? "",
    pendingReason: text(v.pendingReason),
  };
}

/** UTC ISO boundary of a Brasília calendar period; weeks begin Monday, not Sunday. */
export function publicSalesPeriod(
  ms: number,
  granularity: PublicSalesGranularity
): string {
  let date = publicSalesDate(ms);
  if (granularity === "hour") {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Sao_Paulo",
        minute: "2-digit",
        second: "2-digit",
      })
        .formatToParts(ms)
        .map(p => [p.type, p.value])
    );
    return new Date(
      ms -
        Number(parts.minute) * 60_000 -
        Number(parts.second) * 1000 -
        (((ms % 1000) + 1000) % 1000)
    ).toISOString();
  }
  if (granularity === "week")
    date = advancePublicSalesDate(
      date,
      -(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7
    );
  if (granularity === "month") date = `${date.slice(0, 7)}-01`;
  return new Date(publicSalesDayStart(date)).toISOString();
}
function orderTime(order: PublicSalesOrder): number | null {
  const ms = order.createdAt
    ? Date.parse(order.createdAt)
    : order.saleDay
      ? publicSalesDayStart(order.saleDay)
      : NaN;
  return Number.isFinite(ms) ? ms : null;
}
function matchesItem(item: PublicSaleItem, query: PublicSalesQuery): boolean {
  return (
    (!query.itemId || item.itemId === query.itemId) &&
    (!query.sku || item.sku === query.sku)
  );
}
function matchesOrder(
  order: PublicSalesOrder,
  query: PublicSalesQuery
): boolean {
  return (
    (!query.status || order.status === query.status) &&
    ((!query.itemId && !query.sku) ||
      order.items.some(item => matchesItem(item, query)))
  );
}
function groupKey(item: PublicSaleItem, groupBy: PublicSalesGroupBy): string {
  return groupBy === "none"
    ? "all"
    : JSON.stringify(groupBy === "item" ? [item.itemId] : [item.sku]);
}
type Bucket = {
  row: PublicSalesHistoryRow;
  paid: Set<string>;
  cancelled: Set<string>;
  all: Set<string>;
  unknownStatus: boolean;
  unknownQuantity: boolean;
  unknownRevenue: boolean;
  unknownCancelledAmount: boolean;
  ambiguousIdentity: boolean;
  identities: Set<string>;
  skus: Set<string | null>;
  titles: Set<string | null>;
  finance: Record<
    FinancialField,
    { sum: number; known: number; unknown: boolean }
  >;
};
function bucket(
  period: string,
  groupBy: PublicSalesGroupBy,
  item?: PublicSaleItem
): Bucket {
  return {
    row: {
      period,
      itemId: groupBy === "item" ? (item?.itemId ?? null) : null,
      sku: groupBy === "none" ? null : (item?.sku ?? null),
      title: groupBy === "none" ? null : (item?.title ?? null),
      orders: 0,
      unitsSold: 0,
      revenue: 0,
      cancelled: 0,
      cancelledAmount: 0,
      net: null,
      saleFee: null,
      processingFee: null,
      shippingCost: null,
      financingFee: null,
      otherCharges: null,
      taxesWithheld: null,
    },
    paid: new Set(),
    cancelled: new Set(),
    all: new Set(),
    unknownStatus: false,
    unknownQuantity: false,
    unknownRevenue: false,
    unknownCancelledAmount: false,
    ambiguousIdentity: false,
    identities: new Set(),
    skus: new Set(),
    titles: new Set(),
    finance: Object.fromEntries(
      FINANCIAL_FIELDS.map(key => [key, { sum: 0, known: 0, unknown: false }])
    ) as Bucket["finance"],
  };
}
function aggregateHistory(
  orders: PublicSalesOrder[],
  query: PublicSalesQuery,
  collectionIncomplete: boolean,
  warnings: Set<string>
) {
  const groupBy = query.groupBy ?? "none",
    granularity = query.granularity ?? "day";
  const buckets = new Map<string, Bucket>();
  const reasons = new Set<string>();
  let excludedUnknownDates = 0,
    unallocatedOrders = 0;
  for (const order of orders) {
    const ms = orderTime(order);
    if (ms === null || (granularity === "hour" && !order.createdAt)) {
      excludedUnknownDates++;
      warnings.add(
        "HISTORY_DATE_UNKNOWN: operações sem data/hora suficiente foram excluídas dos períodos; horário não foi inventado."
      );
      continue;
    }
    const matching = order.items.filter(item => matchesItem(item, query));
    if ((query.itemId || query.sku) && matching.length === 0) continue;
    const partition = new Map<string, PublicSaleItem[]>();
    for (const item of matching) {
      const key = groupKey(item, groupBy);
      partition.set(key, [...(partition.get(key) ?? []), item]);
    }
    if (groupBy === "none" && !partition.size) partition.set("all", []);
    if (!partition.size) {
      warnings.add(
        "HISTORY_ITEM_UNKNOWN: operação sem itens não pode ser atribuída a produto/SKU."
      );
      reasons.add("missing_item_identity");
      continue;
    }
    const wholeGroups = new Set(
      order.items.map(item => groupKey(item, groupBy))
    );
    const partialItems = matching.length !== order.items.length;
    const identityKnown =
      groupBy === "none" ||
      order.items.every(item =>
        groupBy === "item" ? item.itemId !== null : item.sku !== null
      );
    const allocationAllowed =
      !partialItems &&
      identityKnown &&
      (groupBy === "none" || wholeGroups.size === 1);
    if (!allocationAllowed) {
      unallocatedOrders++;
      reasons.add(
        partialItems
          ? "partial_item_filter"
          : !identityKnown
            ? "missing_item_identity"
            : "multi_group_order"
      );
    }
    const period = publicSalesPeriod(ms, granularity);
    for (const [key, items] of partition) {
      const bucketKey = JSON.stringify([period, key]);
      let b = buckets.get(bucketKey);
      if (!b) {
        b = bucket(period, groupBy, items[0]);
        buckets.set(bucketKey, b);
      }
      if (b.all.has(order.orderId)) continue;
      b.all.add(order.orderId);
      for (const item of items) {
        b.identities.add(JSON.stringify([item.itemId, item.variationId]));
        b.skus.add(item.sku);
        b.titles.add(item.title);
        if (
          (groupBy === "item" && !item.itemId) ||
          (groupBy === "sku" && !item.sku)
        )
          b.ambiguousIdentity = true;
      }
      if (order.rawStatus === "paid" || order.status === "paid") {
        b.paid.add(order.orderId);
        if (!items.length) {
          b.unknownQuantity = true;
          b.unknownRevenue = true;
        }
        for (const item of items) {
          if (item.quantity === null) b.unknownQuantity = true;
          else b.row.unitsSold! += item.quantity;
          if (item.quantity === null || item.unitPrice === null)
            b.unknownRevenue = true;
          else b.row.revenue! += item.quantity * item.unitPrice;
        }
      }
      if (order.status === "cancelled" || order.rawStatus === "cancelled") {
        b.cancelled.add(order.orderId);
        if (!items.length) b.unknownCancelledAmount = true;
        for (const item of items) {
          if (item.quantity === null || item.unitPrice === null)
            b.unknownCancelledAmount = true;
          else b.row.cancelledAmount! += item.quantity * item.unitPrice;
        }
      } else if (order.status === null && order.rawStatus === null) {
        b.unknownStatus = true;
        warnings.add(
          "HISTORY_STATUS_UNKNOWN: fotografias sem status não comprovam pagamento/cancelamento; contagens e receita afetadas são null."
        );
      }
      for (const field of FINANCIAL_FIELDS) {
        const amount =
          allocationAllowed &&
          order.financiallyComplete &&
          order.financialStatus === "confirmed"
            ? order[field]
            : null;
        if (amount === null) b.finance[field].unknown = true;
        else {
          b.finance[field].sum += amount;
          b.finance[field].known++;
        }
      }
    }
  }
  const knownFinance = Object.fromEntries(
    FINANCIAL_FIELDS.map(key => [key, null])
  ) as Record<FinancialField, number | null>;
  let financePartial = false;
  const rows = [...buckets.values()]
    .map(b => {
      b.row.orders =
        collectionIncomplete || b.unknownStatus ? null : b.paid.size;
      b.row.cancelled =
        collectionIncomplete || b.unknownStatus ? null : b.cancelled.size;
      b.row.unitsSold =
        collectionIncomplete || b.unknownStatus || b.unknownQuantity
          ? null
          : b.row.unitsSold;
      b.row.revenue =
        collectionIncomplete || b.unknownStatus || b.unknownRevenue
          ? null
          : round(b.row.revenue!);
      b.row.cancelledAmount =
        collectionIncomplete || b.unknownStatus || b.unknownCancelledAmount
          ? null
          : round(b.row.cancelledAmount!);
      if (groupBy === "item")
        b.row.sku = b.skus.size === 1 ? [...b.skus][0] : null;
      if (groupBy !== "none")
        b.row.title = b.titles.size === 1 ? [...b.titles][0] : null;
      if (b.unknownQuantity)
        warnings.add(
          "HISTORY_QUANTITY_UNKNOWN: quantidade ausente/inválida; unitsSold e receita afetada permanecem null."
        );
      if (b.unknownRevenue || b.unknownCancelledAmount)
        warnings.add(
          "HISTORY_ITEM_AMOUNT_UNKNOWN: quantidade/preço unitário ausente; receita/cancelamento afetados permanecem null, sem ratear o bruto do pedido."
        );
      if (groupBy === "sku" && b.identities.size > 1)
        warnings.add(
          "HISTORY_SKU_GROUPING: groupBy=sku reúne identidades distintas pelo texto exato do SKU; SKU não é identidade única de produto."
        );
      if (b.ambiguousIdentity) {
        warnings.add(
          "HISTORY_GROUP_IDENTITY_UNKNOWN: itens sem identidade foram reunidos no grupo null, sem associação adivinhada."
        );
      }
      for (const field of FINANCIAL_FIELDS) {
        const f = b.finance[field];
        b.row[field] =
          collectionIncomplete || f.unknown || !f.known ? null : round(f.sum);
        if (f.known)
          knownFinance[field] = round((knownFinance[field] ?? 0) + f.sum);
        if (b.row[field] === null) financePartial = true;
      }
      return b.row;
    })
    .sort(
      (a, b) =>
        a.period.localeCompare(b.period) ||
        (a.itemId ?? "").localeCompare(b.itemId ?? "") ||
        (a.sku ?? "").localeCompare(b.sku ?? "")
    );
  return {
    rows,
    excludedUnknownDates,
    unallocatedOrders,
    financialAllocationReasons: [...reasons],
    financePartial,
    financePartialKnown: {
      ...knownFinance,
      note: "Somente valores conhecidos de pedidos inteiros atribuíveis ao grupo; não são totais completos do período.",
    },
  };
}

/** Auth/scopes/HTTP remain the caller's responsibility. This module performs no writes. */
export async function loadPublicSalesData(
  path: "/sales/orders" | "/sales/history",
  ownerUserId: number,
  query: PublicSalesQuery
): Promise<ReadApiResult> {
  if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0)
    throw new ReadApiDataError(403, "INVALID_OWNER", "Conta não autorizada.");
  let bounds: PublicSalesBounds;
  try {
    bounds = resolvePublicSalesBounds(query);
  } catch {
    throw new ReadApiDataError(
      400,
      "BAD_REQUEST",
      "Período inválido. Use datas reais de Brasília e uma janela de até 366 dias inclusivos."
    );
  }
  try {
    const windowDays =
      (Date.parse(`${bounds.to}T12:00:00Z`) -
        Date.parse(`${bounds.from}T12:00:00Z`)) /
        DAY +
      1;
    const financialScopeMissing =
      path === "/sales/history" && query.includeFinancial !== true;
    const financial =
      path === "/sales/orders" ||
      (!financialScopeMissing &&
        windowDays <= PUBLIC_HISTORY_FINANCIAL_MAX_DAYS);
    const snapshot = await getPublicSalesSnapshot(ownerUserId, bounds, {
      financial,
    });
    const warnings = new Set(
      snapshot.warnings.filter(value => typeof value === "string")
    );
    const [stored, projection] = await Promise.all([
      listMarginReports(snapshot.ownerUserId, snapshot.sellerId),
      readPublicSkuProjection().catch(() => {
        warnings.add(
          "SKU_PROJECTION_UNAVAILABLE: SKU original preservado; a associação à planilha não pôde ser confirmada."
        );
        return null;
      }),
    ]);
    if (stored.partial)
      warnings.add(
        "REPORTS_CAPPED: leitura limitada aos 1.000 relatórios importados mais recentes; dados anteriores podem estar ausentes."
      );
    if (financialScopeMissing)
      warnings.add(
        "FINANCIAL_SCOPE_REQUIRED: detalhes financeiros exigem vendas-detalhe:read, inclusive quando presentes em relatórios importados."
      );
    if (
      path === "/sales/history" &&
      windowDays > PUBLIC_HISTORY_FINANCIAL_MAX_DAYS
    )
      warnings.add(
        "FINANCIAL_WINDOW_LIMIT: histórico acima de 31 dias não consulta pagamentos por pedido e retorna detalhes financeiros null."
      );
    const verifiedOrderIds = new Set(
      snapshot.orders.map(order => order.orderId)
    );
    const all = mergePublicSalesReports(
      snapshot.orders.map(safeOrder),
      stored.reports
    )
      .map(safeOrder)
      .map(order => ({
        ...order,
        items: order.items.map(item =>
          projection
            ? resolvePublicSaleSku(item, projection, warnings)
            : { ...item }
        ),
      }));
    let unknownDates = 0;
    const inWindow = all.filter(order => {
      const ms = orderTime(order);
      if (ms === null) {
        unknownDates++;
        return false;
      }
      return ms >= bounds.fromMs && ms <= bounds.toMs;
    });
    const unverifiedReports = inWindow.filter(
      order =>
        order.source === "imported_report" &&
        !verifiedOrderIds.has(order.orderId)
    );
    if (unverifiedReports.length)
      warnings.add(
        "IMPORTED_ORDER_ID_UNVERIFIED: referências de relatórios sem correspondência a orderId confirmado foram omitidas de /sales/orders. No histórico só sustentam datas/itens observados; não comprovam pedidos distintos nem totais financeiros deduplicados. A projeção persistida não preserva a origem ORDER_ID/EXTERNAL_REFERENCE."
      );
    if (unknownDates)
      warnings.add(
        "ORDER_DATE_UNKNOWN: pedidos sem data confirmada foram excluídos; não foram atribuídos ao período pedido."
      );
    const filtered = inWindow
      .filter(order => matchesOrder(order, query))
      .filter(
        order =>
          path !== "/sales/orders" ||
          order.source !== "imported_report" ||
          verifiedOrderIds.has(order.orderId)
      );
    const observedDays = all
      .map(order => order.saleDay)
      .filter((value): value is string => value !== null)
      .sort();
    const evidenceStart =
      [day(snapshot.dataStart), observedDays[0] ?? null]
        .filter((value): value is string => value !== null)
        .sort()[0] ?? null;
    const coverageFrom = day(snapshot.coverageFrom),
      coverageTo = day(snapshot.coverageTo);
    const beforeDataStart =
      snapshot.dataStartConfirmed === true &&
      snapshot.dataStart !== null &&
      bounds.from < snapshot.dataStart;
    const fullCoverage =
      coverageFrom !== null &&
      coverageTo !== null &&
      coverageFrom <= bounds.from &&
      coverageTo >= bounds.to &&
      !beforeDataStart;
    const observedEnd = observedDays.at(-1) ?? null;
    const observedHistoryCovered =
      evidenceStart !== null &&
      observedEnd !== null &&
      coverageFrom !== null &&
      coverageTo !== null &&
      coverageFrom <= evidenceStart &&
      coverageTo >= observedEnd;
    if (!fullCoverage)
      warnings.add(
        "HISTORY_COVERAGE_UNCONFIRMED: fotografias observadas não comprovam cobertura contínua nem o início da conta; períodos ausentes não são zeros."
      );
    if (beforeDataStart)
      warnings.add(
        "REQUEST_BEFORE_DATA_START: início pedido anterior ao primeiro pedido visível confirmado pela API; não há arquivo permanente de todos os pedidos antigos."
      );
    if (snapshot.dataStartConfirmed === false)
      warnings.add(
        "DATA_START_UNCONFIRMED: busca global do primeiro pedido não foi confirmada; dataStart observado não prova disponibilidade histórica global."
      );
    const incomplete = snapshot.partial || snapshot.capped || stored.partial;
    const ordersIncomplete =
      (snapshot.ordersPartial ?? snapshot.partial) ||
      snapshot.capped ||
      stored.partial;
    const baseMeta = {
      partial:
        incomplete ||
        !fullCoverage ||
        snapshot.dataStartConfirmed === false ||
        unknownDates > 0 ||
        projection === null ||
        unverifiedReports.length > 0 ||
        [...warnings].some(warning => warning.startsWith("SKU_AMBIGUOUS")),
      stale: snapshot.stale,
      capped: snapshot.capped || stored.partial,
      asOf: snapshot.asOf,
      currency: "BRL",
      timezone: "America/Sao_Paulo",
      sellerId: Number(snapshot.sellerId),
      ordersPartial: ordersIncomplete,
      from: bounds.from,
      to: bounds.to,
      windowDays,
      maxWindowDays: 366,
      financialRequested: financial,
      financialWindowMaxDays: PUBLIC_HISTORY_FINANCIAL_MAX_DAYS,
      financialScopeRequired: "vendas-detalhe:read",
      financialScopeMissing,
      dataStart: evidenceStart,
      dataStartConfirmed: snapshot.dataStartConfirmed === true,
      beforeDataStart,
      dataStartEvidence: evidenceStart
        ? "earliest_observed_sale_or_provider_evidence_not_account_creation"
        : null,
      coverageFrom,
      coverageTo,
      coverage: {
        from: coverageFrom,
        to: coverageTo,
        complete: fullCoverage && !ordersIncomplete,
      },
      coverageScope: "visible_seller_orders_not_account_lifetime",
      availableHistory: {
        from: evidenceStart,
        to: observedEnd,
        continuous:
          observedHistoryCovered &&
          !incomplete &&
          unknownDates === 0 &&
          unverifiedReports.length === 0,
        sources: ["automatic", ...(stored.count ? ["imported_report"] : [])],
      },
      emptyPeriodsReason:
        "Somente períodos com registros observados são retornados. Ausência não confirma zero vendas nem cobertura histórica contínua.",
      sparseEmptyPeriodsReason:
        "Períodos sem registros confirmados são omitidos, nunca preenchidos com zeros.",
      reportCount: stored.count,
      reportLimit: 1000,
      ordersObserved: filtered.length,
      excludedUnknownDates: unknownDates,
      unverifiedImportedReferences: unverifiedReports.length,
      importedOrderIdentityPolicy:
        "Somente referência importada idêntica a orderId confirmado na fotografia automática pode aparecer em /sales/orders; formato/proveniência de referência não estão disponíveis no armazenamento existente.",
    };
    const limit = Number.isSafeInteger(query.limit)
      ? Math.max(1, Math.min(100, query.limit))
      : 50;
    const offset = Number.isSafeInteger(query.offset)
      ? Math.max(0, Math.min(100000, query.offset))
      : 0;
    if (path === "/sales/orders") {
      const rows = filtered.sort(
        (a, b) =>
          (orderTime(b) ?? 0) - (orderTime(a) ?? 0) ||
          b.orderId.localeCompare(a.orderId)
      );
      const itemsPartial = rows.some(
        order =>
          !order.items.length ||
          order.items.some(
            item =>
              item.quantity === null ||
              item.unitPrice === null ||
              item.itemId === null
          )
      );
      if (itemsPartial)
        warnings.add(
          "ORDER_ITEMS_PARTIAL: identificação, quantidade ou preço unitário ausente em itens; campos desconhecidos são null."
        );
      const financePartial =
        incomplete ||
        rows.some(
          order =>
            !order.financiallyComplete ||
            FINANCIAL_FIELDS.some(field => order[field] === null)
        );
      const known = rows.filter(
        order => order.financiallyComplete && order.net !== null
      );
      return {
        data: rows.slice(offset, offset + limit),
        meta: {
          ...baseMeta,
          partial: baseMeta.partial || financePartial || itemsPartial,
          financePartial,
          financePartialKnown: {
            confirmedOrders: known.length,
            net: known.length
              ? round(known.reduce((sum, order) => sum + order.net!, 0))
              : null,
          },
          limit,
          offset,
          hasMore: rows.length > offset + limit,
          warnings: [...warnings],
        },
      };
    }
    // Scope/window suppression occurs BEFORE aggregation, including known subtotals
    // in meta. A one-order group must not bypass the financial-detail permission.
    const historyInput = filtered.map(order =>
      financial && verifiedOrderIds.has(order.orderId)
        ? order
        : {
            ...order,
            financiallyComplete: false,
            net: null,
            saleFee: null,
            processingFee: null,
            shippingCost: null,
            financingFee: null,
            otherCharges: null,
            taxesWithheld: null,
          }
    );
    const history = aggregateHistory(
      historyInput,
      query,
      ordersIncomplete,
      warnings
    );
    if (unverifiedReports.length)
      history.financialAllocationReasons.push(
        "unverified_imported_order_identity"
      );
    const qualityPartial = warnings.size > snapshot.warnings.length;
    return {
      data: history.rows.slice(offset, offset + limit),
      meta: {
        ...baseMeta,
        partial: baseMeta.partial || qualityPartial || history.financePartial,
        granularity: query.granularity ?? "day",
        groupBy: query.groupBy ?? "none",
        financePartial: incomplete || history.financePartial,
        financePartialKnown: history.financePartialKnown,
        financialAllocationReasons: history.financialAllocationReasons,
        unallocatedOrders: history.unallocatedOrders,
        excludedUnknownDates: unknownDates + history.excludedUnknownDates,
        limit,
        offset,
        hasMore: history.rows.length > offset + limit,
        warnings: [...warnings],
      },
    };
  } catch (error) {
    if (error instanceof ReadApiDataError) throw error;
    if (error instanceof SalesMarginProviderError) {
      const status = {
        FORBIDDEN: 403,
        BAD_GATEWAY: 502,
        BAD_REQUEST: 400,
        PRECONDITION_FAILED: 503,
      }[error.code];
      const message =
        error.code === "FORBIDDEN"
          ? "A conexão não corresponde à loja autorizada."
          : error.code === "BAD_REQUEST"
            ? "Período de vendas inválido."
            : "Não foi possível confirmar os dados de vendas na fonte.";
      throw new ReadApiDataError(status, error.code, message);
    }
    throw new ReadApiDataError(
      503,
      "DATA_UNAVAILABLE",
      "Os dados de vendas não estão disponíveis agora. Tente novamente em instantes."
    );
  }
}
