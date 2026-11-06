import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import {
  buildFlowSource,
  buildSelectedFlowRows,
  buildSelectedScenarioRows,
  getReportAcquisition,
  groupEquivalentScenarioRows,
  resolveProductReport,
  scenarioMatrixToCsv,
  MATRIX_SHIPPING_LABELS,
  type FlowSource,
  type ProductReportRecord,
  type ScenarioMatrixResult,
  type ScenarioLogisticGroup,
} from "@shared/alpha/decisionReport";
import {
  getStateTaxRates,
  type PricingInput,
  type PricingResult,
} from "@shared/alpha/pricing";
import { alphaComparisonRecord } from "@shared/alpha/alphaProfile";
import { getPackagingPreset } from "@shared/alpha/packagingCatalog";
import { mandatoryFreeShippingChoiceReason } from "@shared/alpha/freeShippingControl";
import { appendCompactFlowDiagramPages } from "./flowCompactPdfPages";
import { appendFlowDiagramPages } from "./flowPdfPages";

export type ProductPdfPrintMode = "duplex" | "twoSheets";
export type ProductPdfScope = "compact" | "complete" | "selected";

export interface ProductPdfOptions {
  printMode?: ProductPdfPrintMode;
  scope?: ProductPdfScope;
  /** Explicit comparison profile; legacy calls remain unchanged when absent. */
  profile?: "alpha";
  /** Four explicit margin goals for the Alpha compact renderer. */
  compactMargins?: readonly number[];
  /** Include the faithful historical first sheet; defaults to true. */
  includeProductSheet?: boolean;
  /** Complete matrix rows, normally produced by generateScenarioMatrix. */
  matrix?: readonly ScenarioMatrixResult[];
  /** Optional prebuilt deterministic flow source for reproducible rendering. */
  flow?: FlowSource;
}

type RGB = [number, number, number];
type Orientation = "portrait" | "landscape";
type PageSpec = {
  width: number;
  height: number;
  left: number;
  right: number;
  contentWidth: number;
};

const PURPLE: RGB = [91, 33, 182];
const PURPLE_DARK: RGB = [57, 24, 116];
const YELLOW: RGB = [243, 199, 79];
const GREEN: RGB = [22, 128, 91];
const RED: RGB = [170, 45, 45];
const GRAY: RGB = [107, 114, 128];
const TEXT: RGB = [45, 35, 56];
const LIGHT: RGB = [246, 243, 252];
const BORDER: RGB = [218, 211, 232];
const PALE_GREEN: RGB = [235, 250, 243];
const PALE_RED: RGB = [253, 243, 243];
const PORTRAIT: PageSpec = {
  width: 210,
  height: 297,
  left: 12,
  right: 198,
  contentWidth: 186,
};
const LANDSCAPE: PageSpec = {
  width: 297,
  height: 210,
  left: 10,
  right: 287,
  contentWidth: 277,
};
const MATRIX_MARGINS = [10, 15, 20, 25, 30] as const;
const MATRIX_ADS_AMOUNTS = [2, 4, 6, 8] as const;
const MATRIX_LISTINGS = ["classic", "premium"] as const;
const MATRIX_DESTINATIONS = ["inside", "outside"] as const;
const MATRIX_SHIPPING = ["auto", "rapid"] as const;
const KIT_PREVIEW_LIMIT = 4;
const KIT_DESCRIPTION_PREVIEW_LIMIT = 60;

const LOGISTIC_LABELS: Record<string, string> = {
  agency: "AGENCY",
  collection: "COLETA",
  full: "FULL",
  flex: "FLEX",
  other: "OTHER",
};

function specFor(doc: jsPDF): PageSpec {
  return doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight()
    ? LANDSCAPE
    : PORTRAIT;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function display(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function moneyBR(value: number | null | undefined): string {
  if (!finite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function numberBR(value: number | null | undefined, digits = 2): string {
  if (!finite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function percentBR(value: number | null | undefined): string {
  return finite(value) ? `${numberBR(value)}%` : "—";
}

function rowAdsAmount(row: ScenarioMatrixResult): number | null {
  if (finite(row.adsAmount)) return row.adsAmount;
  // Old exported rows used adsPercent for the same fixed value. Keep reading
  // them, but never label or format the alias as a percentage.
  return finite(row.adsPercent) ? row.adsPercent : null;
}

function textLines(doc: jsPDF, value: unknown, width: number): string[] {
  return doc.splitTextToSize(display(value), width) as string[];
}

function setFill(doc: jsPDF, color: readonly [number, number, number]): void {
  doc.setFillColor(color[0], color[1], color[2]);
}

function setDraw(doc: jsPDF, color: readonly [number, number, number]): void {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function setText(doc: jsPDF, color: readonly [number, number, number]): void {
  doc.setTextColor(color[0], color[1], color[2]);
}

function lastTableY(doc: jsPDF, fallback: number): number {
  return (
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? fallback
  );
}

function drawHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  pageLabel: string,
  record: ProductReportRecord
): void {
  const page = specFor(doc);
  setFill(doc, PURPLE_DARK);
  doc.rect(0, 0, page.width, 24, "F");
  setText(doc, YELLOW);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("ALPHA", page.left, 9);
  setText(doc, [255, 255, 255]);
  doc.setFontSize(page === PORTRAIT ? 10 : 10.5);
  doc.text(title, page.left + 31, 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.text(subtitle, page.left + 31, 15);
  setText(doc, [235, 232, 245]);
  doc.setFontSize(6.6);
  doc.text(pageLabel, page.right, 8, { align: "right" });
  doc.text(`ID ${display(record.id)}`, page.right, 13, { align: "right" });
  doc.text(`SNAPSHOT ${display(record.at)}`, page.right, 18, {
    align: "right",
  });
}

function drawFooter(
  doc: jsPDF,
  record: ProductReportRecord,
  pageNumber: number,
  footerNote = "Frete e tributos são parâmetros da simulação; confirme antes de anunciar."
): void {
  const page = specFor(doc);
  const y = page.height - 8;
  setDraw(doc, BORDER);
  doc.setLineWidth(0.25);
  doc.line(page.left, y, page.right, y);
  setText(doc, GRAY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.text(
    `Alpha | Registro ${display(record.id).slice(0, 24)} | Página ${pageNumber}`,
    page.left,
    page.height - 4
  );
  doc.text(footerNote, page.right, page.height - 4, {
    align: "right",
  });
}

function drawSectionTitle(
  doc: jsPDF,
  title: string,
  x: number,
  y: number,
  width: number
): number {
  setFill(doc, YELLOW);
  doc.roundedRect(x, y, width, 7, 1.4, 1.4, "F");
  setText(doc, PURPLE_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.8);
  doc.text(title, x + 2.5, y + 4.8);
  return y + 10;
}

function drawInfoTable(
  doc: jsPDF,
  startY: number,
  rows: readonly (readonly [string, string, string, string])[]
): number {
  const page = specFor(doc);
  autoTable(doc, {
    startY,
    margin: { left: page.left, right: page.width - page.right },
    tableWidth: page.contentWidth,
    body: rows.map(row => [...row]),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.2,
      cellPadding: 1.8,
      textColor: TEXT,
      lineColor: BORDER,
      lineWidth: 0.18,
      overflow: "linebreak",
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 27, fontStyle: "bold", textColor: GRAY },
      1: { cellWidth: 66 },
      2: { cellWidth: 27, fontStyle: "bold", textColor: GRAY },
      3: { cellWidth: 66 },
    },
    didParseCell(data) {
      if (
        data.section === "body" &&
        (data.column.index === 0 || data.column.index === 2)
      ) {
        data.cell.styles.fillColor = LIGHT;
      }
    },
  });
  return lastTableY(doc, startY + 20);
}

function drawPriceHero(
  doc: jsPDF,
  resolved: ReturnType<typeof resolveProductReport>,
  startY: number
): number {
  const page = specFor(doc);
  const height = 26;
  if (resolved.valid) {
    setFill(doc, PURPLE_DARK);
    doc.roundedRect(
      page.left,
      startY,
      page.contentWidth,
      height,
      2.2,
      2.2,
      "F"
    );
    setText(doc, YELLOW);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.text("PREÇO FINAL DO ANÚNCIO", page.left + 4, startY + 6.5);
    doc.setFontSize(20);
    doc.text(moneyBR(resolved.price), page.left + 4, startY + 19);
    setText(doc, [255, 255, 255]);
    doc.setFontSize(7);
    doc.text(
      `Margem realizada  ${percentBR(resolved.result.margin)}`,
      page.right - 4,
      startY + 7,
      { align: "right" }
    );
    doc.text(
      `Lucro  ${moneyBR(resolved.result.profit)}`,
      page.right - 4,
      startY + 13,
      { align: "right" }
    );
    doc.text(
      `Origem  ${resolved.source === "snapshot" ? "snapshot persistido" : "recalculado"}`,
      page.right - 4,
      startY + 19,
      { align: "right" }
    );
  } else {
    setFill(doc, PALE_RED);
    setDraw(doc, [235, 190, 190]);
    doc.roundedRect(
      page.left,
      startY,
      page.contentWidth,
      height,
      2.2,
      2.2,
      "FD"
    );
    setText(doc, RED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("CENÁRIO NÃO DISPONÍVEL", page.left + 4, startY + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.3);
    doc.text(
      textLines(
        doc,
        resolved.reason || resolved.result.error,
        page.contentWidth - 8
      ).slice(0, 2),
      page.left + 4,
      startY + 15
    );
  }
  return startY + height + 7;
}

function drawAcquisition(
  doc: jsPDF,
  input: PricingInput,
  startY: number,
  annexRequired = false
): number {
  const page = specFor(doc);
  const acquisition = getReportAcquisition(input);
  const y = drawSectionTitle(
    doc,
    input.productType === "kit"
      ? "Aquisição e unidades | composição do KIT"
      : "Aquisição e unidades | produto",
    page.left,
    startY,
    page.contentWidth
  );
  const kitItems =
    input.productType === "kit" && annexRequired
      ? acquisition.items.slice(0, KIT_PREVIEW_LIMIT)
      : acquisition.items;
  const previewDescription = (description: unknown): string => {
    const value = display(description);
    if (!annexRequired || value.length <= KIT_DESCRIPTION_PREVIEW_LIMIT)
      return value;
    return `${value.slice(0, KIT_DESCRIPTION_PREVIEW_LIMIT - 3).trimEnd()}...`;
  };
  const body =
    input.productType === "kit"
      ? kitItems.map(item => [
          display(item.sku),
          previewDescription(item.description),
          numberBR(item.quantity, 0),
          moneyBR(item.unitCost),
          moneyBR(item.subtotal),
        ])
      : [
          [
            display(input.productSku),
            display(input.description),
            numberBR(input.itemQuantity, 0),
            moneyBR(input.cost),
            moneyBR(acquisition.total),
          ],
        ];
  autoTable(doc, {
    startY: y,
    margin: { left: page.left, right: page.width - page.right },
    tableWidth: page.contentWidth,
    head: [["SKU", "Descrição", "Qtd.", "Custo unitário", "Subtotal"]],
    body,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.3,
      cellPadding: 1.7,
      textColor: TEXT,
      lineColor: BORDER,
      lineWidth: 0.18,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: PURPLE,
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [250, 249, 253] },
    columnStyles: {
      0: { cellWidth: 29 },
      1: { cellWidth: 78 },
      2: { cellWidth: 18, halign: "right" },
      3: { cellWidth: 31, halign: "right" },
      4: { cellWidth: 30, halign: "right" },
    },
  });
  const finalY = lastTableY(doc, y + 14);
  setText(doc, PURPLE_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.7);
  doc.text(
    `TOTAL DE AQUISIÇÃO  ${moneyBR(acquisition.total)}`,
    page.right,
    finalY + 6,
    { align: "right" }
  );
  if (input.productType === "kit" && annexRequired) {
    setText(doc, GRAY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.text(
      `Composição completa no anexo: ${acquisition.items.length} componentes.`,
      page.left,
      finalY + 12
    );
    return finalY + 17;
  }
  return finalY + 11;
}

function drawTwoColumnTables(
  doc: jsPDF,
  input: PricingInput,
  result: PricingResult,
  startY: number
): number {
  const page = specFor(doc);
  const gap = 4;
  const width = (page.contentWidth - gap) / 2;
  const leftX = page.left;
  const rightX = page.left + width + gap;
  const leftStart = drawSectionTitle(
    doc,
    "Produto, pacote e custos",
    leftX,
    startY,
    width
  );
  const rightStart = drawSectionTitle(
    doc,
    "Venda, taxas e logística",
    rightX,
    startY,
    width
  );
  const acquisition = getReportAcquisition(input);
  const packagePreset = getPackagingPreset(input.packagingPreset);
  const value = (amount: number) =>
    result.valid ? moneyBR(amount) : "Indisponível";
  const volume =
    input.length > 0 && input.width > 0 && input.height > 0
      ? (input.length * input.width * input.height) / 6000
      : NaN;
  const leftRows: Array<[string, string, string, string]> = [
    [
      "Aquisição total",
      moneyBR(acquisition.total),
      "Unidade",
      input.productType === "kit" ? "KIT" : "Unidade",
    ],
    [
      "Quantidade total",
      numberBR(acquisition.quantity, 0),
      "Peso físico",
      `${numberBR(input.weight)} kg`,
    ],
    [
      "Embalagem",
      packagePreset
        ? `${packagePreset.label} (${packagePreset.sideA} x ${packagePreset.sideB} cm)`
        : "Manual",
      "Origem do peso",
      input.weightInputMode === "band" ? "Faixa estimada" : "Peso informado",
    ],
    [
      "Dimensões",
      `${numberBR(input.length)} x ${numberBR(input.width)} x ${numberBR(input.height)} cm`,
      "Peso volumétrico",
      `${numberBR(volume)} kg`,
    ],
    [
      "Operação",
      moneyBR(input.operation),
      "Embalagem (custo)",
      moneyBR(input.packaging),
    ],
    [
      "Frete calculado",
      value(result.shipping),
      "Peso considerado",
      result.valid ? `${numberBR(result.weightUsed)} kg` : "Indisponível",
    ],
    ...(input.promotion || input.reservePercent
      ? [
          [
            "Promoção (legado)",
            moneyBR(input.promotion),
            "Reserva (legado)",
            percentBR(input.reservePercent),
          ] as [string, string, string, string],
        ]
      : []),
  ];
  const rates = getStateTaxRates(input);
  const adsValue =
    input.adsMode === "percent" ? percentBR(input.ads) : moneyBR(input.ads);
  const activeDifalValue =
    input.difalMode === "rs"
      ? moneyBR(rates.difalFixed)
      : percentBR(rates.difalPercent);
  const externalDifalValue =
    input.difalMode === "rs"
      ? moneyBR(input.taxDifalValue)
      : percentBR(input.taxDifal);
  const rightRows: Array<[string, string, string, string]> = [
    [
      "Publicidade (entrada)",
      adsValue,
      "Anúncio",
      input.listing === "classic" ? "Clássico" : "Premium",
    ],
    [
      "Comissão Clássico",
      percentBR(input.classicRate),
      "Comissão Premium",
      percentBR(input.premiumRate),
    ],
    [
      "Logística",
      (
        {
          agency: "Agência",
          collection: "Coleta",
          full: "Full",
          flex: "Flex",
          other: "Envio próprio",
        } as Record<string, string>
      )[input.logistic] || display(input.logistic),
      "Frete (opção)",
      input.shippingMode === "manual"
        ? "Manual (legado)"
        : mandatoryFreeShippingChoiceReason(input, result)
          ? "Frete grátis obrigatório"
          : MATRIX_SHIPPING_LABELS[input.shippingMode],
    ],
    [
      "Federal (total)",
      percentBR(input.taxFederal),
      "PIS / COFINS",
      `${percentBR(input.taxPis)} / ${percentBR(input.taxCofins)}`,
    ],
    [
      "IRPJ / CSLL",
      `${percentBR(input.taxIrpj)} / ${percentBR(input.taxCsll)}`,
      "ICMS de venda",
      percentBR(rates.icmsSale),
    ],
    [
      "ICMS transferência",
      percentBR(rates.icmsTransfer),
      "DIFAL ativo",
      activeDifalValue,
    ],
    [
      "Destino",
      input.saleDestination === "outside"
        ? "Fora do estado"
        : input.useDestinationTaxes
          ? "Dentro do estado"
          : "Não segregado",
      "DIFAL configurado",
      externalDifalValue,
    ],
    [
      "Extra Full (entrada)",
      moneyBR(input.fullExtra),
      "Faixa de preço",
      result.valid ? display(result.priceBand) : "Indisponível",
    ],
  ];
  const drawTable = (
    x: number,
    y: number,
    rows: readonly (readonly [string, string, string, string])[]
  ) => {
    autoTable(doc, {
      startY: y,
      margin: { left: x, right: page.width - x - width },
      tableWidth: width,
      body: rows.map(row => [...row]),
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 6.7,
        cellPadding: 1.4,
        textColor: TEXT,
        lineColor: BORDER,
        lineWidth: 0.16,
        overflow: "linebreak",
        valign: "middle",
      },
      columnStyles: {
        0: {
          cellWidth: 21,
          fontStyle: "bold",
          textColor: GRAY,
          fillColor: LIGHT,
        },
        1: { cellWidth: 25 },
        2: {
          cellWidth: 21,
          fontStyle: "bold",
          textColor: GRAY,
          fillColor: LIGHT,
        },
        3: { cellWidth: 24 },
      },
    });
    return lastTableY(doc, y + 30);
  };
  const leftEnd = drawTable(leftX, leftStart, leftRows);
  const rightEnd = drawTable(rightX, rightStart, rightRows);
  return Math.max(leftEnd, rightEnd);
}

function drawCostGrid(
  doc: jsPDF,
  result: PricingResult,
  valid: boolean,
  startY: number
): number {
  const page = specFor(doc);
  const value = (amount: number): string => (valid ? moneyBR(amount) : "—");
  const y = drawSectionTitle(
    doc,
    "Composição do custo e resultado",
    page.left,
    startY,
    page.contentWidth
  );
  autoTable(doc, {
    startY: y,
    margin: { left: page.left, right: page.width - page.right },
    tableWidth: page.contentWidth,
    body: [
      [
        "Produto / aquisição",
        value(result.productCost),
        "Operação",
        value(result.operation),
        "Embalagem",
        value(result.packaging),
      ],
      [
        "Frete",
        value(result.shipping),
        "Comissão",
        value(result.commission),
        "Publicidade",
        value(result.ads),
      ],
      [
        "Impostos",
        value(result.taxes),
        "Extra Full",
        value(result.fullExtra),
        "CUSTO TOTAL",
        value(result.totalCosts),
      ],
    ],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 6.9,
      cellPadding: 1.7,
      lineColor: BORDER,
      lineWidth: 0.16,
      textColor: TEXT,
    },
    columnStyles: {
      0: {
        cellWidth: 31,
        fontStyle: "bold",
        textColor: GRAY,
        fillColor: LIGHT,
      },
      1: { cellWidth: 31, halign: "right" },
      2: {
        cellWidth: 27,
        fontStyle: "bold",
        textColor: GRAY,
        fillColor: LIGHT,
      },
      3: { cellWidth: 31, halign: "right" },
      4: {
        cellWidth: 29,
        fontStyle: "bold",
        textColor: GRAY,
        fillColor: LIGHT,
      },
      5: { cellWidth: 37, halign: "right" },
    },
    didParseCell(data) {
      if (data.section === "body" && data.row.index === 2)
        data.cell.styles.fillColor = [241, 236, 249];
    },
  });
  return lastTableY(doc, y + 25);
}

function drawFirstPage(
  doc: jsPDF,
  record: ProductReportRecord,
  annexRequired: boolean
): void {
  const resolved = resolveProductReport(record);
  const input = resolved.input;
  drawHeader(
    doc,
    "Relatório de decisão de preço",
    "Snapshot original | aquisição, anúncio, frete e impostos",
    "1 / DADOS",
    record
  );
  const page = specFor(doc);
  let y = 30;
  y = drawSectionTitle(
    doc,
    "Identificação e entrada da simulação",
    page.left,
    y,
    page.contentWidth
  );
  y =
    drawInfoTable(doc, y, [
      [
        "Descrição",
        display(input.description),
        "SKU",
        display(input.productType === "kit" ? input.kitSku : input.productSku),
      ],
      [
        "Categoria",
        display(input.category, "Não informada"),
        "Unidade",
        input.productType === "kit" ? "KIT" : "Unidade",
      ],
      [
        "Tipo",
        input.productType === "kit" ? "KIT" : "Produto único",
        "Cálculo",
        input.calculationType === "real" ? "Real" : "Estimado",
      ],
      [
        "Modo",
        record.mode === "target"
          ? `Margem alvo ${percentBR(record.goal)}`
          : "Venda atual",
        "Origem",
        resolved.source === "snapshot"
          ? "Snapshot persistido"
          : "Recalculado do input",
      ],
      [
        "Reputação",
        (
          {
            green: "Verde / MercadoLíder",
            new: "Sem reputação",
            yellow: "Amarela",
            red: "Laranja / vermelha",
          } as Record<string, string>
        )[input.reputation] || display(input.reputation),
        "Condição",
        input.condition === "new" ? "Novo" : "Usado (legado)",
      ],
    ]) + 5;
  y = drawPriceHero(doc, resolved, y);
  y = drawAcquisition(doc, input, y, annexRequired);
  y = drawTwoColumnTables(doc, input, resolved.result, y + 2);
  y = drawCostGrid(doc, resolved.result, resolved.valid, y + 4);
  const warningY = Math.min(y + 4, page.height - 27);
  setFill(doc, resolved.valid ? [250, 249, 253] : PALE_RED);
  setDraw(doc, resolved.valid ? BORDER : [235, 190, 190]);
  doc.roundedRect(page.left, warningY, page.contentWidth, 13, 1.5, 1.5, "FD");
  setText(doc, resolved.valid ? GRAY : RED);
  doc.setFont("helvetica", resolved.valid ? "normal" : "bold");
  doc.setFontSize(6.4);
  const message = resolved.valid
    ? resolved.result.warnings[0] || "Sem alertas adicionais."
    : `Motivo: ${display(resolved.reason || resolved.result.error)}`;
  doc.text(
    textLines(doc, message, page.contentWidth - 7).slice(0, 1),
    page.left + 3,
    warningY + 5
  );
  doc.setFont("helvetica", "normal");
  doc.text(
    `Verificação da tabela de frete: ${display(buildFlowSource(input, record.goal).checkedAt)}. Valores e data vieram do registro salvo.`,
    page.left + 3,
    warningY + 10
  );
  drawFooter(doc, record, 1);
}

function kitAnnexRequired(input: PricingInput): boolean {
  if (input.productType !== "kit") return false;
  const acquisition = getReportAcquisition(input);
  return (
    acquisition.items.length > KIT_PREVIEW_LIMIT ||
    acquisition.items.some(
      item => display(item.description).length > KIT_DESCRIPTION_PREVIEW_LIMIT
    )
  );
}

function drawKitAnnex(doc: jsPDF, record: ProductReportRecord): void {
  const input = resolveProductReport(record).input;
  const acquisition = getReportAcquisition(input);
  const page = specFor(doc);
  const drawAnnexPageChrome = () => {
    const pageNumber = doc.getCurrentPageInfo().pageNumber;
    drawHeader(
      doc,
      "Anexo de composição completa do KIT",
      "Todos os componentes preservados | descrição integral e SKUs sem truncamento",
      `${pageNumber} / ANEXO`,
      record
    );
    setText(doc, GRAY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.text(
      `SKU do KIT ${display(input.kitSku)} | Categoria ${display(input.category, "Não informada")} | ${acquisition.items.length} componentes`,
      page.left,
      29
    );
    drawFooter(doc, record, pageNumber);
  };

  autoTable(doc, {
    startY: 34,
    margin: {
      top: 32,
      bottom: 20,
      left: page.left,
      right: page.width - page.right,
    },
    tableWidth: page.contentWidth,
    head: [["SKU", "Descrição completa", "Qtd.", "Custo unitário", "Subtotal"]],
    body: acquisition.items.map(item => [
      display(item.sku),
      display(item.description),
      numberBR(item.quantity, 0),
      moneyBR(item.unitCost),
      moneyBR(item.subtotal),
    ]),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.3,
      cellPadding: 1.7,
      textColor: TEXT,
      lineColor: BORDER,
      lineWidth: 0.18,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: PURPLE,
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [250, 249, 253] },
    columnStyles: {
      0: { cellWidth: 29 },
      1: { cellWidth: 78 },
      2: { cellWidth: 18, halign: "right" },
      3: { cellWidth: 31, halign: "right" },
      4: { cellWidth: 30, halign: "right" },
    },
    didDrawPage: drawAnnexPageChrome,
  });
  const finalY = lastTableY(doc, 34);
  if (doc.getCurrentPageInfo().pageNumber === 3 || finalY <= page.height - 25) {
    setText(doc, PURPLE_DARK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.7);
    doc.text(
      `TOTAL DE AQUISIÇÃO  ${moneyBR(acquisition.total)}`,
      page.right,
      Math.min(finalY + 7, page.height - 24),
      { align: "right" }
    );
  }
}

function stageGroups(flow: FlowSource): Array<{
  stage: string;
  label: string;
  options: Array<{ label: string; selected: boolean; unsupported: boolean }>;
}> {
  const groups = new Map<
    string,
    Array<{ label: string; selected: boolean; unsupported: boolean }>
  >();
  for (const node of flow.nodes) {
    if (node.kind !== "choice") continue;
    const options = groups.get(node.stage) ?? [];
    options.push({
      label: node.label.split("\n").slice(1).join(" "),
      selected: node.selected,
      unsupported:
        (node.stage === "logistic" && /flex|other/i.test(node.label)) ||
        (node.stage === "reputation" && /yellow|red/i.test(node.label)),
    });
    groups.set(node.stage, options);
  }
  return [
    ["ads", "Publicidade"],
    ["destination", "Destino"],
    ["listing", "Anúncio"],
    ["logistic", "Logística"],
    ["reputation", "Reputação fixa"],
    ["shipping", "Envio"],
    ["margin", "Margem alvo"],
  ].map(([stage, label]) => ({
    stage,
    label,
    options: groups.get(stage) ?? [],
  }));
}

function drawFlowRoot(doc: jsPDF, input: PricingInput, flow: FlowSource): void {
  const page = specFor(doc);
  const rootX = page.left;
  const rootY = 30;
  const rootW = 27;
  const rootH = 40;
  setFill(doc, PURPLE_DARK);
  doc.roundedRect(rootX, rootY, rootW, rootH, 1.8, 1.8, "F");
  setText(doc, [255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.7);
  doc.text("ENTRADAS FIXAS", rootX + 2.3, rootY + 6.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.8);
  doc.text(
    textLines(doc, input.description, rootW - 4.5).slice(0, 4),
    rootX + 2.3,
    rootY + 13
  );
  doc.text(
    textLines(
      doc,
      `Categoria: ${display(input.category, "não informada")}`,
      rootW - 4.5
    ).slice(0, 2),
    rootX + 2.3,
    rootY + 24
  );
  doc.text(
    `SKU ${display(input.productType === "kit" ? input.kitSku : input.productSku)}`,
    rootX + 2.3,
    rootY + 31
  );
  doc.text(
    `Aquisição ${moneyBR(getReportAcquisition(input).total)}`,
    rootX + 2.3,
    rootY + 35
  );
  doc.text(`Peso ${numberBR(input.weight)} kg`, rootX + 2.3, rootY + 39);

  const groups = stageGroups(flow);
  const boxY = 30;
  const boxW = 32.8;
  const gap = 1.6;
  const xStart = 41;
  const boxH = 40;
  let previousX = rootX + rootW;
  groups.forEach((group, index) => {
    const x = xStart + index * (boxW + gap);
    setFill(doc, [251, 249, 254]);
    setDraw(doc, BORDER);
    doc.roundedRect(x, boxY, boxW, boxH, 1.5, 1.5, "FD");
    setText(doc, PURPLE_DARK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(group.label, x + 2, boxY + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    group.options.forEach((option, optionIndex) => {
      const lineY = boxY + 13 + optionIndex * 6;
      if (lineY > boxY + boxH - 3) return;
      const color: RGB = option.unsupported
        ? [156, 163, 175]
        : option.selected
          ? GREEN
          : PURPLE_DARK;
      setText(doc, color);
      doc.setFont("helvetica", option.selected ? "bold" : "normal");
      doc.text(`${option.selected ? "*" : "-"} ${option.label}`, x + 2, lineY);
    });
    setDraw(doc, [194, 181, 208]);
    doc.setLineWidth(0.4);
    doc.line(previousX, boxY + boxH / 2, x, boxY + boxH / 2);
    previousX = x + boxW;
  });
  setDraw(doc, GREEN);
  doc.line(previousX, boxY + boxH / 2, page.right, boxY + boxH / 2);
}

function selectedSummaryText(
  resolved: ReturnType<typeof resolveProductReport>
): string {
  if (!resolved.valid)
    return `Sem preço final: ${display(resolved.reason || resolved.result.error)}`;
  return `Preço ${moneyBR(resolved.price)} | margem ${percentBR(resolved.result.margin)} | frete ${moneyBR(resolved.result.shipping)} | ${display(resolved.input.logistic)} / ${display(resolved.input.reputation)}`;
}

function drawSelectedSummary(
  doc: jsPDF,
  resolved: ReturnType<typeof resolveProductReport>,
  startY: number
): number {
  const page = specFor(doc);
  setFill(doc, resolved.valid ? PALE_GREEN : PALE_RED);
  setDraw(doc, resolved.valid ? [148, 207, 176] : [235, 190, 190]);
  doc.roundedRect(page.left, startY, page.contentWidth, 12, 1.8, 1.8, "FD");
  setText(doc, resolved.valid ? GREEN : RED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.4);
  doc.text(
    resolved.valid ? "CENÁRIO SELECIONADO" : "CENÁRIO FIXO INDISPONÍVEL",
    page.left + 3.5,
    startY + 5.5
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text(selectedSummaryText(resolved), page.left + 3.5, startY + 10);
  return startY + 15;
}

function matrixRow(
  rows: readonly ScenarioMatrixResult[],
  adsAmount: number,
  listing: (typeof MATRIX_LISTINGS)[number],
  marginGoal: number,
  destination: (typeof MATRIX_DESTINATIONS)[number],
  shippingMode: (typeof MATRIX_SHIPPING)[number],
  reputation?: string
): ScenarioMatrixResult | undefined {
  return rows.find(
    row =>
      rowAdsAmount(row) === adsAmount &&
      row.listing === listing &&
      row.marginGoal === marginGoal &&
      row.destination === destination &&
      row.shippingMode === shippingMode &&
      (reputation === undefined || String(row.reputation) === reputation)
  );
}

function groupLabel(group: ScenarioLogisticGroup): string {
  return group.logistics
    .map(logistic => LOGISTIC_LABELS[logistic] || logistic.toUpperCase())
    .join(" + ");
}

function drawScenarioBoard(
  doc: jsPDF,
  group: ScenarioLogisticGroup,
  x: number,
  y: number,
  width: number,
  destination: (typeof MATRIX_DESTINATIONS)[number],
  shippingMode: (typeof MATRIX_SHIPPING)[number]
): number {
  setText(doc, PURPLE_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.4);
  doc.text(
    `${destination === "inside" ? "DENTRO" : "FORA"} | ${shippingMode === "auto" ? "GRÁTIS" : "RÁPIDO"}`,
    x,
    y + 3.4
  );
  doc.setFontSize(5.6);
  doc.text("PREÇOS EM R$", x, y + 6.4);
  const body = MATRIX_ADS_AMOUNTS.flatMap(adsAmount =>
    MATRIX_LISTINGS.map(listing => {
      const values = MATRIX_MARGINS.map(marginGoal => {
        const row = matrixRow(
          group.rows,
          adsAmount,
          listing,
          marginGoal,
          destination,
          shippingMode
        );
        return row?.valid ? moneyBR(row.price).replace(/^R\$\s*/u, "") : "—";
      });
      return [
        `${moneyBR(adsAmount)} / ${listing === "classic" ? "C" : "P"}`,
        ...values,
      ];
    })
  );
  autoTable(doc, {
    startY: y + 8,
    margin: { left: x, right: specFor(doc).right - x - width },
    tableWidth: width,
    head: [
      [
        "Publicidade (R$) / anúncio",
        ...MATRIX_MARGINS.map(margin => `${margin}%`),
      ],
    ],
    body,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 6.7,
      cellPadding: 0.45,
      minCellHeight: 3.6,
      lineColor: BORDER,
      lineWidth: 0.12,
      halign: "right",
      valign: "middle",
      overflow: "linebreak",
      textColor: TEXT,
    },
    headStyles: {
      fillColor: PURPLE,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      fontSize: 6.5,
    },
    columnStyles: {
      0: { cellWidth: width - 5 * ((width - 16) / 5), halign: "left" },
      1: { cellWidth: (width - 16) / 5 },
      2: { cellWidth: (width - 16) / 5 },
      3: { cellWidth: (width - 16) / 5 },
      4: { cellWidth: (width - 16) / 5 },
      5: { cellWidth: (width - 16) / 5 },
    },
    alternateRowStyles: { fillColor: [250, 249, 253] },
  });
  return lastTableY(doc, y + 45);
}

function drawUnavailableStrip(
  doc: jsPDF,
  groups: readonly ScenarioLogisticGroup[],
  y: number
): void {
  if (groups.length === 0) return;
  const page = specFor(doc);
  setText(doc, GRAY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.4);
  const text = groups
    .map(group => {
      const reason =
        group.rows.find(row => row.reason)?.reason ||
        "perfil sem frete automático";
      return `${groupLabel(group)}: ${reason}`;
    })
    .join(" | ");
  doc.text(
    textLines(
      doc,
      `Indisponíveis, sem preço inventado: ${text}`,
      page.contentWidth
    ).slice(0, 2),
    page.left,
    y
  );
}

function drawUnavailableCards(
  doc: jsPDF,
  groups: readonly ScenarioLogisticGroup[],
  startY: number
): number {
  const page = specFor(doc);
  const gap = 3;
  const width =
    (page.contentWidth - gap * Math.max(0, groups.length - 1)) /
    Math.max(1, groups.length);
  groups.forEach((group, index) => {
    const x = page.left + index * (width + gap);
    setFill(doc, [248, 248, 250]);
    setDraw(doc, [190, 194, 202]);
    doc.roundedRect(x, startY, width, 31, 1.5, 1.5, "FD");
    setText(doc, GRAY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(groupLabel(group), x + 2.2, startY + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.text("NÃO DISPONÍVEL", x + 2.2, startY + 12);
    const reason =
      group.rows.find(row => row.reason)?.reason ||
      "frete automático fora do perfil";
    doc.text(
      textLines(doc, reason, width - 4.5).slice(0, 3),
      x + 2.2,
      startY + 18
    );
    doc.text("Preço e frete não foram preenchidos.", x + 2.2, startY + 28);
  });
  return startY + 31;
}

function drawGroupedScenarioTables(
  doc: jsPDF,
  rows: readonly ScenarioMatrixResult[],
  input: PricingInput,
  startY: number
): number {
  const page = specFor(doc);
  if (rows.length === 0) {
    setText(doc, GRAY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(
      "Matriz completa não anexada nesta chamada; o PDF não inventa preços ausentes.",
      page.left,
      startY + 7
    );
    return startY + 12;
  }
  // The normal report fixes reputation at the saved input. An explicit four-
  // reputation matrix can still be exported, but the visual remains the fixed
  // root profile rather than silently mixing four profiles in one board.
  const fixedRows = rows.filter(
    row => String(row.reputation) === String(input.reputation)
  );
  const rowsForVisual = fixedRows.length > 0 ? fixedRows : rows;
  const groups = groupEquivalentScenarioRows(rowsForVisual);
  const validGroups = groups.filter(group => group.valid);
  const unavailableGroups = groups.filter(group => !group.valid);
  const tableStart = startY + (unavailableGroups.length > 0 ? 8 : 1);
  drawUnavailableStrip(doc, unavailableGroups, startY);
  if (validGroups.length === 0)
    return drawUnavailableCards(doc, unavailableGroups, tableStart + 3);
  const gap = 3;
  const boardWidth = (page.contentWidth - gap * 3) / 4;
  let y = tableStart;
  validGroups.forEach((group, groupIndex) => {
    setText(doc, PURPLE_DARK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.text(
      `GRUPO DE LOGÍSTICA: ${groupLabel(group)}${group.logistics.length > 1 ? " (vetor equivalente)" : ""}`,
      page.left,
      y
    );
    y += 4.2;
    MATRIX_DESTINATIONS.forEach((destination, destinationIndex) => {
      MATRIX_SHIPPING.forEach((shippingMode, shippingIndex) => {
        const boardIndex =
          destinationIndex * MATRIX_SHIPPING.length + shippingIndex;
        const x = page.left + boardIndex * (boardWidth + gap);
        drawScenarioBoard(
          doc,
          group,
          x,
          y,
          boardWidth,
          destination,
          shippingMode
        );
      });
    });
    const estimatedEnd = lastTableY(doc, y + 43);
    y = estimatedEnd + 5;
    if (groupIndex < validGroups.length - 1) {
      setDraw(doc, BORDER);
      doc.setLineWidth(0.25);
      doc.line(page.left, y - 2, page.right, y - 2);
    }
  });
  return y;
}

function drawSelectedRows(
  doc: jsPDF,
  rows: readonly ScenarioMatrixResult[],
  startY: number
): number {
  const page = specFor(doc);
  const adsAmount = rows.map(rowAdsAmount).find(finite);
  setText(doc, GRAY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.4);
  doc.text(
    `Publicidade comparada: ${moneyBR(adsAmount)} por venda/KIT (custo fixo em reais).`,
    page.left,
    startY
  );
  const tableStart = startY + 4;
  const tableRows = rows.map(row => [
    `${row.marginGoal}%`,
    row.valid ? moneyBR(row.price) : "—",
    row.valid ? percentBR(row.result?.margin) : "—",
    row.valid ? moneyBR(row.shipping) : "—",
    row.valid ? "Válido" : "Não disponível",
    row.valid ? "" : display(row.reason),
  ]);
  autoTable(doc, {
    startY: tableStart,
    margin: { left: page.left, right: page.width - page.right },
    tableWidth: page.contentWidth,
    head: [["Meta", "Preço alvo", "Margem", "Frete", "Status", "Observação"]],
    body: tableRows,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: 1.7,
      lineColor: BORDER,
      lineWidth: 0.18,
      overflow: "linebreak",
      textColor: TEXT,
    },
    headStyles: {
      fillColor: PURPLE,
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [250, 249, 253] },
    columnStyles: {
      0: { cellWidth: 22, halign: "right" },
      1: { cellWidth: 40, halign: "right" },
      2: { cellWidth: 35, halign: "right" },
      3: { cellWidth: 35, halign: "right" },
      4: { cellWidth: 40 },
      5: { cellWidth: 105 },
    },
  });
  return lastTableY(doc, tableStart + 30);
}

function drawFlowPage(
  doc: jsPDF,
  record: ProductReportRecord,
  options: ProductPdfOptions,
  selectedRows: readonly ScenarioMatrixResult[]
): void {
  const resolved = resolveProductReport(record);
  const flow = options.flow ?? buildFlowSource(resolved.input, record.goal);
  drawHeader(
    doc,
    "Fluxo auditável de escolhas",
    resolved.input.adsMode === "percent"
      ? "Entrada histórica preservada na 1ª folha | comparação corrente de publicidade em reais"
      : "Reputação fixa no registro | publicidade em reais por venda/KIT",
    "2 / FLUXO",
    record
  );
  const page = specFor(doc);
  setText(doc, GRAY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text(
    "Automático: condição nova + frete de tabela. FLEX e OTHER ficam cinza; reputações não elegíveis não recebem custo inventado.",
    page.left,
    28
  );
  drawFlowRoot(doc, resolved.input, flow);
  const summaryEnd = drawSelectedSummary(doc, resolved, 74);

  if (options.scope === "selected") {
    drawSelectedRows(doc, selectedRows, summaryEnd + 3);
  } else {
    const rows =
      options.matrix && options.matrix.length > 0
        ? options.matrix
        : options.scope === "compact"
          ? buildSelectedScenarioRows(resolved.input)
          : [];
    if (
      options.scope === "compact" &&
      (!options.matrix || options.matrix.length === 0)
    ) {
      setText(doc, GRAY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.3);
      doc.text(
        "Vista do perfil atual: a matriz integral não foi anexada nesta chamada; as cinco metas abaixo são calculadas do input salvo.",
        page.left,
        summaryEnd + 1
      );
      drawSelectedRows(doc, rows, summaryEnd + 5);
    } else {
      drawGroupedScenarioTables(doc, rows, resolved.input, summaryEnd + 3);
    }
  }
  drawFooter(doc, record, 2);
}

function stableFileId(id: string): string {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `${hex}${hex}${hex}${hex}`;
}

function configureMetadata(
  doc: jsPDF,
  record: ProductReportRecord,
  mode: ProductPdfPrintMode
): void {
  doc.setDocumentProperties({
    title: `Alpha - Relatório ${record.id}`,
    subject: "Relatório reproduzível de decisão de preço",
    author: "Alpha",
    creator: "Alpha Precificação",
    keywords: `product-report,${record.id},${record.mode}`,
  });
  const parsed = new Date(record.at);
  doc.setCreationDate(Number.isNaN(parsed.getTime()) ? new Date(0) : parsed);
  doc.setFileId(stableFileId(`${record.id}|${record.at}`));
  doc.viewerPreferences({
    DisplayDocTitle: true,
    Direction: "L2R",
    Duplex: mode === "duplex" ? "DuplexFlipLongEdge" : "none",
  });
}

/** Paginated true flowcharts; the faithful product sheet and KIT annex are optional. */
export function generateProductPdf(
  record: ProductReportRecord,
  options: ProductPdfOptions = {}
): Uint8Array {
  const scope =
    options.scope ?? (options.matrix?.length ? "complete" : "selected");
  const printMode = options.printMode ?? "twoSheets";
  const includeSheet = options.includeProductSheet !== false;
  const alphaProfile = options.profile === "alpha";
  const compactAlpha = alphaProfile && scope === "compact";
  const comparisonRecord = alphaProfile ? alphaComparisonRecord(record) : record;
  const doc = new jsPDF({
    orientation: includeSheet || compactAlpha ? "portrait" : "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  configureMetadata(doc, record, printMode);
  const annexRequired = kitAnnexRequired(record.input);
  if (includeSheet) drawFirstPage(doc, record, annexRequired);

  if (compactAlpha) {
    const margins = options.compactMargins ?? [];
    if (margins.length !== 4) {
      throw new Error(
        "O escopo compacto Alpha exige quatro margens selecionadas explicitamente."
      );
    }
    const rows = options.matrix;
    if (!rows?.length) {
      throw new Error(
        "Calcule os 128 caminhos Alpha das quatro margens antes de gerar o fluxo compacto."
      );
    }
    appendCompactFlowDiagramPages(doc, comparisonRecord, rows, {
      margins,
      useFirstPage: !includeSheet,
      printMode,
    });
    if (includeSheet && annexRequired) {
      doc.addPage("a4", "portrait");
      drawKitAnnex(doc, record);
    }
    return new Uint8Array(doc.output("arraybuffer"));
  }

  const rows =
    scope === "selected" || (scope === "compact" && !options.matrix?.length)
      ? buildSelectedFlowRows(comparisonRecord.input)
      : options.matrix;
  if (!rows?.length)
    throw new Error(
      "Calcule os caminhos completos antes de gerar o fluxograma."
    );
  appendFlowDiagramPages(doc, comparisonRecord, rows, {
    useFirstPage: !includeSheet,
    printMode,
  });
  if (includeSheet && annexRequired) {
    doc.addPage("a4", "portrait");
    drawKitAnnex(doc, record);
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

export function productPdfBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: "application/pdf" });
}

/** Convenience export for callers that need the exact complete CSV beside the PDF. */
export function productReportMatrixCsv(
  rows: readonly ScenarioMatrixResult[]
): string {
  return scenarioMatrixToCsv(rows);
}
