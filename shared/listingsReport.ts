/**
 * Geração (pura) do HTML do relatório imprimível de anúncios.
 * Fica em `shared/` para ser coberto pela suíte vitest (server/shared)
 * e reutilizado pelo client em `client/src/lib/exportListingsPdf.ts`.
 * NÃO depende de DOM — apenas string building + Intl.
 */
import type { ListingRow, VisitsDayPoint } from "./account";

const LOGO_URL = "/manus-storage/toujours-logo_6a1debf8.webp";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  paused: "Pausado",
  closed: "Encerrado",
};

export type ExportPdfOpts = {
  /** Texto curto descrevendo os filtros aplicados (ex.: "Ativos · Premium"). */
  filtersLabel?: string;
  /** Janela de visitas selecionada (7/30/90), para o subtítulo. */
  visitWindow?: number;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function fmtNum(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
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

/** Colunas de dias derivadas do primeiro item que tiver série diária. */
function dayColumns(items: ListingRow[]): VisitsDayPoint[] {
  const withDaily = items.find((i) => (i.dailyVisits?.length ?? 0) > 0);
  return withDaily?.dailyVisits ?? [];
}

function dayHeaderLabel(p: VisitsDayPoint, todayKey: string): string {
  return p.date === todayKey ? "Hoje" : `${isoToWeekdayShort(p.date)} ${isoToDayNum(p.date)}`;
}

/**
 * Função pura: monta o HTML do relatório imprimível a partir dos anúncios
 * filtrados/ordenados.
 */
export function buildListingsReportHtml(items: ListingRow[], opts: ExportPdfOpts = {}): string {
  const todayKey = new Date().toISOString().slice(0, 10);
  const cols = dayColumns(items);

  const generatedAt = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const dayHeadCells = cols
    .map((p) => `<th class="num day">${escapeHtml(dayHeaderLabel(p, todayKey))}</th>`)
    .join("");

  const rowsHtml = items
    .map((it, idx) => {
      const dailyMap = new Map((it.dailyVisits ?? []).map((p) => [p.date, p.visits]));
      const dayCells = cols
        .map((c) => {
          const v = dailyMap.get(c.date);
          return `<td class="num day">${v == null ? "—" : fmtNum(v)}</td>`;
        })
        .join("");
      const visitsCell = it.visitsAvailable ? fmtNum(it.visits) : "—";
      return `<tr class="${idx % 2 ? "alt" : ""}">
        <td class="title">${escapeHtml(it.title)}</td>
        <td class="num">${fmtBRL(it.price)}</td>
        <td class="num">${fmtNum(it.availableQuantity)}</td>
        <td class="num">${fmtNum(it.soldQuantity)}</td>
        <td class="num strong">${visitsCell}</td>
        ${dayCells}
        <td class="status">${escapeHtml(STATUS_LABEL[it.status] ?? it.status)}</td>
      </tr>`;
    })
    .join("");

  const subtitleParts: string[] = [];
  if (opts.visitWindow) subtitleParts.push(`Visitas dos últimos ${opts.visitWindow} dias`);
  if (opts.filtersLabel) subtitleParts.push(opts.filtersLabel);
  const subtitle = subtitleParts.join(" · ");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Relatório de anúncios — TOUJOURS</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #18181b; margin: 0; padding: 32px 28px;
  }
  .head {
    display: flex; align-items: center; gap: 16px;
    border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 18px;
  }
  .head img { width: 56px; height: 56px; border-radius: 10px; object-fit: cover; background: #0b0b0d; }
  .head .brand { font-size: 22px; font-weight: 700; letter-spacing: 0.06em; }
  .head .tag { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #71717a; }
  .meta { margin-left: auto; text-align: right; font-size: 11px; color: #52525b; line-height: 1.5; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .sub { font-size: 12px; color: #52525b; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #e4e4e7; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #71717a; border-bottom: 1.5px solid #d4d4d8; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.day, th.day { text-align: center; width: 46px; }
  td.strong { font-weight: 700; }
  td.title { max-width: 320px; }
  td.status, th.status { white-space: nowrap; }
  tr.alt td { background: #fafafa; }
  .foot { margin-top: 18px; font-size: 10px; color: #a1a1aa; text-align: center; }
  @media print { body { padding: 12px; } .foot { position: fixed; bottom: 8px; left: 0; right: 0; } }
</style>
</head>
<body>
  <div class="head">
    <img src="${LOGO_URL}" alt="TOUJOURS" />
    <div>
      <div class="brand">TOUJOURS</div>
      <div class="tag">Market Intelligence</div>
    </div>
    <div class="meta">
      Gerado em ${escapeHtml(generatedAt)}<br/>
      ${fmtNum(items.length)} anúncio(s)
    </div>
  </div>
  <h1>Relatório de anúncios</h1>
  ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ""}
  <table>
    <thead>
      <tr>
        <th>Anúncio</th>
        <th class="num">Preço</th>
        <th class="num">Estoque</th>
        <th class="num">Vendas</th>
        <th class="num">Visitas</th>
        ${dayHeadCells}
        <th class="status">Status</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <div class="foot">TOUJOURS — Sempre presente · Relatório gerado pelo painel de inteligência de mercado</div>
</body>
</html>`;
}
