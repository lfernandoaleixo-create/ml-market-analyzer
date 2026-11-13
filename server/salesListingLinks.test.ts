import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountProvider } from "./ml/accountProvider";
import { salesPermalink } from "./ml/salesPermalink";

const ITEM = "MLB5446974387";
const OFFICIAL =
  "https://produto.mercadolivre.com.br/MLB-5446974387-cabana-infantil-barraca-casinha-crianca-dobravel-colorida-vermelho-_JM";
const BROKEN = `https://produto.mercadolivre.com.br/${ITEM}`;
const DAY = "2026-11-13";
const range = {
  fromMs: Date.parse(`${DAY}T03:00:00Z`),
  toMs: Date.parse("2026-11-14T02:59:59Z"),
  topLimit: 0,
};
function order(id = ITEM, fields: Record<string, unknown> = {}) {
  return {
    id: `pedido-${id}`,
    date_created: `${DAY}T12:00:00Z`,
    status: "paid",
    total_amount: 110.33,
    payments: [{ status: "approved", transaction_amount: 110.33 }],
    order_items: [
      {
        quantity: 1,
        unit_price: 110.33,
        item: { id, title: "Cabana infantil", ...fields },
      },
    ],
  };
}
function setup(
  paid: any[],
  cancelled: any[] = [],
  details: Record<string, any> = { [ITEM]: { id: ITEM, permalink: OFFICIAL } }
) {
  const provider = new AccountProvider("token-simulado", 3308178634);
  vi.spyOn(provider as any, "getPaidOrders").mockResolvedValue(paid);
  vi.spyOn(provider as any, "getCancelledOrders").mockResolvedValue(cancelled);
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    const ids = url.searchParams.get("ids")!.split(",");
    return new Response(
      JSON.stringify(
        ids.map(id =>
          details[id]
            ? { code: 200, body: details[id] }
            : { code: 404, body: { id } }
        )
      ),
      { status: 200 }
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return { provider, fetchMock };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Validação do permalink informado pela fonte", () => {
  it.each([
    undefined,
    null,
    12,
    "",
    "  ",
    "/MLB-1-_JM",
    "javascript:alert(1)",
    "data:text/html,x",
    "https://usuario:senha@exemplo.com/item",
    BROKEN,
  ])("rejeita valor sem endereço utilizável: %s", value => {
    expect(salesPermalink(value)).toBeUndefined();
  });
  it("mantém permalink completo e parâmetros de página de catálogo sem inferir outro anúncio", () => {
    const catalog =
      "https://www.mercadolivre.com.br/produto/up/MLBU5302791958?wid=MLB7699004738";
    expect(salesPermalink(OFFICIAL)).toBe(OFFICIAL);
    expect(salesPermalink(catalog)).toBe(catalog);
  });
});

describe("Links oficiais dos produtos vendidos", () => {
  it("vendas do dia com imagem consultam o permalink ausente e nunca usam MLB sem hífen", async () => {
    const { provider, fetchMock } = setup([
      order(ITEM, { thumbnail: "https://http2.mlstatic.com/foto.jpg" }),
    ]);
    const result = await provider.getProductsByDay(DAY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.products[0].permalink).toBe(OFFICIAL);
    expect(result.products[0].permalink).not.toBe(BROKEN);
    expect(result.orders).toBe(1);
    expect(result.revenue).toBe(110.33);
    expect(result.unitsSold).toBe(1);
  });

  it("ranking usa detalhes oficiais em vez do caminho abreviado preenchido no pedido", async () => {
    const { provider } = setup([order(ITEM, { permalink: BROKEN })]);
    const result = await provider.getSalesDashboard(range);
    expect(result.topProducts[0].permalink).toBe(OFFICIAL);
    expect(result.kpis.revenue).toBe(110.33);
  });

  it("ranking com imagem e sem permalink também consulta detalhes", async () => {
    const { provider, fetchMock } = setup([
      order(ITEM, { thumbnail: "https://http2.mlstatic.com/foto.jpg" }),
    ]);
    expect(
      (await provider.getSalesDashboard(range)).topProducts[0].permalink
    ).toBe(OFFICIAL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("vendidos e cancelados recebem o mesmo endereço oficial com multiget deduplicado", async () => {
    const { provider, fetchMock } = setup(
      [order()],
      [{ ...order(), status: "cancelled", payments: [] }]
    );
    const result = await provider.getProductsByDay(DAY);
    expect(result.products[0].permalink).toBe(OFFICIAL);
    expect(result.cancelledProducts[0].permalink).toBe(OFFICIAL);
    expect(result.cancelledRevenue).toBe(110.33);
    expect(
      new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("ids")
    ).toBe(ITEM);
  });

  it.each(["getProductsByDay", "getSalesDashboard"] as const)(
    "%s mantém produto sem fabricar link quando detalhe retorna 404",
    async method => {
      const { provider } = setup([order()], [], {});
      const result =
        method === "getProductsByDay"
          ? await provider.getProductsByDay(DAY)
          : await provider.getSalesDashboard(range);
      const products =
        "products" in result ? result.products : result.topProducts;
      expect(products).toHaveLength(1);
      expect(products[0].permalink).toBeUndefined();
      expect(products[0].revenue).toBe(110.33);
    }
  );

  it("falha de detalhe não inventa link nem remove a venda", async () => {
    const { provider, fetchMock } = setup([order()]);
    fetchMock.mockRejectedValue(new Error("indisponível"));
    const result = await provider.getProductsByDay(DAY);
    expect(result.products[0].permalink).toBeUndefined();
    expect(result.revenue).toBe(110.33);
  });

  it("um pedido posterior completa o permalink oficial sem precisar de detalhe", async () => {
    const first = order(ITEM, {
      thumbnail: "https://http2.mlstatic.com/foto.jpg",
    });
    const second = order(ITEM, { permalink: OFFICIAL });
    const { provider, fetchMock } = setup([first, second]);
    const result = await provider.getProductsByDay(DAY);
    expect(result.products[0].permalink).toBe(OFFICIAL);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.products[0].unitsSold).toBe(2);
  });

  it("preserva link oficial do pedido se o detalhe sem permalink falhar", async () => {
    const { provider } = setup([order(ITEM, { permalink: OFFICIAL })], [], {
      [ITEM]: { id: ITEM },
    });
    expect((await provider.getProductsByDay(DAY)).products[0].permalink).toBe(
      OFFICIAL
    );
  });

  it("ranking completo conserva limite de enriquecimento e deixa link desconhecido ausente", async () => {
    const orders = Array.from({ length: 81 }, (_, i) =>
      order(`MLB${i + 1}`, { thumbnail: "https://http2.mlstatic.com/foto.jpg" })
    );
    const { provider, fetchMock } = setup(orders, [], {});
    const result = await provider.getSalesDashboard(range);
    expect(result.topProducts).toHaveLength(81);
    const queried = fetchMock.mock.calls.flatMap(call =>
      new URL(String(call[0])).searchParams.get("ids")!.split(",")
    );
    expect(queried).toHaveLength(80);
    expect(queried).not.toContain("MLB81");
    expect(result.topProducts[80].permalink).toBeUndefined();
  });
});
