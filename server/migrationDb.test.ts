import { describe, it, expect } from "vitest";
import { mapKitRowToSkuInsert } from "./migrationDb";
import type { KitSheetRow } from "../drizzle/schema";

/**
 * A migração Kits -> SKU deve copiar fielmente todas as colunas do formato SKU,
 * preservando preenchimento, características e cor da linha, sem carregar id,
 * position ou createdAt para o destino.
 */
function makeKit(overrides: Partial<KitSheetRow> = {}): KitSheetRow {
  return {
    id: 123,
    position: 7,
    createdAt: Date.now(),
    productNumber: 10,
    variantNumber: 2,
    cadastradoMl: "ATIVO",
    tipoSku: "3",
    categoryId: "cat-1",
    categoryName: "Festas e Lembrancinhas",
    subCategoryId: "sub-1",
    subCategoryName: "Velas",
    produto: "KIT VELA",
    variante: "12 UN",
    sku: "KITVELA-12",
    gerarSkuKit: true,
    skuKit: "KITVELA-12-KIT",
    eanGtin: "7890000000001",
    ncm: "44219900",
    gpc: "GPC1",
    cest: "CEST1",
    precoClassico: "R$ 10,00",
    precoPremium: "R$ 12,00",
    precoAtacado: "R$ 8,00",
    embProfundidade: "5",
    embLargura: "10",
    embAltura: "15",
    embPeso: "0,5",
    caracteristicas: "Caixa com 12",
    rowColor: "blue",
    customValues: '{"99":"valor antigo"}',
    // Campos legados específicos de kit (não portados para SKU).
    kit: "KIT VELA legado",
    ...overrides,
  } as KitSheetRow;
}

describe("mapKitRowToSkuInsert", () => {
  it("copia todas as colunas do formato SKU preservando os valores", () => {
    const out = mapKitRowToSkuInsert(makeKit());
    expect(out.produto).toBe("KIT VELA");
    // SKU e SKU Kit são recalculados pela regra padrão (Tipo-Categoria-Nprod-Nvar),
    // ignorando o valor antigo armazenado no kit.
    expect(out.sku).toBe("3-FESTAS-10-2");
    expect(out.skuKit).toBe("3-FESTAS-10-2-KITINS");
    expect(out.cadastradoMl).toBe("ATIVO");
    expect(out.tipoSku).toBe("3");
    expect(out.categoryName).toBe("Festas e Lembrancinhas");
    expect(out.subCategoryName).toBe("Velas");
    expect(out.eanGtin).toBe("7890000000001");
    expect(out.ncm).toBe("44219900");
    expect(out.precoClassico).toBe("R$ 10,00");
    expect(out.embPeso).toBe("0,5");
    expect(out.caracteristicas).toBe("Caixa com 12");
    expect(out.gerarSkuKit).toBe(true);
    expect(out.rowColor).toBe("blue");
  });

  it("não carrega id, position, createdAt nem customValues para o destino", () => {
    const out = mapKitRowToSkuInsert(makeKit()) as Record<string, unknown>;
    expect(out.id).toBeUndefined();
    expect(out.position).toBeUndefined();
    expect(out.createdAt).toBeUndefined();
    // customValues fica de fora (colunas custom de kit e sku são independentes).
    expect(out.customValues).toBeUndefined();
  });

  it("usa fallbacks seguros quando campos vêm nulos", () => {
    const out = mapKitRowToSkuInsert(
      makeKit({
        cadastradoMl: null as unknown as string,
        produto: null as unknown as string,
        sku: null as unknown as string,
        gerarSkuKit: null as unknown as boolean,
        rowColor: null as unknown as string,
        caracteristicas: null,
      }),
    );
    expect(out.cadastradoMl).toBe("");
    expect(out.produto).toBe("");
    expect(out.gerarSkuKit).toBe(false);
    expect(out.rowColor).toBe("");
    expect(out.caracteristicas).toBeNull();
  });

  it("gera SKU vazio quando faltam componentes essenciais (sem categoria)", () => {
    const out = mapKitRowToSkuInsert(
      makeKit({ categoryName: null, categoryId: null }),
    );
    expect(out.sku).toBe("");
    // Sem SKU base, o SKU Kit também fica vazio mesmo com gerarSkuKit=true.
    expect(out.skuKit).toBe("");
  });

  it("recalcula SKU mesmo quando o campo sku do kit está vazio", () => {
    const out = mapKitRowToSkuInsert(makeKit({ sku: "", skuKit: "" }));
    expect(out.sku).toBe("3-FESTAS-10-2");
    expect(out.skuKit).toBe("3-FESTAS-10-2-KITINS");
  });
});
