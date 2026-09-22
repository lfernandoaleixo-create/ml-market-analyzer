import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const {
  listSkuRows,
  listCustomColumns,
  listSkuVariationsForBackup,
  listKitRows,
  listKitCustomColumns,
  listEmbalagemRows,
  listEmbalagemCustomColumns,
  listSkuChangeLogForBackup,
} = vi.hoisted(() => ({
  listSkuRows: vi.fn(),
  listCustomColumns: vi.fn(),
  listSkuVariationsForBackup: vi.fn(),
  listKitRows: vi.fn(),
  listKitCustomColumns: vi.fn(),
  listEmbalagemRows: vi.fn(),
  listEmbalagemCustomColumns: vi.fn(),
  listSkuChangeLogForBackup: vi.fn(),
}));

vi.mock("../skuSheetDb", () => ({
  listSkuRows,
  listCustomColumns,
  listSkuVariationsForBackup,
}));

vi.mock("../kitSheetDb", () => ({
  listKitRows,
  listKitCustomColumns,
}));

vi.mock("../embalagemSheetDb", () => ({
  listEmbalagemRows,
  listEmbalagemCustomColumns,
}));

vi.mock("../skuProtection", () => ({
  listSkuChangeLogForBackup,
}));

import { backupFileName, buildSheetsWorkbookBuffer } from "./sheetsXlsx";

beforeEach(() => {
  const createdAt = new Date("2026-09-22T12:00:00.000Z");
  const updatedAt = new Date("2026-09-22T12:30:00.000Z");

  listSkuRows.mockResolvedValue([
    {
      id: 77,
      position: 9,
      productNumber: 31,
      variantNumber: 2,
      cadastradoMl: "ATIVO",
      tipoSku: "2",
      categoryId: "MLB1430",
      categoryName: "Construção",
      subCategoryId: "MLB123",
      subCategoryName: "Teste",
      produto: "Produto protegido",
      variante: "100 UND",
      sku: "2-CONSTRUCAO-31-2",
      gerarSkuKit: false,
      skuKit: "",
      mainMlb: "MLB999",
      mainDone: true,
      eanGtin: "7890000000000",
      ncm: "0000.00.00",
      gpc: "",
      cest: "",
      precoClassico: "10,00",
      precoPremium: "11,00",
      precoAtacado: "9,00",
      embProfundidade: "1",
      embLargura: "2",
      embAltura: "3",
      embPeso: "0,1",
      caracteristicas: "Dados completos",
      rowColor: "blue",
      customValues: JSON.stringify({ "501": "valor preservado" }),
      createdAt,
      updatedAt,
    },
  ]);
  listCustomColumns.mockResolvedValue([
    { id: 501, name: "Coluna livre", position: 1, createdAt, updatedAt },
  ]);
  listKitRows.mockResolvedValue([]);
  listKitCustomColumns.mockResolvedValue([]);
  listEmbalagemRows.mockResolvedValue([
    {
      id: 8,
      position: 1,
      produto: "Caixa",
      sku: "CX-1",
      eanGtin: "",
      embalagem: "Papelão",
      ncm: "",
      gpc: "",
      cest: "",
      precoClassico: "",
      precoPremium: "",
      altura: "10",
      largura: "20",
      comprimento: "30",
      kg: "0,5",
      categoria: "Embalagem",
      observacao: "",
      rowColor: "",
      customValues: null,
      createdAt,
      updatedAt,
    },
  ]);
  listEmbalagemCustomColumns.mockResolvedValue([]);
  listSkuVariationsForBackup.mockResolvedValue([
    {
      id: 900,
      skuRowId: 77,
      variationIndex: 4,
      variationSku: "2-CONSTRUCAO-31-2-04",
      ean: "7891111111111",
      mlb: "MLB123",
      done: false,
      isDeleted: true,
      createdAt,
      updatedAt,
    },
  ]);
  listSkuChangeLogForBackup.mockResolvedValue([
    {
      id: 3,
      action: "policy_update",
      authorizedBy: "Guilherme",
      description: "Regra registrada sem alterar SKUs existentes.",
      affectedRowIds: "[]",
      oldValues: null,
      newValues: JSON.stringify({ preserveExisting: true }),
      affectedCount: 0,
      timestamp: 1_790_080_000_000,
      createdAt,
    },
  ]);
});

describe("buildSheetsWorkbookBuffer", () => {
  it("inclui abas de uso diário e todas as abas técnicas de segurança", async () => {
    const buffer = await buildSheetsWorkbookBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });

    expect(workbook.SheetNames).toEqual([
      "Produtos",
      "Kits",
      "Embalagens",
      "_Produtos_Tecnico",
      "_Kits_Tecnico",
      "_Embalagens_Tecnico",
      "_Colunas_Produtos",
      "_Colunas_Kits",
      "_Colunas_Embalagens",
      "_Variacoes_SKU",
      "_Historico_SKU",
    ]);
  });

  it("preserva IDs, SKU manual, tombstone e histórico necessários para restauração", async () => {
    const buffer = await buildSheetsWorkbookBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const products = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets["_Produtos_Tecnico"],
      { defval: "" },
    );
    const variations = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets["_Variacoes_SKU"],
      { defval: "" },
    );
    const history = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets["_Historico_SKU"],
      { defval: "" },
    );

    expect(products[0]).toMatchObject({
      id: 77,
      productNumber: 31,
      variantNumber: 2,
      sku: "2-CONSTRUCAO-31-2",
      mainMlb: "MLB999",
      customValues: '{"501":"valor preservado"}',
    });
    expect(variations[0]).toMatchObject({
      id: 900,
      skuRowId: 77,
      variationIndex: 4,
      variationSku: "2-CONSTRUCAO-31-2-04",
      isDeleted: "SIM",
    });
    expect(history[0]).toMatchObject({
      id: 3,
      authorizedBy: "Guilherme",
      affectedCount: 0,
    });
  });

  it("mantém cabeçalhos técnicos mesmo quando uma tabela está vazia", async () => {
    const buffer = await buildSheetsWorkbookBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const kitRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["_Kits_Tecnico"], {
      header: 1,
      defval: "",
    });

    expect(kitRows).toHaveLength(1);
    expect(kitRows[0]).toContain("id");
    expect(kitRows[0]).toContain("observacao");
    expect(kitRows[0]).toContain("createdAt");
  });
});

describe("backupFileName", () => {
  it("nomeia o arquivo no horário de Brasília", () => {
    expect(backupFileName(new Date("2026-09-22T09:05:00.000Z"))).toBe(
      "Planilha-SKU-2026-09-22_06h05.xlsx",
    );
  });
});
