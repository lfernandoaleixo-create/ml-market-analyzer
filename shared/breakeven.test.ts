import { describe, it, expect } from "vitest";
import {
  calculateBreakEven,
  sumFixed,
  sumVariable,
  type BreakEvenInput,
  type FixedCosts,
  type VariableCosts,
} from "./breakeven";

function fixed(overrides: Partial<FixedCosts> = {}): FixedCosts {
  return {
    proLabore: 0,
    salaries: 0,
    rent: 0,
    waterAndEnergy: 0,
    internet: 0,
    insurance: 0,
    managementSystem: 0,
    otherSoftware: 0,
    bankFees: 0,
    financing: 0,
    accounting: 0,
    other: 0,
    ...overrides,
  };
}

function variable(overrides: Partial<VariableCosts> = {}): VariableCosts {
  return {
    cmv: 0,
    advertising: 0,
    channelCommission: 0,
    shipping: 0,
    packaging: 0,
    returns: 0,
    taxRate: 0,
    otherTaxRate: 0,
    ...overrides,
  };
}

describe("sumFixed / sumVariable", () => {
  it("soma custos fixos", () => {
    expect(sumFixed(fixed({ rent: 1000, salaries: 2000, other: 500 }))).toBe(3500);
  });
  it("soma custos variáveis com impostos sobre o faturamento", () => {
    const v = variable({ cmv: 1000, shipping: 200, taxRate: 6, otherTaxRate: 0 });
    // 1000 + 200 + 6% de 10000 = 1200 + 600 = 1800
    expect(sumVariable(v, 10000)).toBe(1800);
  });
});

describe("calculateBreakEven — caso típico", () => {
  const input: BreakEvenInput = {
    sales: { grossRevenue: 10000, cancelledRevenue: 0, unitsSold: 100 },
    variable: variable({ cmv: 4000, channelCommission: 1200, shipping: 800, taxRate: 6 }),
    fixed: fixed({ rent: 1500, salaries: 1000 }),
  };

  it("calcula ticket, margem de contribuição e ponto de equilíbrio", () => {
    const r = calculateBreakEven(input);
    expect(r.valid).toBe(true);
    expect(r.netRevenue).toBe(10000);
    expect(r.avgTicket).toBe(100); // 10000 / 100
    // variável = 4000+1200+800 + 6% de 10000 (600) = 6600
    expect(r.variableTotal).toBe(6600);
    expect(r.variableCostPerUnit).toBe(66);
    expect(r.contributionMargin).toBe(3400); // 10000 - 6600
    expect(r.contributionMarginPct).toBeCloseTo(34, 1);
    expect(r.contributionMarginPerUnit).toBe(34);
    expect(r.fixedTotal).toBe(2500);
    // PE R$ = 2500 / 0.34 = 7352.94
    expect(r.breakEvenRevenue).toBeCloseTo(7352.94, 0);
    // PE unid = ceil(2500 / 34) = 74
    expect(r.breakEvenUnits).toBe(74);
    // lucro = 3400 - 2500 = 900
    expect(r.netProfit).toBe(900);
  });

  it("gera 4 cenários (PE, atual, -10%, +10%)", () => {
    const r = calculateBreakEven(input);
    expect(r.scenarios).toHaveLength(4);
    const current = r.scenarios.find((s) => s.key === "current")!;
    expect(current.units).toBe(100);
    expect(current.profit).toBe(900);
    const plus = r.scenarios.find((s) => s.key === "plus10")!;
    expect(plus.units).toBe(110);
    expect(plus.profit).toBeGreaterThan(current.profit);
    const minus = r.scenarios.find((s) => s.key === "minus10")!;
    expect(minus.profit).toBeLessThan(current.profit);
  });

  it("donut de custos pela margem inclui fixo, variável e margem", () => {
    const r = calculateBreakEven(input);
    expect(r.costShare.map((c) => c.key).sort()).toEqual(["fixed", "margin", "variable"]);
  });
});

describe("calculateBreakEven — casos inválidos", () => {
  it("sem faturamento/unidades é inválido", () => {
    const r = calculateBreakEven({
      sales: { grossRevenue: 0, cancelledRevenue: 0, unitsSold: 0 },
      variable: variable(),
      fixed: fixed(),
    });
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("margem de contribuição negativa é sinalizada", () => {
    const r = calculateBreakEven({
      sales: { grossRevenue: 1000, cancelledRevenue: 0, unitsSold: 10 },
      variable: variable({ cmv: 1200 }), // custo > receita
      fixed: fixed({ rent: 100 }),
    });
    expect(r.valid).toBe(false);
    expect(r.contributionMargin).toBeLessThan(0);
  });

  it("considera faturamento cancelado na receita líquida", () => {
    const r = calculateBreakEven({
      sales: { grossRevenue: 10000, cancelledRevenue: 2000, unitsSold: 80 },
      variable: variable({ cmv: 3000 }),
      fixed: fixed({ rent: 1000 }),
    });
    expect(r.netRevenue).toBe(8000);
  });
});
