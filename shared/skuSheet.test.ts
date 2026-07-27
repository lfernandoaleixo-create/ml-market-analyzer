import { describe, it, expect } from "vitest";
import {
  buildSku,
  buildSkuKit,
  resolveProductNumber,
  resolveVariantNumber,
  isSkuDuplicate,
  normalizeSku,
  normalizeProductName,
  normalizeVariantText,
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

describe("resolveProductNumber (global)", () => {
  // Linhas com numeração global sequencial
  const rows: ProductNumberRow[] = [
    { id: 1, produto: "Palito de Dente Embalado", productNumber: 1 },
    { id: 2, produto: "Palito de Bambu Unha", productNumber: 2 },
    { id: 3, produto: "Vareta Aromatizador Fibra", productNumber: 3 },
    { id: 4, produto: "Vareta Aromatizador Madeira", productNumber: 4 },
    { id: 5, produto: "Palito de Dente Bambu", productNumber: 5 },
    { id: 6, produto: "Palito de Hashi de Bambu", productNumber: 6 },
    { id: 7, produto: "Vareta Algodão Doce", productNumber: 7 },
  ];

  it("reaproveita o Nº de um produto de mesmo nome (case-insensitive, global)", () => {
    expect(resolveProductNumber(rows, 99, "PALITO DE HASHI DE BAMBU")).toBe(6);
    expect(resolveProductNumber(rows, 99, "  palito  de hashi de bambu ")).toBe(6);
  });

  it("atribui o próximo da sequência GLOBAL para um nome novo", () => {
    // max é 7, então próximo = 7 + 1 = 8
    expect(resolveProductNumber(rows, 99, "Produto Totalmente Novo")).toBe(8);
  });

  it("resgata o número de um produto com mesmo nome independente de categoria", () => {
    // A numeração é global — se o nome já existe, retorna o número dele
    expect(resolveProductNumber(rows, 99, "Vareta Aromatizador Fibra")).toBe(3);
    expect(resolveProductNumber(rows, 99, "vareta aromatizador fibra")).toBe(3);
  });

  it("ignora a própria linha ao buscar nome igual — sem currentProductNumber dá max+1", () => {
    // id 6 tem "Palito de Hashi de Bambu" com Nº 6.
    // Sem passar currentProductNumber (linha nova), atribui max+1 = 8
    expect(resolveProductNumber(rows, 6, "Palito de Hashi de Bambu")).toBe(8);
  });

  it("preserva o número existente quando a linha já tem productNumber e o nome muda", () => {
    // Linha 6 tem Nº 6. Usuário edita o nome para algo novo.
    // Como já tem número (6), PRESERVA — não gera novo.
    expect(resolveProductNumber(rows, 6, "Nome Completamente Diferente", 6)).toBe(6);
  });

  it("preserva o número existente quando usuário redigita o mesmo nome", () => {
    // Linha 6 tem Nº 6. Usuário clica no campo e sai sem mudar.
    // Como já tem número (6), PRESERVA.
    expect(resolveProductNumber(rows, 6, "Palito de Hashi de Bambu", 6)).toBe(6);
  });

  it("reaproveita número de outro produto mesmo quando já tem número (merge de nomes)", () => {
    // Linha 6 tem Nº 6. Usuário muda o nome para "Vareta Aromatizador Fibra" (Nº 3).
    // Deve REAPROVEITAR o Nº 3 (merge), não preservar o 6.
    expect(resolveProductNumber(rows, 6, "Vareta Aromatizador Fibra", 6)).toBe(3);
  });

  it("ignora a própria linha mas encontra outra com mesmo nome", () => {
    // Adicionar uma duplicata
    const rowsWithDup: ProductNumberRow[] = [
      ...rows,
      { id: 8, produto: "Palito de Hashi de Bambu", productNumber: 6 },
    ];
    // Editando id 6, deve encontrar id 8 com mesmo nome e retornar 6
    expect(resolveProductNumber(rowsWithDup, 6, "Palito de Hashi de Bambu")).toBe(6);
  });

  it("retorna null quando o nome está vazio", () => {
    expect(resolveProductNumber(rows, 99, "")).toBeNull();
    expect(resolveProductNumber(rows, 99, "   ")).toBeNull();
  });

  it("começa em 1 quando não há linhas", () => {
    expect(resolveProductNumber([], 99, "Primeiro")).toBe(1);
  });

  it("começa em 1 quando nenhuma linha tem productNumber", () => {
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
    const v = resolveVariantNumber(rows, 2, {
      tipoSku: "1",
      categoryName: "Serviços",
      productNumber: 46,
      variantNumber: 2,
    });
    expect(v).toBe(2);
  });

  it("incrementa a variante para não repetir SKU no mesmo grupo", () => {
    const rows: VariantNumberRow[] = [grp({ id: 65, variantNumber: 1 })];
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
      variantNumber: 1,
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
    expect(v).toBe(1);
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
    { id: 4, sku: "2-CASA-1-1" },
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

  it("detecta duplicata case-insensitive", () => {
    expect(isSkuDuplicate(rows, 99, "2-casa-1-1")).toBe(true);
    expect(isSkuDuplicate(rows, 99, "2-CASA-1-1")).toBe(true);
  });

  it("detecta duplicata ignorando espaços", () => {
    expect(isSkuDuplicate(rows, 99, "2-CASA -1-1")).toBe(true);
    expect(isSkuDuplicate(rows, 99, " 2-CASA-1-1 ")).toBe(true);
  });

  it("detecta duplicata ignorando pontos", () => {
    expect(isSkuDuplicate(rows, 99, "2.CASA.1.1")).toBe(true);
    expect(isSkuDuplicate(rows, 99, "2-CASA.1-1")).toBe(true);
  });
});

describe("normalizeSku", () => {
  it("converte para lowercase e remove espaços e pontos", () => {
    expect(normalizeSku("2-CASA-1-1")).toBe("2-casa-1-1");
    expect(normalizeSku("2-CASA -1-1")).toBe("2-casa-1-1");
    expect(normalizeSku("2.CASA.1.1")).toBe("2-casa-1-1");
    expect(normalizeSku(" 2-CASA-1-1 ")).toBe("2-casa-1-1");
  });

  it("retorna vazio para null/undefined/vazio", () => {
    expect(normalizeSku(null)).toBe("");
    expect(normalizeSku(undefined)).toBe("");
    expect(normalizeSku("")).toBe("");
  });
});

describe("normalizeVariantText (comparação inteligente de variantes)", () => {
  it("'100UND' == '100' == '100 und' == '100un'", () => {
    const base = normalizeVariantText("100");
    expect(normalizeVariantText("100UND")).toBe(base);
    expect(normalizeVariantText("100 und")).toBe(base);
    expect(normalizeVariantText("100un")).toBe(base);
    expect(normalizeVariantText("100 UN")).toBe(base);
    expect(normalizeVariantText("100unid")).toBe(base);
  });

  it("'1.000' == '1000' == '1.000und' == '1000 un'", () => {
    const base = normalizeVariantText("1000");
    expect(normalizeVariantText("1.000")).toBe(base);
    expect(normalizeVariantText("1.000und")).toBe(base);
    expect(normalizeVariantText("1000 un")).toBe(base);
  });

  it("'20×30' == '20x30' == '20 x 30'", () => {
    const base = normalizeVariantText("20x30");
    expect(normalizeVariantText("20×30")).toBe(base);
    expect(normalizeVariantText("20 x 30")).toBe(base);
  });

  it("remove acentos: 'Proteção' == 'Protecao'", () => {
    expect(normalizeVariantText("Proteção")).toBe(normalizeVariantText("Protecao"));
  });

  it("case insensitive: 'ROLO' == 'rolo' == 'Rolo'", () => {
    const base = normalizeVariantText("rolo");
    expect(normalizeVariantText("ROLO")).toBe(base);
    expect(normalizeVariantText("Rolo")).toBe(base);
  });

  it("variantes diferentes continuam diferentes", () => {
    expect(normalizeVariantText("100")).not.toBe(normalizeVariantText("200"));
    expect(normalizeVariantText("20x30")).not.toBe(normalizeVariantText("26x36"));
    expect(normalizeVariantText("ROLO")).not.toBe(normalizeVariantText("CAIXA"));
  });

  it("null/undefined/vazio retorna string vazia", () => {
    expect(normalizeVariantText(null)).toBe("");
    expect(normalizeVariantText(undefined)).toBe("");
    expect(normalizeVariantText("")).toBe("");
  });
});
