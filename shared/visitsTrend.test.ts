import { describe, expect, it } from "vitest";
import { isoIsWeekend, computeVisitsTrendPct, dayAxisLabelParts } from "./visitsTrend";

describe("isoIsWeekend", () => {
  it("flags Saturday and Sunday as weekend", () => {
    // 2026-06-13 is a Saturday, 2026-06-14 is a Sunday (UTC).
    expect(isoIsWeekend("2026-06-13")).toBe(true);
    expect(isoIsWeekend("2026-06-14")).toBe(true);
  });

  it("does not flag weekdays", () => {
    // 2026-06-10 Wed, 2026-06-11 Thu, 2026-06-12 Fri, 2026-06-15 Mon.
    expect(isoIsWeekend("2026-06-10")).toBe(false);
    expect(isoIsWeekend("2026-06-11")).toBe(false);
    expect(isoIsWeekend("2026-06-12")).toBe(false);
    expect(isoIsWeekend("2026-06-15")).toBe(false);
  });

  it("returns false for malformed input", () => {
    expect(isoIsWeekend("")).toBe(false);
    expect(isoIsWeekend("not-a-date")).toBe(false);
  });
});

describe("computeVisitsTrendPct", () => {
  const mk = (vals: number[]) =>
    vals.map((v, i) => ({ date: `2026-06-${String(i + 1).padStart(2, "0")}`, visits: v }));

  it("returns null with too little history", () => {
    expect(computeVisitsTrendPct(mk([1, 2, 3]), "2026-06-30")).toBeNull();
    expect(computeVisitsTrendPct([], "2026-06-30")).toBeNull();
  });

  it("computes a positive trend when the second half grows", () => {
    // first half [10,10]=20, second half [15,15]=30 => +50%
    const pct = computeVisitsTrendPct(mk([10, 10, 15, 15]), "2026-06-30");
    expect(pct).toBeCloseTo(50, 5);
  });

  it("computes a negative trend when the second half shrinks", () => {
    // first half [20,20]=40, second half [10,10]=20 => -50%
    const pct = computeVisitsTrendPct(mk([20, 20, 10, 10]), "2026-06-30");
    expect(pct).toBeCloseTo(-50, 5);
  });

  it("ignores today (partial) when computing the trend", () => {
    // 4 past days [10,10,15,15] => +50%; today has a huge partial value that
    // must be excluded.
    const series = [
      ...mk([10, 10, 15, 15]),
      { date: "2026-06-30", visits: 9999 },
    ];
    const pct = computeVisitsTrendPct(series, "2026-06-30");
    expect(pct).toBeCloseTo(50, 5);
  });

  it("returns +100 when coming from zero", () => {
    const pct = computeVisitsTrendPct(mk([0, 0, 5, 5]), "2026-06-30");
    expect(pct).toBe(100);
  });

  it("returns null when everything is zero", () => {
    expect(computeVisitsTrendPct(mk([0, 0, 0, 0]), "2026-06-30")).toBeNull();
  });
});

describe("dayAxisLabelParts (regra global do eixo de dias)", () => {
  it("extrai número do dia e abreviação do dia da semana", () => {
    // 2026-06-10 é uma quarta-feira (UTC).
    const p = dayAxisLabelParts("2026-06-10");
    expect(p.dayNum).toBe("10");
    expect(p.weekday).toBe("qua");
  });

  it("marca hoje com a cor primária e negrito", () => {
    const p = dayAxisLabelParts("2026-06-11", "2026-06-11");
    expect(p.isToday).toBe(true);
    expect(p.color).toBe("var(--primary)");
    expect(p.bold).toBe(true);
  });

  it("marca fim de semana em vermelho", () => {
    const sat = dayAxisLabelParts("2026-06-13");
    const sun = dayAxisLabelParts("2026-06-14");
    expect(sat.isWeekend).toBe(true);
    expect(sat.color).toBe("#dc2626");
    expect(sun.isWeekend).toBe(true);
    expect(sun.color).toBe("#dc2626");
  });

  it("hoje tem prioridade sobre fim de semana na cor", () => {
    const p = dayAxisLabelParts("2026-06-13", "2026-06-13"); // sábado + hoje
    expect(p.color).toBe("var(--primary)");
  });

  it("dia útil comum usa a cor de texto padrão e sem negrito", () => {
    const p = dayAxisLabelParts("2026-06-10");
    expect(p.color).toBe("var(--foreground)");
    expect(p.bold).toBe(false);
  });

  it("lida com ISO malformado sem quebrar", () => {
    const p = dayAxisLabelParts("");
    expect(p.dayNum).toBe("");
    expect(p.weekday).toBe("");
  });
});
