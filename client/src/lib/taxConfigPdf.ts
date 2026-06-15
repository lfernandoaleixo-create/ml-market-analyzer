import type { TaxConfig, UF } from "@shared/finance";

/**
 * Build a clean, printable HTML document for the tax configuration and open it
 * in a new window with the print dialog. The user can then "Save as PDF" or
 * print it for the accountant to review.
 *
 * We use the browser's native print pipeline (no external libs): it renders
 * crisp text, handles pagination, and lets the OS export to PDF reliably.
 */

type ExportOptions = {
  config: TaxConfig;
  ufList: UF[];
  /** Inventory catalog name (BaseLinker), when known. */
  inventoryName?: string | null;
  /** Optional note to print alongside the config. */
  note?: string | null;
  /** Store/owner display name for the header. */
  storeName?: string | null;
};

function fmtPct(n: number): string {
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildTaxConfigHtml(opts: ExportOptions): string {
  const { config, ufList, inventoryName, note, storeName } = opts;
  const now = new Date();
  const generatedAt = now.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const federalRows = [
    ["PIS (cumulativo)", config.pis],
    ["COFINS (cumulativo)", config.cofins],
    ["IRPJ efetivo (sobre a receita)", config.irpjEffective],
    ["CSLL efetiva (sobre a receita)", config.csllEffective],
  ] as const;
  const federalSum =
    config.pis + config.cofins + config.irpjEffective + config.csllEffective;

  const ttsRows = [
    ["ICMS interestadual (com TTS)", config.ttsInterstate],
    ["ICMS dentro de MG (com TTS)", config.ttsInternal],
    ["ICMS interno de MG (sem TTS)", config.icmsInternalOrigin],
  ] as const;

  const ufRows = ufList
    .map((uf) => {
      const icms = config.icmsInternalByUF[uf] ?? 0;
      const fcp = config.fcpByUF?.[uf];
      const fcpCell =
        fcp != null && fcp > 0 ? fmtPct(fcp) : "<span class=\"muted\">—</span>";
      return `<tr><td>${uf}</td><td class="num">${fmtPct(icms)}</td><td class="num">${fcpCell}</td></tr>`;
    })
    .join("");

  const noteBlock =
    note && note.trim().length > 0
      ? `<div class="note"><strong>Observação:</strong> ${escapeHtml(note.trim())}</div>`
      : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Configuração de impostos — Mercato</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #18181b; margin: 0; padding: 32px 36px; font-size: 13px; line-height: 1.5;
  }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #10b981; color: #0f766e; }
  .sub { color: #71717a; font-size: 12px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e4e4e7; padding-bottom: 14px; margin-bottom: 6px; }
  .brand { font-weight: 700; font-size: 16px; color: #0f766e; }
  .meta { text-align: right; font-size: 11px; color: #71717a; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ececef; }
  th { background: #f4f4f5; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: #52525b; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #a1a1aa; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .pill.on { background: #dcfce7; color: #166534; }
  .pill.off { background: #fef3c7; color: #92400e; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .summary td:first-child { color: #52525b; }
  .summary tr:last-child td { font-weight: 700; border-top: 2px solid #d4d4d8; }
  .ufgrid { columns: 3; column-gap: 24px; }
  .ufgrid table { break-inside: avoid; }
  .note { margin-top: 14px; padding: 10px 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; font-size: 12px; }
  .disclaimer { margin-top: 22px; padding: 12px 14px; background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 11px; color: #52525b; }
  .footer { margin-top: 18px; font-size: 10px; color: #a1a1aa; text-align: center; }
  @media print { body { padding: 0; } @page { margin: 16mm; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Mercato · Inteligência de Mercado</div>
      <h1>Configuração de impostos</h1>
      <div class="sub">${storeName ? escapeHtml(storeName) + " · " : ""}Estimativa gerencial (Lucro Presumido + ICMS/DIFAL)</div>
    </div>
    <div class="meta">
      Gerado em<br /><strong>${generatedAt}</strong>
    </div>
  </div>

  <h2>Resumo</h2>
  <table class="summary">
    <tbody>
      <tr><td>Cenário tributário (benefício TTS)</td><td class="num"><span class="pill ${config.ttsEnabled ? "on" : "off"}">${config.ttsEnabled ? "COM TTS (ativo)" : "SEM TTS"}</span></td></tr>
      <tr><td>UF de origem</td><td class="num">${config.originUF}</td></tr>
      ${inventoryName ? `<tr><td>Catálogo de custos (BaseLinker)</td><td class="num">${escapeHtml(inventoryName)}</td></tr>` : ""}
      <tr><td>Soma dos tributos federais</td><td class="num">${fmtPct(federalSum)}</td></tr>
    </tbody>
  </table>

  <h2>Tributos federais (sobre a receita)</h2>
  <table>
    <thead><tr><th>Tributo</th><th class="num">Alíquota</th></tr></thead>
    <tbody>
      ${federalRows.map(([label, v]) => `<tr><td>${label}</td><td class="num">${fmtPct(v)}</td></tr>`).join("")}
      <tr><td><strong>Total federal</strong></td><td class="num"><strong>${fmtPct(federalSum)}</strong></td></tr>
    </tbody>
  </table>

  <h2>ICMS — benefício TTS (Minas Gerais)</h2>
  <table>
    <thead><tr><th>Parâmetro</th><th class="num">Alíquota</th></tr></thead>
    <tbody>
      ${ttsRows.map(([label, v]) => `<tr><td>${label}</td><td class="num">${fmtPct(v)}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2>ICMS interno por estado de destino (cenário sem TTS)</h2>
  <div class="ufgrid">
    <table>
      <thead><tr><th>UF</th><th class="num">ICMS</th><th class="num">FCP</th></tr></thead>
      <tbody>${ufRows}</tbody>
    </table>
  </div>

  ${noteBlock}

  <div class="disclaimer">
    <strong>Aviso:</strong> Os valores acima são uma <strong>estimativa gerencial</strong> para apoiar a
    precificação e a tomada de decisão. A apuração e o recolhimento oficial dos tributos são de
    responsabilidade do contador. Documento gerado para conferência.
  </div>

  <div class="footer">Documento gerado automaticamente pelo Mercato para conferência contábil</div>
</body>
</html>`;
}

/**
 * Render the printable tax-config document inside a hidden iframe on the SAME
 * page and trigger the print dialog from there. This never triggers the
 * browser's pop-up blocker (unlike window.open) because no new window/tab is
 * created. The iframe is removed automatically once printing finishes.
 *
 * Returns true on success. If anything goes wrong, falls back to downloading
 * the document as an .html file the user can open and print manually.
 */
export function exportTaxConfigPdf(opts: ExportOptions): boolean {
  const html = buildTaxConfigHtml(opts);
  try {
    const iframe = document.createElement("iframe");
    // Keep it visually hidden but still rendered (display:none can prevent print in some browsers).
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      // Give the print dialog a moment, then remove the iframe.
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        return;
      }
      // Clean up after the user closes/finishes the print dialog.
      win.addEventListener("afterprint", cleanup);
      try {
        win.focus();
        win.print();
      } catch {
        cleanup();
      }
    };

    document.body.appendChild(iframe);
    // srcdoc renders the HTML in-document without navigation or a new window.
    iframe.srcdoc = html;
    return true;
  } catch {
    // Last-resort fallback: download an .html file the user can open & print.
    try {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "configuracao-impostos-mercato.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    } catch {
      return false;
    }
  }
}
