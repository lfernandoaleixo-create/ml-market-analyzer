import { describe, expect, it } from "vitest";
import {
  parsePublicSalesQuery,
  resolvePublicSalesBounds,
  publicSalesDayStart,
  publicSalesDate,
} from "./publicSalesQuery";
const now = Date.parse("2026-11-16T02:30:00Z");
describe("Períodos externos no calendário de Brasília", () => {
  it("days termina no dia BRT, não no dia UTC", () => {
    const q = parsePublicSalesQuery("/sales/orders", { days: "7" }, now);
    const b = resolvePublicSalesBounds(q, now);
    expect(b.from).toBe("2026-11-09");
    expect(b.to).toBe("2026-11-15");
    expect(new Date(b.fromMs).toISOString()).toBe("2026-11-09T03:00:00.000Z");
    expect(new Date(b.toMs).toISOString()).toBe("2026-11-16T02:59:59.999Z");
  });
  it("ano bissexto e janela inclusiva de366 dias são aceitos", () => {
    const q = parsePublicSalesQuery(
      "/sales/history",
      { from: "2024-01-01", to: "2024-12-31" },
      now
    );
    expect(resolvePublicSalesBounds(q, now).to).toBe("2024-12-31");
  });
  it.each([
    { from: "2026-02-30", to: "2026-03-01" },
    { from: "2025-02-29", to: "2025-03-01" },
    { from: "2026-99-01", to: "2026-11-15" },
    { from: "2026-11-16", to: "2026-11-15" },
    { from: "2026-11-01" },
    { to: "2026-11-15" },
    { from: "2024-01-01", to: "2025-01-01" },
    { from: "2026-11-16", to: "2026-11-16" },
  ])("rejeita data impossível/incompleta/futura %j", params => {
    expect(() => parsePublicSalesQuery("/sales/orders", params, now)).toThrow();
  });
  it("preserva SKU com espaços sem normalizar o texto comercial", () => {
    expect(
      parsePublicSalesQuery("/sales/orders", { sku: " 001-FOX " }, now).sku
    ).toBe(" 001-FOX ");
  });
  it.each([
    "includeFinancial",
    "ownerUserId",
    "access_token",
    "buyerId",
    "url",
  ])("não permite injetar %s", key => {
    expect(() =>
      parsePublicSalesQuery("/sales/history", { [key]: "true" }, now)
    ).toThrow();
  });
  it("períodos históricos usam regras IANA, não offset fixo", () => {
    expect(new Date(publicSalesDayStart("2018-01-15")).toISOString()).toBe(
      "2018-01-15T02:00:00.000Z"
    );
    expect(new Date(publicSalesDayStart("2018-06-15")).toISOString()).toBe(
      "2018-06-15T03:00:00.000Z"
    );
    expect(publicSalesDate(publicSalesDayStart("2018-11-04"))).toBe(
      "2018-11-04"
    );
  });
});
