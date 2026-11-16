import type { MarginChargeCategory } from "../../shared/salesMargin";
import type {
  PublicSaleItem,
  PublicSalesBounds,
  PublicSalesOrder,
  PublicSalesSnapshot,
} from "../../shared/publicSales";
import {
  PUBLIC_SALES_MAX_WINDOW_DAYS,
  PUBLIC_SALES_TIMEZONE,
} from "../../shared/publicSales";
import { readPublicSalesAvailability } from "./publicSalesAvailability";
import {
  collectPublicSalesOrderFinancial,
  SalesMarginProviderError,
  SALES_MARGIN_SELLER_ID,
  validateMarginBounds,
  verifySalesMarginAccount,
  type VerifiedMarginAccount,
} from "../salesMargin/provider";

type Json = Record<string, unknown>;
type Collection = Pick<
  PublicSalesSnapshot,
  | "orders"
  | "partial"
  | "ordersPartial"
  | "dataStartConfirmed"
  | "capped"
  | "dataStart"
  | "coverageFrom"
  | "coverageTo"
  | "warnings"
>;
const TTL_MS = 120_000;
const STALE_MAX_MS = 6 * 60 * 60_000;
const BUDGET_MS = 80_000;
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_LIMIT = 64;
const PAGE_SIZE = 50;
const SEARCH_OFFSET_LIMIT = 10_000;
const CONCURRENCY = 4;
const WARN_LIMIT = 12;
const coverageWarning =
  "coverageScope: visible_seller_orders. Pedidos ocultos ou manually_cancelled não são disponibilizados pela busca do vendedor; início absoluto da conta não confirmado.";
const retentionWarning =
  "Histórico da API é best-effort na janela solicitada (máximo 366 dias), sujeito à disponibilidade da fonte; não há garantia de cobertura desde o início da conta.";
const unavailable = () =>
  new SalesMarginProviderError(
    "BAD_GATEWAY",
    "Não foi possível confirmar os dados de vendas na fonte. Tente novamente."
  );
const mismatch = () =>
  new SalesMarginProviderError(
    "FORBIDDEN",
    "A conexão ou os pedidos não correspondem à loja autorizada (3308178634)."
  );
const object = (value: unknown): Json | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;
const obj = (value: unknown): Json => object(value) ?? {};
const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
const id = (value: unknown): string | null =>
  typeof value === "string" && value.trim()
    ? value
    : typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? String(value)
      : null;
const amount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
const round = (value: number) => Math.round(value * 100) / 100;
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PUBLIC_SALES_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value
  );
}
function iso(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    ) ||
    !validDay(value.slice(0, 10))
  )
    return null;
  if (
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  )
    return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
function day(ms: number): string {
  const parts = dayFormatter.formatToParts(ms);
  return ["year", "month", "day"]
    .map(type => parts.find(part => part.type === type)!.value)
    .join("-");
}
function validateBounds(bounds: PublicSalesBounds): void {
  validateMarginBounds(bounds);
  const calendarDays =
    (Date.parse(`${bounds.to}T12:00:00Z`) -
      Date.parse(`${bounds.from}T12:00:00Z`)) /
      86_400_000 +
    1;
  if (
    !validDay(bounds.from) ||
    !validDay(bounds.to) ||
    bounds.from > bounds.to ||
    day(bounds.fromMs) !== bounds.from ||
    day(bounds.toMs) !== bounds.to ||
    !Number.isFinite(calendarDays) ||
    calendarDays > PUBLIC_SALES_MAX_WINDOW_DAYS
  ) {
    throw new SalesMarginProviderError(
      "BAD_REQUEST",
      "Período inválido; informe até 366 dias no fuso de Brasília."
    );
  }
}
async function requestJson(
  url: string,
  account: VerifiedMarginAccount
): Promise<unknown> {
  const remaining = account.deadlineAt - Date.now();
  if (remaining <= 0) throw unavailable();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${account.token}`,
            Accept: "application/json",
          },
          signal: controller.signal,
        });
        if (!response.ok) throw unavailable();
        return (await response.json()) as unknown;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => {
            controller.abort();
            reject(unavailable());
          },
          Math.min(REQUEST_TIMEOUT_MS, remaining)
        );
      }),
    ]);
  } catch {
    throw unavailable();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function items(order: Json): PublicSaleItem[] {
  if (!Array.isArray(order.order_items)) return [];
  return order.order_items.map(raw => {
    const entry = obj(raw),
      item = obj(entry.item);
    const attributes = [
      ...(Array.isArray(item.attributes) ? item.attributes : []),
      ...(Array.isArray(item.variation_attributes)
        ? item.variation_attributes
        : []),
    ];
    const skuAttribute = attributes
      .map(obj)
      .find(
        attribute =>
          attribute.id === "SELLER_SKU" ||
          attribute.id === "SELLER_CUSTOM_FIELD"
      );
    const sku = [
      item.seller_sku,
      item.seller_custom_field,
      entry.seller_sku,
      entry.seller_custom_field,
      skuAttribute?.value_name,
    ].find(value => typeof value === "string" && value.length > 0);
    return {
      itemId: id(item.id),
      variationId: id(item.variation_id ?? entry.variation_id),
      sku: typeof sku === "string" ? sku : null,
      skuSource: typeof sku === "string" ? "mercado_livre" : null,
      title: text(item.title),
      quantity: amount(entry.quantity),
      unitPrice: amount(entry.unit_price),
      listingType: text(item.listing_type_id ?? entry.listing_type_id),
    };
  });
}
function refund(value: Json): string | null {
  if (value.status === "partially_refunded") return "partially_refunded";
  if (value.status === "refunded" || value.status === "returned")
    return "refunded";
  const returned =
    amount(value.transaction_amount_refunded) ?? amount(value.refunded_amount);
  if (returned !== null && returned > 0) {
    const gross =
      amount(value.transaction_amount) ?? amount(value.total_amount);
    return gross === null
      ? "refund_pending"
      : returned >= gross
        ? "refunded"
        : "partially_refunded";
  }
  return ["charged_back", "chargeback"].includes(String(value.status))
    ? "refund_pending"
    : null;
}
function operationStatus(order: Json): string | null {
  const refs = Array.isArray(order.payments) ? order.payments.map(obj) : [];
  if (
    [order, ...refs].some(
      value =>
        value.status === "in_mediation" ||
        value.status_detail === "in_mediation" ||
        (Array.isArray(value.mediations) && value.mediations.length > 0)
    )
  )
    return "in_mediation";
  const refunds = [order, ...refs].map(refund).filter(value => value !== null);
  if (refunds.length)
    return refunds.includes("partially_refunded")
      ? "partially_refunded"
      : refunds[0];
  return text(order.status);
}
function baseOrder(order: Json, asOf: string): PublicSalesOrder {
  const createdAt = iso(order.date_created),
    status = operationStatus(order);
  const paymentIds =
    Array.isArray(order.payments) &&
    order.payments.every(payment => id(obj(payment).id) !== null)
      ? [...new Set(order.payments.map(payment => id(obj(payment).id)!))]
      : null;
  const refundPending =
    status !== null &&
    ["cancelled", "refunded", "partially_refunded", "refund_pending"].includes(
      status
    );
  return {
    orderId: id(order.id)!,
    packId: id(order.pack_id),
    paymentIds,
    createdAt,
    saleDay: createdAt ? day(Date.parse(createdAt)) : null,
    paidAt: null,
    status,
    rawStatus: text(order.status),
    financiallyComplete: false,
    financialStatus: refundPending ? "refund_pending" : "pending",
    items: items(order),
    shipping: {
      logisticType: text(obj(order.shipping).logistic_type),
      payer: null,
    },
    gross: order.currency_id === "BRL" ? amount(order.total_amount) : null,
    net: null,
    deductions: null,
    charges: [],
    saleFee: null,
    processingFee: null,
    shippingCost: null,
    financingFee: null,
    otherCharges: null,
    taxesWithheld: null,
    taxDetail: null,
    taxesDisaggregated: null,
    chargesExplainDeductions: null,
    source: "automatic",
    asOf,
    pendingReason:
      "Detalhe financeiro não coletado ou ainda não confirmado pela fonte.",
  };
}
function validatePage(
  raw: unknown,
  offset: number,
  limit: number,
  account: VerifiedMarginAccount
): { orders: Json[]; total: number } {
  const page = obj(raw),
    total = obj(page.paging).total;
  if (
    !Array.isArray(page.results) ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    page.results.length > limit ||
    total < offset + page.results.length ||
    (obj(page.paging).offset !== undefined &&
      obj(page.paging).offset !== offset)
  )
    throw unavailable();
  const orders = page.results.map(object);
  // Foreign records invalidate the complete response, including already collected pages/cache.
  if (
    orders.some(
      order =>
        order &&
        id(obj(order.seller).id) !== null &&
        id(obj(order.seller).id) !== account.sellerId
    )
  )
    throw mismatch();
  if (
    orders.some(
      order =>
        !order ||
        !id(order.id) ||
        !iso(order.date_created) ||
        !id(obj(order.seller).id) ||
        (order.order_items !== undefined &&
          (!Array.isArray(order.order_items) ||
            order.order_items.some(
              entry => !object(entry) || !object(obj(entry).item)
            ))) ||
        (order.payments !== undefined &&
          (!Array.isArray(order.payments) ||
            order.payments.some(entry => !object(entry))))
    )
  )
    throw unavailable();
  if (new Set(orders.map(order => id(order!.id))).size !== orders.length)
    throw unavailable();
  return { orders: orders as Json[], total };
}
async function shipping(
  order: Json,
  account: VerifiedMarginAccount,
  target: PublicSalesOrder
): Promise<boolean> {
  const shippingId = id(obj(order.shipping).id);
  if (!shippingId) return false;
  let unknown = false;
  if (target.shipping.logisticType === null) {
    try {
      const shipment = obj(
        await requestJson(
          `https://api.mercadolibre.com/shipments/${encodeURIComponent(shippingId)}`,
          account
        )
      );
      if (
        id(shipment.id) !== shippingId ||
        id(shipment.sender_id) !== account.sellerId
      )
        unknown = true;
      else target.shipping.logisticType = text(shipment.logistic_type);
    } catch {
      unknown = true;
    }
  }
  if (Date.now() >= account.deadlineAt) return true;
  try {
    const costs = obj(
      await requestJson(
        `https://api.mercadolibre.com/shipments/${encodeURIComponent(shippingId)}/costs`,
        account
      )
    );
    if (
      id(
        costs.senders && Array.isArray(costs.senders)
          ? obj(
              costs.senders.find(
                entry => id(obj(entry).user_id) === account.sellerId
              )
            ).user_id
          : null
      ) !== account.sellerId
    )
      return true;
    if (costs.shipping_id != null && id(costs.shipping_id) !== shippingId)
      return true;
    const senders = costs.senders as unknown[];
    const sellerAmounts = senders
      .filter(entry => id(obj(entry).user_id) === account.sellerId)
      .map(entry => amount(obj(entry).cost));
    const seller =
      sellerAmounts.length && sellerAmounts.every(value => value !== null)
        ? sellerAmounts.reduce<number>((sum, value) => sum + value!, 0)
        : null;
    const buyer = amount(obj(costs.receiver).cost);
    // Only explicit costs for BOTH parties prove payer; no inference from shipping tags/logistics/charges.
    if (seller !== null && buyer !== null)
      target.shipping.payer =
        seller > 0 && buyer > 0
          ? "both"
          : seller > 0
            ? "seller"
            : buyer > 0
              ? "buyer"
              : null;
  } catch {
    unknown = true;
  }
  return unknown;
}
async function collect(
  account: VerifiedMarginAccount,
  bounds: PublicSalesBounds,
  financial: boolean
): Promise<Collection> {
  const cap = financial ? 1_000 : 10_000;
  const orders = new Map<string, Json>();
  const warnings = new Set<string>([coverageWarning, retentionWarning]);
  const warn = (message: string) => {
    if (warnings.size < WARN_LIMIT) warnings.add(message);
  };
  const availability = await readPublicSalesAvailability(account, requestJson);
  for (const message of availability.warnings) warn(message);
  let partial = false,
    capped = false,
    successfulPages = 0;
  const streams = [
    { cancelled: false, offset: 0, done: false, seen: new Set<string>() },
    { cancelled: true, offset: 0, done: false, seen: new Set<string>() },
  ];
  // Alternate visible-all and explicit cancelled pages so one search cannot starve the other.
  while (streams.some(stream => !stream.done)) {
    for (const stream of streams) {
      if (stream.done) continue;
      if (Date.now() >= account.deadlineAt) {
        partial = true;
        warn(
          "Coleta interrompida pelo limite de tempo; pedidos ainda não confirmados."
        );
        stream.done = true;
        continue;
      }
      if (orders.size >= cap || stream.offset >= SEARCH_OFFSET_LIMIT) {
        partial = capped = true;
        warn(
          `Coleta limitada a ${cap} pedidos ou ao offset máximo da fonte; reduza a janela.`
        );
        stream.done = true;
        continue;
      }
      const url = new URL("https://api.mercadolibre.com/orders/search");
      const limit = Math.min(PAGE_SIZE, cap - orders.size);
      url.search = new URLSearchParams({
        seller: account.sellerId,
        "order.date_created.from": new Date(bounds.fromMs).toISOString(),
        "order.date_created.to": new Date(bounds.toMs).toISOString(),
        sort: "date_desc",
        limit: String(limit),
        offset: String(stream.offset),
        ...(stream.cancelled ? { "order.status": "cancelled" } : {}),
      }).toString();
      try {
        const page = validatePage(
          await requestJson(url.toString(), account),
          stream.offset,
          limit,
          account
        );
        successfulPages++;
        if (page.orders.some(order => stream.seen.has(id(order.id)!))) {
          partial = true;
          warn(
            "A fonte repetiu pedidos entre páginas; total do período não confirmado."
          );
        }
        for (const order of page.orders) {
          stream.seen.add(id(order.id)!);
          const ms = Date.parse(String(order.date_created));
          if (
            ms < bounds.fromMs ||
            ms > bounds.toMs ||
            (stream.cancelled && order.status !== "cancelled")
          ) {
            partial = true;
            warn(
              "A fonte retornou pedidos fora dos filtros solicitados; cobertura não confirmada."
            );
            continue;
          }
          const key = id(order.id)!;
          if (
            orders.has(key) &&
            !stream.cancelled &&
            orders.get(key)!.status === "cancelled"
          )
            continue;
          orders.set(key, order);
          if (
            !Array.isArray(order.order_items) ||
            order.currency_id !== "BRL" ||
            amount(order.total_amount) === null
          ) {
            partial = true;
            warn(
              "Há pedidos com itens, moeda ou bruto não informados/confirmados pela fonte."
            );
          }
          if (
            typeof order.status !== "string" ||
            order.status.length === 0 ||
            items(order).some(
              item => item.quantity === null || item.unitPrice === null
            )
          ) {
            partial = true;
            warn(
              "Há pedidos com status, quantidade ou preço unitário não informados pela fonte."
            );
          }
        }
        stream.offset += page.orders.length;
        if (stream.offset >= page.total) stream.done = true;
        else if (page.orders.length < limit) {
          stream.done = true;
          partial = true;
          warn(
            "A API retornou uma página incompleta; total do período não confirmado."
          );
        }
      } catch (error) {
        if (
          error instanceof SalesMarginProviderError &&
          error.code === "FORBIDDEN"
        )
          throw error;
        stream.done = true;
        partial = true;
        warn(
          stream.cancelled
            ? "Falha na busca explícita de cancelados; cobertura de cancelamentos não confirmada."
            : "Falha na paginação de pedidos; total do período não confirmado."
        );
      }
    }
  }
  // Failed or interrupted empty searches must never become a false zero.
  if (!successfulPages || (!orders.size && partial)) throw unavailable();
  const ordersPartial = partial;
  const asOf = new Date().toISOString();
  const entries = [...orders.values()].sort(
    (a, b) =>
      Date.parse(String(b.date_created)) - Date.parse(String(a.date_created)) ||
      id(a.id)!.localeCompare(id(b.id)!)
  );
  const output = entries.map(order => baseOrder(order, asOf));
  if (financial) {
    let cursor = 0;
    await Promise.all(
      Array.from(
        { length: Math.min(CONCURRENCY, entries.length) },
        async () => {
          while (cursor < entries.length) {
            const index = cursor++,
              order = entries[index],
              target = output[index];
            if (Date.now() >= account.deadlineAt) {
              partial = true;
              warn(
                "Há pagamentos ou fretes não coletados pelo limite de tempo."
              );
              continue;
            }
            const result = await collectPublicSalesOrderFinancial(
              order,
              account
            );
            const sale = result.sale,
              meta = result.metadata;
            target.financialStatus = sale.financialStatus;
            target.financiallyComplete = sale.financialStatus === "confirmed";
            target.gross = order.currency_id === "BRL" ? sale.gross : null;
            target.net = sale.net;
            target.deductions = sale.deductions;
            target.charges = sale.charges;
            target.taxesWithheld = sale.taxesWithheld;
            target.pendingReason = sale.pendingReason ?? null;
            target.paidAt = meta.paidAt;
            target.taxDetail = meta.taxDetail;
            target.taxesDisaggregated = meta.taxesDisaggregated;
            if (meta.mediation) target.status = "in_mediation";
            else if (meta.refundStatus) target.status = meta.refundStatus;
            const category = (
              category: MarginChargeCategory
            ): number | null => {
              if (!meta.chargesComplete) return null;
              const charges = sale.charges.filter(
                charge => charge.category === category
              );
              return charges.length
                ? round(charges.reduce((sum, charge) => sum + charge.amount, 0))
                : null;
            };
            target.saleFee = category("sale");
            target.processingFee = category("processing");
            target.shippingCost = category("shipping");
            target.financingFee = category("financing");
            target.otherCharges = category("other");
            target.chargesExplainDeductions =
              meta.chargesComplete &&
              target.financiallyComplete &&
              sale.charges.length > 0 &&
              sale.deductions !== null
                ? Math.abs(
                    round(
                      sale.charges.reduce(
                        (sum, charge) => sum + charge.amount,
                        0
                      )
                    ) - sale.deductions
                  ) <= 0.010000001
                : null;
            if (!meta.chargesComplete && target.financiallyComplete) {
              partial = true;
              warn(
                "Detalhes de cobranças incompletos: categorias sem total confirmado permanecem null; charges pode conter somente detalhes recebidos."
              );
            }
            if (result.cutoff) {
              partial = true;
              warn("Há pagamentos não coletados pelo limite de tempo.");
            } else if (
              !target.financiallyComplete &&
              target.financialStatus === "pending"
            ) {
              partial = true;
              warn(
                "Há informações financeiras pendentes ou indisponíveis; valores desconhecidos permanecem null."
              );
            }
            if (await shipping(order, account, target)) {
              partial = true;
              warn(
                "Há detalhes de frete indisponíveis ou não confirmados pela fonte."
              );
            }
          }
        }
      )
    );
  }
  return {
    orders: output,
    partial,
    ordersPartial,
    capped,
    dataStart: availability.dataStart,
    dataStartConfirmed: availability.confirmed,
    coverageFrom: ordersPartial ? null : bounds.from,
    coverageTo: ordersPartial ? null : bounds.to,
    warnings: [...warnings],
  };
}
type CacheEntry = {
  value?: Collection;
  at: number;
  inflight?: Promise<{ value: Collection; at: number }>;
};
const cache = new Map<string, CacheEntry>();
function reserve(key: string): void {
  if (cache.has(key) || cache.size < CACHE_LIMIT) return;
  const oldest = [...cache.entries()]
    .filter(([, entry]) => !entry.inflight)
    .sort((a, b) => a[1].at - b[1].at)[0];
  if (!oldest) throw unavailable();
  cache.delete(oldest[0]);
}
/** Read-only automatic snapshot. Identity is verified BEFORE cache/inflight/fallback access. */
export async function getPublicSalesSnapshot(
  ownerUserId: number,
  bounds: PublicSalesBounds,
  options: { financial?: boolean } = {}
): Promise<PublicSalesSnapshot> {
  validateBounds(bounds);
  const startedAt = Date.now();
  const account = await verifySalesMarginAccount(ownerUserId);
  if (account.sellerId !== SALES_MARGIN_SELLER_ID) throw mismatch();
  account.deadlineAt = Math.min(account.deadlineAt, startedAt + BUDGET_MS);
  const financial = options.financial !== false;
  const key = JSON.stringify([
    account.ownerUserId,
    account.sellerId,
    bounds.from,
    bounds.to,
    bounds.fromMs,
    bounds.toMs,
    financial,
  ]);
  let entry = cache.get(key);
  const snapshot = (
    value: Collection,
    at: number,
    stale: boolean
  ): PublicSalesSnapshot =>
    structuredClone({
      ...value,
      ownerUserId: account.ownerUserId,
      sellerId: account.sellerId,
      nickname: account.nickname,
      asOf: at,
      stale,
      ...(stale
        ? {
            warnings: [
              ...value.warnings.slice(0, WARN_LIMIT - 1),
              "API indisponível: fotografia anterior desatualizada (stale).",
            ],
          }
        : {}),
    });
  if (entry?.value && Date.now() - entry.at < TTL_MS)
    return snapshot(entry.value, entry.at, false);
  if (!entry?.inflight) {
    reserve(key);
    const previous = entry;
    entry = { value: previous?.value, at: previous?.at ?? 0 };
    const current = entry;
    current.inflight = collect(account, bounds, financial).then(
      value => {
        const at = Date.now();
        if (cache.get(key) === current) cache.set(key, { value, at });
        return { value, at };
      },
      error => {
        if (cache.get(key) === current) {
          if (
            current.value &&
            !(
              error instanceof SalesMarginProviderError &&
              error.code === "FORBIDDEN"
            )
          )
            cache.set(key, { value: current.value, at: current.at });
          else cache.delete(key);
        }
        throw error;
      }
    );
    cache.set(key, current);
  }
  const current = entry;
  try {
    const result = await current.inflight!;
    return snapshot(result.value, result.at, false);
  } catch (error) {
    if (error instanceof SalesMarginProviderError && error.code === "FORBIDDEN")
      throw error;
    if (current.value && Date.now() - current.at <= STALE_MAX_MS)
      return snapshot(current.value, current.at, true);
    throw unavailable();
  }
}
/** Tests only. Never exposed through an API. */
export function __clearPublicSalesCache(): void {
  cache.clear();
}
