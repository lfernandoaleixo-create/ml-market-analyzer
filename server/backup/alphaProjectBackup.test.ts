import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  alphaCatalogProducts,
  alphaPdfExports,
} from "../../drizzle/alphaSchema";
import { projectProducts, projectDocuments } from "../../drizzle/schema";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb }));

import {
  BACKUP_JSON_CHUNK_FIELDS,
  BACKUP_JSON_CHUNK_SIZE,
  buildBackupJsonAoa,
  loadAlphaProjectBackupRecords,
  splitBackupJson,
} from "./alphaProjectBackup";

beforeEach(() => vi.clearAllMocks());

function hasBrokenSurrogate(value: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
    value
  );
}

describe("loadAlphaProjectBackupRecords", () => {
  it("consulta todas as colunas e owners das quatro tabelas, sem filtros ou limite", async () => {
    const createdAt = new Date("2026-11-06T11:00:00.000Z");
    const catalog = [
      {
        ownerId: 1,
        id: "sku-comum",
        recordPayload: '{"sku":"SKU-1"}',
        version: 3,
        createdAt: 1_790_080_000_000,
        updatedAt: 1_790_080_001_000,
      },
      {
        ownerId: 2,
        id: "sku-comum",
        recordPayload: '{"sku":"SKU-2"}',
        version: 1,
        createdAt: 1_790_080_000_000,
        updatedAt: 1_790_080_001_000,
      },
    ];
    const pdfs = [
      {
        ownerId: 2,
        exportId: "export-1",
        reportId: "report-1",
        filename: "relatório.pdf",
        description: "PDF de SKU",
        sku: "SKU-2",
        projectId: 14,
        documentId: 15,
        sha256: "a".repeat(64),
        byteSize: 400,
        contextHash: "b".repeat(64),
        optionsPayload: '{"landscape":false}',
        snapshotPayload: '{"sku":"SKU-2"}',
        status: "ready",
        leaseToken: "segredo-temporario",
        leaseExpiresAt: null,
        key: "alpha/reports/relatório.pdf",
        url: "https://files.example.test/relatório.pdf?a=1&b=2",
        uploadedAt: 1_790_080_001_000,
        lastError: null,
        createdAt: 1_790_080_000_000,
        updatedAt: 1_790_080_001_000,
      },
    ];
    const products = [
      {
        id: 14,
        name: "Produto",
        description: null,
        priority: "alta",
        currentStep: "amostra",
        supplier: "Fornecedor",
        supplierContact: "Contato do fornecedor",
        notes: "Notas",
        imageUrl: "https://files.example.test/foto.png",
        expectedArrival: createdAt,
        orderDeadline: null,
        createdAt,
        updatedAt: createdAt,
        createdBy: 2,
      },
    ];
    const documents = [
      {
        id: 15,
        productId: 14,
        name: "relatório.pdf",
        url: pdfs[0].url,
        fileKey: pdfs[0].key,
        type: "documento",
        createdAt,
        uploadedBy: 2,
      },
    ];
    const data = new Map<object, object[]>([
      [alphaCatalogProducts, catalog],
      [alphaPdfExports, pdfs],
      [projectProducts, products],
      [projectDocuments, documents],
    ]);
    const orderCalls: unknown[][] = [];
    const from = vi.fn((table: object) => ({
      orderBy: (...columns: unknown[]) => {
        orderCalls.push(columns);
        return Promise.resolve(data.get(table));
      },
    }));
    const select = vi.fn(() => ({ from }));
    getDb.mockResolvedValue({ select });

    const result = await loadAlphaProjectBackupRecords();

    expect(getDb).toHaveBeenCalledOnce();
    expect(select.mock.calls).toEqual([[], [], [], []]); // select() = ALL columns
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      alphaCatalogProducts,
      alphaPdfExports,
      projectProducts,
      projectDocuments,
    ]);
    expect(orderCalls).toEqual([
      [alphaCatalogProducts.ownerId, alphaCatalogProducts.id],
      [alphaPdfExports.ownerId, alphaPdfExports.exportId],
      [projectProducts.id],
      [projectDocuments.id],
    ]);
    expect(result).toEqual({
      alphaCatalogProducts: catalog,
      alphaPdfExports: [{ ...pdfs[0], leaseToken: null }],
      projectProducts: products,
      projectDocuments: documents,
    });
    expect(pdfs[0].leaseToken).toBe("segredo-temporario"); // never mutate DB rows
    expect(JSON.stringify(result)).not.toContain("segredo-temporario");
  });

  it("falha explicitamente se getDb não fornecer uma conexão, sem backup vazio", async () => {
    getDb.mockResolvedValue(null);
    await expect(loadAlphaProjectBackupRecords()).rejects.toThrow(
      "Database unavailable"
    );
  });

  it("propaga falhas de consulta sem esconder a perda de uma tabela", async () => {
    const failure = new Error("query failed");
    getDb.mockResolvedValue({
      select: () => ({
        from: () => ({ orderBy: () => Promise.reject(failure) }),
      }),
    });
    await expect(loadAlphaProjectBackupRecords()).rejects.toBe(failure);
  });
});

describe("splitBackupJson", () => {
  it("não corta surrogate pair na fronteira de 30000 unidades UTF-16", () => {
    const value =
      "x".repeat(BACKUP_JSON_CHUNK_SIZE - 1) +
      "😀" +
      "y".repeat(BACKUP_JSON_CHUNK_SIZE) +
      "🚀";
    const chunks = splitBackupJson(value);
    expect(chunks[0]).toHaveLength(BACKUP_JSON_CHUNK_SIZE - 1);
    expect(chunks.join("")).toBe(value);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(BACKUP_JSON_CHUNK_SIZE);
      expect(hasBrokenSurrogate(chunk)).toBe(false);
    }
  });

  it("mantém o limite exato e conteúdo misto de muitos chunks", () => {
    const value = "😀ç\r\n漢字".repeat(20_000);
    const chunks = splitBackupJson(value);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.join("")).toBe(value);
    expect(splitBackupJson("a".repeat(BACKUP_JSON_CHUNK_SIZE))).toEqual([
      "a".repeat(BACKUP_JSON_CHUNK_SIZE),
    ]);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(BACKUP_JSON_CHUNK_SIZE);
      expect(hasBrokenSurrogate(chunk)).toBe(false);
    }
  });
});

describe("buildBackupJsonAoa", () => {
  it("mantém cabeçalho fixo mesmo sem registros", () => {
    expect(buildBackupJsonAoa([], "id", "ownerId")).toEqual([
      [...BACKUP_JSON_CHUNK_FIELDS],
    ]);
  });

  it("reassembla todo payload por ID + owner, preservando nulos, booleanos, datas e UTC ms", () => {
    const payload = JSON.stringify({
      sku: "MANUAL-0001",
      description: '😀"\\\r\n漢字'.repeat(20_000),
    });
    const records = [
      {
        id: "mesmo-id",
        ownerId: 1,
        recordPayload: payload,
        createdAt: 1_790_080_000_000,
        enabled: true,
        nullable: null,
        date: new Date("2026-11-06T11:00:00.123Z"),
      },
      {
        id: "mesmo-id",
        ownerId: 2,
        recordPayload: "{JSON de origem intacto, mesmo inválido}",
        createdAt: 1_790_080_002_000,
        enabled: false,
        nullable: null,
        date: null,
      },
    ];
    const aoa = buildBackupJsonAoa(records, "id", "ownerId");
    const groups = new Map<string, (string | number)[][]>();
    for (const row of aoa.slice(1).reverse()) {
      // rebuilding does not depend on sheet row order
      const key = JSON.stringify([row[2], row[1]]);
      groups.set(key, [...(groups.get(key) ?? []), row]);
      expect(String(row[5]).length).toBeLessThanOrEqual(BACKUP_JSON_CHUNK_SIZE);
      expect(hasBrokenSurrogate(String(row[5]))).toBe(false);
    }
    expect(groups.size).toBe(2);
    for (const record of records) {
      const chunks = groups.get(
        JSON.stringify([String(record.ownerId), record.id])
      )!;
      expect(
        chunks.every(chunk => chunk[0] === 1 && chunk[4] === chunks.length)
      ).toBe(true);
      chunks.sort((a, b) => Number(a[3]) - Number(b[3]));
      expect(chunks.map(chunk => chunk[3])).toEqual(
        chunks.map((_, index) => index + 1)
      );
      expect(JSON.parse(chunks.map(chunk => chunk[5]).join(""))).toEqual({
        ...record,
        date: record.date?.toISOString() ?? null,
      });
    }
  });

  it("preserva bigint nativo sem perda de precisão e mantém tokens fora do JSON", () => {
    const record = {
      id: 12,
      createdAt: BigInt("1790080000000"),
      leaseToken: "never-export",
    };
    const aoa = buildBackupJsonAoa([record], "id");
    expect(aoa[1][2]).toBe("");
    const restored = JSON.parse(
      aoa
        .slice(1)
        .map(row => row[5])
        .join("")
    );
    expect(restored).toEqual({
      id: 12,
      createdAt: "1790080000000",
      leaseToken: null,
    });
    expect(record.leaseToken).toBe("never-export");
  });

  it("preserva URL/key/hash e snapshot longos como referências sem downloads", () => {
    const record = {
      ownerId: 3,
      exportId: "pdf-1",
      key: "alpha/SKU-001/relatório 😀.pdf",
      url:
        "https://files.example.test/relatório%20😀.pdf?x=1&y=" +
        "ç😀".repeat(12_000),
      sha256: "a".repeat(64),
      snapshotPayload: "snapshot 😀".repeat(15_000),
      optionsPayload: '{"format":"pdf"}',
      byteSize: 12_000,
      status: "ready",
    };
    const rows = buildBackupJsonAoa([record], "exportId", "ownerId").slice(1);
    expect(rows.length).toBeGreaterThan(3);
    expect(JSON.parse(rows.map(row => row[5]).join(""))).toEqual(record);
  });
});
