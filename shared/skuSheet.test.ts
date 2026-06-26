import { describe, it, expect } from "vitest";
import {
  buildSku,
  buildSkuKit,
  resolveProductNumber,
  normalizeProductName,
  type ProductNumberRow,
} from "./skuSheet";

describe("buildSku", () => {
  it("monta o SKU no formato [TIPO]-[CATEGORIA]-[Nº produto]-[Nº variante]", () => {
    expect(
      buildSku({ tipoSku: "2", categoryName: "Casa, Móveis e Decoração", productNumber: 1, variantNumber: 1 }),
    ).toBe("2-CASA-1-1");
  });

  it("retorna vazio enquanto algum componente estiver ausente", () => {
    expect(buildSku({ tipoSku: "", categoryName: "Casa, Móveis e Decoração", productNumber: 1, variantNumber: 1 })).toBe("");
    expect(buildSku({ tipoSku: "2", categoryName: null, productNumber: 1, variantNumber: 1 })).toBe("");
    expect(buildSku({ tipoSku: "2", categoryName: "Agro", productNumber: null, variantNumber: 1 })).toBe("");
    expect(buildSku({ tipoSku: "2", categoryName: "Agro", productNumber: 1, variantNumber: null })).toBe("");
  });
});

describe("buildSkuKit", () => {
  it("adiciona o sufixo -KITINS quando habilitado", () => {
    expect(buildSkuKit("2-CASA-1-1", true)).toBe("2-CASA-1-1-KITINS");
  });
  it("retorna vazio quando desabilitado ou sem SKU base", () => {
    expect(buildSkuKit("2-CASA-1-1", false)).toBe("");
    expect(buildSkuKit("", true)).toBe("");
  });
});

describe("normalizeProductName", () => {
  it("ignora maiúsculas/minúsculas, espaços nas pontas e múltiplos espaços", () => {
    expect(normalizeProductName("  PALITO  DE   HASHI ")).toBe("palito de hashi");
    expect(normalizeProductName("Palito De Hashi")).toBe("palito de hashi");
  });
  it("retorna vazio para null/undefined/vazio", () => {
    expect(normalizeProductName(null)).toBe("");
    expect(normalizeProductName(undefined)).toBe("");
    expect(normalizeProductName("   ")).toBe("");
  });
});

describe("resolveProductNumber", () => {
  const rows: ProductNumberRow[] = [
    { id: 1, produto: "Palito de Hashi de Bambu", productNumber: 6 },
    { id: 2, produto: "Palito de Hashi de Bambu", productNumber: 6 },
    { id: 3, produto: "Tábua de Corte", productNumber: 7 },
    { id: 4, produto: "Filme Plástico", productNumber: 23 },
  ];

  it("reaproveita o Nº de um produto de mesmo nome (case-insensitive)", () => {
    expect(resolveProductNumber(rows, 99, "PALITO DE HASHI DE BAMBU")).toBe(6);
    expect(resolveProductNumber(rows, 99, "  palito  de hashi de bambu ")).toBe(6);
  });

  it("atribui o próximo da sequência para um nome novo", () => {
    expect(resolveProductNumber(rows, 99, "Produto Totalmente Novo")).toBe(24);
  });

  it("ignora a própria linha ao buscar nome igual", () => {
    // Linha 1 sendo editada; existe outra (id 2) com mesmo nome -> reaproveita 6.
    expect(resolveProductNumber(rows, 1, "Palito de Hashi de Bambu")).toBe(6);
  });

  it("trata nome novo quando a única ocorrência é a própria linha", () => {
    const single: ProductNumberRow[] = [{ id: 10, produto: "Único", productNumber: 5 }];
    // Editando a própria linha 10 com um nome novo -> próximo da sequência (5 + 1).
    expect(resolveProductNumber(single, 10, "Outro Nome")).toBe(6);
  });

  it("retorna null quando o nome está vazio", () => {
    expect(resolveProductNumber(rows, 99, "")).toBeNull();
    expect(resolveProductNumber(rows, 99, "   ")).toBeNull();
  });

  it("começa em 1 quando não há linhas com número", () => {
    const empty: ProductNumberRow[] = [{ id: 1, produto: "X", productNumber: null }];
    expect(resolveProductNumber(empty, 99, "Primeiro")).toBe(1);
  });
});
