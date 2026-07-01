import { describe, it, expect } from "vitest";
import { analyzeDuplicates, type DuplicateAnalysisRow } from "../shared/skuSheet";

function row(partial: Partial<DuplicateAnalysisRow> & { id: number }): DuplicateAnalysisRow {
  return {
    position: partial.id,
    tipoSku: "2",
    categoryName: "Casa, Móveis e Decoração",
    produto: "PRODUTO",
    variante: "",
    productNumber: 1,
    variantNumber: 1,
    sku: "2-CASA-1-1",
    ...partial,
  };
}

describe("analyzeDuplicates — Tipo 1: linha idêntica (erro do usuário)", () => {
  it("detecta duas linhas com a MESMA identidade de conteúdo", () => {
    const rows = [
      row({ id: 1, position: 10, produto: "CAIXA PRESENTE", variante: "P", variantNumber: 1, sku: "2-CASA-1-1" }),
      row({ id: 2, position: 11, produto: "CAIXA PRESENTE", variante: "P", variantNumber: 2, sku: "2-CASA-1-2" }),
    ];
    const res = analyzeDuplicates(rows);
    expect(res.identicalGroups).toHaveLength(1);
    expect(res.identicalGroups[0].ids).toEqual([1, 2]);
    expect(res.identicalGroups[0].positions).toEqual([10, 11]);
    expect(res.identicalGroups[0].produto).toBe("CAIXA PRESENTE");
    // Não é colisão de SKU (os SKUs até são diferentes); é conteúdo repetido.
    expect(res.skuCollisions).toHaveLength(0);
  });

  it("ignora diferenças de caixa/espaços ao comparar identidade", () => {
    const rows = [
      row({ id: 1, produto: "  Caixa   Presente ", variante: "  P  " }),
      row({ id: 2, produto: "CAIXA PRESENTE", variante: "p", variantNumber: 2, sku: "2-CASA-1-2" }),
    ];
    const res = analyzeDuplicates(rows);
    expect(res.identicalGroups).toHaveLength(1);
  });

  it("variantes textuais diferentes NÃO são linha idêntica", () => {
    const rows = [
      row({ id: 1, produto: "CAIXA", variante: "20x30", variantNumber: 1, sku: "2-CASA-1-1" }),
      row({ id: 2, produto: "CAIXA", variante: "40x50", variantNumber: 2, sku: "2-CASA-1-2" }),
    ];
    const res = analyzeDuplicates(rows);
    expect(res.identicalGroups).toHaveLength(0);
    expect(res.skuCollisions).toHaveLength(0);
  });
});

describe("analyzeDuplicates — Tipo 2: colisão de SKU (erro do sistema)", () => {
  it("detecta mesmo SKU em variações DIFERENTES (corrigível)", () => {
    const rows = [
      row({ id: 1, position: 65, produto: "ENVELOPE", variante: "20x30", variantNumber: 1, sku: "1-SERVICOS-46-1" }),
      row({ id: 2, position: 67, produto: "ENVELOPE", variante: "40x50", variantNumber: 1, sku: "1-SERVICOS-46-1" }),
    ];
    const res = analyzeDuplicates(rows);
    expect(res.skuCollisions).toHaveLength(1);
    expect(res.skuCollisions[0].sku).toBe("1-SERVICOS-46-1");
    expect(res.skuCollisions[0].positions).toEqual([65, 67]);
    // Não é linha idêntica (variantes diferentes).
    expect(res.identicalGroups).toHaveLength(0);
  });

  it("mesmo SKU + conteúdo idêntico é classificado como Tipo 1, não Tipo 2", () => {
    const rows = [
      row({ id: 1, produto: "ENVELOPE", variante: "20x30", variantNumber: 1, sku: "1-SERVICOS-46-1" }),
      row({ id: 2, produto: "ENVELOPE", variante: "20x30", variantNumber: 1, sku: "1-SERVICOS-46-1" }),
    ];
    const res = analyzeDuplicates(rows);
    expect(res.identicalGroups).toHaveLength(1);
    expect(res.skuCollisions).toHaveLength(0);
  });
});

describe("analyzeDuplicates — sem problemas", () => {
  it("variações legítimas com SKUs únicos não geram alerta", () => {
    const rows = [
      row({ id: 1, produto: "ENVELOPE", variante: "20x30", variantNumber: 1, sku: "1-SERVICOS-46-1" }),
      row({ id: 2, produto: "ENVELOPE", variante: "26x36", variantNumber: 2, sku: "1-SERVICOS-46-2" }),
      row({ id: 3, produto: "ENVELOPE", variante: "40x50", variantNumber: 3, sku: "1-SERVICOS-46-3" }),
    ];
    const res = analyzeDuplicates(rows);
    expect(res.identicalGroups).toHaveLength(0);
    expect(res.skuCollisions).toHaveLength(0);
  });

  it("linhas sem produto são ignoradas na análise de identidade", () => {
    const rows = [
      row({ id: 1, produto: "", variante: "", sku: "" }),
      row({ id: 2, produto: "", variante: "", sku: "" }),
    ];
    const res = analyzeDuplicates(rows);
    expect(res.identicalGroups).toHaveLength(0);
    expect(res.skuCollisions).toHaveLength(0);
  });
});
