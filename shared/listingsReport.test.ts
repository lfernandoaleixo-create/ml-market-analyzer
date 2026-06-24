import { describe, it, expect } from "vitest";
import { buildListingsReportTable } from "./listingsReport";
import type { ListingRow } from "./account";

/** Helper para montar um ListingRow completo com overrides. */
function makeRow(over: Partial<ListingRow> = {}): ListingRow {
  return {
    itemId: "MLB1",
    title: "Produto de Teste",
    price: 49.9,
    currency: "BRL",
    availableQuantity: 100,
    soldQuantity: 3,
    status: "active",
    listingType: "gold_special",
    visits: 120,
    visitsAvailable: true,
    conversion: 0.025,
    health: 0.85,
    stockValue: 4990,
    ...over,
  };
}

describe("buildListingsReportTable", () => {
  it("monta o cabeçalho com TODAS as colunas da lista (sem dias)", () => {
    const t = buildListingsReportTable([makeRow()]);
    expect(t.head).toEqual([
      "Anúncio",
      "SKU",
      "Preço",
      "Estoque",
      "Vendas",
      "Visitas",
      "Conversão",
      "Saúde",
      "Status",
    ]);
    expect(t.dayColCount).toBe(0);
  });

  it("retorna uma linha por anúncio e o total correto", () => {
    const t = buildListingsReportTable([
      makeRow({ title: "Alpha" }),
      makeRow({ itemId: "MLB2", title: "Beta" }),
    ]);
    expect(t.rows).toHaveLength(2);
    expect(t.count).toBe(2);
    expect(t.rows[0][0]).toBe("Alpha");
    expect(t.rows[1][0]).toBe("Beta");
  });

  it("formata preço em BRL, conversão e saúde em %", () => {
    const [row] = buildListingsReportTable([makeRow()]).rows;
    // Preço (índice 2)
    expect(row[2]).toContain("49,90");
    // Conversão (penúltima antes de Status): 0.025 -> "2,5%"
    expect(row).toContain("2,5%");
    // Saúde: 0.85 -> "85%"
    expect(row).toContain("85%");
  });

  it("mostra '—' para visitas e conversão quando não disponíveis", () => {
    const [row] = buildListingsReportTable([
      makeRow({ visitsAvailable: false, visits: 0, conversion: null }),
    ]).rows;
    // Visitas (índice 5) e Conversão devem ser "—"
    expect(row[5]).toBe("—");
    // a coluna de conversão (sem dias) é o índice 6
    expect(row[6]).toBe("—");
  });

  it("mostra '—' na coluna SKU quando ausente e o SKU quando presente", () => {
    const semSku = buildListingsReportTable([makeRow({ sku: "" })]).rows[0];
    expect(semSku[1]).toBe("—");
    const comSku = buildListingsReportTable([makeRow({ sku: "ABC-123" })]).rows[0];
    expect(comSku[1]).toBe("ABC-123");
  });

  it("mostra '—' na saúde quando ausente", () => {
    const [row] = buildListingsReportTable([makeRow({ health: null })]).rows;
    expect(row).toContain("—");
  });

  it("cria colunas de dias a partir da série diária e preenche valores/lacunas", () => {
    const t = buildListingsReportTable([
      makeRow({
        title: "ComSerie",
        dailyVisits: [
          { date: "2026-06-21", visits: 8 },
          { date: "2026-06-22", visits: 5 },
        ],
      }),
      makeRow({
        itemId: "MLB2",
        title: "Parcial",
        dailyVisits: [{ date: "2026-06-21", visits: 2 }],
      }),
    ]);
    expect(t.dayColCount).toBe(2);
    // As colunas de dia ficam entre "Visitas" (idx 5) e "Conversão".
    const r0 = t.rows[0];
    expect(r0[6]).toBe("8");
    expect(r0[7]).toBe("5");
    // Item com série mais curta: a 2ª coluna de dia vira "—".
    const r1 = t.rows[1];
    expect(r1[6]).toBe("2");
    expect(r1[7]).toBe("—");
  });

  it("deriva as colunas de dias do item com a série mais longa", () => {
    const t = buildListingsReportTable([
      makeRow({ title: "Curto", dailyVisits: [{ date: "2026-06-23", visits: 1 }] }),
      makeRow({
        itemId: "MLB2",
        title: "Longo",
        dailyVisits: [
          { date: "2026-06-21", visits: 2 },
          { date: "2026-06-22", visits: 3 },
          { date: "2026-06-23", visits: 4 },
          { date: "2026-06-24", visits: 0 },
        ],
      }),
    ]);
    expect(t.dayColCount).toBe(4);
    expect(t.head).toHaveLength(9 + 4);
  });

  it("inclui o subtítulo com janela de visitas e filtros aplicados", () => {
    const t = buildListingsReportTable([makeRow()], {
      visitWindow: 30,
      filtersLabel: "Ativos · Premium",
    });
    expect(t.subtitle).toContain("Visitas dos últimos 30 dias");
    expect(t.subtitle).toContain("Ativos · Premium");
  });

  it("traduz o status para rótulo em português", () => {
    const t = buildListingsReportTable([
      makeRow({ status: "paused" }),
      makeRow({ itemId: "MLB2", status: "closed" }),
    ]);
    expect(t.rows[0].at(-1)).toBe("Pausado");
    expect(t.rows[1].at(-1)).toBe("Encerrado");
  });

  it("subtítulo vazio quando não há opções", () => {
    const t = buildListingsReportTable([makeRow()]);
    expect(t.subtitle).toBe("");
  });
});
