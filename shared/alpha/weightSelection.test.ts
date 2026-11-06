import { describe, expect, it } from "vitest";
import {
  calculate,
  defaultInput,
  solveTarget,
  type PricingInput,
} from "./pricing";
import { SHIPPING_WEIGHTS } from "./tariffs";
import {
  WEIGHT_BAND_OPTIONS,
  getWeightBandId,
  normalizeWeightEntry,
  restoreExactWeight,
  selectWeightBand,
  setExactWeight,
} from "./weightSelection";

const makeInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  ...defaultInput,
  ...overrides,
});

describe("opções e limites das faixas de peso", () => {
  it("deriva todas as faixas da tabela e desabilita a faixa aberta", () => {
    expect(WEIGHT_BAND_OPTIONS).toHaveLength(SHIPPING_WEIGHTS.length);
    expect(
      WEIGHT_BAND_OPTIONS.filter(option => option.selectable)
    ).toHaveLength(29);

    expect(WEIGHT_BAND_OPTIONS[0]).toEqual({
      id: "0",
      lower: 0,
      upper: 0.3,
      label: "Até 0,3 kg",
      selectable: true,
    });
    expect(WEIGHT_BAND_OPTIONS[1]).toMatchObject({
      id: "1",
      lower: 0.3,
      upper: 0.5,
      label: "Mais de 0,3 até 0,5 kg",
      selectable: true,
    });
    expect(WEIGHT_BAND_OPTIONS.at(-1)).toEqual({
      id: "29",
      lower: 150,
      upper: Infinity,
      label: "Mais de 150 kg — informar peso exato",
      selectable: false,
    });
  });

  it("usa limite superior inclusivo e limite inferior exclusivo", () => {
    expect(getWeightBandId(0)).toBe("0");
    expect(getWeightBandId(0.3)).toBe("0");
    expect(getWeightBandId(0.30001)).toBe("1");
    expect(getWeightBandId(0.5)).toBe("1");
    expect(getWeightBandId(0.50001)).toBe("2");

    for (const invalid of [Number.NaN, -0.01, -Infinity, Infinity]) {
      expect(getWeightBandId(invalid)).toBe("");
    }
  });
});

describe("seleção, restauração e entrada exata", () => {
  it("seleciona a segunda faixa, preserva o peso exato e restaura sem arredondar", () => {
    const input = makeInput({
      weight: 0.263,
      weightInputMode: "exact",
      weightExact: 0.263,
    });

    const selected = selectWeightBand(input, "1");
    expect(selected).toEqual({
      ...input,
      weight: 0.5,
      weightInputMode: "band",
      weightExact: 0.263,
    });

    const changedBand = selectWeightBand(selected, "2");
    expect(changedBand.weight).toBe(1);
    expect(changedBand.weightExact).toBe(0.263);

    expect(restoreExactWeight(changedBand)).toEqual({
      ...changedBand,
      weight: 0.263,
      weightInputMode: "exact",
      weightExact: 0.263,
    });
  });

  it("define os dois campos da entrada exata, inclusive para valores inválidos", () => {
    const input = makeInput({ weight: 0.5, weightExact: 0.5 });
    const entered = setExactWeight(input, Number.NaN);

    expect(entered).toEqual({
      ...input,
      weight: Number.NaN,
      weightInputMode: "exact",
      weightExact: Number.NaN,
    });
  });

  it("recusa ids inexistentes e a faixa aberta sem atribuir Infinity", () => {
    const input = makeInput();

    expect(() => selectWeightBand(input, "29")).toThrow(RangeError);
    expect(() => selectWeightBand(input, "-1")).toThrow(RangeError);
    expect(() => selectWeightBand(input, "missing")).toThrow(RangeError);
    expect(input.weight).not.toBe(Infinity);
  });
});

describe("normalização de metadados de peso", () => {
  it("converte legado sem modo para exact usando o peso ativo", () => {
    const legacy = {
      ...makeInput({ weight: 0.263, weightExact: 0.5 }),
      weightInputMode: undefined,
    } as unknown as PricingInput;

    expect(normalizeWeightEntry(legacy)).toEqual({
      ...legacy,
      weightInputMode: "exact",
      weightExact: 0.263,
    });
  });

  it("preserva por identidade uma banda coerente, inclusive exact NaN", () => {
    const coherent = makeInput({
      weight: 0.5,
      weightInputMode: "band",
      weightExact: Number.NaN,
    });

    expect(normalizeWeightEntry(coherent)).toBe(coherent);
  });
  it("preserves a band with no exact backup and does not infer it when restoring exact mode", () => {
    const coherent = makeInput({
      weight: 0.5,
      weightInputMode: "band",
      weightExact: undefined as unknown as number,
    });

    expect(normalizeWeightEntry(coherent)).toBe(coherent);
    const exact = restoreExactWeight(coherent);
    expect(exact.weightInputMode).toBe("exact");
    expect(exact.weight).toBeNaN();
    expect(exact.weightExact).toBeNaN();
  });

  it("corrige banda incoerente para exact sem forçar o limite inferior", () => {
    const incoherent = makeInput({
      weight: 0.37,
      weightInputMode: "band",
      weightExact: 0.263,
    });

    expect(normalizeWeightEntry(incoherent)).toEqual({
      ...incoherent,
      weightInputMode: "exact",
      weightExact: 0.37,
    });
  });

  it("bloqueia peso ativo inválido na normalização, sem inventar peso", () => {
    const invalid = makeInput({
      weight: Number.NaN,
      weightInputMode: "band",
      weightExact: 0.263,
    });

    expect(normalizeWeightEntry(invalid)).toEqual({
      ...invalid,
      weightInputMode: "exact",
      weightExact: Number.NaN,
    });
  });

  it("preserva identidade de exact coerente e alinha exact ausente ou divergente", () => {
    const exact = makeInput({ weight: 0.263, weightExact: 0.263 });
    expect(normalizeWeightEntry(exact)).toBe(exact);

    const divergent = makeInput({ weight: 0.263, weightExact: 0.5 });
    expect(normalizeWeightEntry(divergent)).toEqual({
      ...divergent,
      weightInputMode: "exact",
      weightExact: 0.263,
    });
  });
});

describe("efeito da seleção no core", () => {
  it("não altera custos, impostos ou dimensões ao mudar somente a entrada de peso", () => {
    const input = makeInput({
      weight: 0.263,
      weightInputMode: "exact",
      weightExact: 0.263,
      cost: 88,
      packaging: 4.5,
      length: 20,
      width: 15,
      height: 10,
      taxFederal: 6.15,
      taxIcms: 4,
      taxDifal: 2,
      taxPis: 0.65,
      taxCofins: 3.2,
      taxIrpj: 1.5,
      taxCsll: 1.1,
    });
    const selected = selectWeightBand(input, "1");

    expect(selected.cost).toBe(input.cost);
    expect(selected.packaging).toBe(input.packaging);
    expect(selected.taxFederal).toBe(input.taxFederal);
    expect(selected.taxIcms).toBe(input.taxIcms);
    expect(selected.taxDifal).toBe(input.taxDifal);
    expect(selected.length).toBe(input.length);
    expect(selected.width).toBe(input.width);
    expect(selected.height).toBe(input.height);

    const before = calculate(input);
    const after = calculate(selected);
    expect(after.productCost).toBe(before.productCost);
    expect(after.operation).toBe(before.operation);
    expect(after.packaging).toBe(before.packaging);
    expect(after.taxes).toBe(before.taxes);
    expect(after.dimensionalWeight).toBe(before.dimensionalWeight);
  });

  it("usa o maior peso entre entrada e cubagem, sem selecionar a faixa .3 kg", () => {
    const input = makeInput({
      weight: 0.263,
      weightInputMode: "exact",
      weightExact: 0.263,
      length: 40,
      width: 30,
      height: 20,
    });
    const selected = selectWeightBand(input, "0");
    const result = calculate(selected);
    const withoutDimensions = calculate({
      ...selected,
      length: 0,
      width: 0,
      height: 0,
    });

    expect(selected.weight).toBe(0.3);
    expect(result.valid).toBe(true);
    expect(result.dimensionalWeight).toBe(4);
    expect(result.weightUsed).toBe(4);
    expect(result.weightBand).toBe("3–4 kg");
    expect(result.weightBand).not.toBe("até 0,3 kg");
    expect(result.shipping).not.toBe(withoutDimensions.shipping);
  });

  it("muda calculate e solveTarget quando a faixa muda, mantendo a meta", () => {
    const input = makeInput({
      weight: 0.3,
      weightInputMode: "exact",
      weightExact: 0.3,
      length: 0,
      width: 0,
      height: 0,
    });
    const selected = selectWeightBand(input, "2");
    const calculatedBefore = calculate(input);
    const calculatedAfter = calculate(selected);
    const targetBefore = solveTarget(input, 20);
    const targetAfter = solveTarget(selected, 20);

    expect(calculatedBefore.valid).toBe(true);
    expect(calculatedAfter.valid).toBe(true);
    expect(calculatedAfter.weightUsed).toBe(1);
    expect(calculatedAfter.shipping).not.toBe(calculatedBefore.shipping);

    expect(targetBefore.price).not.toBeNull();
    expect(targetAfter.price).not.toBeNull();
    expect(targetAfter.price).not.toBe(targetBefore.price);
    expect(targetBefore.result?.margin).toBeGreaterThanOrEqual(20);
    expect(targetAfter.result?.margin).toBeGreaterThanOrEqual(20);
  });

  it("aceita peso zero manual com dimensões zeradas, mas bloqueia NaN e dimensões parciais legadas", () => {
    const zero = makeInput({
      shippingMode: "manual",
      weight: 0,
      weightInputMode: "exact",
      weightExact: 0,
      length: 0,
      width: 0,
      height: 0,
    });
    const nan = { ...zero, weight: Number.NaN, weightExact: Number.NaN };
    const partial = { ...zero, length: 20 };

    expect(calculate(zero).valid).toBe(true);
    expect(calculate(nan).valid).toBe(false);
    expect(calculate(partial).valid).toBe(false);
    expect(calculate(partial).error).toMatch(/dimensões parciais/i);
  });
});
