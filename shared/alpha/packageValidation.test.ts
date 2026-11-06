import { describe, expect, it } from "vitest";
import {
  calculate,
  defaultInput,
  getPackageInputIssues,
  solveTarget,
  type PricingInput,
} from "./pricing";
import { applyPackagingSelection } from "./packagingSelection";
import { SHIPPING_WEIGHTS } from "./tariffs";
import {
  WEIGHT_BAND_OPTIONS,
  selectWeightBand,
} from "./weightSelection";

const makeInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  ...defaultInput,
  ...overrides,
});

const issueFor = (
  input: PricingInput,
  field: "weight" | "length" | "width" | "height"
) => getPackageInputIssues(input).find(issue => issue.field === field);

describe("validação semântica do pacote", () => {
  it("retorna altura concreta para P selecionado sem altura, sem cair em Peso inválido", () => {
    const selected = applyPackagingSelection(
      selectWeightBand(defaultInput, "1"),
      "p"
    );

    expect(selected).toMatchObject({
      weight: 0.5,
      length: 20,
      width: 30,
      height: 0,
    });

    const heightIssue = issueFor(selected, "height");
    expect(heightIssue).toBeDefined();
    expect(heightIssue?.message).toMatch(/altura/i);

    const solved = solveTarget(selected, 10);
    expect(solved.price).toBeNull();
    expect(solved.error).toMatch(/altura/i);
    expect(solved.error).not.toMatch(/^peso inválido\.?$/i);
  });

  it("resolve a embalagem P quando a altura é preenchida e mantém frete finito", () => {
    const input = {
      ...applyPackagingSelection(selectWeightBand(defaultInput, "1"), "p"),
      height: 5,
    };
    const solved = solveTarget(input, 10);

    expect(solved.error).toBeUndefined();
    expect(solved.price).not.toBeNull();
    expect(solved.result?.valid).toBe(true);
    expect(Number.isFinite(solved.result?.shipping)).toBe(true);
    expect(solved.result?.dimensionalWeight).toBe(0.5);
    expect(solved.result?.weightUsed).toBeGreaterThanOrEqual(
      solved.result?.dimensionalWeight ?? 0
    );
  });

  it("mantém todas as bandas finitas selecionáveis e valida amostras de cálculo e solver", () => {
    expect(WEIGHT_BAND_OPTIONS).toHaveLength(SHIPPING_WEIGHTS.length);

    const finiteOptions = WEIGHT_BAND_OPTIONS.filter(option =>
      Number.isFinite(option.upper)
    );
    expect(finiteOptions).toHaveLength(29);
    expect(finiteOptions.map(option => option.id)).toEqual(
      Array.from({ length: 29 }, (_, index) => String(index))
    );
    expect(WEIGHT_BAND_OPTIONS[29]).toMatchObject({
      id: "29",
      upper: Infinity,
      selectable: false,
    });

    const complete = makeInput({
      length: 20,
      width: 30,
      height: 5,
      weightInputMode: "exact",
      weightExact: 0.5,
    });

    // Exercita o primeiro par, uma faixa intermediária e a última finita;
    // não repete solver 29 vezes para manter este teste barato.
    for (const id of ["0", "1", "10", "28"]) {
      const selected = selectWeightBand(complete, id);
      const calculated = calculate(selected);
      const solved = solveTarget(selected, 10);

      expect(calculated.valid).toBe(true);
      expect(Number.isFinite(calculated.shipping)).toBe(true);
      expect(solved.error).toBeUndefined();
      expect(solved.result?.valid).toBe(true);
      expect(Number.isFinite(solved.result?.shipping)).toBe(true);
    }

    expect(() => selectWeightBand(complete, "29")).toThrow(RangeError);
  });

  it.each([Number.NaN, -1])(
    "retorna erro explícito para peso real inválido (%s)",
    weight => {
      const input = makeInput({
        weight,
        weightExact: weight,
      });
      const issue = issueFor(input, "weight");
      const solved = solveTarget(input, 10);

      expect(issue).toBeDefined();
      expect(issue?.message).toMatch(/peso/i);
      expect(issue?.message).not.toMatch(/^peso inválido\.?$/i);
      expect(solved.price).toBeNull();
      expect(solved.error).toMatch(/peso/i);
      expect(solved.error).not.toMatch(/^peso inválido\.?$/i);
    }
  );

  it("selecionar uma faixa corrige NaN ativo mesmo com weightExact oculto também NaN", () => {
    const selected = selectWeightBand(
      makeInput({ weight: Number.NaN, weightExact: Number.NaN }),
      "1"
    );

    expect(selected.weight).toBe(0.5);
    expect(Number.isNaN(selected.weightExact)).toBe(true);
    expect(issueFor(selected, "weight")).toBeUndefined();
    expect(calculate(selected).valid).toBe(true);
    expect(solveTarget(selected, 10).result?.valid).toBe(true);
  });

  it("dá orientação útil para peso zero no automático e deixa seleção de faixa corrigir o ativo", () => {
    const input = makeInput({
      shippingMode: "auto",
      weight: 0,
      weightExact: 0,
      length: 0,
      width: 0,
      height: 0,
    });
    const issue = issueFor(input, "weight");
    const solved = solveTarget(input, 10);

    expect(issue).toBeDefined();
    expect(issue?.message).toMatch(/peso|faixa|informe|selecione/i);
    expect(issue?.message).not.toMatch(/^peso inválido\.?$/i);
    expect(solved.price).toBeNull();
    expect(solved.error).toMatch(/peso|faixa|informe|selecione/i);
    expect(solved.error).not.toMatch(/^peso inválido\.?$/i);

    const selected = selectWeightBand(input, "0");
    expect(selected.weight).toBe(0.3);
    expect(calculate(selected).valid).toBe(true);
  });

  it("aceita peso e dimensões zerados quando o frete é manual, inclusive com frete zero", () => {
    const input = makeInput({
      shippingMode: "manual",
      manualShipping: 0,
      weight: 0,
      weightExact: 0,
      length: 0,
      width: 0,
      height: 0,
    });
    const calculated = calculate(input);
    const solved = solveTarget(input, 10);

    expect(calculated.valid).toBe(true);
    expect(calculated.shipping).toBe(0);
    expect(solved.error).toBeUndefined();
    expect(solved.result?.valid).toBe(true);
    expect(solved.result?.shipping).toBe(0);
  });

  it("associa mensagens concretas a comprimento, largura e altura inválidos", () => {
    const fields = [
      ["length", /comprimento/i],
      ["width", /largura/i],
      ["height", /altura/i],
    ] as const;

    for (const [field, label] of fields) {
      for (const value of [-1, Number.NaN]) {
        const input = makeInput({ [field]: value });
        const issue = issueFor(input, field);
        const solved = solveTarget(input, 10);

        expect(issue).toBeDefined();
        expect(issue?.message).toMatch(label);
        expect(issue?.message).not.toMatch(/^dimensões inválidas\.?$/i);
        expect(solved.price).toBeNull();
        expect(solved.error).toMatch(label);
      }
    }
  });

  it("em dimensões parciais, lista cada medida ausente na issue do helper", () => {
    const input = makeInput({ length: 20, width: 0, height: 0 });
    const issues = getPackageInputIssues(input);
    const partialIssue = issues.find(issue =>
      /dimensões parciais/i.test(issue.message)
    );

    expect(partialIssue).toBeDefined();
    expect(partialIssue?.message).toMatch(/largura/i);
    expect(partialIssue?.message).toMatch(/altura/i);
  });

  it("usa peso dimensional positivo quando o peso físico é zero e as dimensões são completas", () => {
    const input = makeInput({
      weight: 0,
      weightExact: 0,
      length: 20,
      width: 30,
      height: 5,
    });
    const calculated = calculate(input);
    const solved = solveTarget(input, 10);

    expect(calculated.valid).toBe(true);
    expect(calculated.dimensionalWeight).toBe(0.5);
    expect(calculated.weightUsed).toBe(0.5);
    expect(Number.isFinite(calculated.shipping)).toBe(true);
    expect(solved.result?.valid).toBe(true);
  });

  it("preserva o erro de custo por kg sem convertê-lo em erro de peso genérico", () => {
    const input = makeInput({
      costMode: "kg",
      productKg: 0,
    });
    const calculated = calculate(input);
    const solved = solveTarget(input, 10);

    expect(calculated.valid).toBe(false);
    expect(calculated.error).toMatch(/custo por kg/i);
    expect(calculated.error).not.toMatch(/^peso inválido\.?$/i);
    expect(solved.price).toBeNull();
    expect(solved.error).toMatch(/custo por kg/i);
    expect(solved.error).not.toMatch(/^peso inválido\.?$/i);
  });

  it("preserva custos, tributos e o resultado válido ao corrigir somente a altura", () => {
    const selected = applyPackagingSelection(
      selectWeightBand(
        makeInput({
          cost: 88,
          packaging: 4.5,
          operation: 2,
          itemQuantity: 3,
          taxFederal: 6.15,
          taxPis: 0.65,
          taxCofins: 3.2,
          taxIrpj: 1.5,
          taxCsll: 1.1,
          taxIcms: 4,
          taxDifal: 2,
        }),
        "1"
      ),
      "p"
    );
    const corrected = { ...selected, height: 5 };
    const copy = { ...corrected };
    const result = calculate(corrected);
    const copiedResult = calculate(copy);

    expect(corrected).toMatchObject({
      cost: selected.cost,
      packaging: selected.packaging,
      operation: selected.operation,
      taxFederal: selected.taxFederal,
      taxPis: selected.taxPis,
      taxCofins: selected.taxCofins,
      taxIrpj: selected.taxIrpj,
      taxCsll: selected.taxCsll,
      taxIcms: selected.taxIcms,
      taxDifal: selected.taxDifal,
    });
    expect(result.valid).toBe(true);
    expect(copiedResult).toEqual(result);
    expect(result.productCost).toBe(264);
    expect(result.operation).toBe(2);
    expect(result.packaging).toBe(4.5);
    expect(result.taxes).toBe(copiedResult.taxes);
  });
});
