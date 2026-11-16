import type {
  MarginCharge,
  MarginChargeCategory,
  MarginItem,
  MarginSale,
} from "../../shared/salesMargin";
import { getCredentials, resolveMlOwnerUserId } from "../dbMl";
import { ensureUserAccessToken } from "../ml/oauthMl";

export const SALES_MARGIN_SELLER_ID = "3308178634";
const TTL_MS = 120_000;
const STALE_MAX_MS = 6 * 60 * 60_000;
const BUDGET_MS = 80_000;
const REQUEST_TIMEOUT_MS = 12_000;
const CONCURRENCY = 4;
export type MarginBounds = { fromMs: number; toMs: number };
export type MarginCollection = {
  operations: MarginSale[];
  partial: boolean;
  capped: boolean;
  warning?: string;
};
export type MarginCollectionSnapshot = MarginCollection & {
  ownerUserId: number;
  sellerId: string;
  nickname: string;
  asOf: number;
  stale: boolean;
};
export class SalesMarginProviderError extends Error {
  constructor(
    readonly code:
      | "PRECONDITION_FAILED"
      | "FORBIDDEN"
      | "BAD_GATEWAY"
      | "BAD_REQUEST",
    message: string
  ) {
    super(message);
    this.name = "SalesMarginProviderError";
  }
}
export type VerifiedMarginAccount = {
  ownerUserId: number;
  sellerId: string;
  nickname: string;
  token: string;
  deadlineAt: number;
};
type Json = Record<string, unknown>;
function obj(value: unknown): Json {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}
function id(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? String(value)
      : null;
}
function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
function reportedNet(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
const round = (value: number) => Math.round(value * 100) / 100;
const unavailable = () =>
  new SalesMarginProviderError(
    "BAD_GATEWAY",
    "Não foi possível confirmar os dados financeiros. Tente novamente ou importe um relatório da loja."
  );
const mismatch = () =>
  new SalesMarginProviderError(
    "FORBIDDEN",
    "A conexão não corresponde à loja autorizada (3308178634). Reconecte a loja correta."
  );
export function validateMarginBounds(bounds: MarginBounds): void {
  if (
    !Number.isSafeInteger(bounds.fromMs) ||
    !Number.isSafeInteger(bounds.toMs) ||
    bounds.fromMs < 0 ||
    bounds.fromMs > bounds.toMs ||
    bounds.toMs > 8_640_000_000_000_000
  ) {
    throw new SalesMarginProviderError("BAD_REQUEST", "Período inválido.");
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
    // Neither provider payloads nor URLs/tokens are retained in public errors.
    throw unavailable();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Every read/write verifies /users/me BEFORE consulting a cached snapshot. No demo or personal fallback. */
export async function verifySalesMarginAccount(
  requestUserId: number
): Promise<VerifiedMarginAccount> {
  const deadlineAt = Date.now() + BUDGET_MS;
  const ownerUserId = await resolveMlOwnerUserId(requestUserId);
  const credentials = await getCredentials(ownerUserId);
  if (!credentials)
    throw new SalesMarginProviderError(
      "PRECONDITION_FAILED",
      "Conecte a loja Mercado Livre para consultar as margens."
    );
  if (id(credentials.mlUserId) !== SALES_MARGIN_SELLER_ID) throw mismatch();
  // Use the existing routine (including its ordinary renewal), never force-refresh for diagnostics.
  const token = await ensureUserAccessToken(ownerUserId);
  if (!token)
    throw new SalesMarginProviderError(
      "PRECONDITION_FAILED",
      "A conexão da loja expirou. Reconecte o Mercado Livre."
    );
  const account = {
    ownerUserId,
    sellerId: SALES_MARGIN_SELLER_ID,
    nickname: "",
    token,
    deadlineAt,
  };
  const me = obj(
    await requestJson("https://api.mercadolibre.com/users/me", account)
  );
  if (!id(me.id)) throw unavailable();
  if (id(me.id) !== SALES_MARGIN_SELLER_ID) throw mismatch();
  account.nickname =
    typeof me.nickname === "string" ? me.nickname : "Loja 3308178634";
  return account;
}

function itemsFromOrder(order: Json): MarginItem[] {
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
    const candidates = [
      item.seller_sku,
      item.seller_custom_field,
      entry.seller_sku,
      entry.seller_custom_field,
      skuAttribute?.value_name,
    ];
    const sku = candidates.find(
      value => typeof value === "string" && value.trim()
    ) as string | undefined;
    return {
      itemId: id(item.id),
      title:
        typeof item.title === "string"
          ? item.title
          : "Produto sem identificação",
      sku: sku?.trim() ?? null,
      quantity: amount(entry.quantity),
    };
  });
}
function pendingOrder(order: Json, reason: string, refund = false): MarginSale {
  return {
    operationId: id(order.id)!,
    saleDate: String(order.date_created),
    items: itemsFromOrder(order),
    gross: amount(order.total_amount),
    deductions: null,
    net: null,
    financialStatus: refund ? "refund_pending" : "pending",
    source: "api",
    charges: [],
    taxesWithheld: null,
    released: null,
    pendingReason: reason,
  };
}
function chargeCategory(name: string): MarginChargeCategory {
  if (/shipping|frete|shipment/i.test(name)) return "shipping";
  if (/tax|imposto|withhold/i.test(name)) return "tax";
  if (/financ|installment/i.test(name)) return "financing";
  if (/mercado_pago|processing|payment_fee/i.test(name)) return "processing";
  if (/marketplace|sale|comiss/i.test(name)) return "sale";
  return "other";
}
function sellerCharge(raw: Json): boolean {
  const from = obj(raw.accounts).from;
  if (
    from === "collector" ||
    from === "seller" ||
    id(from) === SALES_MARGIN_SELLER_ID
  )
    return true;
  const fromObject = obj(from);
  // An explicit foreign id wins over a generic role label.
  if (id(fromObject.id)) return id(fromObject.id) === SALES_MARGIN_SELLER_ID;
  return fromObject.type === "collector" || fromObject.type === "seller";
}
function paymentCharges(payment: Json): MarginCharge[] {
  if (!Array.isArray(payment.charges_details)) return [];
  return payment.charges_details.flatMap(raw => {
    const charge = obj(raw),
      amounts = obj(charge.amounts);
    if (!sellerCharge(charge)) return [];
    const original = amount(amounts.original),
      refunded = amounts.refunded === undefined ? 0 : amount(amounts.refunded);
    if (original === null || refunded === null || refunded > original)
      return [];
    const name =
      typeof charge.name === "string"
        ? charge.name
        : typeof charge.type === "string"
          ? charge.type
          : "other";
    return [
      {
        key: id(charge.id) ?? name,
        label: name,
        category: chargeCategory(`${name} ${String(charge.type ?? "")}`),
        amount: round(original - refunded),
      },
    ];
  });
}
const REFUND_REASON =
  "Reembolso, devolução ou contestação: concilie pelo relatório da loja antes de calcular o líquido.";
function hasRefund(value: Json): boolean {
  return (
    value.status === "refunded" ||
    value.status === "charged_back" ||
    value.status === "chargeback" ||
    (amount(value.transaction_amount_refunded) ?? 0) > 0 ||
    (amount(value.refunded_amount) ?? 0) > 0
  );
}
function validPayment(
  payment: Json,
  operationId: string,
  paymentId: string
): boolean {
  if (
    id(payment.id) !== paymentId ||
    id(payment.collector_id) !== SALES_MARGIN_SELLER_ID ||
    payment.currency_id !== "BRL"
  )
    return false;
  const order = obj(payment.order);
  return [payment.order_id, order.id].every(
    value => value === undefined || value === null || id(value) === operationId
  );
}
async function collectOrder(
  order: Json,
  account: VerifiedMarginAccount,
  observeVerifiedPayment?: (payment: Json) => void
): Promise<{ sale: MarginSale; cutoff: boolean }> {
  const base = pendingOrder(
    order,
    "Líquido não confirmado pela API. Importe um relatório da loja para conciliar."
  );
  if (order.currency_id !== "BRL")
    return {
      sale: {
        ...base,
        pendingReason: "Moeda do pedido não confirmada como BRL.",
      },
      cutoff: false,
    };
  if (
    order.status === "cancelled" ||
    order.status === "returned" ||
    order.status === "charged_back"
  ) {
    return {
      sale: {
        ...base,
        financialStatus: "refund_pending",
        pendingReason: REFUND_REASON,
      },
      cutoff: false,
    };
  }
  if (!Array.isArray(order.payments) || !order.payments.length)
    return { sale: base, cutoff: false };
  const refs = order.payments.map(obj);
  if (refs.some(hasRefund))
    return {
      sale: {
        ...base,
        financialStatus: "refund_pending",
        pendingReason: REFUND_REASON,
      },
      cutoff: false,
    };
  const terminalAttempts = new Set(["approved", "rejected", "cancelled", "canceled"]);
  if (order.status === "partially_paid" || refs.some(payment => !terminalAttempts.has(String(payment.status)))) {
    return { sale: { ...base, pendingReason: "O pedido possui pagamento parcial ou ainda não finalizado. O líquido completo e a margem aguardam confirmação." }, cutoff: false };
  }
  const approvedRefs = refs.filter(payment => payment.status === "approved");
  if (
    approvedRefs.some(
      payment =>
        !id(payment.id) ||
        (payment.order_id != null && id(payment.order_id) !== base.operationId)
    )
  )
    return { sale: base, cutoff: false };
  // One actual payment cannot count twice even if /orders/search repeats its reference.
  const approved = [
    ...new Map(
      approvedRefs.map(payment => [id(payment.id)!, payment])
    ).values(),
  ];
  if (!approved.length) return { sale: base, cutoff: false };
  const payments: Json[] = [];
  let unknown = false,
    refund = false,
    cutoff = false;
  for (const ref of approved) {
    const paymentId = id(ref.id);
    if (
      !paymentId ||
      (ref.order_id != null && id(ref.order_id) !== base.operationId)
    ) {
      unknown = true;
      continue;
    }
    if (Date.now() >= account.deadlineAt) {
      cutoff = true;
      unknown = true;
      continue;
    }
    try {
      const payment = obj(
        await requestJson(
          `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
          account
        )
      );
      if (!validPayment(payment, base.operationId, paymentId)) {
        unknown = true;
        continue;
      }
      observeVerifiedPayment?.(payment);
      if (hasRefund(payment)) {
        refund = true;
        continue;
      }
      if (
        payment.status !== "approved" ||
        amount(payment.transaction_amount) === null ||
        reportedNet(obj(payment.transaction_details).net_received_amount) ===
          null
      ) {
        unknown = true;
        continue;
      }
      payments.push(payment);
    } catch {
      unknown = true;
      cutoff ||= Date.now() >= account.deadlineAt;
    }
  }
  if (refund)
    return {
      sale: {
        ...base,
        financialStatus: "refund_pending",
        pendingReason: REFUND_REASON,
      },
      cutoff,
    };
  if (unknown || payments.length !== approved.length)
    return { sale: base, cutoff };
  const gross = round(
    payments.reduce(
      (sum, payment) => sum + (payment.transaction_amount as number),
      0
    )
  );
  // AUTHORITATIVE API NET: charges below are an explanation, NEVER another subtraction.
  const net = round(
    payments.reduce(
      (sum, payment) =>
        sum + (obj(payment.transaction_details).net_received_amount as number),
      0
    )
  );
  const taxes = payments.map(payment => amount(payment.taxes_amount));
  const release = payments.map(payment =>
    typeof payment.released === "boolean"
      ? payment.released
      : payment.money_release_status === "released"
        ? true
        : payment.money_release_status === "pending" ||
            payment.money_release_status === "held"
          ? false
          : null
  );
  return {
    sale: {
      ...base,
      gross,
      net,
      deductions: round(gross - net),
      financialStatus: "confirmed",
      pendingReason: undefined,
      charges: payments.flatMap(paymentCharges),
      taxesWithheld: taxes.every(value => value !== null)
        ? round(taxes.reduce<number>((sum, value) => sum + value!, 0))
        : null,
      released: release.every(value => value === true)
        ? true
        : release.some(value => value === false)
          ? false
          : null,
    },
    cutoff,
  };
}

export type PublicFinancialMetadata = {
  paidAt: string | null;
  refundStatus: "refunded" | "partially_refunded" | "refund_pending" | null;
  mediation: boolean;
  chargesComplete: boolean;
  taxDetail: { type: string | null; description: string | null; amount: number | null }[] | null;
  taxesDisaggregated: { type: string | null; description: string | null; amount: number | null }[] | null;
};
/** Exact string fields only. Unknown metadata objects are never exposed or recursively flattened. */
function publicTaxEntries(value: unknown): PublicFinancialMetadata["taxDetail"] {
  const entries = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : null;
  if (!entries || entries.length > 100) return null;
  if (!entries.length) return [];
  const safe = entries.flatMap(entry => {
    const row = obj(entry);
    const type = typeof row.type === "string" ? row.type : null;
    const description = typeof row.description === "string" ? row.description : null;
    const value = amount(row.amount);
    return type === null && description === null && value === null
      ? [] : [{ type, description, amount: value }];
  });
  return safe.length ? safe : null;
}
function publicRefund(value: Json): PublicFinancialMetadata["refundStatus"] {
  if (value.status === "partially_refunded") return "partially_refunded";
  if (value.status === "refunded" || value.status === "returned") return "refunded";
  const refunded = amount(value.transaction_amount_refunded) ?? amount(value.refunded_amount);
  if (refunded !== null && refunded > 0) {
    const total = amount(value.transaction_amount) ?? amount(value.total_amount);
    return total === null ? "refund_pending" : refunded >= total ? "refunded" : "partially_refunded";
  }
  if (value.status === "charged_back" || value.status === "chargeback") return "refund_pending";
  return null;
}
function publicMediation(value: Json): boolean {
  return value.status === "in_mediation" || value.status_detail === "in_mediation" ||
    (Array.isArray(value.mediations) && value.mediations.length > 0);
}
function publicChargesComplete(payment: Json): boolean {
  if (!Array.isArray(payment.charges_details)) return false;
  return payment.charges_details.every(raw => {
    const charge = obj(raw), from = obj(charge.accounts).from, account = obj(from);
    // An unidentified account is not evidence of a buyer charge.
    const identified = ["collector", "seller", "payer", "buyer"].includes(String(from)) ||
      (typeof from === "number" && id(from) !== null) || (typeof from === "string" && /^\d+$/.test(from)) ||
      id(account.id) !== null || ["collector", "seller", "payer", "buyer"].includes(String(account.type));
    if (!identified) return false;
    if (!sellerCharge(charge)) return true;
    return (typeof charge.name === "string" || typeof charge.type === "string") && paymentCharges({ charges_details: [charge] }).length === 1;
  });
}
/** Public read-only adapter. The existing UI's collectOrder result/rules remain unchanged. */
export async function collectPublicSalesOrderFinancial(
  order: Record<string, unknown>,
  account: VerifiedMarginAccount
): Promise<{ sale: MarginSale; cutoff: boolean; metadata: PublicFinancialMetadata }> {
  const refs = Array.isArray(order.payments) ? order.payments.map(obj) : [];
  const refunds = [order, ...refs].map(publicRefund).filter(value => value !== null);
  const initialRefund = refunds.includes("partially_refunded") ? "partially_refunded" : refunds[0] ?? null;
  const metadata: PublicFinancialMetadata = {
    paidAt: null, refundStatus: initialRefund,
    mediation: [order, ...refs].some(publicMediation), chargesComplete: false,
    taxDetail: null, taxesDisaggregated: null,
  };
  // Additional explicit refund/mediation states must not be promoted to confirmed finance.
  if (initialRefund || metadata.mediation || refs.length > 20) {
    return {
      sale: pendingOrder(order, initialRefund ? REFUND_REASON : "Informação financeira ainda não confirmada pela fonte.", !!initialRefund),
      cutoff: false, metadata,
    };
  }
  const verified: Json[] = [];
  const result = await collectOrder(order, account, payment => verified.push(payment));
  const verifiedRefunds = verified.map(publicRefund).filter(value => value !== null);
  metadata.refundStatus = verifiedRefunds.includes("partially_refunded") ? "partially_refunded" : verifiedRefunds[0] ?? null;
  metadata.mediation = verified.some(publicMediation);
  if (metadata.refundStatus || metadata.mediation) {
    return {
      sale: pendingOrder(order, metadata.refundStatus ? REFUND_REASON : "Informação financeira ainda não confirmada pela fonte.", !!metadata.refundStatus),
      cutoff: result.cutoff, metadata,
    };
  }
  if (result.sale.financialStatus === "confirmed") {
    metadata.chargesComplete = verified.length > 0 && verified.every(publicChargesComplete);
    const dates = verified.map(payment => typeof payment.date_approved === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(payment.date_approved) &&
      Number(payment.date_approved.slice(11, 13)) <= 23 && Number(payment.date_approved.slice(14, 16)) <= 59 && Number(payment.date_approved.slice(17, 19)) <= 59 &&
      Number.isFinite(Date.parse(`${payment.date_approved.slice(0, 10)}T00:00:00Z`)) &&
      new Date(`${payment.date_approved.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === payment.date_approved.slice(0, 10) &&
      Number.isFinite(Date.parse(payment.date_approved)) ? Date.parse(payment.date_approved) : null);
    if (dates.length && dates.every(value => value !== null)) metadata.paidAt = new Date(Math.max(...dates as number[])).toISOString();
    for (const [field, lower, upper] of [
      ["taxDetail", "tax_detail", "TAX_DETAIL"],
      ["taxesDisaggregated", "taxes_disaggregated", "TAXES_DISAGGREGATED"],
    ] as const) {
      const parts = verified.map(payment => {
        const meta = obj(payment.metadata);
        return publicTaxEntries(payment[lower] ?? payment[upper] ?? meta[upper] ?? meta[lower]);
      });
      metadata[field] = parts.length && parts.every(part => part !== null) ? parts.flatMap(part => part!) : null;
    }
    // Keep original charge names, but never publish the UI's fallback name for unnamed records.
    const charges = verified.flatMap(payment => paymentCharges({ charges_details:
      Array.isArray(payment.charges_details) ? payment.charges_details.filter(raw => {
        const charge = obj(raw);
        return typeof charge.name === "string" || typeof charge.type === "string";
      }) : [],
    }));
    return { ...result, sale: { ...result.sale, charges }, metadata };
  }
  return { ...result, metadata };
}

async function collect(
  account: VerifiedMarginAccount,
  bounds: MarginBounds
): Promise<MarginCollection> {
  const cap = bounds.toMs - bounds.fromMs <= 31 * 86_400_000 ? 300 : 600;
  const orders = new Map<string, Json>();
  let partial = false,
    capped = false,
    offset = 0;
  const warnings = new Set<string>();
  while (offset < cap) {
    if (Date.now() >= account.deadlineAt) {
      partial = true;
      warnings.add(
        "Coleta interrompida pelo limite de tempo; há pedidos ainda não coletados."
      );
      break;
    }
    const url = new URL("https://api.mercadolibre.com/orders/search");
    url.search = new URLSearchParams({
      seller: account.sellerId,
      "order.date_created.from": new Date(bounds.fromMs).toISOString(),
      "order.date_created.to": new Date(bounds.toMs).toISOString(),
      sort: "date_desc",
      limit: "50",
      offset: String(offset),
    }).toString();
    try {
      const page = obj(await requestJson(url.toString(), account));
      const total = obj(page.paging).total;
      if (
        !Array.isArray(page.results) ||
        typeof total !== "number" ||
        !Number.isSafeInteger(total) ||
        total < 0 ||
        page.results.length > 50 ||
        total < offset + page.results.length
      )
        throw unavailable();
      // Validate the whole page before accepting it: malformed entries cannot silently disappear.
      const entries = page.results.map(obj);
      for (const order of entries) {
        if (
          !id(order.id) ||
          typeof order.date_created !== "string" ||
          !Number.isFinite(Date.parse(order.date_created)) ||
          !id(obj(order.seller).id)
        )
          throw unavailable();
        if (id(obj(order.seller).id) !== account.sellerId) throw mismatch();
      }
      for (const order of entries) {
        const date = Date.parse(String(order.date_created));
        if (date >= bounds.fromMs && date <= bounds.toMs)
          orders.set(id(order.id)!, order);
      }
      offset += entries.length;
      if (offset >= total) break;
      if (!entries.length || entries.length < 50) {
        partial = true;
        warnings.add(
          "A API retornou uma página incompleta; o total do período não está confirmado."
        );
        break;
      }
      if (offset >= cap) {
        capped = true;
        partial = true;
        warnings.add(
          `Coleta limitada a ${cap} pedidos; reduza o período para conciliar o total.`
        );
      }
    } catch (error) {
      if (
        error instanceof SalesMarginProviderError &&
        error.code === "FORBIDDEN"
      )
        throw error;
      if (!orders.size) throw unavailable();
      partial = true;
      warnings.add(
        "Falha ao buscar outra página de pedidos; total do período não confirmado."
      );
      break;
    }
  }
  const entries = [...orders.values()];
  const operations: MarginSale[] = entries.map(order =>
    pendingOrder(
      order,
      "Pagamento ainda não coletado pelo limite de tempo. Importe o relatório para conciliar."
    )
  );
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, entries.length) }, async () => {
      while (cursor < entries.length) {
        const index = cursor++;
        if (Date.now() >= account.deadlineAt) {
          partial = true;
          warnings.add(
            "Há pagamentos ainda não coletados pelo limite de tempo."
          );
          continue;
        }
        const result = await collectOrder(entries[index], account);
        operations[index] = result.sale;
        if (result.cutoff) {
          partial = true;
          warnings.add(
            "Há pagamentos ainda não coletados pelo limite de tempo."
          );
        }
      }
    })
  );
  return {
    operations,
    partial,
    capped,
    ...(warnings.size ? { warning: [...warnings].join(" ") } : {}),
  };
}

type CacheEntry = {
  value?: MarginCollection;
  at: number;
  inflight?: Promise<MarginCollection>;
};
const collectionCache = new Map<string, CacheEntry>();
const CACHE_LIMIT = 64;
function reserveCacheKey(key: string): void {
  if (collectionCache.has(key) || collectionCache.size < CACHE_LIMIT) return;
  const oldest = [...collectionCache.entries()]
    .filter(([, value]) => !value.inflight)
    .sort((a, b) => a[1].at - b[1].at)[0];
  if (!oldest) throw unavailable();
  collectionCache.delete(oldest[0]);
}
/** Collection cache ONLY. Local costs and uploaded snapshots belong to fresh router reads. */
export async function getSalesMarginCollection(
  requestUserId: number,
  bounds: MarginBounds,
  force = false
): Promise<MarginCollectionSnapshot> {
  validateMarginBounds(bounds);
  const account = await verifySalesMarginAccount(requestUserId);
  const key = `${account.ownerUserId}:${account.sellerId}:${bounds.fromMs}:${bounds.toMs}`;
  let entry = collectionCache.get(key);
  const result = (
    value: MarginCollection,
    at: number,
    stale: boolean
  ): MarginCollectionSnapshot => ({
    ...value,
    ownerUserId: account.ownerUserId,
    sellerId: account.sellerId,
    nickname: account.nickname,
    asOf: at,
    stale,
    ...(stale
      ? {
          warning: [
            value.warning,
            "API indisponível: exibindo uma fotografia anterior, desatualizada.",
          ]
            .filter(Boolean)
            .join(" "),
        }
      : {}),
  });
  if (!force && entry?.value && Date.now() - entry.at < TTL_MS)
    return result(entry.value, entry.at, false);
  if (!entry?.inflight) {
    reserveCacheKey(key);
    entry = {
      ...entry,
      at: entry?.at ?? 0,
      inflight: collect(account, bounds),
    };
    collectionCache.set(key, entry);
  }
  const current = entry;
  try {
    const value = await current.inflight!;
    const at = Date.now();
    collectionCache.set(key, { value, at });
    return result(value, at, false);
  } catch (error) {
    collectionCache.set(key, { value: current.value, at: current.at });
    if (error instanceof SalesMarginProviderError && error.code === "FORBIDDEN")
      throw error;
    if (current.value && Date.now() - current.at < STALE_MAX_MS)
      return result(current.value, current.at, true);
    throw unavailable();
  }
}
/** Test isolation only; no external side effects. */
export function __clearSalesMarginCache(): void {
  collectionCache.clear();
}
