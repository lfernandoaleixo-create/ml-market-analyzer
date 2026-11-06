import type { jsPDF } from "jspdf";
import type {
  ProductReportRecord,
  ScenarioMatrixResult,
} from "@shared/alpha/decisionReport";
import { MANDATORY_FREE_SHIPPING_CHOICE_REASON } from "@shared/alpha/freeShippingControl";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const SLOT_HEIGHT = PAGE_HEIGHT / 2;
const BODY_START = 15;
const ROW_STEP = 15.2;
const PANEL_HEIGHT = 14.4;
const ROW_GUTTER = ROW_STEP - PANEL_HEIGHT;
const BODY_END = BODY_START + ROW_STEP * 7 + PANEL_HEIGHT;
const LEGEND_FONT_SIZE = 5.2;
const LEGEND_LINE_HEIGHT_FACTOR = 1.15;

/** Reserve a real gap above the caption; never overflow into another slot. */
export function compactLegendFits(lineCount: number): boolean {
  if (!Number.isInteger(lineCount) || lineCount < 1) return false;
  const lineStep = LEGEND_FONT_SIZE * (25.4 / 72) * LEGEND_LINE_HEIGHT_FACTOR;
  const lastBaseline = BODY_END + 4.1 + (lineCount - 1) * lineStep;
  return lastBaseline <= SLOT_HEIGHT - 1.75 - 2.5;
}

const PURPLE_DARK = [57, 24, 116] as const;
const PURPLE = [103, 69, 139] as const;
const GREEN = [22, 128, 91] as const;
const BLUE = [62, 91, 149] as const;
const GRAY = [107, 114, 128] as const;
const TEXT = [45, 35, 56] as const;
const BORDER = [211, 204, 224] as const;
const PALE = [249, 247, 252] as const;
const PALE_GREEN = [235, 250, 243] as const;
const PALE_GRAY = [245, 246, 248] as const;

const AD_X = 8;
const AD_W = 16;
const DEST_X = 30;
const DEST_W = 20;
const CLASSIC_X = 57;
const PREMIUM_X = 126;
const PANEL_W = 66;

export interface CompactFlowPdfOptions {
  /** Exactly four distinct, explicitly chosen margin goals. */
  margins: readonly number[];
  /** Add a continuation page before drawing the first pair of flow slots. */
  useFirstPage?: boolean;
  printMode?: "duplex" | "twoSheets";
}

type RGB = readonly [number, number, number];
type Box = { x: number; y: number; w: number; h: number };
type Shipping = "auto" | "rapid";
type Destination = "inside" | "outside";
type Listing = "classic" | "premium";

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function money(value: number | null | undefined): string {
  if (!finite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function abbreviate(value: unknown, limit: number): string {
  const text = clean(value) || "Produto sem nome";
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

function setFill(doc: jsPDF, color: RGB): void {
  doc.setFillColor(color[0], color[1], color[2]);
}

function setDraw(doc: jsPDF, color: RGB): void {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function setText(doc: jsPDF, color: RGB): void {
  doc.setTextColor(color[0], color[1], color[2]);
}

function labelMoney(value: number | null | undefined): string {
  return money(value).replace(/\u00a0/g, " ");
}

function compactMoney(value: number | null | undefined): string {
  return labelMoney(value).replace(/^R\$\s*/u, "");
}

function normalizeMargins(margins: readonly number[]): number[] {
  return [...new Set(margins.filter(finite))].sort((a, b) => a - b);
}

function rowFor(
  rows: readonly ScenarioMatrixResult[],
  margin: number,
  adsAmount: number,
  destination: Destination,
  listing: Listing,
  shippingMode: Shipping
): ScenarioMatrixResult | undefined {
  return rows.find(
    row =>
      row.marginGoal === margin &&
      row.adsAmount === adsAmount &&
      row.destination === destination &&
      row.listing === listing &&
      row.shippingMode === shippingMode
  );
}

function rowReason(row: ScenarioMatrixResult | undefined): string | undefined {
  if (!row) return "Linha de matriz ausente; nenhuma cotação foi inventada.";
  if (row.valid) return undefined;
  return row.reason || "Cenário indisponível para o perfil Alpha.";
}

function drawArrow(
  doc: jsPDF,
  from: Box,
  to: Box,
  color: RGB,
  routeY?: number
): void {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const bendY = routeY ?? y1;
  const midX = Math.max(x1 + 1.2, Math.min(x2 - 1.2, (x1 + x2) / 2));
  setDraw(doc, color);
  setFill(doc, color);
  doc.setLineWidth(0.25);
  doc.line(x1, y1, midX, y1);
  if (Math.abs(bendY - y1) > 0.01) doc.line(midX, y1, midX, bendY);
  doc.line(midX, bendY, x2 - 1.15, bendY);
  if (Math.abs(y2 - bendY) > 0.01) doc.line(x2 - 1.15, bendY, x2 - 1.15, y2);
  doc.triangle(x2, y2, x2 - 1.35, y2 - 0.8, x2 - 1.35, y2 + 0.8, "F");
}

function drawDownArrow(
  doc: jsPDF,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: RGB
): void {
  setDraw(doc, color);
  setFill(doc, color);
  doc.setLineWidth(0.2);
  doc.line(x1, y1, x2, y2 - 0.85);
  doc.triangle(x2, y2, x2 - 0.75, y2 - 1.25, x2 + 0.75, y2 - 1.25, "F");
}

function drawNode(
  doc: jsPDF,
  box: Box,
  title: string,
  fill: RGB,
  border: RGB,
  fontSize: number
): void {
  setFill(doc, fill);
  setDraw(doc, border);
  doc.setLineWidth(0.22);
  doc.roundedRect(box.x, box.y, box.w, box.h, 1.2, 1.2, "FD");
  setText(doc, TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.text(title, box.x + box.w / 2, box.y + box.h / 2 + 1.35, {
    align: "center",
  });
}

function drawLeaf(
  doc: jsPDF,
  box: Box,
  row: ScenarioMatrixResult | undefined,
  reasonRef: string | undefined
): void {
  const valid = !!row?.valid && finite(row?.price) && finite(row?.shipping);
  const blocked = !valid;
  setFill(doc, valid ? PALE_GREEN : PALE_GRAY);
  setDraw(doc, valid ? GREEN : GRAY);
  doc.setLineWidth(valid ? 0.3 : 0.22);
  doc.roundedRect(box.x, box.y, box.w, box.h, 0.85, 0.85, "FD");
  setText(doc, valid ? GREEN : GRAY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.6);
  doc.text(
    row?.shippingMode === "rapid" ? "Com frete" : "Sem frete",
    box.x + box.w / 2,
    box.y + 2.5,
    { align: "center" }
  );
  if (valid) {
    setText(doc, TEXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.text(labelMoney(row.price), box.x + box.w / 2, box.y + 6.45, {
      align: "center",
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.text(
      `L ${compactMoney(row.result?.profit)} · F ${compactMoney(row.shipping)}`,
      box.x + box.w / 2,
      box.y + 9.55,
      { align: "center" }
    );
    return;
  }
  setText(doc, GRAY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.1);
  doc.text(
    row?.reason === MANDATORY_FREE_SHIPPING_CHOICE_REASON
      ? "Não permitido"
      : "Indisponível",
    box.x + box.w / 2,
    box.y + 6.2,
    { align: "center" }
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.1);
  doc.text(reasonRef || "R?", box.x + box.w / 2, box.y + 9.1, {
    align: "center",
  });
}

function drawListingPanel(
  doc: jsPDF,
  x: number,
  y: number,
  listing: Listing,
  margin: number,
  rows: readonly ScenarioMatrixResult[],
  adsAmount: number,
  destination: Destination,
  reasons: Map<string, string>
): void {
  const panel: Box = { x, y, w: PANEL_W, h: PANEL_HEIGHT };
  const panelRows = (["auto", "rapid"] as Shipping[]).map(shippingMode =>
    rowFor(rows, margin, adsAmount, destination, listing, shippingMode)
  );
  const panelValid = panelRows.some(row => row?.valid);
  setFill(doc, panelValid ? PALE : [248, 248, 250]);
  setDraw(doc, panelValid ? BLUE : GRAY);
  doc.setLineWidth(0.28);
  doc.roundedRect(panel.x, panel.y, panel.w, panel.h, 1.05, 1.05, "FD");
  setText(doc, panelValid ? PURPLE_DARK : GRAY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.7);
  doc.text(listing === "classic" ? "CLÁSSICO" : "PREMIUM", x + 2, y + 3.35);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.25);
  doc.text("2 opções de envio", x + PANEL_W - 2, y + 3.35, { align: "right" });

  const leafGap = 1.2;
  const leafX = x + 2;
  const leafY = y + 4.25;
  const leafW = (PANEL_W - 4 - leafGap) / 2;
  const leafH = 9.35;
  panelRows.forEach((row, index) => {
    const leaf: Box = {
      x: leafX + index * (leafW + leafGap),
      y: leafY,
      w: leafW,
      h: leafH,
    };
    const reason = rowReason(row);
    const ref = reason ? reasons.get(reason) : undefined;
    drawLeaf(doc, leaf, row, ref);
    drawDownArrow(
      doc,
      x + PANEL_W / 2,
      y + 3.55,
      leaf.x + leaf.w / 2,
      leaf.y,
      row?.valid ? GREEN : GRAY
    );
  });
}

function drawHeader(
  doc: jsPDF,
  top: number,
  margin: number,
  flowIndex: number,
  record: ProductReportRecord,
  rowCount: number
): void {
  setFill(doc, PURPLE_DARK);
  doc.rect(0, top, PAGE_WIDTH, 10.7, "F");
  setText(doc, [255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.1);
  doc.text(`ALPHA · Verde · Agência · meta ${margin}%`, 8, top + 4.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.55);
  doc.text(abbreviate(record.input.description, 52), 8, top + 8.2);
  doc.text(
    `Fluxo ${flowIndex}/4 · ${rowCount} caminhos`,
    PAGE_WIDTH - 8,
    top + 4.2,
    {
      align: "right",
    }
  );
  doc.text(
    `${record.input.productType === "kit" ? "KIT" : "Produto"} · R$2 / R$4 / R$6 / R$8 · dentro/fora · Cl/Prem · auto/rapid`,
    PAGE_WIDTH - 8,
    top + 8.2,
    { align: "right" }
  );
}

function drawSlot(
  doc: jsPDF,
  top: number,
  margin: number,
  flowIndex: number,
  record: ProductReportRecord,
  rows: readonly ScenarioMatrixResult[]
): void {
  const reasons = new Map<string, string>();
  const reasonFor = (reason: string): string => {
    const existing = reasons.get(reason);
    if (existing) return existing;
    const ref = `R${reasons.size + 1}`;
    reasons.set(reason, ref);
    return ref;
  };
  const rowPairs = [2, 4, 6, 8].flatMap(adsAmount =>
    (["inside", "outside"] as Destination[]).map(destination => ({
      adsAmount,
      destination,
    }))
  );
  for (const { adsAmount, destination } of rowPairs) {
    (["classic", "premium"] as Listing[]).forEach(listing => {
      (["auto", "rapid"] as Shipping[]).forEach(shippingMode => {
        const reason = rowReason(
          rowFor(rows, margin, adsAmount, destination, listing, shippingMode)
        );
        if (reason) reasonFor(reason);
      });
    });
  }

  drawHeader(doc, top, margin, flowIndex, record, rows.length);
  setText(doc, PURPLE_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.2);
  doc.text("PUBLICIDADE", AD_X, top + 13.1);
  doc.text("DESTINO", DEST_X, top + 13.1);
  doc.text("CAMINHOS DE ANÚNCIO", CLASSIC_X, top + 13.1);

  rowPairs.forEach(({ adsAmount, destination }, rowIndex) => {
    const y = top + BODY_START + rowIndex * ROW_STEP;
    const ad: Box = { x: AD_X, y: y + 2.2, w: AD_W, h: 9.8 };
    const dest: Box = { x: DEST_X, y: y + 2.2, w: DEST_W, h: 9.8 };
    drawNode(
      doc,
      ad,
      labelMoney(adsAmount),
      [255, 249, 220],
      [198, 157, 42],
      5.9
    );
    drawNode(
      doc,
      dest,
      destination === "inside" ? "Dentro" : "Fora",
      PALE,
      BLUE,
      5.5
    );
    drawArrow(doc, ad, dest, PURPLE);

    const classic: Box = { x: CLASSIC_X, y, w: PANEL_W, h: PANEL_HEIGHT };
    const premium: Box = { x: PREMIUM_X, y, w: PANEL_W, h: PANEL_HEIGHT };
    drawArrow(doc, dest, classic, BLUE);
    // Route the Premium branch through the 1 mm gutter above the Classic
    // panel. It never crosses the previous row's panel or its text.
    const premiumRouteY = y - Math.max(0.35, ROW_GUTTER / 2);
    drawArrow(doc, dest, premium, BLUE, premiumRouteY);
    drawListingPanel(
      doc,
      CLASSIC_X,
      y,
      "classic",
      margin,
      rows,
      adsAmount,
      destination,
      reasons
    );
    drawListingPanel(
      doc,
      PREMIUM_X,
      y,
      "premium",
      margin,
      rows,
      adsAmount,
      destination,
      reasons
    );
  });

  setDraw(doc, BORDER);
  doc.setLineWidth(0.25);
  doc.line(8, top + BODY_END + 1.1, PAGE_WIDTH - 8, top + BODY_END + 1.1);
  setText(doc, GRAY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(LEGEND_FONT_SIZE);
  const legend = [...reasons.entries()].map(
    ([reason, ref]) => `${ref}: ${reason}`
  );
  const legendText =
    legend.length > 0
      ? `Bloqueios oficiais (sem preço/frete fictício): ${legend.join(" · ")}`
      : "Sem bloqueios: todas as 32 combinações possuem cotação.";
  const legendLines = doc.splitTextToSize(
    legendText,
    PAGE_WIDTH - 16
  ) as string[];
  if (!compactLegendFits(legendLines.length)) {
    throw new Error(
      "Os motivos de bloqueio são extensos demais para meia página sem cortes. Corrija os dados incompletos ou escolha Todos os caminhos — PDF paginado."
    );
  }
  doc.text(legendLines, 8, top + BODY_END + 4.1, {
    lineHeightFactor: LEGEND_LINE_HEIGHT_FACTOR,
  });
  doc.text(
    "Setas indicam publicidade, destino, anúncio e resultado. Verde = cotado; cinza = não permitido/indisponível.",
    8,
    top + SLOT_HEIGHT - 1.75
  );
}

/**
 * Render exactly four Alpha comparison diagrams, two portrait slots per A4.
 * Each selected margin owns one diagram and has 8 rows × 4 leaves = 32 paths.
 */
export function appendCompactFlowDiagramPages(
  doc: jsPDF,
  record: ProductReportRecord,
  rows: readonly ScenarioMatrixResult[],
  options: CompactFlowPdfOptions
): number {
  const margins = normalizeMargins(options.margins);
  if (margins.length !== 4) {
    throw new Error(
      "O fluxo compacto exige exatamente quatro margens explícitas."
    );
  }
  const rowsByMargin = margins.map(margin =>
    rows.filter(row => row.marginGoal === margin)
  );
  if (rows.some(row => !margins.includes(row.marginGoal))) {
    throw new Error(
      "A matriz compacta contém uma margem fora da seleção explícita."
    );
  }

  let pageCount = 0;
  margins.forEach((margin, index) => {
    if (index === 0 && !options.useFirstPage) doc.addPage("a4", "portrait");
    if (index > 0 && index % 2 === 0) doc.addPage("a4", "portrait");
    const slot = index % 2;
    drawSlot(
      doc,
      slot * SLOT_HEIGHT,
      margin,
      index + 1,
      record,
      rowsByMargin[index]
    );
    if (slot === 1) pageCount += 1;
  });
  if (margins.length % 2 !== 0) pageCount += 1;
  return pageCount;
}

export const COMPACT_FLOW_GEOMETRY = Object.freeze({
  pageWidth: PAGE_WIDTH,
  pageHeight: PAGE_HEIGHT,
  slotHeight: SLOT_HEIGHT,
  bodyStart: BODY_START,
  bodyEnd: BODY_END,
  rowStep: ROW_STEP,
  panelHeight: PANEL_HEIGHT,
  rowGutter: ROW_GUTTER,
  adX: AD_X,
  adWidth: AD_W,
  destinationX: DEST_X,
  destinationWidth: DEST_W,
  classicX: CLASSIC_X,
  premiumX: PREMIUM_X,
  panelWidth: PANEL_W,
});
