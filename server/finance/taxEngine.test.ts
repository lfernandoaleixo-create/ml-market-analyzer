import { describe, it, expect } from "vitest";
import { defaultTaxConfig } from "../../shared/finance";
import {
  computeProfit,
  taxRevenue,
  addProfit,
  emptyProfit,
  federalLines,
  icmsLine,
  icmsSplit,
} from "./taxEngine";

describe("taxEngine — federal (Lucro Presumido)", () => {
  it("soma PIS+COFINS+IRPJ+CSLL ≈ 5,93% da receita", () => {
    const cfg = defaultTaxConfig();
    const lines = federalLines(1000, cfg);
    const total = lines.reduce((s, l) => s + l.amount, 0);
    // 6.5 + 30 + 12 + 10.8 = 59.3
    expect(total).toBeCloseTo(59.3, 2);
  });
});

describe("taxEngine — ICMS sem TTS", () => {
  const cfg = defaultTaxConfig();

  it("venda dentro de MG usa alíquota interna de origem (18%)", () => {
    const { line, inState } = icmsLine(1000, "MG", "sem_tts", cfg);
    expect(inState).toBe(true);
    expect(line.ratePercent).toBe(18);
    expect(line.amount).toBe(180);
  });

  it("venda interestadual para SP usa carga do destino (18%)", () => {
    const { line, inState } = icmsLine(1000, "SP", "sem_tts", cfg);
    expect(inState).toBe(false);
    expect(line.ratePercent).toBe(18);
    expect(line.amount).toBe(180);
  });

  it("venda interestadual para BA usa carga do destino (20,5%)", () => {
    const { line } = icmsLine(1000, "BA", "sem_tts", cfg);
    expect(line.ratePercent).toBe(20.5);
    expect(line.amount).toBe(205);
  });

  it("destino desconhecido cai no fallback (origem) e sinaliza estimativa", () => {
    const { line } = icmsLine(1000, null, "sem_tts", cfg);
    expect(line.ratePercent).toBe(18);
    expect(line.label).toMatch(/estimado/i);
  });

  it("aplica FCP quando configurado para a UF de destino", () => {
    const c = defaultTaxConfig();
    c.fcpByUF = { RJ: 2 };
    const { line } = icmsLine(1000, "RJ", "sem_tts", c);
    // RJ interna 20 + FCP 2 = 22
    expect(line.ratePercent).toBe(22);
    expect(line.amount).toBe(220);
    expect(line.label).toMatch(/FCP/);
  });
});

describe("taxEngine — ICMS com TTS", () => {
  const cfg = defaultTaxConfig();

  it("interestadual com TTS usa carga efetiva de 1,3%", () => {
    const { line } = icmsLine(1000, "SP", "com_tts", cfg);
    expect(line.ratePercent).toBe(1.3);
    expect(line.amount).toBe(13);
  });

  it("interna MG com TTS usa carga efetiva de 6%", () => {
    const { line } = icmsLine(1000, "MG", "com_tts", cfg);
    expect(line.ratePercent).toBe(6);
    expect(line.amount).toBe(60);
  });

  it("permite ajustar a carga TTS para 1,0% (compromisso de arrecadação)", () => {
    const c = defaultTaxConfig();
    c.ttsInterstate = 1.0;
    const { line } = icmsLine(1000, "SP", "com_tts", c);
    expect(line.amount).toBe(10);
  });
});

describe("taxEngine — taxRevenue efetiva", () => {
  it("sem TTS interestadual SP ≈ 5,93% + 18% = 23,93%", () => {
    const cfg = defaultTaxConfig();
    const b = taxRevenue(1000, "SP", "sem_tts", cfg);
    expect(b.federalTotal).toBeCloseTo(59.3, 2);
    expect(b.icmsTotal).toBe(180);
    expect(b.taxTotal).toBeCloseTo(239.3, 2);
    expect(b.effectiveRate).toBeCloseTo(23.93, 2);
  });

  it("com TTS interestadual SP ≈ 5,93% + 1,3% = 7,23%", () => {
    const cfg = defaultTaxConfig();
    const b = taxRevenue(1000, "SP", "com_tts", cfg);
    expect(b.taxTotal).toBeCloseTo(72.3, 2);
    expect(b.effectiveRate).toBeCloseTo(7.23, 2);
  });
});

describe("taxEngine — decomposição ICMS x DIFAL (sem TTS)", () => {
  const cfg = defaultTaxConfig();

  it("interestadual SP: ICMS saída 12% + DIFAL 6% = 18% (soma == total)", () => {
    const s = icmsSplit(1000, "SP", "sem_tts", cfg);
    // SP interno 18, saída S/SE = 12 → DIFAL = 6
    expect(s.icmsBaseAmount).toBe(120); // 12% de 1000
    expect(s.difalAmount).toBe(60); // 6% de 1000
    expect(s.fcpAmount).toBe(0);
    expect(s.totalAmount).toBe(180);
    // a soma das linhas deve bater com o total
    const sum = s.lines.reduce((acc, l) => acc + l.amount, 0);
    expect(sum).toBeCloseTo(s.totalAmount, 2);
  });

  it("interestadual BA: saída 7% + DIFAL 13,5% = 20,5% (soma == total)", () => {
    const s = icmsSplit(1000, "BA", "sem_tts", cfg);
    // BA interno 20,5, saída N/NE/CO = 7 → DIFAL = 13,5
    expect(s.icmsBaseAmount).toBe(70);
    expect(s.difalAmount).toBe(135);
    expect(s.totalAmount).toBe(205);
  });

  it("venda interna (MG): sem DIFAL, ICMS interno cheio", () => {
    const s = icmsSplit(1000, "MG", "sem_tts", cfg);
    expect(s.difalAmount).toBe(0);
    expect(s.icmsBaseAmount).toBe(180); // 18% de 1000
    expect(s.totalAmount).toBe(180);
  });

  it("FCP entra separado e a soma continua igual ao total", () => {
    const c = defaultTaxConfig();
    c.fcpByUF = { RJ: 2 };
    const s = icmsSplit(1000, "RJ", "sem_tts", c);
    // RJ interno 20, saída 12 → DIFAL 8; FCP 2
    expect(s.icmsBaseAmount).toBe(120);
    expect(s.difalAmount).toBe(80);
    expect(s.fcpAmount).toBe(20);
    expect(s.totalAmount).toBe(220);
    const sum = s.lines.reduce((acc, l) => acc + l.amount, 0);
    expect(sum).toBeCloseTo(220, 2);
  });

  it("com TTS não gera DIFAL (linha única efetiva)", () => {
    const s = icmsSplit(1000, "SP", "com_tts", cfg);
    expect(s.difalAmount).toBe(0);
    expect(s.totalAmount).toBe(13); // 1,3% de 1000
  });

  it("taxRevenue expoe icmsInterstateTotal/difalTotal e bate com icmsTotal", () => {
    const b = taxRevenue(1000, "SP", "sem_tts", cfg);
    expect(b.icmsInterstateTotal).toBe(120);
    expect(b.difalTotal).toBe(60);
    expect(b.fcpTotal).toBe(0);
    expect(b.icmsInterstateTotal + b.difalTotal + b.fcpTotal).toBeCloseTo(b.icmsTotal, 2);
  });
});

describe("taxEngine — computeProfit", () => {
  const cfg = defaultTaxConfig();

  it("calcula lucro líquido descontando todos os componentes", () => {
    const p = computeProfit(
      { revenue: 1000, commission: 125, shipping: 0, cmv: 300, ads: 50, destinationUF: "SP" },
      "sem_tts",
      cfg,
    );
    // tax = 239.3 ; net = 1000 -125 -0 -300 -239.3 -50 = 285.7
    expect(p.tax).toBeCloseTo(239.3, 2);
    expect(p.netProfit).toBeCloseTo(285.7, 2);
    expect(p.margin).toBeCloseTo(0.2857, 3);
  });

  it("TTS aumenta o lucro líquido (mesma venda)", () => {
    const input = { revenue: 1000, commission: 125, shipping: 0, cmv: 300, ads: 50, destinationUF: "SP" as const };
    const sem = computeProfit(input, "sem_tts", cfg);
    const com = computeProfit(input, "com_tts", cfg);
    expect(com.netProfit).toBeGreaterThan(sem.netProfit);
    // diferença = (239.3 - 72.3) = 167
    expect(com.netProfit - sem.netProfit).toBeCloseTo(167, 1);
  });

  it("margem é null quando receita é zero", () => {
    const p = computeProfit(
      { revenue: 0, commission: 0, shipping: 0, cmv: 0, destinationUF: "SP" },
      "sem_tts",
      cfg,
    );
    expect(p.margin).toBeNull();
  });
});

describe("taxEngine — agregação", () => {
  const cfg = defaultTaxConfig();
  it("addProfit soma componentes e recalcula a margem", () => {
    const a = computeProfit({ revenue: 1000, commission: 125, shipping: 0, cmv: 300, ads: 0, destinationUF: "SP" }, "sem_tts", cfg);
    const b = computeProfit({ revenue: 500, commission: 60, shipping: 20, cmv: 150, ads: 0, destinationUF: "MG" }, "sem_tts", cfg);
    const sum = addProfit(emptyProfit(), addProfit(a, b));
    expect(sum.revenue).toBe(1500);
    expect(sum.commission).toBe(185);
    expect(sum.netProfit).toBeCloseTo(a.netProfit + b.netProfit, 1);
  });
});
