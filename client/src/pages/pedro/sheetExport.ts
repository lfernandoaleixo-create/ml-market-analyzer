import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/** Coluna a ser exportada: rótulo + função que extrai o valor textual da linha. */
export type ExportColumn = {
  label: string;
  value: (row: Record<string, unknown>, index: number) => string;
  /** Largura relativa (peso) para distribuição proporcional no PDF. Default = 1. */
  pdfWidth?: number;
  /** Se true, coluna é omitida do PDF (mas incluída no Excel). */
  pdfHide?: boolean;
};

function todayStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildMatrix(
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
): { headers: string[]; body: string[][] } {
  const headers = columns.map((c) => c.label);
  const body = rows.map((row, idx) =>
    columns.map((c) => {
      const v = c.value(row, idx);
      return v == null ? "" : String(v);
    }),
  );
  return { headers, body };
}

/** Exporta para arquivo .xlsx (Excel). */
export function exportToExcel(
  sheetName: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
) {
  const { headers, body } = buildMatrix(columns, rows);
  const aoa = [headers, ...body];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // largura automática simples por coluna (entre 8 e 60 chars)
  ws["!cols"] = headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...body.map((r) => (r[i] ? String(r[i]).length : 0)),
    );
    return { wch: Math.min(Math.max(maxLen + 2, 8), 60) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Planilha");
  XLSX.writeFile(wb, `${sheetName}-${todayStamp()}.xlsx`);
}

/** Exporta para arquivo .pdf (tabela paisagem). */
export function exportToPdf(
  title: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
) {
  // Filtrar colunas marcadas como pdfHide
  const pdfColumns = columns.filter((c) => !c.pdfHide);
  const { headers, body } = buildMatrix(pdfColumns, rows);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  // Página A4 landscape: 842 x 595 pt
  const pageWidth = 842;
  const marginLeft = 20;
  const marginRight = 20;
  const usableWidth = pageWidth - marginLeft - marginRight;

  doc.setFontSize(14);
  doc.text(title, marginLeft, 32);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${rows.length} ${rows.length === 1 ? "registro" : "registros"} · gerado em ${new Date().toLocaleString("pt-BR")}`,
    marginLeft,
    46,
  );
  doc.setTextColor(0);

  // Calcular larguras proporcionais baseadas em pdfWidth
  const totalWeight = pdfColumns.reduce((sum, c) => sum + (c.pdfWidth ?? 1), 0);
  const columnStyles: Record<number, { cellWidth: number }> = {};
  pdfColumns.forEach((col, i) => {
    const weight = col.pdfWidth ?? 1;
    columnStyles[i] = { cellWidth: (weight / totalWeight) * usableWidth };
  });

  autoTable(doc, {
    head: [headers],
    body,
    startY: 56,
    styles: {
      fontSize: 6.5,
      cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 },
      overflow: "linebreak",
      valign: "top",
      lineWidth: 0.25,
      lineColor: [200, 200, 200],
    },
    headStyles: {
      fillColor: [13, 148, 136],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 6.5,
      cellPadding: { top: 3, right: 2, bottom: 3, left: 2 },
      halign: "center",
    },
    alternateRowStyles: { fillColor: [245, 247, 247] },
    columnStyles,
    margin: { left: marginLeft, right: marginRight, top: 56 },
    tableWidth: usableWidth,
    didDrawPage: (data) => {
      // Footer com número da página
      const pageCount = doc.getNumberOfPages();
      const currentPage = data.pageNumber;
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(
        `Página ${currentPage} de ${pageCount}`,
        pageWidth - marginRight,
        585,
        { align: "right" },
      );
      // Header repetido nas páginas seguintes
      if (currentPage > 1) {
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text(title, marginLeft, 28);
        doc.setFontSize(7);
        doc.setTextColor(120);
        doc.text(`(continuação)`, marginLeft + doc.getTextWidth(title) + 6, 28);
      }
    },
  });

  doc.save(`${title}-${todayStamp()}.pdf`);
}
