import type { ListingRow } from "./account";

/**
 * Pure, framework-free analytics helpers for the "Meus anúncios" page.
 *
 * Everything here is deterministic and unit-tested so the UI can stay a thin
 * rendering layer: bucketing (faixas), filtering, sorting and the actionable
 * "insights" (cross-metric classification) all live here.
 */

// ---------------------------------------------------------------------------
// Faixas (buckets)
// ---------------------------------------------------------------------------

export interface Bucket {
  id: string;
  label: string;
  /** Inclusive lower bound. */
  min: number;
  /** Exclusive upper bound (Infinity for open-ended). */
  max: number;
}

/** Visit ranges (per selected window). */
export const VISIT_BUCKETS: Bucket[] = [
  { id: "v0", label: "0 visitas", min: 0, max: 1 },
  { id: "v1_10", label: "1–10", min: 1, max: 11 },
  { id: "v10_50", label: "10–50", min: 11, max: 51 },
  { id: "v50_100", label: "50–100", min: 51, max: 101 },
  { id: "v100_200", label: "100–200", min: 101, max: 201 },
  { id: "v200", label: "200+", min: 201, max: Infinity },
];

/** Stock ranges. */
export const STOCK_BUCKETS: Bucket[] = [
  { id: "s0", label: "Sem estoque", min: 0, max: 1 },
  { id: "s1_5", label: "Baixo (1–5)", min: 1, max: 6 },
  { id: "s6_20", label: "6–20", min: 6, max: 21 },
  { id: "s21", label: "21+", min: 21, max: Infinity },
];

/** Conversion bands expressed in PERCENT (0..100). */
export const CONVERSION_BUCKETS: Bucket[] = [
  { id: "c0", label: "0%", min: 0, max: 0.0001 },
  { id: "c0_1", label: "0–1%", min: 0.0001, max: 1 },
  { id: "c1_3", label: "1–3%", min: 1, max: 3 },
  { id: "c3_5", label: "3–5%", min: 3, max: 5 },
  { id: "c5", label: "5%+", min: 5, max: Infinity },
];

/** Health bands expressed 0..1. */
export const HEALTH_BUCKETS: Bucket[] = [
  { id: "h_crit", label: "Crítica (<0,5)", min: 0, max: 0.5 },
  { id: "h_low", label: "Baixa (0,5–0,8)", min: 0.5, max: 0.8 },
  { id: "h_good", label: "Boa (0,8+)", min: 0.8, max: Infinity },
];

/** Return the bucket id a numeric value falls into, or null if none. */
export function bucketIdFor(value: number, buckets: Bucket[]): string | null {
  for (const b of buckets) {
    if (value >= b.min && value < b.max) return b.id;
  }
  return null;
}

/** Count how many items fall into each bucket for a given accessor. */
export function bucketCounts(
  items: ListingRow[],
  buckets: Bucket[],
  accessor: (r: ListingRow) => number | null,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const b of buckets) counts[b.id] = 0;
  for (const it of items) {
    const v = accessor(it);
    if (v == null) continue;
    const id = bucketIdFor(v, buckets);
    if (id) counts[id] += 1;
  }
  return counts;
}

/** Conversion as a percentage number (0..100), or null when no visits. */
export function conversionPct(r: ListingRow): number | null {
  if (r.conversion == null) return null;
  return r.conversion * 100;
}

// ---------------------------------------------------------------------------
// Insights (cross-metric, actionable)
// ---------------------------------------------------------------------------

export type InsightId =
  | "high_visits_low_conv"
  | "selling_low_stock"
  | "no_sales_high_visits"
  | "paused_with_sales"
  | "out_of_stock_active";

export interface InsightDef {
  id: InsightId;
  title: string;
  description: string;
  /** Predicate that decides whether a listing belongs to this insight. */
  match: (r: ListingRow) => boolean;
}

/**
 * The actionable insight catalog. Thresholds chosen to be meaningful for a
 * growing store; tweakable in one place.
 */
export const INSIGHTS: InsightDef[] = [
  {
    id: "high_visits_low_conv",
    title: "Muitas visitas, baixa conversão",
    description: "Anúncios ativos com 50+ visitas e conversão abaixo de 1% — revise preço, fotos, título ou ficha técnica.",
    match: (r) =>
      r.status === "active" &&
      r.visits >= 50 &&
      r.conversion != null &&
      r.conversion < 0.01,
  },
  {
    id: "no_sales_high_visits",
    title: "Sem vendas, mesmo com visitas",
    description: "Anúncios ativos com 30+ visitas e nenhuma venda — provável problema de oferta ou concorrência.",
    match: (r) => r.status === "active" && r.visits >= 30 && r.soldQuantity === 0,
  },
  {
    id: "selling_low_stock",
    title: "Vende bem, estoque baixo",
    description: "Anúncios ativos que já venderam e estão com 5 unidades ou menos — reponha para não perder vendas.",
    match: (r) =>
      r.status === "active" &&
      r.soldQuantity > 0 &&
      r.availableQuantity > 0 &&
      r.availableQuantity <= 5,
  },
  {
    id: "out_of_stock_active",
    title: "Ativo sem estoque",
    description: "Anúncios ativos com estoque zerado — perdem posição e podem ser pausados pelo ML.",
    match: (r) => r.status === "active" && r.availableQuantity === 0,
  },
  {
    id: "paused_with_sales",
    title: "Pausados que já venderam",
    description: "Anúncios pausados com histórico de vendas — bons candidatos a reativar.",
    match: (r) => r.status === "paused" && r.soldQuantity > 0,
  },
];

export interface InsightResult {
  id: InsightId;
  title: string;
  description: string;
  count: number;
  /** Sum of stock value for the matched listings (useful for capital insight). */
  stockValue: number;
  items: ListingRow[];
}

/** Compute every insight bucket against the provided listings. */
export function computeInsights(items: ListingRow[]): InsightResult[] {
  return INSIGHTS.map((def) => {
    const matched = items.filter(def.match);
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      count: matched.length,
      stockValue: matched.reduce((s, r) => s + r.stockValue, 0),
      items: matched,
    };
  });
}

// ---------------------------------------------------------------------------
// Filtering + sorting
// ---------------------------------------------------------------------------

export interface ListingFilters {
  search?: string;
  statuses?: string[];
  listingTypes?: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  freeShipping?: boolean | null;
  visitBucketIds?: string[];
  stockBucketIds?: string[];
  conversionBucketIds?: string[];
  healthBucketIds?: string[];
  insightId?: InsightId | null;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Apply all active filters (AND semantics across categories, OR within). */
export function filterListings(items: ListingRow[], f: ListingFilters): ListingRow[] {
  const term = f.search ? normalize(f.search) : "";
  const insightDef = f.insightId ? INSIGHTS.find((i) => i.id === f.insightId) : null;

  return items.filter((r) => {
    if (term) {
      const hay = normalize(`${r.title} ${r.itemId}`);
      if (!hay.includes(term)) return false;
    }
    if (f.statuses && f.statuses.length && !f.statuses.includes(r.status)) return false;
    if (f.listingTypes && f.listingTypes.length && !f.listingTypes.includes(r.listingType)) return false;
    if (f.priceMin != null && r.price < f.priceMin) return false;
    if (f.priceMax != null && r.price > f.priceMax) return false;
    if (f.freeShipping != null && (r.freeShipping ?? false) !== f.freeShipping) return false;

    if (f.visitBucketIds && f.visitBucketIds.length) {
      const id = bucketIdFor(r.visits, VISIT_BUCKETS);
      if (!id || !f.visitBucketIds.includes(id)) return false;
    }
    if (f.stockBucketIds && f.stockBucketIds.length) {
      const id = bucketIdFor(r.availableQuantity, STOCK_BUCKETS);
      if (!id || !f.stockBucketIds.includes(id)) return false;
    }
    if (f.conversionBucketIds && f.conversionBucketIds.length) {
      const pct = conversionPct(r);
      const id = pct == null ? null : bucketIdFor(pct, CONVERSION_BUCKETS);
      if (!id || !f.conversionBucketIds.includes(id)) return false;
    }
    if (f.healthBucketIds && f.healthBucketIds.length) {
      const id = r.health == null ? null : bucketIdFor(r.health, HEALTH_BUCKETS);
      if (!id || !f.healthBucketIds.includes(id)) return false;
    }
    if (insightDef && !insightDef.match(r)) return false;

    return true;
  });
}

export type SortKey =
  | "title"
  | "price"
  | "availableQuantity"
  | "soldQuantity"
  | "visits"
  | "conversion"
  | "health"
  | "stockValue"
  | "day0" // hoje (último ponto da série diária)
  | "day1" // ontem
  | "day2" // anteontem
  | "day3"; // 3 dias atrás

export type SortDir = "asc" | "desc";

/** Mapa itemId -> série diária (último ponto = hoje). */
export type DailyVisitsMap = Record<string, { date: string; visits: number }[]>;

/** Resolve as visitas do dia `offsetFromEnd` (0 = hoje, 1 = ontem, 2 = anteontem)
 *  a partir do mapa diário. Retorna null quando ainda não há dado. */
export function dayVisitsFromMap(
  daily: DailyVisitsMap | undefined,
  itemId: string,
  offsetFromEnd: number,
): number | null {
  const series = daily?.[itemId];
  if (!series || series.length === 0) return null;
  const idx = series.length - 1 - offsetFromEnd;
  if (idx < 0) return null;
  const pt = series[idx];
  return pt ? pt.visits : null;
}

/** Stable sort by a numeric/string key. Nulls always sort last.
 *  Para as chaves de dia (day0/day1/day2), passe o `daily` (mapa por itemId). */
export function sortListings(
  items: ListingRow[],
  key: SortKey,
  dir: SortDir,
  daily?: DailyVisitsMap,
): ListingRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const copy = items.slice();
  const dayOffset: Record<string, number> = { day0: 0, day1: 1, day2: 2, day3: 3 };
  copy.sort((a, b) => {
    if (key === "title") {
      return sign * normalize(a.title).localeCompare(normalize(b.title));
    }
    let av: number | null;
    let bv: number | null;
    if (key in dayOffset) {
      const off = dayOffset[key];
      av = dayVisitsFromMap(daily, a.itemId, off);
      bv = dayVisitsFromMap(daily, b.itemId, off);
    } else {
      av = a[key as keyof ListingRow] as number | null;
      bv = b[key as keyof ListingRow] as number | null;
    }
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls last regardless of dir
    if (bv == null) return -1;
    return sign * (av - bv);
  });
  return copy;
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a semicolon-separated CSV (Excel-pt-BR friendly) for the given rows. */
export function listingsToCsv(items: ListingRow[]): string {
  const headers = [
    "ID",
    "Titulo",
    "Status",
    "Tipo",
    "Preco",
    "Estoque",
    "Vendidos",
    "Visitas",
    "Conversao(%)",
    "Saude",
    "FreteGratis",
    "Permalink",
  ];
  const lines = [headers.join(";")];
  for (const r of items) {
    const conv = r.conversion == null ? "" : (r.conversion * 100).toFixed(2).replace(".", ",");
    const health = r.health == null ? "" : r.health.toFixed(2).replace(".", ",");
    lines.push(
      [
        csvCell(r.itemId),
        csvCell(r.title),
        csvCell(r.status),
        csvCell(r.listingType),
        csvCell(r.price.toFixed(2).replace(".", ",")),
        csvCell(r.availableQuantity),
        csvCell(r.soldQuantity),
        csvCell(r.visits),
        csvCell(conv),
        csvCell(health),
        csvCell(r.freeShipping ? "Sim" : "Nao"),
        csvCell(r.permalink ?? ""),
      ].join(";"),
    );
  }
  return lines.join("\n");
}

/**
 * Seleciona SOMENTE os anúncios com status ativo, aplicando uma busca textual
 * opcional por título ou itemId (case-insensitive). Usado pelo card dedicado
 * "Anúncios ativos" na página Meus anúncios. Mantém a ordem original recebida.
 */
export function selectActiveListings(
  items: ListingRow[],
  search = "",
): ListingRow[] {
  const active = items.filter((i) => i.status === "active");
  const q = search.trim().toLowerCase();
  if (!q) return active;
  return active.filter(
    (i) =>
      i.title.toLowerCase().includes(q) || i.itemId.toLowerCase().includes(q),
  );
}
