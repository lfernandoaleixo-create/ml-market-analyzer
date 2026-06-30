import { describe, it, expect } from "vitest";
import {
  buildOptions,
  applyColumnFilters,
  toggleFilterValue,
  clearColumnFilter,
  clearAllFilters,
  countActiveFilters,
  isColumnActive,
  type FilterableRow,
  type ColumnFilters,
} from "../shared/skuFilters";

function row(p: Partial<FilterableRow>): FilterableRow {
  return {
    cadastradoMl: "",
    tipoSku: "",
    categoryName: null,
    subCategoryName: null,
    produto: "",
    ...p,
  };
}

const sample: FilterableRow[] = [
  row({ cadastradoMl: "ATIVO", tipoSku: "2", categoryName: "Saúde", subCategoryName: "Terapias", produto: "Vareta" }),
  row({ cadastradoMl: "PAUSADO", tipoSku: "2", categoryName: "Casa, Móveis e Decoração", subCategoryName: "Cozinha", produto: "Palito" }),
  row({ cadastradoMl: "PAUSADO", tipoSku: "1", categoryName: "Beleza e Cuidado Pessoal", subCategoryName: "Manicure e Pedicure", produto: "Palito" }),
  row({ cadastradoMl: "EXCLUIDO", tipoSku: "3", categoryName: null, subCategoryName: null, produto: "" }),
];

describe("buildOptions", () => {
  it("Cadastrado ML segue a ordem fixa e inclui apenas valores presentes", () => {
    const opts = buildOptions(sample, "cadastradoMl");
    expect(opts.map((o) => o.value)).toEqual(["ATIVO", "PAUSADO", "EXCLUIDO"]);
    // PENDENTE não está presente nas linhas
    expect(opts.find((o) => o.value === "PENDENTE")).toBeUndefined();
  });

  it("Tipo SKU usa rótulos amigáveis e ordem fixa", () => {
    const opts = buildOptions(sample, "tipoSku");
    expect(opts.map((o) => o.value)).toEqual(["1", "2", "3"]);
    expect(opts.find((o) => o.value === "2")?.label).toBe("2 (PRODUTO)");
  });

  it("Categoria lista valores presentes em ordem alfabética e (vazio) por último", () => {
    const opts = buildOptions(sample, "categoryName");
    expect(opts.map((o) => o.label)).toEqual([
      "Beleza e Cuidado Pessoal",
      "Casa, Móveis e Decoração",
      "Saúde",
      "(vazio)",
    ]);
  });

  it("Produto deduplica valores repetidos", () => {
    const opts = buildOptions(sample, "produto");
    const palito = opts.filter((o) => o.value === "Palito");
    expect(palito).toHaveLength(1);
    // inclui (vazio) pois há uma linha com produto vazio
    expect(opts.some((o) => o.label === "(vazio)")).toBe(true);
  });
});

describe("applyColumnFilters", () => {
  it("sem filtros retorna todas as linhas", () => {
    expect(applyColumnFilters(sample, {})).toHaveLength(4);
  });

  it("filtra por um único valor de uma coluna", () => {
    const out = applyColumnFilters(sample, { cadastradoMl: ["PAUSADO"] });
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.cadastradoMl === "PAUSADO")).toBe(true);
  });

  it("dentro da mesma coluna combina valores com OU", () => {
    const out = applyColumnFilters(sample, { cadastradoMl: ["ATIVO", "EXCLUIDO"] });
    expect(out.map((r) => r.cadastradoMl).sort()).toEqual(["ATIVO", "EXCLUIDO"]);
  });

  it("colunas diferentes combinam com E", () => {
    const out = applyColumnFilters(sample, {
      cadastradoMl: ["PAUSADO"],
      tipoSku: ["2"],
    });
    expect(out).toHaveLength(1);
    expect(out[0].produto).toBe("Palito");
    expect(out[0].categoryName).toBe("Casa, Móveis e Decoração");
  });

  it("filtra linhas com valor vazio via opção (vazio)", () => {
    const out = applyColumnFilters(sample, { categoryName: [""] });
    expect(out).toHaveLength(1);
    expect(out[0].cadastradoMl).toBe("EXCLUIDO");
  });

  it("filtro sem correspondência retorna lista vazia", () => {
    const out = applyColumnFilters(sample, { produto: ["Inexistente"] });
    expect(out).toHaveLength(0);
  });
});

describe("helpers de estado", () => {
  it("toggleFilterValue adiciona e remove valores", () => {
    let f: ColumnFilters = {};
    f = toggleFilterValue(f, "tipoSku", "2");
    expect(f.tipoSku).toEqual(["2"]);
    f = toggleFilterValue(f, "tipoSku", "1");
    expect(f.tipoSku).toEqual(["2", "1"]);
    f = toggleFilterValue(f, "tipoSku", "2");
    expect(f.tipoSku).toEqual(["1"]);
  });

  it("isColumnActive e countActiveFilters refletem o estado", () => {
    const f: ColumnFilters = { tipoSku: ["2"], cadastradoMl: [] };
    expect(isColumnActive(f, "tipoSku")).toBe(true);
    expect(isColumnActive(f, "cadastradoMl")).toBe(false);
    expect(countActiveFilters(f)).toBe(1);
  });

  it("clearColumnFilter remove apenas a coluna alvo", () => {
    const f: ColumnFilters = { tipoSku: ["2"], produto: ["Palito"] };
    const out = clearColumnFilter(f, "tipoSku");
    expect(out.tipoSku).toBeUndefined();
    expect(out.produto).toEqual(["Palito"]);
  });

  it("clearAllFilters zera tudo", () => {
    expect(countActiveFilters(clearAllFilters())).toBe(0);
  });
});
