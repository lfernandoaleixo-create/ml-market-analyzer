import { describe, it, expect } from "vitest";
import {
  buildMatrixInput,
  computeMatrixRow,
  deriveMatrixCost,
  priceForMargin,
  solveSimulator,
  MATRIX_TAX_BY_REGIME,
  type MatrixGlobalSettings,
} from "./pricing";

/**
 * Régua de validação combinada com o Fernando:
 * preço @20% = R$ 100, COM TTS (14%), Clássico (12%), TACoS 3%, afiliados 0%,
 * frete grátis ligado, peso "Até 300g" (índice 0) → custo Matriz ≈ R$ 36,65.
 */
const baseSettings: MatrixGlobalSettings = {
  ttsRegime: "com_tts",
  listingType: "classico",
  tacosPercent: 3,
  affiliatePercent: 0,
  freeShipping: true,
};

describe("buildMatrixInput", () => {
  it("aplica imposto pelo regime e comissão pelo tipo de anúncio", () => {
    const comTts = buildMatrixInput(baseSettings, 0);
    expect(comTts.taxPercent).toBe(14);
    expect(comTts.commissionPercent).toBe(12);
    expect(comTts.mlListingType).toBe("classico");
    expect(comTts.freeShippingFast).toBe(true);
    expect(comTts.autoFees).toBe(true);

    const semTtsPremium = buildMatrixInput(
      { ...baseSettings, ttsRegime: "sem_tts", listingType: "premium" },
      0,
    );
    expect(semTtsPremium.taxPercent).toBe(24);
    expect(semTtsPremium.commissionPercent).toBe(17);
  });

  it("MATRIX_TAX_BY_REGIME espelha 14% / 24%", () => {
    expect(MATRIX_TAX_BY_REGIME.com_tts).toBe(14);
    expect(MATRIX_TAX_BY_REGIME.sem_tts).toBe(24);
  });
});

describe("deriveMatrixCost", () => {
  it("deriva o custo fixo da Matriz a partir do preço âncora @20%", () => {
    const input = buildMatrixInput(baseSettings, 0);
    const cost = deriveMatrixCost(input, 100, 20);
    expect(cost).toBeCloseTo(36.65, 2);
  });

  it("o custo derivado é consistente independentemente da margem âncora usada", () => {
    const input = buildMatrixInput(baseSettings, 0);
    // Custo a partir do preço @20% (R$100).
    const cost = deriveMatrixCost(input, 100, 20);
    // Para esse custo, o preço @15% calculado deve re-derivar o mesmo custo.
    const p15 = priceForMargin(input, cost, 15);
    const reCost = deriveMatrixCost(input, p15.price, 15);
    expect(reCost).toBeCloseTo(cost, 1);
  });
});

describe("computeMatrixRow", () => {
  it("a coluna âncora reflete exatamente o preço informado", () => {
    const row = computeMatrixRow(baseSettings, 0, 100, 20, [20, 15, 25, 30, 35, 40]);
    const anchorCell = row.cells.find((c) => c.marginPct === 20);
    expect(anchorCell?.sellingPrice).toBe(100);
    expect(anchorCell?.valid).toBe(true);
    expect(row.matrixCost).toBeCloseTo(36.65, 2);
  });

  it("margens menores geram preço de venda menor; maiores geram preço maior", () => {
    const row = computeMatrixRow(baseSettings, 0, 100, 20, [20, 15, 25, 30, 35, 40]);
    const byMargin = Object.fromEntries(row.cells.map((c) => [c.marginPct, c.sellingPrice]));
    expect(byMargin[15]).toBeLessThan(byMargin[20]);
    expect(byMargin[25]).toBeGreaterThan(byMargin[20]);
    expect(byMargin[30]).toBeGreaterThan(byMargin[25]);
    expect(byMargin[40]).toBeGreaterThan(byMargin[35]);
  });

  it("bate com os valores validados pelo Fernando (tolerância de centavos)", () => {
    const row = computeMatrixRow(baseSettings, 0, 100, 20, [15, 25, 30, 35, 40]);
    const byMargin = Object.fromEntries(row.cells.map((c) => [c.marginPct, c.sellingPrice]));
    expect(byMargin[15]).toBeCloseTo(87.5, 1);
    expect(byMargin[25]).toBeCloseTo(110.87, 1);
    expect(byMargin[30]).toBeCloseTo(129.51, 1);
    expect(byMargin[35]).toBeCloseTo(147.5, 1);
    expect(byMargin[40]).toBeCloseTo(177.74, 1);
  });

  it("SEM TTS (24%) eleva o custo dos impostos e muda os preços por margem", () => {
    const comTts = computeMatrixRow(baseSettings, 0, 100, 20, [20, 30]);
    const semTts = computeMatrixRow(
      { ...baseSettings, ttsRegime: "sem_tts" },
      0,
      100,
      20,
      [20, 30],
    );
    // Mesmo preço âncora, mas mais imposto → custo Matriz menor.
    expect(semTts.matrixCost).toBeLessThan(comTts.matrixCost);
    // Para a mesma margem 30%, o preço SEM TTS precisa ser maior (carrega mais imposto).
    const c30 = comTts.cells.find((c) => c.marginPct === 30)!.sellingPrice;
    const s30 = semTts.cells.find((c) => c.marginPct === 30)!.sellingPrice;
    expect(s30).toBeGreaterThan(c30);
  });

  it("Premium (17%) reduz o custo Matriz frente ao Clássico (12%) no mesmo preço âncora", () => {
    const classico = computeMatrixRow(baseSettings, 0, 100, 20, [20]);
    const premium = computeMatrixRow(
      { ...baseSettings, listingType: "premium" },
      0,
      100,
      20,
      [20],
    );
    expect(premium.matrixCost).toBeLessThan(classico.matrixCost);
  });

  it("preço âncora muito baixo torna o custo Matriz inviável (<= 0) e invalida as células", () => {
    const row = computeMatrixRow(baseSettings, 0, 0.5, 20, [20, 30]);
    expect(row.matrixCost).toBeLessThanOrEqual(0);
    expect(row.cells.every((c) => !c.valid)).toBe(true);
  });
});

describe("coluna variável (recálculo em tempo real)", () => {
  it("uma margem arbitrária produz o mesmo preço de uma coluna fixa equivalente", () => {
    // Coluna variável em 30% deve bater com a coluna fixa de 30%.
    const fixed = computeMatrixRow(baseSettings, 0, 100, 20, [20, 30]);
    const variable = computeMatrixRow(baseSettings, 0, 100, 20, [30]);
    const fixed30 = fixed.cells.find((c) => c.marginPct === 30)!;
    expect(variable.cells[0].marginPct).toBe(30);
    expect(variable.cells[0].sellingPrice).toBeCloseTo(fixed30.sellingPrice, 2);
  });

  it("a coluna variável é monotônica: margem maior => preço maior", () => {
    const m25 = computeMatrixRow(baseSettings, 0, 100, 20, [25]).cells[0];
    const m45 = computeMatrixRow(baseSettings, 0, 100, 20, [45]).cells[0];
    const m60 = computeMatrixRow(baseSettings, 0, 100, 20, [60]).cells[0];
    expect(m45.sellingPrice).toBeGreaterThan(m25.sellingPrice);
    expect(m60.sellingPrice).toBeGreaterThan(m45.sellingPrice);
  });

  it("mantém o mesmo custo Matriz independentemente da margem variável escolhida", () => {
    const a = computeMatrixRow(baseSettings, 0, 100, 20, [45]);
    const b = computeMatrixRow(baseSettings, 0, 100, 20, [12]);
    expect(a.matrixCost).toBeCloseTo(b.matrixCost, 2);
  });
});

describe("margens altas inviáveis (guard contra explosão de preço)", () => {
  // Clássico 12% + COM TTS 14% + TACoS 3% = 29% de custos variáveis.
  // Margem 70% -> 70 + 29 = 99% de deduções -> antes explodia para ~R$ 5.880.
  it("margem de 70% com Clássico não explode: célula marcada como inviável", () => {
    const row = computeMatrixRow(baseSettings, 0, 100, 20, [70]);
    const cell = row.cells[0];
    expect(cell.marginPct).toBe(70);
    expect(cell.valid).toBe(false);
    // Em vez de um número astronômico, o preço NÃO deve ser exibido como válido.
    expect(cell.sellingPrice).not.toBeGreaterThan(1000);
  });

  it("não retorna preços astronômicos para nenhuma margem entre 67% e 95%", () => {
    for (let m = 67; m <= 95; m += 1) {
      const cell = computeMatrixRow(baseSettings, 0, 100, 20, [m]).cells[0];
      // Toda margem cujo (variáveis + margem) >= 95% deve ser inviável.
      if (!cell.valid) continue;
      // Quando válida, o preço precisa ser financeiramente razoável (sem explosão).
      expect(cell.sellingPrice).toBeLessThan(1000);
    }
  });

  it("margens viáveis (<= ~50%) continuam produzindo preços válidos e crescentes", () => {
    const m40 = computeMatrixRow(baseSettings, 0, 100, 20, [40]).cells[0];
    const m50 = computeMatrixRow(baseSettings, 0, 100, 20, [50]).cells[0];
    expect(m40.valid).toBe(true);
    expect(m50.valid).toBe(true);
    expect(m50.sellingPrice).toBeGreaterThan(m40.sellingPrice);
    expect(m50.sellingPrice).toBeLessThan(1000);
  });

  it("SEM TTS (24%) torna a inviabilidade ocorrer em margem mais baixa", () => {
    // SEM TTS 24% + Clássico 12% + TACoS 3% = 39% -> margem 60% já dá 99%.
    const semTts = { ...baseSettings, ttsRegime: "sem_tts" as const };
    const cell = computeMatrixRow(semTts, 0, 100, 20, [60]).cells[0];
    expect(cell.valid).toBe(false);
  });
});


describe("simulador de 3 variáveis interligadas (solveSimulator)", () => {
  // baseSettings: Clássico 12% + COM TTS 14% + TACoS 3% = 29% variáveis, frete grátis.
  const input = buildMatrixInput(baseSettings, 3); // peso "2kg a 3kg" (índice 3)

  it("editar margem (mantendo custo) recalcula o preço de venda", () => {
    // Custo Matriz R$ 10,03 (exemplo do tapete higiênico), margem 30%.
    const out = solveSimulator(input, { matrixCost: 10.03, marginPct: 30, sellingPrice: 0 }, "margem");
    expect(out.valid).toBe(true);
    expect(out.matrixCost).toBeCloseTo(10.03, 2);
    expect(out.marginPct).toBeCloseTo(30, 2);
    expect(out.sellingPrice).toBeGreaterThan(10.03);
  });

  it("editar custo (mantendo margem) recalcula o preço: custo maior => preço maior", () => {
    const a = solveSimulator(input, { matrixCost: 10, marginPct: 25, sellingPrice: 0 }, "custo");
    const b = solveSimulator(input, { matrixCost: 20, marginPct: 25, sellingPrice: 0 }, "custo");
    expect(a.valid).toBe(true);
    expect(b.valid).toBe(true);
    expect(b.sellingPrice).toBeGreaterThan(a.sellingPrice);
  });

  it("editar preço (mantendo custo) deriva a margem coerente", () => {
    // Primeiro descubro o preço para custo 10,03 @ 30%.
    const fromMargin = solveSimulator(input, { matrixCost: 10.03, marginPct: 30, sellingPrice: 0 }, "margem");
    expect(fromMargin.valid).toBe(true);
    // Agora informo esse mesmo preço editando o campo "preço" e devo recuperar ~30%.
    const fromPrice = solveSimulator(
      input,
      { matrixCost: 10.03, marginPct: 0, sellingPrice: fromMargin.sellingPrice },
      "preco",
    );
    expect(fromPrice.valid).toBe(true);
    expect(fromPrice.marginPct).toBeCloseTo(30, 0); // tolerância de arredondamento de frete
  });

  it("ida e volta margem→preço→margem é estável (round-trip)", () => {
    const margins = [10, 20, 35, 45];
    for (const m of margins) {
      const p = solveSimulator(input, { matrixCost: 15, marginPct: m, sellingPrice: 0 }, "margem");
      if (!p.valid) continue;
      const back = solveSimulator(input, { matrixCost: 15, marginPct: 0, sellingPrice: p.sellingPrice }, "preco");
      expect(back.valid).toBe(true);
      expect(back.marginPct).toBeCloseTo(m, 0);
    }
  });

  it("preço abaixo do necessário gera margem baixa/negativa, mas não quebra", () => {
    // Custo 50, preço de venda apenas 40 (não cobre custo + taxas) => margem negativa.
    const out = solveSimulator(input, { matrixCost: 50, marginPct: 0, sellingPrice: 40 }, "preco");
    expect(out.valid).toBe(true);
    expect(out.marginPct).toBeLessThan(0);
  });

  it("margem inviável (alta demais) propaga valid:false ao editar a margem", () => {
    const out = solveSimulator(input, { matrixCost: 10, marginPct: 80, sellingPrice: 0 }, "margem");
    expect(out.valid).toBe(false);
  });
});
