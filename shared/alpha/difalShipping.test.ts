import { describe, expect, it } from "vitest";
import { calculate, defaultInput, money, solveTarget } from "./pricing";

const base = { ...defaultInput, cost: 40, taxIcms: 0, taxDifal: 0 };

describe("DIFAL é imposto e não tarifa de envio", () => {
  it("preserva frete e comissão a preço e pacote fixos", () => {
    const without = calculate(base, 100);
    const withDifal = calculate({ ...base, taxDifal: 5 }, 100);
    expect(without.valid).toBe(true);
    expect(withDifal.valid).toBe(true);
    expect(withDifal.shipping).toBe(without.shipping);
    expect(withDifal.commission).toBe(without.commission);
    expect(money(withDifal.taxes - without.taxes)).toBe(5);
    expect(money(without.profit - withDifal.profit)).toBe(5);
  });

  it("pode mudar o envio indiretamente se o preço por margem cruza uma faixa", () => {
    const without = solveTarget(base, 15);
    const withDifal = solveTarget({ ...base, taxDifal: 5 }, 15);
    expect(without.result?.valid).toBe(true);
    expect(withDifal.result?.valid).toBe(true);
    expect(withDifal.price!).toBeGreaterThan(without.price!);
    expect(without.price!).toBeLessThan(79);
    expect(withDifal.price!).toBeGreaterThanOrEqual(79);
    expect(withDifal.result!.priceBand).not.toBe(without.result!.priceBand);
    expect(withDifal.result!.shipping).not.toBe(without.result!.shipping);
    expect(withDifal.result!.margin).toBeGreaterThanOrEqual(15);
  });
});
