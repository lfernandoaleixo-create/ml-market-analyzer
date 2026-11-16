import {
  SalesMarginProviderError,
  type VerifiedMarginAccount,
} from "../salesMargin/provider";

type Availability = {
  dataStart: string | null;
  warnings: string[];
  confirmed: boolean;
};
type Json = Record<string, unknown>;
const SCOPE_WARNING =
  "dataStart indica o primeiro pedido visível nas buscas do vendedor, incluindo cancelados; não comprova o início absoluto do histórico da conta. Pedidos ocultos ou manually_cancelled podem não estar disponíveis.";
const UNCONFIRMED_WARNING =
  "Não foi possível confirmar o primeiro pedido visível nas duas buscas da fonte; dataStart permanece null.";
const DEADLINE_WARNING =
  "O limite de tempo impediu confirmar o primeiro pedido visível; dataStart permanece null.";
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const object = (value: unknown): Json | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;
function id(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? String(value)
      : null;
}
const forbidden = () =>
  new SalesMarginProviderError(
    "FORBIDDEN",
    "Os pedidos não correspondem à loja autorizada."
  );
function timestamp(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    )
  )
    return null;
  // Date.parse normalizes impossible calendar dates (e.g. February 30).
  const calendarDay = value.slice(0, 10);
  const calendarMs = Date.parse(`${calendarDay}T00:00:00Z`);
  if (
    !Number.isFinite(calendarMs) ||
    new Date(calendarMs).toISOString().slice(0, 10) !== calendarDay ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59 ||
    (value.endsWith("Z")
      ? false
      : Number(value.slice(-5, -3)) > 23 || Number(value.slice(-2)) > 59)
  )
    return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
function validatePage(
  raw: unknown,
  account: VerifiedMarginAccount
): { oldest: number | null } | null {
  const page = object(raw);
  const results = page?.results;
  // Identity takes precedence over malformed paging/other fields: no fallback
  // may hide a foreign record, even in an otherwise unusable response.
  if (Array.isArray(results)) {
    for (const rawOrder of results) {
      const sellerId = id(object(object(rawOrder)?.seller)?.id);
      if (sellerId !== null && sellerId !== account.sellerId) throw forbidden();
    }
  }
  const paging = object(page?.paging);
  const total = paging?.total;
  if (
    !Array.isArray(results) ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    results.length > 1 ||
    results.length !== (total > 0 ? 1 : 0) ||
    (paging?.offset !== undefined && paging.offset !== 0) ||
    (paging?.limit !== undefined && paging.limit !== 1)
  )
    return null;
  if (total === 0) return { oldest: null };
  const order = object(results[0]);
  const oldest = timestamp(order?.date_created);
  if (
    !order ||
    !id(order.id) ||
    !id(object(order.seller)?.id) ||
    oldest === null
  )
    return null;
  return { oldest };
}

/** Global, read-only availability probe; the caller owns collection caching. */
export async function readPublicSalesAvailability(
  account: VerifiedMarginAccount,
  read: (url: string, account: VerifiedMarginAccount) => Promise<unknown>
): Promise<Availability> {
  const oldest: number[] = [];
  let failed = false;
  let timedOut = false;
  for (const cancelled of [false, true]) {
    if (!(Date.now() < account.deadlineAt)) {
      failed = timedOut = true;
      break;
    }
    const url = new URL("https://api.mercadolibre.com/orders/search");
    url.search = new URLSearchParams({
      seller: account.sellerId,
      sort: "date_asc",
      limit: "1",
      offset: "0",
      ...(cancelled ? { "order.status": "cancelled" } : {}),
    }).toString();
    try {
      const page = validatePage(await read(url.toString(), account), account);
      if (!(Date.now() < account.deadlineAt)) {
        failed = timedOut = true;
      } else if (!page) {
        failed = true;
      } else if (page.oldest !== null) {
        oldest.push(page.oldest);
      }
    } catch (error) {
      if (
        error instanceof SalesMarginProviderError &&
        error.code === "FORBIDDEN"
      )
        throw forbidden();
      // Never expose source errors, URLs, tokens or provider payloads.
      failed = true;
      timedOut ||= !(Date.now() < account.deadlineAt);
    }
  }
  if (failed) {
    return {
      dataStart: null,
      warnings: [
        SCOPE_WARNING,
        timedOut ? DEADLINE_WARNING : UNCONFIRMED_WARNING,
      ],
      confirmed: false,
    };
  }
  const parts = oldest.length
    ? dayFormatter.formatToParts(Math.min(...oldest))
    : null;
  return {
    dataStart: parts
      ? ["year", "month", "day"]
          .map(type => parts.find(part => part.type === type)!.value)
          .join("-")
      : null,
    warnings: [SCOPE_WARNING],
    confirmed: true,
  };
}
