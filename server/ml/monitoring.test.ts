import { describe, expect, it } from "vitest";
import { buildBackfillSnapshots } from "./monitoring";

describe("buildBackfillSnapshots", () => {
  const base = {
    monitoredProductId: 1,
    itemId: "MLB-TEST-123",
    basePrice: 250,
    baseSold: 1000,
    basePosition: 5,
    baseRating: 4.6,
    baseReviews: 320,
    days: 14,
  };

  it("gera um ponto por dia (inclusive o dia 0), em ordem cronológica", () => {
    const rows = buildBackfillSnapshots(base);
    // days..0 inclusive = days + 1 pontos
    expect(rows).toHaveLength(base.days + 1);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].capturedAt).toBeGreaterThan(rows[i - 1].capturedAt);
    }
  });

  it("produz vendas acumuladas não-decrescentes (curva de crescimento coerente)", () => {
    const rows = buildBackfillSnapshots(base);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].soldQuantity!).toBeGreaterThanOrEqual(rows[i - 1].soldQuantity!);
    }
    // O último ponto deve estar próximo da base de vendas atual.
    expect(rows[rows.length - 1].soldQuantity).toBe(base.baseSold);
  });

  it("mantém o preço dentro de uma faixa plausível ao redor do preço base", () => {
    const rows = buildBackfillSnapshots(base);
    for (const r of rows) {
      expect(r.price!).toBeGreaterThan(base.basePrice * 0.9);
      expect(r.price!).toBeLessThan(base.basePrice * 1.1);
    }
  });

  it("nunca gera posição menor que 1", () => {
    const rows = buildBackfillSnapshots({ ...base, basePosition: 1 });
    for (const r of rows) {
      expect(r.position!).toBeGreaterThanOrEqual(1);
    }
  });

  it("é determinístico para o mesmo itemId", () => {
    const a = buildBackfillSnapshots(base);
    const b = buildBackfillSnapshots(base);
    expect(a.map((r) => r.price)).toEqual(b.map((r) => r.price));
    expect(a.map((r) => r.position)).toEqual(b.map((r) => r.position));
  });
});
