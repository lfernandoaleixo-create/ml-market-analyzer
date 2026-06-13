import { describe, it, expect } from "vitest";
import {
  classifyStatusName,
  normalizeStatusName,
  buildStatusMap,
} from "./orderStatus";

describe("normalizeStatusName", () => {
  it("strips accents and lowercases", () => {
    expect(normalizeStatusName("Devolução")).toBe("devolucao");
    expect(normalizeStatusName("  Cancelado ")).toBe("cancelado");
    expect(normalizeStatusName(null)).toBe("");
  });
});

describe("classifyStatusName", () => {
  it("classifies cancelled/returned/refunded as excluded", () => {
    expect(classifyStatusName("Cancelado")).toBe("excluded");
    expect(classifyStatusName("Cancelamento")).toBe("excluded");
    expect(classifyStatusName("Devolução")).toBe("excluded");
    expect(classifyStatusName("Estorno")).toBe("excluded");
    expect(classifyStatusName("Reembolso")).toBe("excluded");
    expect(classifyStatusName("Pedido recusado")).toBe("excluded");
  });

  it("classifies real sale states as effective", () => {
    expect(classifyStatusName("Entregue")).toBe("effective");
    expect(classifyStatusName("Enviado")).toBe("effective");
    expect(classifyStatusName("Separação")).toBe("effective");
    expect(classifyStatusName("NF Emitida")).toBe("effective");
    expect(classifyStatusName("Pronto para envio")).toBe("effective");
    expect(classifyStatusName("Pago")).toBe("effective");
  });

  it("classifies 'Não pago' as excluded (não é venda efetivada)", () => {
    expect(classifyStatusName("Não pago")).toBe("excluded");
  });

  it("defaults to effective for empty/unknown", () => {
    expect(classifyStatusName("")).toBe("effective");
    expect(classifyStatusName("Algum status novo")).toBe("effective");
  });
});

describe("buildStatusMap", () => {
  it("indexes statuses by id with classification", () => {
    const map = buildStatusMap([
      { id: 1, name: "Entregue" },
      { id: 2, name: "Devolução" },
      { id: 3, name: "Cancelado" },
    ]);
    expect(map.get(1)?.klass).toBe("effective");
    expect(map.get(2)?.klass).toBe("excluded");
    expect(map.get(3)?.klass).toBe("excluded");
    expect(map.get(2)?.name).toBe("Devolução");
  });
});
