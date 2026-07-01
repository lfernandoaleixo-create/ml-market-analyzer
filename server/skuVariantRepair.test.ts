import { describe, it, expect } from "vitest";
import {
  resolveVariantNumber,
  normalizeVariantNumbers,
  buildSku,
  type VariantNumberRow,
} from "../shared/skuSheet";

// Cenário real do bug: ENVELOPE PLÁSTICO DE SEGURANÇA PRETO
// tipo=1, categoria=Serviços, productNumber=46, três variações.
// A linha 60006 ficou com variante 1 (colidindo com 60004) e deveria ser 3.
const envelopeRows: VariantNumberRow[] = [
  { id: 60004, tipoSku: "1", categoryName: "Serviços", productNumber: 46, variantNumber: 1 },
  { id: 60005, tipoSku: "1", categoryName: "Serviços", productNumber: 46, variantNumber: 2 },
  { id: 60006, tipoSku: "1", categoryName: "Serviços", productNumber: 46, variantNumber: 1 },
];

describe("resolveVariantNumber — unicidade por grupo", () => {
  it("nunca aceita variante que colide com outra linha do mesmo grupo", () => {
    // A linha 60006 quer manter 1, mas 60004 já usa 1 → deve ceder para 3.
    const v = resolveVariantNumber(envelopeRows, 60006, {
      tipoSku: "1",
      categoryName: "Serviços",
      productNumber: 46,
      variantNumber: 1,
    });
    expect(v).toBe(3);
  });

  it("mantém a variante quando ela está livre no grupo", () => {
    const v = resolveVariantNumber(envelopeRows, 60006, {
      tipoSku: "1",
      categoryName: "Serviços",
      productNumber: 46,
      variantNumber: 3,
    });
    expect(v).toBe(3);
  });

  it("atribui a menor variante livre quando não há valor desejado", () => {
    const rows: VariantNumberRow[] = [
      { id: 1, tipoSku: "2", categoryName: "Beleza e Cuidado Pessoal", productNumber: 2, variantNumber: 1 },
      { id: 2, tipoSku: "2", categoryName: "Beleza e Cuidado Pessoal", productNumber: 2, variantNumber: 3 },
    ];
    const v = resolveVariantNumber(rows, 3, {
      tipoSku: "2",
      categoryName: "Beleza e Cuidado Pessoal",
      productNumber: 2,
      variantNumber: null,
    });
    expect(v).toBe(2); // 1 e 3 ocupados → menor livre é 2
  });

  it("grupos distintos não interferem entre si", () => {
    const rows: VariantNumberRow[] = [
      { id: 1, tipoSku: "1", categoryName: "Serviços", productNumber: 46, variantNumber: 1 },
      { id: 2, tipoSku: "2", categoryName: "Serviços", productNumber: 46, variantNumber: 1 },
    ];
    // tipo diferente → grupo diferente → pode manter 1
    const v = resolveVariantNumber(rows, 2, {
      tipoSku: "2",
      categoryName: "Serviços",
      productNumber: 46,
      variantNumber: 1,
    });
    expect(v).toBe(1);
  });

  it("preserva o valor atual quando o grupo é inválido (sem categoria)", () => {
    const v = resolveVariantNumber([], 1, {
      tipoSku: "1",
      categoryName: null,
      productNumber: 46,
      variantNumber: 5,
    });
    expect(v).toBe(5);
  });
});

describe("normalizeVariantNumbers — reparo em massa", () => {
  it("corrige a duplicata do ENVELOPE (60006: 1 → 3)", () => {
    const fixes = normalizeVariantNumbers(envelopeRows);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toEqual({ id: 60006, from: 1, to: 3 });
  });

  it("mantém a linha mais antiga (menor id) e move as demais", () => {
    // Duas linhas com variante 1 no mesmo grupo; a de menor id mantém.
    const rows: VariantNumberRow[] = [
      { id: 200, tipoSku: "1", categoryName: "Serviços", productNumber: 10, variantNumber: 1 },
      { id: 100, tipoSku: "1", categoryName: "Serviços", productNumber: 10, variantNumber: 1 },
    ];
    const fixes = normalizeVariantNumbers(rows);
    // id 100 (menor) mantém 1; id 200 vai para 2.
    expect(fixes).toEqual([{ id: 200, from: 1, to: 2 }]);
  });

  it("não gera correções quando já está tudo único", () => {
    const rows: VariantNumberRow[] = [
      { id: 1, tipoSku: "1", categoryName: "Serviços", productNumber: 46, variantNumber: 1 },
      { id: 2, tipoSku: "1", categoryName: "Serviços", productNumber: 46, variantNumber: 2 },
      { id: 3, tipoSku: "1", categoryName: "Serviços", productNumber: 46, variantNumber: 3 },
    ];
    expect(normalizeVariantNumbers(rows)).toHaveLength(0);
  });

  it("três variações sem número recebem 1, 2, 3 (por id crescente)", () => {
    const rows: VariantNumberRow[] = [
      { id: 1, tipoSku: "3", categoryName: "Casa, Móveis e Decoração", productNumber: 7, variantNumber: null },
      { id: 2, tipoSku: "3", categoryName: "Casa, Móveis e Decoração", productNumber: 7, variantNumber: null },
      { id: 3, tipoSku: "3", categoryName: "Casa, Móveis e Decoração", productNumber: 7, variantNumber: null },
    ];
    const fixes = normalizeVariantNumbers(rows).sort((a, b) => a.id - b.id);
    expect(fixes.map((f) => f.to)).toEqual([1, 2, 3]);
  });

  it("o SKU resultante do reparo é único", () => {
    const fixes = normalizeVariantNumbers(envelopeRows);
    const applied = envelopeRows.map((r) => {
      const fix = fixes.find((f) => f.id === r.id);
      return { ...r, variantNumber: fix ? fix.to : r.variantNumber };
    });
    const skus = applied.map((r) =>
      buildSku({
        tipoSku: r.tipoSku,
        categoryName: r.categoryName,
        productNumber: r.productNumber,
        variantNumber: r.variantNumber,
      }),
    );
    expect(new Set(skus).size).toBe(skus.length); // todos únicos
    expect(skus).toContain("1-SERVICOS-46-3");
  });
});
