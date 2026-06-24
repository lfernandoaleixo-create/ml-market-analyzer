import { describe, it, expect } from "vitest";
import { buildListingsReportHtml } from "./listingsReport";
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
    stockValue: 4990,
    ...over,
  };
}

describe("buildListingsReportHtml", () => {
  it("inclui o cabeçalho da marca e o total de anúncios", () => {
    const html = buildListingsReportHtml([makeRow(), makeRow({ itemId: "MLB2" })]);
    expect(html).toContain("TOUJOURS");
    expect(html).toContain("Market Intelligence");
    expect(html).toContain("2 anúncio(s)");
  });

  it("renderiza uma linha de tabela por anúncio", () => {
    const items = [makeRow({ title: "Alpha" }), makeRow({ itemId: "MLB2", title: "Beta" })];
    const html = buildListingsReportHtml(items);
    const rowCount = (html.match(/<tr class=/g) ?? []).length;
    expect(rowCount).toBe(2);
    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
  });

  it("escapa caracteres HTML no título para evitar injeção", () => {
    const html = buildListingsReportHtml([makeRow({ title: 'Colar <b> & "aspas"' })]);
    expect(html).toContain("Colar &lt;b&gt; &amp; &quot;aspas&quot;");
    expect(html).not.toContain('Colar <b> & "aspas"');
  });

  it("mostra '—' quando as visitas não estão disponíveis", () => {
    const html = buildListingsReportHtml([makeRow({ visitsAvailable: false, visits: 0 })]);
    expect(html).toContain('<td class="num strong">—</td>');
  });

  it("cria colunas de dias a partir da série diária e preenche valores/lacunas", () => {
    const items = [
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
    ];
    const html = buildListingsReportHtml(items);
    const dayHeaders = (html.match(/<th class="num day">/g) ?? []).length;
    expect(dayHeaders).toBe(2);
    expect(html).toContain('<td class="num day">8</td>');
    expect(html).toContain('<td class="num day">5</td>');
    expect(html).toContain('<td class="num day">2</td>');
    expect(html).toContain('<td class="num day">—</td>');
  });

  it("inclui o subtítulo com janela de visitas e filtros aplicados", () => {
    const html = buildListingsReportHtml([makeRow()], {
      visitWindow: 30,
      filtersLabel: "Ativos · Premium",
    });
    expect(html).toContain("Visitas dos últimos 30 dias");
    expect(html).toContain("Ativos · Premium");
  });

  it("traduz o status para rótulo em português", () => {
    const html = buildListingsReportHtml([
      makeRow({ status: "paused" }),
      makeRow({ itemId: "MLB2", status: "closed" }),
    ]);
    expect(html).toContain(">Pausado<");
    expect(html).toContain(">Encerrado<");
  });

  it("não inclui o subtítulo quando não há opções", () => {
    const html = buildListingsReportHtml([makeRow()]);
    expect(html).not.toContain('class="sub"');
  });
});
