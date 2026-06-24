/**
 * Geração (pura) dos dados tabulares do relatório de anúncios.
 * Fica em `shared/` para ser coberta pela suíte vitest e reutilizada pelo
 * client em `client/src/lib/exportListingsPdf.ts` (que monta o PDF com jsPDF).
 * NÃO depende de DOM — apenas string building + Intl.
 */
import type { ListingRow, VisitsDayPoint } from "./account";

export const REPORT_LOGO_URL = "/manus-storage/toujours-logo_6a1debf8.webp";

/** Rótulo amigável do tipo de anúncio do Mercado Livre. */
export const LISTING_TYPE_LABEL: Record<string, string> = {
  gold_pro: "Clássico",
  gold_special: "Premium",
  gold_premium: "Premium",
  gold: "Clássico",
  silver: "Clássico",
  bronze: "Grátis",
  free: "Grátis",
};

/** Mapeia o listingType cru do ML para um rótulo curto (Premium/Clássico/…). */
export function listingTypeLabel(listingType: string | null | undefined): string {
  if (!listingType) return "—";
  return LISTING_TYPE_LABEL[listingType] ?? listingType;
}

export type ExportPdfOpts = {
  /** Texto curto descrevendo os filtros aplicados (ex.: "Ativos · Premium"). */
  filtersLabel?: string;
  /** Janela de visitas selecionada (7/30/90), para o subtítulo. */
  visitWindow?: number;
  /** Conjunto de itemIds que possuem anúncio patrocinado (Mercado Ads). */
  adsItemIds?: Set<string>;
};

function fmtBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function fmtNum(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

/** Conversão (0..1) -> "1,2%"; null/sem visita -> "—". */
function fmtPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value * 100)}%`;
}

function isoToUtcDate(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function isoToWeekdayShort(iso: string): string {
  const dt = isoToUtcDate(iso);
  if (!dt) return "";
  return dt.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
}

function isoToDayNum(iso: string): string {
  const dt = isoToUtcDate(iso);
  if (!dt) return "";
  return String(dt.getUTCDate());
}

/** Colunas de dias derivadas do item que tiver a SÉRIE MAIS LONGA, para que
 *  as colunas de dia sempre apareçam quando houver qualquer dado diário
 *  (a UI coleta a quebra por dia apenas dos anúncios ativos). */
function dayColumns(items: ListingRow[]): VisitsDayPoint[] {
  let best: VisitsDayPoint[] = [];
  for (const it of items) {
    const d = it.dailyVisits ?? [];
    if (d.length > best.length) best = d;
  }
  return best;
}

function dayHeaderLabel(p: VisitsDayPoint, todayKey: string): string {
  return p.date === todayKey ? "Hoje" : `${isoToWeekdayShort(p.date)} ${isoToDayNum(p.date)}`;
}

export interface ListingsReportTable {
  /** Cabeçalho de todas as colunas, na ordem. */
  head: string[];
  /** Linhas já formatadas (strings), alinhadas ao head. */
  rows: string[][];
  /** Quantos cabeçalhos finais são colunas de dia (para alinhamento numérico). */
  dayColCount: number;
  /** Índice (0-based) da primeira coluna de dia, para o zebrado laranja. */
  dayColStart: number;
  /** Subtítulo (filtros + janela). */
  subtitle: string;
  /** Rótulo do filtro ativo (ex.: "Ativos"), para destaque no cabeçalho. */
  filtersLabel?: string;
  /** Total de itens. */
  count: number;
}

/**
 * Função PURA: monta o cabeçalho + linhas (strings formatadas) com as colunas:
 * Anúncio, SKU, Tipo de Anúncio, Catálogo, ADS, Preço, Vendas, Visitas,
 * (dias da semana) e Conversão.
 */
export function buildListingsReportTable(
  items: ListingRow[],
  opts: ExportPdfOpts = {},
): ListingsReportTable {
  const todayKey = new Date().toISOString().slice(0, 10);
  const cols = dayColumns(items);
  const adsSet = opts.adsItemIds ?? new Set<string>();

  const dayHeads = cols.map((p) => dayHeaderLabel(p, todayKey));

  // Anúncio, SKU, Tipo, Catálogo, ADS, Preço, Vendas, Visitas → 8 colunas fixas
  // antes das colunas de dia.
  const dayColStart = 8;

  const head = [
    "Anúncio",
    "SKU",
    "Tipo de Anúncio",
    "Catálogo",
    "ADS",
    "Preço",
    "Vendas",
    "Visitas",
    ...dayHeads,
    "Conversão",
  ];

  const rows = items.map((it) => {
    const dailyMap = new Map((it.dailyVisits ?? []).map((p) => [p.date, p.visits]));
    const dayCells = cols.map((c) => {
      const v = dailyMap.get(c.date);
      return v == null ? "—" : fmtNum(v);
    });
    const visitsCell = it.visitsAvailable ? fmtNum(it.visits) : "—";
    const conversionCell = it.visitsAvailable ? fmtPct(it.conversion) : "—";
    return [
      it.title,
      it.sku && it.sku.trim() ? it.sku.trim() : "—",
      listingTypeLabel(it.listingType),
      it.catalogListing ? "Sim" : "Não",
      adsSet.has(String(it.itemId)) ? "Sim" : "Não",
      fmtBRL(it.price),
      fmtNum(it.soldQuantity),
      visitsCell,
      ...dayCells,
      conversionCell,
    ];
  });

  const subtitleParts: string[] = [];
  if (opts.visitWindow) subtitleParts.push(`Visitas dos últimos ${opts.visitWindow} dias`);
  if (opts.filtersLabel) subtitleParts.push(opts.filtersLabel);

  return {
    head,
    rows,
    dayColCount: dayHeads.length,
    dayColStart,
    subtitle: subtitleParts.join(" · "),
    filtersLabel: opts.filtersLabel,
    count: items.length,
  };
}
