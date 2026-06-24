import type { ListingRow } from "@shared/account";
import {
  buildListingsReportTable,
  type ExportPdfOpts,
} from "@shared/listingsReport";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type { ExportPdfOpts };

// Paleta da marca / relatório.
const SLATE_900: [number, number, number] = [30, 41, 59]; // títulos
const SLATE_700: [number, number, number] = [51, 65, 85]; // cabeçalho da tabela (azul-ardósia suave)
const SLATE_500: [number, number, number] = [100, 116, 139]; // textos secundários
const SLATE_400: [number, number, number] = [148, 163, 184];
const ROW_ZEBRA: [number, number, number] = [248, 250, 252]; // slate-50 (linhas pares)
const ORANGE_ODD: [number, number, number] = [255, 247, 237]; // orange-50 (dias, linhas ímpares)
const ORANGE_EVEN: [number, number, number] = [255, 237, 213]; // orange-100 (dias, linhas pares)
const ORANGE_BADGE: [number, number, number] = [234, 88, 12]; // orange-600 (badge do filtro)
const TEXT_DARK: [number, number, number] = [24, 24, 27];
const LINE: [number, number, number] = [226, 232, 240];

/**
 * Gera um PDF (paisagem, A4) com a lista de anúncios filtrada/ordenada e
 * dispara o DOWNLOAD direto do arquivo — sem abrir a janela de impressão.
 * A montagem dos dados tabulares vive em `@shared/listingsReport`
 * (função pura, testável); aqui ficam apenas a renderização do PDF e o save.
 */
export function exportListingsPdf(items: ListingRow[], opts: ExportPdfOpts = {}) {
  const table = buildListingsReportTable(items, opts);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 28;

  const generatedAt = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // ── Cabeçalho da marca ────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...SLATE_900);
  doc.text("TOUJOURS", marginX, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_400);
  doc.text("MARKET INTELLIGENCE", marginX, 52);

  // Meta (à direita)
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_500);
  doc.text(`Gerado em ${generatedAt}`, pageWidth - marginX, 40, { align: "right" });
  doc.text(`${table.count} anúncio(s)`, pageWidth - marginX, 52, { align: "right" });

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...SLATE_900);
  doc.text("Relatório de anúncios", marginX, 76);

  let startY = 88;

  // ── Badge do filtro ativo ─────────────────────────────────────────────────
  if (table.filtersLabel) {
    const badgeText = `Filtro: ${table.filtersLabel}`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const textW = doc.getTextWidth(badgeText);
    const padX = 8;
    const badgeW = textW + padX * 2;
    const badgeH = 16;
    const badgeY = 82;
    doc.setFillColor(...ORANGE_BADGE);
    doc.roundedRect(marginX, badgeY, badgeW, badgeH, 4, 4, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(badgeText, marginX + padX, badgeY + 11);
    startY = badgeY + badgeH + 10;
  } else if (table.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...SLATE_500);
    doc.text(table.subtitle, marginX, 90);
    startY = 100;
  }

  // ── Estilos de coluna ──────────────────────────────────────────────────────
  // Tudo centralizado por padrão; apenas Anúncio fica à esquerda (texto longo).
  const dayStart = table.dayColStart;
  const dayEnd = dayStart + table.dayColCount; // exclusivo

  const columnStyles: Record<
    number,
    { halign?: "left" | "right" | "center"; valign?: "middle"; cellWidth?: number }
  > = {
    0: { halign: "left", valign: "middle", cellWidth: 150 }, // Anúncio
  };
  for (let i = 1; i < table.head.length; i++) {
    columnStyles[i] = { halign: "center", valign: "middle" };
  }

  autoTable(doc, {
    head: [table.head],
    body: table.rows,
    startY,
    margin: { left: marginX, right: marginX },
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 3,
      overflow: "linebreak",
      textColor: TEXT_DARK,
      lineColor: LINE,
      lineWidth: 0.5,
      halign: "center",
      valign: "middle",
    },
    headStyles: {
      fillColor: SLATE_700,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "center",
      valign: "middle",
    },
    alternateRowStyles: { fillColor: ROW_ZEBRA },
    columnStyles,
    // Zebrado laranja SOMENTE nas colunas de dia (alterna por linha), suave o
    // bastante para manter os números legíveis.
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const col = data.column.index;
      if (col >= dayStart && col < dayEnd) {
        const even = data.row.index % 2 === 0;
        data.cell.styles.fillColor = even ? ORANGE_EVEN : ORANGE_ODD;
      }
    },
    didDrawPage: () => {
      const ph = doc.internal.pageSize.getHeight();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE_400);
      doc.text(
        "TOUJOURS — Sempre presente · Relatório gerado pelo painel de inteligência de mercado",
        pageWidth / 2,
        ph - 14,
        { align: "center" },
      );
    },
  });

  const filename = `meus-anuncios-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
