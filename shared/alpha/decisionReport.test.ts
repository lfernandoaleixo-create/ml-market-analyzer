import { describe, expect, it } from "vitest";
import { defaultInput, calculate, type PricingInput } from "./pricing";
import {
  DEFAULT_MATRIX_ADS_AMOUNTS,
  DEFAULT_MATRIX_SCENARIO_COUNT,
  FULL_MATRIX_SCENARIO_COUNT,
  buildFlowSource,
  buildSelectedScenarioRows,
  buildScenarioInput,
  createProductReportRecord,
  exportScenarioMatrixCsv,
  generateScenarioMatrix,
  groupEquivalentScenarioRows,
  getScenarioMatrixCount,
  resolveProductReport,
  type ScenarioMatrixResult,
} from "./decisionReport";
import { generateProductPdf } from "../../client/src/alpha/lib/productPdf";

const makeInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  ...defaultInput,
  ...overrides,
});

const smallOptions = {
  adsAmounts: [2],
  destinations: ["inside" as const],
  listings: ["classic" as const],
  margins: [10, 20],
  logistics: ["agency", "flex"] as const,
  reputations: ["green", "yellow"] as const,
  shippingModes: ["rapid"] as const,
};

describe("decisionReport", () => {
  it("expõe 800 linhas na reputação fixa e 3.200 quando as quatro reputações são explícitas", () => {
    expect(getScenarioMatrixCount()).toBe(DEFAULT_MATRIX_SCENARIO_COUNT);
    expect(DEFAULT_MATRIX_SCENARIO_COUNT).toBe(800);
    expect(FULL_MATRIX_SCENARIO_COUNT).toBe(3200);
    expect(
      getScenarioMatrixCount({ reputations: ["green", "new", "yellow", "red"] })
    ).toBe(3200);
  });

  it("padroniza nomes de frete mantendo os códigos e a seleção", () => {
    const flow = buildFlowSource(makeInput({ shippingMode: "rapid" }));
    const shipping = flow.nodes.filter(node => node.stage === "shipping");
    expect(shipping.map(node => node.label)).toEqual([
      "Envio\nSem frete grátis",
      "Envio\nCom frete grátis",
    ]);
    expect(shipping.filter(node => node.selected).map(node => node.id)).toEqual(
      ["shipping-rapid"]
    );
  });

  it("calcula publicidade fixa diferente da mesma taxa percentual", () => {
    const fixed = makeInput({ adsMode: "rs", ads: 4 });
    const percentage = makeInput({ adsMode: "percent", ads: 4 });
    const fixedResult = calculate(fixed, 200);
    const percentageResult = calculate(percentage, 200);
    expect(fixedResult.valid).toBe(true);
    expect(percentageResult.valid).toBe(true);
    expect(fixedResult.ads).toBe(4);
    expect(percentageResult.ads).toBe(8);

    const scenario = buildScenarioInput(percentage, {
      adsAmount: 4,
      destination: "inside",
      listing: "classic",
      logistic: "agency",
      reputation: "green",
      shippingMode: "auto",
    });
    expect(scenario.adsMode).toBe("rs");
    expect(scenario.ads).toBe(4);
  });

  it("expõe opções do fluxo em R$ e seleciona o nó e a aresta corretos", () => {
    const flow = buildFlowSource(makeInput({ adsMode: "rs", ads: 4 }));
    const adsNodes = flow.nodes.filter(node => node.stage === "ads");
    const selected = adsNodes.filter(node => node.selected);
    expect(adsNodes.map(node => node.label)).toContain("Publicidade\nR$4,00");
    expect(adsNodes.every(node => !node.label.includes("%"))).toBe(true);
    expect(selected).toHaveLength(1);
    expect(selected[0].label).toBe("Publicidade\nR$4,00");
    expect(
      flow.edges.some(edge => edge.to === selected[0].id && edge.selected)
    ).toBe(true);
    expect(DEFAULT_MATRIX_ADS_AMOUNTS).toEqual([2, 4, 6, 8]);
  });

  it("mantém o valor personalizado no comparativo selected-only", () => {
    const rows = buildSelectedScenarioRows(
      makeInput({ adsMode: "rs", ads: 5 })
    );
    expect(rows).toHaveLength(5);
    expect(rows.every(row => row.adsAmount === 5)).toBe(true);
    expect(rows.every(row => row.adsPercent === 5)).toBe(true);
    expect(rows.every(row => row.input.adsMode === "rs")).toBe(true);
    expect(rows.every(row => row.input.ads === 5)).toBe(true);
  });

  it("mantém 800 caminhos e bloqueia Sem frete grátis obrigatório sem preço zero", async () => {
    const rows = await generateScenarioMatrix(
      makeInput({
        cost: 30,
        reputation: "green",
        logistic: "agency",
        automaticShippingOnly: true,
        useDestinationTaxes: true,
        saleDestination: "inside",
        taxDifal: 16,
        weight: 0.5,
        length: 20,
        width: 30,
        height: 5,
      })
    );
    expect(rows).toHaveLength(800);
    expect(rows.filter(row => row.valid).length).toBeLessThanOrEqual(480);
    expect(rows.filter(row => !row.valid).length).toBeGreaterThanOrEqual(320);
    expect(rows.every(row => row.reputation === "green")).toBe(true);
    expect(
      rows
        .filter(row => !row.valid)
        .every(row => row.price === null && row.shipping === null && row.reason)
    ).toBe(true);
    expect(
      rows
        .filter(row => row.shippingMode === "auto" && row.valid)
        .every(row => row.price !== null && row.price < 79)
    ).toBe(true);
    const mandatoryAutoRows = rows.filter(
      row =>
        row.shippingMode === "auto" &&
        !row.valid &&
        row.reason?.includes("Sem frete grátis não é permitido")
    );
    expect(mandatoryAutoRows.length).toBeGreaterThan(0);
    expect(
      mandatoryAutoRows.every(
        row =>
          row.price === null &&
          row.shipping === null &&
          row.result === null &&
          row.reason
      )
    ).toBe(true);
  }, 120_000);

  it("não agrupa logísticas quando preço, margem ou frete diferem", async () => {
    const rows = await generateScenarioMatrix(
      makeInput({
        reputation: "green",
        automaticShippingOnly: true,
      }),
      {
        adsPercentages: [2],
        destinations: ["inside"],
        listings: ["classic"],
        margins: [10],
        logistics: ["agency", "collection"],
        reputations: ["green"],
        shippingModes: ["rapid"],
      }
    );
    const changed = rows.map(row =>
      row.logistic === "collection"
        ? { ...row, price: row.price === null ? null : row.price + 0.01 }
        : row
    );
    expect(groupEquivalentScenarioRows(rows)).toHaveLength(1);
    expect(groupEquivalentScenarioRows(changed)).toHaveLength(2);
  });

  it("isola o cache por input e não reutiliza agência para Full acima de 25 kg", async () => {
    const options = {
      adsPercentages: [2],
      destinations: ["inside" as const],
      listings: ["classic" as const],
      margins: [10],
      logistics: ["agency", "full"] as const,
      reputations: ["green" as const],
      shippingModes: ["rapid" as const],
    };
    const cache = new Map<
      string,
      {
        price: number | null;
        result: ReturnType<typeof calculate> | null;
        shipping: number | null;
        valid: boolean;
        reason?: string;
      }
    >();
    const first = await generateScenarioMatrix(makeInput({ cost: 30 }), {
      ...options,
      cache,
    });
    const second = await generateScenarioMatrix(makeInput({ cost: 60 }), {
      ...options,
      cache,
    });
    const firstAgency = first.find(row => row.logistic === "agency");
    const secondAgency = second.find(row => row.logistic === "agency");
    expect(firstAgency?.valid).toBe(true);
    expect(secondAgency?.valid).toBe(true);
    expect(secondAgency?.price).not.toBe(firstAgency?.price);

    const physicalLimit = await generateScenarioMatrix(
      makeInput({ weight: 26, logistic: "agency" }),
      options
    );
    expect(physicalLimit.find(row => row.logistic === "agency")?.valid).toBe(
      true
    );
    expect(physicalLimit.find(row => row.logistic === "full")?.valid).toBe(
      false
    );
  }, 30_000);

  it("mantém impostos novos e legados do snapshot sem sobrescrever números salvos", () => {
    const legacy = makeInput({
      useDestinationTaxes: false,
      taxIcms: 9,
      taxDifal: 7,
      taxDifalValue: 123,
      difalMode: "rs",
      saleDestination: "inside",
    });
    const legacyScenario = buildScenarioInput(legacy, {
      adsPercent: 2,
      destination: "outside",
      listing: "classic",
      logistic: "agency",
      reputation: "green",
      shippingMode: "auto",
    });
    expect(legacyScenario.saleDestination).toBe("inside");
    expect(legacyScenario.taxIcms).toBe(9);
    expect(legacyScenario.taxDifal).toBe(7);
    expect(legacyScenario.taxDifalValue).toBe(123);
    expect(legacyScenario.difalMode).toBe("rs");

    const destination = makeInput({
      useDestinationTaxes: true,
      taxIcmsInside: 6.25,
      taxIcmsOutside: 1.3,
      taxIcmsTransfer: 1.75,
      taxDifal: 18.5,
      difalMode: "percent",
    });
    const outsideScenario = buildScenarioInput(destination, {
      adsAmount: 2,
      destination: "outside",
      listing: "classic",
      logistic: "agency",
      reputation: "green",
      shippingMode: "auto",
    });
    expect(outsideScenario.saleDestination).toBe("outside");
    expect(outsideScenario.taxIcmsInside).toBe(6.25);
    expect(outsideScenario.taxIcmsOutside).toBe(1.3);
    expect(outsideScenario.taxIcmsTransfer).toBe(1.75);
    expect(outsideScenario.taxDifal).toBe(18.5);
  });

  it("gera subset assíncrono, mantém linhas inválidas e nunca usa preço zero como válido", async () => {
    const base = makeInput({
      description: "Tester",
      productSku: "ROOT-1",
      cost: 30,
      reputation: "green",
      logistic: "agency",
      packagingPreset: "p",
      length: 20,
      width: 30,
      height: 5,
      weight: 0.5,
      useDestinationTaxes: true,
      saleDestination: "inside",
      taxDifal: 16,
    });
    const progress: number[] = [];
    const rows = await generateScenarioMatrix(
      base,
      (completed, total) => {
        progress.push(completed);
        expect(total).toBe(8);
      },
      smallOptions
    );
    expect(rows).toHaveLength(8);
    expect(progress.at(-1)).toBe(8);
    const valid = rows.filter(row => row.valid);
    const unsupported = rows.filter(row => !row.valid);
    expect(valid.length).toBeGreaterThan(0);
    expect(unsupported.length).toBeGreaterThan(0);
    for (const row of valid) {
      expect(row.price).not.toBeNull();
      expect(row.price!).toBeGreaterThan(0);
      expect(row.shipping).not.toBeNull();
      expect(row.shipping!).toBeGreaterThanOrEqual(0);
      expect(row.result?.margin).toBeGreaterThanOrEqual(row.marginGoal - 1e-9);
    }
    for (const row of unsupported) {
      expect(row.price).toBeNull();
      expect(row.shipping).toBeNull();
      expect(row.result).toBeNull();
      expect(row.reason).toBeTruthy();
    }
  });

  it("preserva o registro e o snapshot sem mutar o input nem descartar campos extras", () => {
    const input = makeInput({ description: "Produto histórico", price: 88 });
    const before = JSON.stringify(input);
    const record = createProductReportRecord({
      input,
      mode: "sale" as const,
      goal: 20,
      resultPrice: 88,
      at: "2026-10-30T13:00:00.000Z",
      id: "report-1",
      existingSaved: { source: "history" },
      snapshot: { note: "raw", result: calculate(input, 88) },
    });
    expect(JSON.stringify(input)).toBe(before);
    expect(record.id).toBe("report-1");
    expect(record.at).toBe("2026-10-30T13:00:00.000Z");
    expect(record.existingSaved).toEqual({ source: "history" });
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.input)).toBe(true);
  });

  it("produz fluxo estruturado com todas as opções, seleção e legenda determinísticas", () => {
    const flow = buildFlowSource(
      makeInput({
        description: "Flow tester",
        logistic: "agency",
        reputation: "green",
      })
    );
    expect(flow.format).toBe("json");
    expect(
      flow.nodes.find(
        node => node.stage === "logistic" && /flex/.test(node.label)
      )
    ).toBeTruthy();
    expect(
      flow.nodes.find(
        node => node.stage === "reputation" && /green/.test(node.label)
      )
    ).toBeTruthy();
    expect(
      flow.nodes.find(
        node => node.stage === "reputation" && /red/.test(node.label)
      )
    ).toBeFalsy();
    expect(
      flow.nodes.some(node => node.selected && node.stage === "logistic")
    ).toBe(true);
    expect(flow.edges.length).toBeGreaterThan(0);
    expect(flow.mermaid).toMatch(/^flowchart LR/);
    expect(flow.legend).toHaveLength(4);
  });

  it("escapa valores de CSV que poderiam virar fórmula do Excel e não remove linhas", () => {
    const row = {
      id: "scenario-0001",
      adsAmount: 2,
      destination: "inside",
      listing: "classic",
      marginGoal: 10,
      logistic: "agency",
      reputation: "green",
      shippingMode: "auto",
      input: makeInput({ productSku: '=HYPERLINK("x")' }),
      price: null,
      result: null,
      shipping: null,
      valid: false,
      reason: "@texto não suportado",
    } as unknown as ScenarioMatrixResult;
    const csv = exportScenarioMatrixCsv([row]);
    expect(csv.split("\r\n")[0]).toContain("adsAmount");
    expect(csv.split("\r\n")[0]).not.toContain("adsPercent");
    expect(csv.split("\r\n")[1].split(",")[1]).toBe("2");
    expect(csv).toContain("'@texto não suportado");
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("renderiza compact em duas páginas e selected sem inventar matriz", () => {
    const input = makeInput({
      description: "Produto PDF",
      productSku: "PDF-1",
      cost: 30,
      price: 99.9,
      reputation: "green",
      logistic: "agency",
      packagingPreset: "p",
      length: 20,
      width: 30,
      height: 5,
      weight: 0.5,
    });
    const record = createProductReportRecord({
      input,
      mode: "sale" as const,
      goal: 20,
      resultPrice: 99.9,
      id: "pdf-test",
      at: "2026-10-30T13:00:00.000Z",
      snapshot: calculate(input, 99.9),
    });
    const compact = generateProductPdf(record, {
      printMode: "twoSheets",
      scope: "compact",
    });
    const selected = generateProductPdf(record, {
      printMode: "duplex",
      scope: "selected",
    });
    for (const bytes of [compact, selected]) {
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
      const pages = (
        new TextDecoder().decode(bytes).match(/\/Type \/Page\b/g) ?? []
      ).length;
      expect(pages).toBe(2);
    }
    expect(buildSelectedScenarioRows(input)).toHaveLength(5);
  });

  it("imprime snapshot inválido antigo explicitamente como indisponível, sem fake zero", () => {
    const input = makeInput({
      description: "Histórico sem campos novos",
      productSku: "OLD-1",
    });
    const record = createProductReportRecord({
      input,
      mode: "sale" as const,
      goal: 20,
      resultPrice: null,
      id: "old-missing-fields",
      at: "2026-10-30T13:00:00.000Z",
      snapshot: {
        valid: false,
        price: 0,
        error: "Campos históricos incompletos.",
      },
    });
    const resolved = resolveProductReport(record);
    expect(resolved.source).toBe("snapshot");
    expect(resolved.valid).toBe(false);
    expect(resolved.price).toBeNull();
    const bytes = generateProductPdf(record, {
      printMode: "twoSheets",
      scope: "compact",
    });
    expect(
      new TextDecoder().decode(bytes).match(/\/Type \/Page\b/g)
    ).toHaveLength(2);
    expect(new TextDecoder().decode(bytes)).not.toContain("R$ 0,00");
  });
});

describe("identificação fiel no fluxograma do registro", () => {
  it("usa o SKU principal do KIT e a margem alvo, não o preço em reais", () => {
    const flow = buildFlowSource(
      makeInput({
        productType: "kit",
        productSku: "ANTIGO-UNITARIO",
        kitSku: "KIT-CORRETO",
        price: 98.94,
      }),
      25
    );
    expect(flow.nodes.find(node => node.stage === "fixed")?.label).toContain(
      "KIT-CORRETO"
    );
    expect(
      flow.nodes.find(node => node.stage === "fixed")?.label
    ).not.toContain("ANTIGO-UNITARIO");
    expect(
      flow.nodes
        .filter(node => node.stage === "margin" && node.selected)
        .map(node => node.label)
    ).toEqual(["Margem alvo\n25%"]);
    expect(flow.nodes.find(node => node.stage === "result")?.label).toContain(
      "25% (meta do registro)"
    );
  });
  it("não inventa meta de 10% quando não recebeu a margem do registro", () => {
    const flow = buildFlowSource(makeInput({ price: 83.47 }));
    expect(
      flow.nodes.filter(node => node.stage === "margin" && node.selected)
    ).toHaveLength(0);
    expect(
      flow.nodes.find(node => node.stage === "result")?.label
    ).not.toContain("10%");
  });
});
