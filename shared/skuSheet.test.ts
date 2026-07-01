import { describe, it, expect } from "vitest";
import {
  buildSku,
  buildSkuKit,
  resolveProductNumber,
  resolveVariantNumber,
  isSkuDuplicate,
  normalizeProductName,
  type ProductNumberRow,
  type VariantNumberRow,
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

describe("resolveVariantNumber", () => {
  const grp = (over: Partial<VariantNumberRow> & { id: number }): VariantNumberRow => ({
    tipoSku: "1",
    categoryName: "Serviços",
    productNumber: 46,
    variantNumber: 1,
    ...over,
  });

  it("mantém a variante quando ela ainda não é usada no grupo", () => {
    const rows: VariantNumberRow[] = [grp({ id: 1, variantNumber: 1 })];
    // linha nova (id 2) do mesmo grupo, com variante ainda nula
    const v = resolveVariantNumber(rows, 2, {
      tipoSku: "1",
      categoryName: "Serviços",
      productNumber: 46,
      variantNumber: 2,
    });
    expect(v).toBe(2);
  });

  it("incrementa a variante para não repetir SKU no mesmo grupo (caso linhas 65/66)", () => {
    const rows: VariantNumberRow[] = [grp({ id: 65, variantNumber: 1 })];
    // linha 66, mesmo tipo+categoria+Nº produto, tentando variante 1 (duplicaria)
    const v = resolveVariantNumber(rows, 66, {
      tipoSku: "1",
      categoryName: "Serviços",
      productNumber: 46,
      variantNumber: 1,
    });
    expect(v).toBe(2);
  });

  it("preenche buracos: escolhe o menor Nº livre", () => {
    const rows: VariantNumberRow[] = [
      grp({ id: 1, variantNumber: 1 }),
      grp({ id: 3, variantNumber: 3 }),
    ];
    const v = resolveVariantNumber(rows, 2, {
      tipoSku: "1",
      categoryName: "Serviços",
      productNumber: 46,
      variantNumber: 1, // 1 está ocupado -> deve ir para 2
    });
    expect(v).toBe(2);
  });

  it("grupos diferentes não interferem (categoria distinta)", () => {
    const rows: VariantNumberRow[] = [
      grp({ id: 1, categoryName: "Serviços", variantNumber: 1 }),
    ];
    const v = resolveVariantNumber(rows, 2, {
      tipoSku: "1",
      categoryName: "Saúde",
      productNumber: 46,
      variantNumber: 1,
    });
    expect(v).toBe(1); // outro grupo, pode usar 1
  });

  it("preserva a variante quando o grupo é inválido (sem categoria)", () => {
    const rows: VariantNumberRow[] = [grp({ id: 1 })];
    const v = resolveVariantNumber(rows, 2, {
      tipoSku: "1",
      categoryName: null,
      productNumber: 46,
      variantNumber: 5,
    });
    expect(v).toBe(5);
  });
});

describe("isSkuDuplicate", () => {
  const rows = [
    { id: 1, sku: "1-SERVICOS-46-1" },
    { id: 2, sku: "1-SERVICOS-46-2" },
    { id: 3, sku: "" },
  ];

  it("detecta SKU repetido em outra linha", () => {
    expect(isSkuDuplicate(rows, 99, "1-SERVICOS-46-1")).toBe(true);
  });

  it("ignora a própria linha", () => {
    expect(isSkuDuplicate(rows, 1, "1-SERVICOS-46-1")).toBe(false);
  });

  it("SKU vazio nunca duplica", () => {
    expect(isSkuDuplicate(rows, 99, "")).toBe(false);
  });

  it("SKU inédito não duplica", () => {
    expect(isSkuDuplicate(rows, 99, "1-SERVICOS-46-9")).toBe(false);
  });
});
