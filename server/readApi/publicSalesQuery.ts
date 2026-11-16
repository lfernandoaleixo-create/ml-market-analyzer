import { z } from "zod";
import {
  PUBLIC_SALES_MAX_WINDOW_DAYS,
  PUBLIC_SALES_TIMEZONE,
  type PublicSalesQuery,
  type PublicSalesBounds,
} from "../../shared/publicSales";

const DAY = 86400000;
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PUBLIC_SALES_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function publicSalesDate(ms: number): string {
  const parts = Object.fromEntries(
    dateFormatter.formatToParts(ms).map(p => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const integer = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
export function validSalesDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(ms) &&
    new Date(ms).toISOString().slice(0, 10) === value &&
    value >= "1970-01-01"
  );
}
export function advancePublicSalesDate(value: string, days: number): string {
  return new Date(Date.parse(`${value}T12:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);
}
/** Earliest instant of the civil date. Intl supplies IANA rules, including old DST midnight jumps. */
export function publicSalesDayStart(value: string): number {
  if (!validSalesDate(value)) throw new Error("Data inválida.");
  const noon = Date.parse(`${value}T12:00:00Z`);
  let low = noon - DAY,
    high = noon + DAY;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (publicSalesDate(middle) < value) low = middle + 1;
    else high = middle;
  }
  return low;
}
const date = z.string().refine(validSalesDate);
const common = {
  limit: integer(1, 100).default(50),
  offset: integer(0, 100000).default(0),
  days: z.enum(["7", "30", "90"]).default("30").transform(Number),
  from: date.optional(),
  to: date.optional(),
  itemId: z
    .string()
    .regex(/^MLB\d+$/)
    .max(32)
    .optional(),
  sku: z.string().min(1).max(200).optional(),
};
const orders = z
  .object({
    ...common,
    status: z
      .enum([
        "paid",
        "cancelled",
        "refunded",
        "partially_refunded",
        "in_mediation",
        "confirmed",
        "payment_required",
        "payment_in_process",
        "partially_paid",
        "invalid",
        "pending",
      ])
      .optional(),
  })
  .strict();
const history = z
  .object({
    ...common,
    granularity: z.enum(["hour", "day", "week", "month"]).default("day"),
    groupBy: z.enum(["item", "sku", "none"]).default("none"),
  })
  .strict();
export function resolvePublicSalesBounds(
  query: PublicSalesQuery,
  now = Date.now()
): PublicSalesBounds {
  if (!!query.from !== !!query.to)
    throw new Error("from e to devem ser enviados juntos.");
  const to = query.to ?? publicSalesDate(now),
    from = query.from ?? advancePublicSalesDate(to, 1 - query.days);
  if (!validSalesDate(from) || !validSalesDate(to))
    throw new Error("Data inválida.");
  const calendarDays =
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY + 1;
  if (calendarDays < 1 || calendarDays > PUBLIC_SALES_MAX_WINDOW_DAYS)
    throw new Error("Janela inválida: máximo 366 dias inclusivos.");
  if (to > publicSalesDate(now)) throw new Error("Data futura não é aceita.");
  return {
    from,
    to,
    fromMs: publicSalesDayStart(from),
    toMs: publicSalesDayStart(advancePublicSalesDate(to, 1)) - 1,
  };
}
export function parsePublicSalesQuery(
  path: string,
  value: unknown,
  now = Date.now()
): PublicSalesQuery {
  const query = (path === "/sales/orders" ? orders : history).parse(value);
  resolvePublicSalesBounds(query, now);
  return query;
}
