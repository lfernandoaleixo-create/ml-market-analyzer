import { describe, it, expect } from "vitest";
import {
  normalizeUF,
  normalizeAuctionId,
  getOrders,
  getOrdersDetailed,
  getProductCosts,
  getInventories,
} from "./provider";
import { buildStatusMap } from "./orderStatus";

// Status map shared by the order tests so getOrders doesn't make a network
// call to getOrderStatusList (which would consume a mock response).
const STATUS_MAP = buildStatusMap([
  { id: 0, name: "" },
  { id: 1, name: "Entregue" },
  { id: 2, name: "Devolucao" },
  { id: 3, name: "Cancelado" },
]);

/** Build a fake fetch that returns the given JSON for each sequential call. */
function fakeFetchSequence(responses: any[]) {
  let i = 0;
  return (async () => {
    const body = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const opts = (fetchImpl: typeof fetch) => ({ token: "test-token", fetchImpl });

describe("normalizeUF", () => {
  it("aceita código UF direto", () => {
    expect(normalizeUF("SP")).toBe("SP");
    expect(normalizeUF("mg")).toBe("MG");
  });
  it("mapeia nomes completos", () => {
    expect(normalizeUF("São Paulo")).toBe("SP");
    expect(normalizeUF("MINAS GERAIS")).toBe("MG");
  });
  it("retorna null para desconhecido/vazio", () => {
    expect(normalizeUF("")).toBeNull();
    expect(normalizeUF("Lisboa")).toBeNull();
  });
});

describe("normalizeAuctionId", () => {
  it("extrai o MLB com sufixo de variação", () => {
    expect(normalizeAuctionId("MLB6728481906_194260273300")).toBe("MLB6728481906");
  });
  it("mantém um MLB simples", () => {
    expect(normalizeAuctionId("MLB6711834666")).toBe("MLB6711834666");
  });
  it("retorna null quando não é MLB", () => {
    expect(normalizeAuctionId("ABC123")).toBeNull();
    expect(normalizeAuctionId("")).toBeNull();
  });
});

describe("getInventories", () => {
  it("normaliza a lista de catálogos", async () => {
    const f = fakeFetchSequence([
      { status: "SUCCESS", inventories: [{ inventory_id: 54206, name: "GRUPO FOX" }] },
    ]);
    const list = await getInventories(opts(f));
    expect(list).toEqual([{ inventoryId: 54206, name: "GRUPO FOX" }]);
  });
});

describe("getProductCosts", () => {
  it("mapeia custo por id e por sku, tolerando custo de fornecedor", async () => {
    const f = fakeFetchSequence([
      // getInventoryProductsList (page 1, < 1000 => last)
      { status: "SUCCESS", products: { "100": {}, "200": {} } },
      // getInventoryProductsData
      {
        status: "SUCCESS",
        products: {
          "100": { sku: "ESP-500", text_fields: { name: "Espeto 500un" }, average_cost: 3.7, tax_rate: 0 },
          "200": { sku: "BAM-500", text_fields: { name: "Bambu 500un" }, average_landed_cost: 5.3, tax_rate: 0 },
        },
      },
    ]);
    const { byId, bySku } = await getProductCosts(54206, opts(f));
    expect(byId.get("100")?.averageCost).toBe(3.7);
    expect(byId.get("200")?.averageCost).toBe(5.3); // fallback landed cost
    expect(bySku.get("esp-500")?.name).toBe("Espeto 500un");
  });
});

describe("getOrders", () => {
  it("normaliza pedidos com comissão, frete, UF e itemId", async () => {
    const f = fakeFetchSequence([
      {
        status: "SUCCESS",
        orders: [
          {
            order_id: 1,
            date_confirmed: 1748000000,
            currency: "BRL",
            admin_comments: "comissão sobre venda dos produtos: 109.42 Método de envio: Normal",
            delivery_price: 0,
            delivery_state: "São Paulo",
            order_source: "melibr",
            products: [
              { product_id: "100", sku: "ESP-500", auction_id: "MLB6728481906_194", name: "Espeto", quantity: 2, price_brutto: 180.15 },
            ],
          },
        ],
      },
      // second page empty => stop
      { status: "SUCCESS", orders: [] },
    ]);
    const orders = await getOrders(0, { ...opts(f), statusMap: STATUS_MAP });
    expect(orders).toHaveLength(1);
    const o = orders[0];
    expect(o.commission).toBeCloseTo(109.42, 2);
    expect(o.feesFromText).toBe(true);
    expect(o.destinationUF).toBe("SP");
    expect(o.lines[0].itemId).toBe("MLB6728481906");
    expect(o.lines[0].quantity).toBe(2);
  });

  it("aceita commission como número simples", async () => {
    const f = fakeFetchSequence([
      {
        status: "SUCCESS",
        orders: [
          { order_id: 9, date_confirmed: 1748000000, commission: 23.21, delivery_price: 73.99, delivery_state: "BA", admin_comments: "", products: [] },
        ],
      },
      { status: "SUCCESS", orders: [] },
    ]);
    const orders = await getOrders(0, { ...opts(f), statusMap: STATUS_MAP });
    // No fee text → falls back to numeric commission + delivery_price.
    expect(orders[0].commission).toBe(23.21);
    expect(orders[0].deliveryPrice).toBe(73.99);
    expect(orders[0].feesFromText).toBe(false);
    expect(orders[0].destinationUF).toBe("BA");
  });

  it("exclui pedidos cancelados/devolvidos e conta os efetivados", async () => {
    const f = fakeFetchSequence([
      {
        status: "SUCCESS",
        orders: [
          { order_id: 1, date_confirmed: 1748000000, order_status_id: 1, delivery_state: "SP", admin_comments: "", products: [] },
          { order_id: 2, date_confirmed: 1748000100, order_status_id: 3, delivery_state: "SP", admin_comments: "", products: [] },
          { order_id: 3, date_confirmed: 1748000200, order_status_id: 2, delivery_state: "RJ", admin_comments: "", products: [] },
        ],
      },
      { status: "SUCCESS", orders: [] },
    ]);
    const res = await getOrdersDetailed(0, { ...opts(f), statusMap: STATUS_MAP });
    expect(res.totalSeen).toBe(3);
    expect(res.orders).toHaveLength(1);
    expect(res.orders[0].orderId).toBe(1);
    expect(res.excludedCount).toBe(2);
    expect(res.excludedByStatus["Cancelado"]).toBe(1);
    expect(res.excludedByStatus["Devolucao"]).toBe(1);
  });

  it("quando filterEffective=false, mantem todos os pedidos", async () => {
    const f = fakeFetchSequence([
      {
        status: "SUCCESS",
        orders: [
          { order_id: 1, date_confirmed: 1748000000, order_status_id: 1, delivery_state: "SP", admin_comments: "", products: [] },
          { order_id: 2, date_confirmed: 1748000100, order_status_id: 3, delivery_state: "SP", admin_comments: "", products: [] },
        ],
      },
      { status: "SUCCESS", orders: [] },
    ]);
    const res = await getOrdersDetailed(0, { ...opts(f), statusMap: STATUS_MAP, filterEffective: false });
    expect(res.orders).toHaveLength(2);
    expect(res.excludedCount).toBe(0);
  });
});
