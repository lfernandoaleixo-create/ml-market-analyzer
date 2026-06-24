import type { ListingRow } from "@shared/account";
import {
  buildListingsReportTable,
  type ExportPdfOpts,
} from "@shared/listingsReport";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type { ExportPdfOpts };

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
  doc.setTextColor(17, 17, 17);
  doc.text("TOUJOURS", marginX, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);
  doc.text("MARKET INTELLIGENCE", marginX, 52);

  // Meta (à direita)
  doc.setFontSize(9);
  doc.setTextColor(82, 82, 91);
  doc.text(`Gerado em ${generatedAt}`, pageWidth - marginX, 40, { align: "right" });
  doc.text(`${table.count} anúncio(s)`, pageWidth - marginX, 52, { align: "right" });

  // Título + subtítulo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(17, 17, 17);
  doc.text("Relatório de anúncios", marginX, 76);
  let startY = 86;
  if (table.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(82, 82, 91);
    doc.text(table.subtitle, marginX, 90);
    startY = 100;
  }

  // ── Tabela ────────────────────────────────────────────────────────────────
  // Quais índices de coluna são numéricos/centralizados (dias) ou à direita.
  const dayStart = 6; // após Anúncio, SKU, Preço, Estoque, Vendas, Visitas
  const dayEnd = dayStart + table.dayColCount; // exclusivo
  const rightCols = new Set<number>([2, 3, 4, 5, dayEnd, dayEnd + 1]); // Preço..Visitas, Conversão, Saúde
  const centerCols = new Set<number>();
  for (let i = dayStart; i < dayEnd; i++) centerCols.add(i);

  const columnStyles: Record<number, { halign?: "left" | "right" | "center"; cellWidth?: number }> = {
    0: { halign: "left", cellWidth: 150 }, // Anúncio
    1: { halign: "left" }, // SKU
  };
  Array.from(rightCols).forEach((c) => {
    columnStyles[c] = { ...(columnStyles[c] ?? {}), halign: "right" };
  });
  Array.from(centerCols).forEach((c) => {
    columnStyles[c] = { ...(columnStyles[c] ?? {}), halign: "center" };
  });

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
      textColor: [24, 24, 27],
      lineColor: [228, 228, 231],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [17, 17, 17],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles,
    didDrawPage: () => {
      const ph = doc.internal.pageSize.getHeight();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(161, 161, 170);
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
