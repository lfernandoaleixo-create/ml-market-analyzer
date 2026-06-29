import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/** Coluna a ser exportada: rótulo + função que extrai o valor textual da linha. */
export type ExportColumn = {
  label: string;
  value: (row: Record<string, unknown>, index: number) => string;
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
  const { headers, body } = buildMatrix(columns, rows);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(14);
  doc.text(title, 24, 36);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${rows.length} ${rows.length === 1 ? "registro" : "registros"} · gerado em ${new Date().toLocaleString("pt-BR")}`,
    24,
    52,
  );

  autoTable(doc, {
    head: [headers],
    body,
    startY: 64,
    styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [13, 148, 136], textColor: 255, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: [245, 247, 247] },
    margin: { left: 24, right: 24 },
  });

  doc.save(`${title}-${todayStamp()}.pdf`);
}
