import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Vendas from "../client/src/pages/Vendas";

const state = vi.hoisted(() => ({
  permalink: undefined as string | undefined,
}));
const official =
  "https://produto.mercadolivre.com.br/MLB-5446974387-cabana-infantil-barraca-casinha-crianca-dobravel-colorida-vermelho-_JM";
vi.mock("../client/src/lib/trpc", () => {
  const product = () => ({
    itemId: "MLB5446974387",
    title: "Cabana infantil",
    thumbnail: null,
    permalink: state.permalink,
    unitsSold: 1,
    revenue: 110.33,
  });
  return {
    trpc: {
      account: {
        connection: { useQuery: () => ({ data: { connected: true } }) },
        storeLifetime: { useQuery: () => ({ data: { firstSaleMs: 0 } }) },
        salesRange: {
          useQuery: () => ({
            isLoading: false,
            data: {
              kpis: {
                revenue: 110.33,
                orders: 1,
                unitsSold: 1,
                cancelledAmount: 0,
                cancelled: 0,
                avgTicket: 110.33,
              },
              daily: [{ date: "2026-11-13", revenue: 110.33, orders: 1 }],
              topProducts: [product()],
            },
          }),
        },
        productsByDay: {
          useQuery: () => ({
            isLoading: false,
            data: {
              date: "2026-11-13",
              revenue: 110.33,
              orders: 1,
              unitsSold: 1,
              cancelledOrders: 1,
              cancelledRevenue: 110.33,
              cancelledUnits: 1,
              products: [product()],
              cancelledProducts: [{ ...product(), title: "Cabana cancelada" }],
            },
          }),
        },
      },
    },
  };
});
vi.mock("../client/src/hooks/usePeriod", () => ({
  usePeriod: () => ({
    key: "current",
    title: "Novembro de 2026",
    setKey: vi.fn(),
    range: { fromMs: 0, toMs: 1 },
    fromIso: "2026-11-01",
    toIso: "2026-11-30",
    setFromIso: vi.fn(),
    setToIso: vi.fn(),
  }),
}));
vi.mock("../client/src/components/PeriodSelector", () => ({
  PeriodSelector: () => null,
}));
vi.mock("../client/src/components/sales/MargemVendas", () => ({
  MargemVendas: () => null,
}));
vi.mock("recharts", async importOriginal => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: () => null,
}));
beforeEach(() => {
  vi.stubGlobal("React", React);
  state.permalink = undefined;
});
afterEach(() => vi.unstubAllGlobals());

describe("Links dos anúncios na tela de Vendas", () => {
  it("título, cancelado e botão Ver usam o mesmo permalink oficial em nova aba", () => {
    state.permalink = official;
    const html = renderToStaticMarkup(<Vendas />);
    const links =
      html.match(/href="https:\/\/produto\.mercadolivre\.com\.br\/[^\"]+"/g) ??
      [];
    expect(links).toHaveLength(4);
    for (const href of links) expect(href).toBe(`href="${official}"`);
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain(
      'href="https://produto.mercadolivre.com.br/MLB5446974387"'
    );
    expect(html).toContain("Cabana cancelada");
  });
  it("produto continua visível sem âncora e sem Ver quando o permalink é desconhecido", () => {
    const html = renderToStaticMarkup(<Vendas />);
    expect(html).toContain("Cabana infantil");
    expect(html).toContain("Cabana cancelada");
    expect(html).not.toContain('href="https://produto.mercadolivre.com.br/');
    expect(html).not.toContain("Ver <");
  });
});
