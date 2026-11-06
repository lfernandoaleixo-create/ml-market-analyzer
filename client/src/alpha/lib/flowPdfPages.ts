import type { jsPDF } from "jspdf";
import type {
  ProductReportRecord,
  ScenarioMatrixResult,
} from "@shared/alpha/decisionReport";
import {
  getReportAcquisition,
  MATRIX_SHIPPING_LABELS,
} from "@shared/alpha/decisionReport";
import { solveTarget } from "@shared/alpha/pricing";
import {
  mandatoryFreeShippingChoiceReason,
  MANDATORY_FREE_SHIPPING_CHOICE_REASON,
} from "@shared/alpha/freeShippingControl";

const PURPLE = [103, 69, 139] as const;
const GREEN = [22, 128, 91] as const;
const GRAY = [115, 118, 130] as const;
const BLUE = [72, 99, 151] as const;
const LIGHT = [248, 246, 252] as const;
const routeLabels: Record<string, string> = {
  agency: "Agência / Mercado Envios",
  collection: "Coleta",
  full: "Full",
  flex: "Flex",
  other: "Outro envio",
};
const reputationLabels: Record<string, string> = {
  green: "Verde / MercadoLíder",
  new: "Conta nova / sem reputação",
  yellow: "Amarela",
  red: "Laranja / vermelha",
};
const money = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? value
        .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        .replace(/\u00a0/g, " ")
    : "-";
const clean = (value: unknown) => String(value ?? "").replace(/[\r\n]+/g, " ");
type NodeBox = { x: number; y: number; w: number; h: number };

function card(doc: jsPDF, box: NodeBox, selected = false, unavailable = false) {
  const color = unavailable ? GRAY : selected ? GREEN : BLUE;
  const fill = selected ? ([236, 249, 242] as const) : LIGHT;
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setFillColor(fill[0], fill[1], fill[2]);
  doc.setLineWidth(selected ? 0.45 : 0.25);
  doc.roundedRect(box.x, box.y, box.w, box.h, 1.4, 1.4, "FD");
  return color;
}
function arrow(
  doc: jsPDF,
  from: NodeBox,
  to: NodeBox,
  selected = false,
  unavailable = false
) {
  const color = unavailable ? GRAY : selected ? GREEN : BLUE;
  const x1 = from.x + from.w,
    y1 = from.y + from.h / 2;
  const x2 = to.x,
    y2 = to.y + to.h / 2;
  const mid = (x1 + x2) / 2;
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setLineWidth(selected ? 0.4 : 0.18);
  doc.line(x1, y1, mid, y1);
  doc.line(mid, y1, mid, y2);
  doc.line(mid, y2, x2 - 1, y2);
  doc.triangle(x2, y2, x2 - 1.5, y2 - 0.75, x2 - 1.5, y2 + 0.75, "F");
}
function text(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  width: number,
  font = 8,
  bold = false
) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(font);
  doc.setTextColor(47, 38, 58);
  doc.text(doc.splitTextToSize(value, width), x, y);
}

/** Every page contains 2 listing branches × 2 shipping branches × 5 margins.
 * Source axes (route, advertising amount, destination, reputation) identify each page.
 * No numeric comparison table is rendered; the arrows describe all terminal paths.
 */
export function appendFlowDiagramPages(
  doc: jsPDF,
  record: ProductReportRecord,
  rows: readonly ScenarioMatrixResult[],
  options: { useFirstPage?: boolean; printMode?: string } = {}
): number {
  const selectedResult =
    record.resultPrice !== null
      ? { valid: true, price: record.resultPrice }
      : solveTarget(record.input, record.goal).result;
  const selectedShippingMode =
    record.input.shippingMode === "auto" &&
    selectedResult &&
    mandatoryFreeShippingChoiceReason(record.input, selectedResult)
      ? "rapid"
      : record.input.shippingMode;
  const groups = new Map<string, ScenarioMatrixResult[]>();
  for (const row of rows) {
    const key = [
      row.logistic,
      row.reputation,
      row.adsAmount,
      row.destination,
      row.taxRegime,
    ].join("|");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  let page = 0;
  for (const group of groups.values()) {
    if (!(options.useFirstPage && page === 0)) doc.addPage("a4", "landscape");
    page += 1;
    const first = group[0];
    const margins = [...new Set(group.map(row => row.marginGoal))].sort(
      (a, b) => a - b
    );
    const leafStep = Math.min(7.7, 37 / Math.max(1, margins.length));
    const leafHeight = Math.min(7.1, leafStep - 0.45);
    const route = routeLabels[first.logistic] ?? clean(first.logistic);
    const destination =
      first.destination === "outside" ? "Fora do estado" : "Dentro do estado";
    const reputation =
      reputationLabels[first.reputation] ?? clean(first.reputation);
    doc.setFillColor(...PURPLE);
    doc.rect(0, 0, 297, 19, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Alpha E-Commerce | Fluxograma ${page}/${groups.size}`, 10, 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(
      `${route} | Publicidade ${money(first.adsAmount)} por venda | ${destination}`,
      10,
      14
    );
    text(doc, "ENTRADA FIXA", 10, 24, 48, 7, true);
    text(doc, "ANÚNCIO", 73, 24, 42, 7, true);
    text(doc, "ENVIO", 125, 24, 44, 7, true);
    text(doc, "MARGEM, PREÇO, LUCRO E FRETE", 184, 24, 102, 7, true);

    const root: NodeBox = { x: 10, y: 31, w: 49, h: 154 };
    card(doc, root, true);
    const input = record.input;
    const sku = input.productType === "kit" ? input.kitSku : input.productSku;
    const acquisition = getReportAcquisition(input);
    let ry = 38;
    const rootLine = (value: string, bold = false) => {
      const size = bold ? 8.3 : 7.3;
      const wrapped: string[] = doc
        .setFont("helvetica", bold ? "bold" : "normal")
        .setFontSize(size)
        .splitTextToSize(value, 42);
      text(doc, value, 13.5, ry, 42, size, bold);
      ry += wrapped.length * 3.3 + 2.2;
    };
    rootLine(clean(input.description) || "Produto sem nome", true);
    if (sku) rootLine(`SKU: ${clean(sku)}`);
    rootLine(`Aquisição: ${money(acquisition.total)}`);
    rootLine(`Reputação: ${reputation}`);
    rootLine(`Logística: ${route}`);
    rootLine(`Publicidade: ${money(first.adsAmount)} por venda/KIT`);
    rootLine(`Destino: ${destination}`);
    rootLine(
      `Pacote: ${input.length} x ${input.width} x ${input.height} cm; ${input.weight} kg`
    );
    if (first.taxRegime === "legacy")
      rootLine("Tributos: parâmetros do registro legado.");
    const reasons = [
      ...new Set(
        group
          .filter(row => !row.valid)
          .map(row => row.reason || "Cotação indisponível.")
      ),
    ];
    if (reasons.length) {
      rootLine("Caminhos indisponíveis:", true);
      for (const reason of reasons) {
        if (ry > 172) break;
        const safe = doc
          .setFontSize(6.5)
          .splitTextToSize(clean(reason), 42)
          .slice(0, 7)
          .join("\n");
        text(doc, safe, 13.5, ry, 42, 6.5);
        ry +=
          Math.min(7, doc.splitTextToSize(clean(reason), 42).length) * 2.8 + 2;
      }
    }

    for (let li = 0; li < 2; li += 1) {
      const listing = li === 0 ? "classic" : "premium";
      const listingNode: NodeBox = { x: 73, y: 54.5 + li * 82, w: 41, h: 23 };
      const listingSelected = input.listing === listing;
      const listingRows = group.filter(row => row.listing === listing);
      const listingUnavailable = listingRows.every(row => !row.valid);
      arrow(doc, root, listingNode, listingSelected, listingUnavailable);
      card(doc, listingNode, listingSelected, listingUnavailable);
      text(
        doc,
        listing === "classic" ? "Clássico" : "Premium",
        76,
        listingNode.y + 8,
        35,
        9.5,
        true
      );
      text(
        doc,
        "Comissão recalculada\npara cada preço",
        76,
        listingNode.y + 13,
        35,
        7
      );
      for (let si = 0; si < 2; si += 1) {
        const mode = si === 0 ? "auto" : "rapid";
        const groupIndex = li * 2 + si;
        const firstY = 27 + groupIndex * 41;
        const lastY = firstY + (margins.length - 1) * leafStep;
        const centerY = (firstY + lastY + leafHeight) / 2;
        const shippingNode: NodeBox = {
          x: 125,
          y: centerY - 8.5,
          w: 43,
          h: 17,
        };
        const shippingRows = listingRows.filter(
          row => row.shippingMode === mode
        );
        const shippingSelected =
          listingSelected && selectedShippingMode === mode;
        const shippingUnavailable = shippingRows.every(row => !row.valid);
        arrow(
          doc,
          listingNode,
          shippingNode,
          shippingSelected,
          shippingUnavailable
        );
        card(doc, shippingNode, shippingSelected, shippingUnavailable);
        text(
          doc,
          MATRIX_SHIPPING_LABELS[mode],
          128,
          shippingNode.y + 6,
          37,
          7.4,
          true
        );
        text(doc, "Regra do preço mantida", 128, shippingNode.y + 13, 37, 6.9);
        for (let mi = 0; mi < margins.length; mi += 1) {
          const goal = margins[mi];
          const row = shippingRows.find(item => item.marginGoal === goal);
          const valid =
            !!row?.valid &&
            typeof row.price === "number" &&
            Number.isFinite(row.price);
          const selected =
            shippingSelected && Math.abs(record.goal - goal) < 0.000001;
          const leaf: NodeBox = {
            x: 185,
            y: firstY + mi * leafStep,
            w: 101,
            h: leafHeight,
          };
          arrow(doc, shippingNode, leaf, selected, !valid);
          card(doc, leaf, selected, !valid);
          const title = `${goal}%  |  ${valid ? `Preço ${money(row?.price)}` : "Preço indisponível"}`;
          const detail = valid
            ? `Lucro ${money(row?.result?.profit)}  |  Frete ${money(row?.shipping)}`
            : row?.reason === MANDATORY_FREE_SHIPPING_CHOICE_REASON
              ? "Não permitido: frete grátis obrigatório nesta faixa."
              : "Sem cotação; não usamos frete zero.";
          text(
            doc,
            title,
            188,
            leaf.y + 2.75,
            95,
            leafHeight < 6.5 ? 7 : 8,
            true
          );
          text(
            doc,
            detail,
            188,
            leaf.y + leafHeight - 1.1,
            95,
            leafHeight < 6.5 ? 6 : 6.4
          );
        }
      }
    }
    doc.setDrawColor(218, 210, 230);
    doc.line(10, 192, 286, 192);
    text(
      doc,
      "Setas = caminhos. Verde = escolha do registro; azul = alternativa; cinza = indisponível. Frete grátis obrigatório por preço não pode ser removido.",
      10,
      196,
      276,
      6.5
    );
    text(
      doc,
      `ID ${record.id} | ${clean(record.at)} | ${options.printMode === "duplex" ? "Frente e verso: paisagem, borda curta." : "Uma página por folha."} Comparações atuais: publicidade fixa em reais.`,
      10,
      202,
      276,
      6.5
    );
  }
  return page;
}
