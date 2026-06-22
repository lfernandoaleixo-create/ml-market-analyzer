import { describe, it, expect } from "vitest";
import {
  buildMatrixInput,
  computeMatrixRow,
  deriveMatrixCost,
  priceForMargin,
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
