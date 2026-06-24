import { describe, it, expect } from "vitest";
import { buildListingsReportTable, listingTypeLabel } from "./listingsReport";
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
    catalogListing: false,
    stockValue: 4990,
    ...over,
  };
}

// Índices das colunas fixas (antes das colunas de dia).
const COL = {
  anuncio: 0,
  sku: 1,
  tipo: 2,
  catalogo: 3,
  ads: 4,
  preco: 5,
  vendas: 6,
  visitas: 7,
} as const;

describe("listingTypeLabel", () => {
  it("mapeia os tipos do ML para rótulos curtos", () => {
    expect(listingTypeLabel("gold_special")).toBe("Premium");
    expect(listingTypeLabel("gold_pro")).toBe("Clássico");
    expect(listingTypeLabel("desconhecido")).toBe("desconhecido");
    expect(listingTypeLabel(undefined)).toBe("—");
  });
});

describe("buildListingsReportTable", () => {
  it("monta o cabeçalho com as novas colunas (sem dias)", () => {
    const t = buildListingsReportTable([makeRow()]);
    expect(t.head).toEqual([
      "Anúncio",
      "SKU",
      "Tipo de Anúncio",
      "Catálogo",
      "ADS",
      "Preço",
      "Vendas",
      "Total de Visitas",
      "Conversão",
    ]);
    expect(t.dayColCount).toBe(0);
    expect(t.dayColStart).toBe(8);
  });

  it("não inclui mais as colunas Estoque, Saúde e Status", () => {
    const t = buildListingsReportTable([makeRow()]);
    expect(t.head).not.toContain("Estoque");
    expect(t.head).not.toContain("Saúde");
    expect(t.head).not.toContain("Status");
  });

  it("retorna uma linha por anúncio e o total correto", () => {
    const t = buildListingsReportTable([
      makeRow({ title: "Alpha" }),
      makeRow({ itemId: "MLB2", title: "Beta" }),
    ]);
    expect(t.rows).toHaveLength(2);
    expect(t.count).toBe(2);
    expect(t.rows[0][COL.anuncio]).toBe("Alpha");
    expect(t.rows[1][COL.anuncio]).toBe("Beta");
  });

  it("preenche Tipo de Anúncio (Premium/Clássico)", () => {
    const t = buildListingsReportTable([
      makeRow({ listingType: "gold_special" }),
      makeRow({ itemId: "MLB2", listingType: "gold_pro" }),
    ]);
    expect(t.rows[0][COL.tipo]).toBe("Premium");
    expect(t.rows[1][COL.tipo]).toBe("Clássico");
  });

  it("preenche Catálogo como Sim/Não", () => {
    const t = buildListingsReportTable([
      makeRow({ catalogListing: true }),
      makeRow({ itemId: "MLB2", catalogListing: false }),
    ]);
    expect(t.rows[0][COL.catalogo]).toBe("Sim");
    expect(t.rows[1][COL.catalogo]).toBe("Não");
  });

  it("preenche ADS conforme o conjunto de itemIds patrocinados", () => {
    const adsItemIds = new Set(["MLB1"]);
    const t = buildListingsReportTable(
      [makeRow({ itemId: "MLB1" }), makeRow({ itemId: "MLB2" })],
      { adsItemIds },
    );
    expect(t.rows[0][COL.ads]).toBe("Sim");
    expect(t.rows[1][COL.ads]).toBe("Não");
  });

  it("ADS é 'Não' quando nenhum conjunto é informado", () => {
    const t = buildListingsReportTable([makeRow()]);
    expect(t.rows[0][COL.ads]).toBe("Não");
  });

  it("formata preço em BRL e conversão em %", () => {
    const [row] = buildListingsReportTable([makeRow()]).rows;
    expect(row[COL.preco]).toContain("49,90");
    // Conversão é a última coluna (sem dias): 0.025 -> "2,5%"
    expect(row.at(-1)).toBe("2,5%");
  });

  it("mostra '—' para visitas e conversão quando não disponíveis", () => {
    const [row] = buildListingsReportTable([
      makeRow({ visitsAvailable: false, visits: 0, conversion: null }),
    ]).rows;
    expect(row[COL.visitas]).toBe("—");
    expect(row.at(-1)).toBe("—");
  });

  it("mostra '—' na coluna SKU quando ausente e o SKU quando presente", () => {
    const semSku = buildListingsReportTable([makeRow({ sku: "" })]).rows[0];
    expect(semSku[COL.sku]).toBe("—");
    const comSku = buildListingsReportTable([makeRow({ sku: "ABC-123" })]).rows[0];
    expect(comSku[COL.sku]).toBe("ABC-123");
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
    expect(t.dayColStart).toBe(8);
    // As colunas de dia começam no índice 8 (após Visitas), antes de Conversão.
    const r0 = t.rows[0];
    expect(r0[8]).toBe("8");
    expect(r0[9]).toBe("5");
    const r1 = t.rows[1];
    expect(r1[8]).toBe("2");
    expect(r1[9]).toBe("—");
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
    // 9 colunas fixas (incl. Conversão) + 4 dias = 13.
    expect(t.head).toHaveLength(9 + 4);
  });

  it("inclui o subtítulo com janela de visitas e filtros aplicados", () => {
    const t = buildListingsReportTable([makeRow()], {
      visitWindow: 30,
      filtersLabel: "Ativos · Premium",
    });
    expect(t.subtitle).toContain("Visitas dos últimos 30 dias");
    expect(t.subtitle).toContain("Ativos · Premium");
    expect(t.filtersLabel).toBe("Ativos · Premium");
  });

  it("subtítulo vazio quando não há opções", () => {
    const t = buildListingsReportTable([makeRow()]);
    expect(t.subtitle).toBe("");
    expect(t.filtersLabel).toBeUndefined();
  });
});
