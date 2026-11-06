import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const {
  listSkuRows,
  listAllSkuRows,
  listCustomColumns,
  listSkuVariationsForBackup,
  listSkuProductNumberReservationsForBackup,
  listSkuVariantNumberReservationsForBackup,
  listSkuValueReservationsForBackup,
  listKitRows,
  listKitCustomColumns,
  listEmbalagemRows,
  listEmbalagemCustomColumns,
  listSkuChangeLogForBackup,
  loadAlphaProjectBackupRecords,
} = vi.hoisted(() => ({
  listSkuRows: vi.fn(),
  listAllSkuRows: vi.fn(),
  listCustomColumns: vi.fn(),
  listSkuVariationsForBackup: vi.fn(),
  listSkuProductNumberReservationsForBackup: vi.fn(),
  listSkuVariantNumberReservationsForBackup: vi.fn(),
  listSkuValueReservationsForBackup: vi.fn(),
  listKitRows: vi.fn(),
  listKitCustomColumns: vi.fn(),
  listEmbalagemRows: vi.fn(),
  listEmbalagemCustomColumns: vi.fn(),
  listSkuChangeLogForBackup: vi.fn(),
  loadAlphaProjectBackupRecords: vi.fn(),
}));

vi.mock("../skuSheetDb", () => ({
  listSkuRows,
  listAllSkuRows,
  listCustomColumns,
  listSkuVariationsForBackup,
  listSkuProductNumberReservationsForBackup,
  listSkuVariantNumberReservationsForBackup,
  listSkuValueReservationsForBackup,
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

vi.mock("./alphaProjectBackup", async importOriginal => ({
  ...(await importOriginal<typeof import("./alphaProjectBackup")>()),
  loadAlphaProjectBackupRecords,
}));

import { backupFileName, buildSheetsWorkbookBuffer } from "./sheetsXlsx";
import {
  BACKUP_JSON_CHUNK_FIELDS,
  BACKUP_JSON_CHUNK_SIZE,
} from "./alphaProjectBackup";

beforeEach(() => {
  vi.clearAllMocks();
  loadAlphaProjectBackupRecords.mockResolvedValue({
    alphaCatalogProducts: [],
    alphaPdfExports: [],
    projectProducts: [],
    projectDocuments: [],
  });
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
      skuMode: "legacy",
      skuSourceRowId: null,
      skuDecisionAt: null,
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
      isDeleted: false,
      deletedAt: null,
      customValues: JSON.stringify({ "501": "valor preservado" }),
      createdAt,
      updatedAt,
    },
  ]);
  listAllSkuRows.mockImplementation(async () => {
    const active = await listSkuRows();
    return [
      ...active,
      {
        ...active[0],
        id: 78,
        position: 10,
        productNumber: 32,
        sku: "2-CONSTRUCAO-32-1",
        isDeleted: true,
        deletedAt: 1_790_080_500_000,
      },
    ];
  });
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
      revision: 1,
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
  listSkuProductNumberReservationsForBackup.mockResolvedValue([
    { productNumber: 31, skuRowId: 77, isVoided: false, createdAt },
    { productNumber: 32, skuRowId: 78, isVoided: false, createdAt },
    { productNumber: 30_002, skuRowId: null, isVoided: true, createdAt },
  ]);
  listSkuVariantNumberReservationsForBackup.mockResolvedValue([
    {
      id: 1,
      skuRowId: 77,
      tipoSku: "2",
      categoryKey: "construção",
      productNumber: 31,
      variantNumber: 2,
      createdAt,
    },
  ]);
  listSkuValueReservationsForBackup.mockResolvedValue([
    {
      id: 1,
      normalizedSku: "2-construcao-31-2",
      originalSku: "2-CONSTRUCAO-31-2",
      sourceType: "main",
      sourceKey: "77",
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
      "_Reservas_Num_Produto",
      "_Reservas_Num_Variante",
      "_Reservas_Valor_SKU",
      "_Alpha_Catalogo",
      "_Alpha_PDFs",
      "_Projeto_Produtos",
      "_Projeto_Documentos",
    ]);
    expect(loadAlphaProjectBackupRecords).toHaveBeenCalledOnce();
  });

  it("preserva IDs, SKU manual, tombstone e histórico necessários para restauração", async () => {
    const buffer = await buildSheetsWorkbookBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const products = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets["_Produtos_Tecnico"],
      { defval: "" }
    );
    const variations = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets["_Variacoes_SKU"],
      { defval: "" }
    );
    const history = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets["_Historico_SKU"],
      { defval: "" }
    );

    expect(products[0]).toMatchObject({
      id: 77,
      productNumber: 31,
      variantNumber: 2,
      sku: "2-CONSTRUCAO-31-2",
      mainMlb: "MLB999",
      customValues: '{"501":"valor preservado"}',
    });
    expect(products[1]).toMatchObject({
      id: 78,
      productNumber: 32,
      sku: "2-CONSTRUCAO-32-1",
      isDeleted: "SIM",
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
    const reservations = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets["_Reservas_Num_Produto"],
      { defval: "" }
    );
    expect(reservations).toHaveLength(3);
    expect(reservations[1]).toMatchObject({
      productNumber: 32,
      skuRowId: 78,
      isVoided: "NÃO",
    });
    expect(reservations[2]).toMatchObject({
      productNumber: 30_002,
      skuRowId: "",
      isVoided: "SIM",
    });
    const variantReservations = XLSX.utils.sheet_to_json<
      Record<string, unknown>
    >(workbook.Sheets["_Reservas_Num_Variante"], { defval: "" });
    expect(variantReservations[0]).toMatchObject({
      skuRowId: 77,
      productNumber: 31,
      variantNumber: 2,
    });
    const skuValueReservations = XLSX.utils.sheet_to_json<
      Record<string, unknown>
    >(workbook.Sheets["_Reservas_Valor_SKU"], { defval: "" });
    expect(skuValueReservations[0]).toMatchObject({
      normalizedSku: "2-construcao-31-2",
      sourceType: "main",
      sourceKey: "77",
    });
  });

  it("mantém cabeçalhos técnicos mesmo quando uma tabela está vazia", async () => {
    const buffer = await buildSheetsWorkbookBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const kitRows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets["_Kits_Tecnico"],
      {
        header: 1,
        defval: "",
      }
    );

    expect(kitRows).toHaveLength(1);
    expect(kitRows[0]).toContain("id");
    expect(kitRows[0]).toContain("observacao");
    expect(kitRows[0]).toContain("createdAt");
    for (const name of [
      "_Alpha_Catalogo",
      "_Alpha_PDFs",
      "_Projeto_Produtos",
      "_Projeto_Documentos",
    ]) {
      expect(
        XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 })
      ).toEqual([[...BACKUP_JSON_CHUNK_FIELDS]]);
    }
  });
});

describe("abas Alpha/Projeto — JSON completo em chunks XLSX", () => {
  it("grava e reassembla payload/snapshot/URLs maiores que 32k, sem perda de emoji", async () => {
    const date = new Date("2026-11-06T11:00:00.123Z");
    const payload = JSON.stringify({
      sku: "SKU-MANUAL",
      text: '😀🚀 ç 漢字\r\n"\\'.repeat(16_000),
    });
    const url =
      "https://files.example.test/report%20😀.pdf?x=1&y=" +
      "ç😀".repeat(12_000);
    const catalog = [
      {
        ownerId: 1,
        id: "produto-1",
        recordPayload: payload,
        version: 8,
        createdAt: 1_790_080_000_000,
        updatedAt: 1_790_080_001_000,
      },
      {
        ownerId: 2,
        id: "produto-1",
        recordPayload: '{"sku":"OUTRO-OWNER"}',
        version: 1,
        createdAt: 1_790_080_000_000,
        updatedAt: 1_790_080_001_000,
      },
    ];
    const pdfs = [
      {
        ownerId: 1,
        exportId: "pdf-1",
        reportId: "produto-1",
        filename: "relatório 😀.pdf",
        description: "Relatório",
        sku: "SKU-MANUAL",
        projectId: 14,
        documentId: 15,
        sha256: "a".repeat(64),
        byteSize: 1_000_000,
        contextHash: "b".repeat(64),
        optionsPayload: '{"format":"pdf"}',
        snapshotPayload: payload,
        status: "ready",
        leaseToken: "nao-exportar-token",
        leaseExpiresAt: 1_790_080_002_000,
        key: "alpha/SKU-MANUAL/relatório 😀.pdf",
        url,
        uploadedAt: 1_790_080_001_000,
        lastError: null,
        createdAt: 1_790_080_000_000,
        updatedAt: 1_790_080_001_000,
      },
    ];
    const products = [
      {
        id: 14,
        name: "Produto 😀",
        description: payload,
        priority: "alta",
        currentStep: "amostra",
        supplier: "Fornecedor",
        supplierContact: "Contato comercial",
        notes: payload,
        imageUrl: "https://files.example.test/foto%20😀.png?a=1&b=2",
        expectedArrival: date,
        orderDeadline: null,
        createdAt: date,
        updatedAt: date,
        createdBy: 1,
      },
    ];
    const documents = [
      {
        id: 15,
        productId: 14,
        name: "relatório 😀.pdf",
        url,
        fileKey: pdfs[0].key,
        type: "documento",
        createdAt: date,
        uploadedBy: 1,
      },
    ];
    loadAlphaProjectBackupRecords.mockResolvedValue({
      alphaCatalogProducts: catalog,
      alphaPdfExports: pdfs,
      projectProducts: products,
      projectDocuments: documents,
    });

    const buffer = await buildSheetsWorkbookBuffer(); // exercises XLSX.write, not only the chunk helper
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const expectedBySheet: Record<string, object[]> = {
      _Alpha_Catalogo: catalog,
      _Alpha_PDFs: [{ ...pdfs[0], leaseToken: null }],
      _Projeto_Produtos: products,
      _Projeto_Documentos: documents,
    };
    for (const [name, expected] of Object.entries(expectedBySheet)) {
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(
        workbook.Sheets[name],
        { defval: "" }
      );
      const groups = new Map<string, typeof rows>();
      for (const row of rows.slice().reverse()) {
        const key = JSON.stringify([row.ownerId, row.recordId]);
        groups.set(key, [...(groups.get(key) ?? []), row]);
        expect(String(row.jsonChunk).length).toBeLessThanOrEqual(
          BACKUP_JSON_CHUNK_SIZE
        );
        expect(String(row.jsonChunk)).not.toMatch(
          /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u
        );
        expect(row.formatVersion).toBe(1);
      }
      const restored = [...groups.values()].map(chunks => {
        expect(chunks.every(row => row.chunkCount === chunks.length)).toBe(
          true
        );
        chunks.sort((a, b) => Number(a.chunkIndex) - Number(b.chunkIndex));
        expect(chunks.map(row => row.chunkIndex)).toEqual(
          chunks.map((_, index) => index + 1)
        );
        return JSON.parse(chunks.map(row => row.jsonChunk).join(""));
      });
      expect(restored).toHaveLength(expected.length);
      expect(restored).toEqual(
        expect.arrayContaining(JSON.parse(JSON.stringify(expected)))
      );
      expect(rows.length).toBeGreaterThan(expected.length);
    }
    const pdfChunks = XLSX.utils.sheet_to_json<{ jsonChunk: string }>(
      workbook.Sheets._Alpha_PDFs
    );
    expect(pdfChunks.map(row => row.jsonChunk).join("")).not.toContain(
      "nao-exportar-token"
    );
  });

  it("não usa um workbook incompleto quando a leitura Alpha/Projeto falha", async () => {
    loadAlphaProjectBackupRecords.mockRejectedValueOnce(
      new Error("Alpha table read failed")
    );
    await expect(buildSheetsWorkbookBuffer()).rejects.toThrow(
      "Alpha table read failed"
    );
  });
});

describe("backupFileName", () => {
  it("nomeia o arquivo no horário de Brasília", () => {
    expect(backupFileName(new Date("2026-09-22T09:05:00.000Z"))).toBe(
      "Planilha-SKU-2026-09-22_06h05.xlsx"
    );
  });
});
