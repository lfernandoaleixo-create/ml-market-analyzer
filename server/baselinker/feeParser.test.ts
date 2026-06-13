import { describe, it, expect } from "vitest";
import { parseOrderFees } from "./feeParser";

describe("parseOrderFees", () => {
  it("soma múltiplas comissões e extrai frete do vendedor", () => {
    const txt =
      "comissão sobre venda dos produtos: 29.10 drop_off comissão sobre venda dos produtos: 11.52 Frete pago pelo vendedor: -68.80 Método de envio: Normal - Standard";
    const r = parseOrderFees(txt);
    expect(r.commission).toBeCloseTo(40.62, 2);
    expect(r.sellerShipping).toBeCloseTo(68.8, 2);
    expect(r.matched).toBe(true);
  });

  it("ignora frete pago pelo comprador", () => {
    const txt =
      "drop_off comissão sobre venda dos produtos: 7.46 Frete pago pelo vendedor: -15.75 Frete pago pelo comprador: 73.99 Método de envio: ME2";
    const r = parseOrderFees(txt);
    expect(r.commission).toBeCloseTo(7.46, 2);
    expect(r.sellerShipping).toBeCloseTo(15.75, 2);
  });

  it("trata pedido sem frete do vendedor", () => {
    const txt = "drop_off comissão sobre venda dos produtos: 21.69 Método de envio: Normal - Standard";
    const r = parseOrderFees(txt);
    expect(r.commission).toBeCloseTo(21.69, 2);
    expect(r.sellerShipping).toBe(0);
    expect(r.matched).toBe(true);
  });

  it("aceita formato pt-BR com vírgula decimal", () => {
    const txt = "comissão sobre venda dos produtos: 1.234,56 Frete pago pelo vendedor: -78,75";
    const r = parseOrderFees(txt);
    expect(r.commission).toBeCloseTo(1234.56, 2);
    expect(r.sellerShipping).toBeCloseTo(78.75, 2);
  });

  it("retorna zeros e matched=false para texto vazio/sem padrão", () => {
    expect(parseOrderFees("")).toEqual({ commission: 0, sellerShipping: 0, matched: false });
    expect(parseOrderFees(null)).toEqual({ commission: 0, sellerShipping: 0, matched: false });
    expect(parseOrderFees("Método de envio: Normal")).toEqual({ commission: 0, sellerShipping: 0, matched: false });
  });
});
