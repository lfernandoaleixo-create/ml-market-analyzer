import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Testes dos helpers de variações SKU (getVariations / upsertVariation).
 * Usa store em memória com mocks de drizzle-orm e db.
 */

type VarRow = {
  id: number;
  skuRowId: number;
  variationIndex: number;
  variationSku: string;
  ean: string;
  mlb: string;
  done: boolean;
  isDeleted?: boolean;
  revision?: number;
};

let variations: VarRow[];
let varSeq: number;
let variationInsertCollisionOnce: boolean;
let productReservationInsertCollisionOnce: boolean;
let productReservations: Array<{
  productNumber: number;
  skuRowId: number | null;
  isVoided: boolean;
}>;
let variantReservations: Array<{
  id: number;
  skuRowId: number;
  tipoSku: string;
  categoryKey: string;
  productNumber: number;
  variantNumber: number;
}>;
let skuValueReservationRows: Array<{
  id: number;
  normalizedSku: string;
  originalSku: string;
  sourceType: string;
  sourceKey: string;
}>;
let changeLogs: Array<Record<string, unknown>>;
let changeLogInsertFailureOnce: boolean;
let customValueConcurrentPatchOnce: { key: string; value: string } | null;
let wrapSkuValueDuplicateErrorOnce: boolean;
let manualDuplicateWinnerBeforeCasOnce: {
  loserRowId: number;
  winnerRowId: number;
  sku: string;
} | null;

// Tabela de SKU sheet rows (simplificada para o teste)
type SkuRow = {
  id: number;
  position: number;
  tipoSku: string;
  categoryName: string | null;
  productNumber: number | null;
  variantNumber: number | null;
  sku: string;
  skuKit: string;
  gerarSkuKit: boolean;
  produto: string;
  variante: string;
  caracteristicas?: string;
  skuMode?: string;
  skuSourceRowId?: number | null;
  skuDecisionAt?: number | null;
  isDeleted?: boolean;
  deletedAt?: number | null;
  revision?: number;
  customValues: string | null;
  [k: string]: unknown;
};
let skuRows: SkuRow[];

vi.mock("../drizzle/schema", () => ({
  skuVariations: { __t: "variations" },
  skuSheetRows: { __t: "skuRows" },
  skuSheetCustomColumns: { __t: "columns" },
  skuProductNumberReservations: { __t: "productReservations" },
  skuVariantNumberReservations: { __t: "variantReservations" },
  skuValueReservations: { __t: "skuValueReservations" },
  skuChangeLog: { __t: "changeLogs" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: { __c?: string }, value: unknown) => ({ kind: "eq", col: col?.__c, value }),
  isNull: (col: { __c?: string }) => ({ kind: "isNull", col: col?.__c }),
  and: (...conds: unknown[]) => ({ kind: "and", conds }),
  asc: (col: { __c?: string }) => ({ kind: "asc", col: col?.__c }),
  sql: (strings: TemplateStringsArray, ..._v: unknown[]) => ({ kind: "sql", raw: strings.join("?") }),
}));

function tableOf(t: unknown): string {
  return (t as { __t?: string })?.__t ?? "";
}

function dataFor(table: string): any[] {
  if (table === "variations") {
    for (const row of variations) row.revision ??= 1;
    return variations;
  }
  if (table === "skuRows") return skuRows;
  if (table === "productReservations") return productReservations;
  if (table === "variantReservations") return variantReservations;
  if (table === "skuValueReservations") return skuValueReservationRows;
  if (table === "changeLogs") return changeLogs;
  return [];
}

function matchRow(row: any, cond: any): boolean {
  if (!cond) return true;
  if (cond.kind === "and") return cond.conds.every((c: any) => matchRow(row, c));
  if (cond.kind === "eq") {
    return row[cond.col] === cond.value;
  }
  if (cond.kind === "isNull") return row[cond.col] == null;
  return true;
}

function makeDb() {
  return {
    select: (proj?: any) => ({
      from: (t: unknown) => {
        const table = tableOf(t);
        const data = dataFor(table);
        const isMax = proj && typeof proj === "object" && "max" in proj;
        const builder: any = {
          _rows: [...data],
          where(cond: any) {
            this._rows = this._rows.filter((r: any) => matchRow(r, cond));
            return this;
          },
          orderBy(_spec: any) {
            if (table === "variations") {
              this._rows.sort((a: any, b: any) => a.variationIndex - b.variationIndex);
            } else {
              this._rows.sort(
                (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id,
              );
            }
            return this;
          },
          async limit(n: number) {
            return this._rows.slice(0, n);
          },
          then(resolve: (v: any) => void) {
            if (isMax) {
              const max = this._rows.reduce(
                (m: number, r: any) =>
                  Math.max(
                    m,
                    table === "variantReservations"
                      ? (r.variantNumber ?? 0)
                      : table === "productReservations"
                        ? (r.productNumber ?? 0)
                        : (r.position ?? 0),
                  ),
                0,
              );
              resolve([{ max }]);
            } else {
              resolve(this._rows);
            }
          },
        };
        return builder;
      },
    }),
    insert: (t: unknown) => ({
      values: async (vals: any) => {
        if (tableOf(t) === "variations") {
          if (variationInsertCollisionOnce) {
            variationInsertCollisionOnce = false;
            variations.push({
              id: varSeq++,
              skuRowId: vals.skuRowId,
              variationIndex: vals.variationIndex,
              variationSku: vals.variationSku,
              ean: "",
              mlb: "",
              done: false,
              isDeleted: false,
              revision: 1,
            });
            throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
          }
          variations.push({
            id: varSeq++,
            skuRowId: vals.skuRowId,
            variationIndex: vals.variationIndex,
            variationSku: vals.variationSku ?? "",
            ean: vals.ean ?? "",
            mlb: vals.mlb ?? "",
            done: vals.done ?? false,
            isDeleted: vals.isDeleted ?? false,
            revision: vals.revision ?? 1,
          });
        } else if (tableOf(t) === "skuRows") {
          skuRows.push({
            id: skuRows.length + 100,
            position: vals.position ?? 0,
            tipoSku: vals.tipoSku ?? "",
            categoryName: vals.categoryName ?? null,
            productNumber: vals.productNumber ?? null,
            variantNumber: vals.variantNumber ?? null,
            sku: vals.sku ?? "",
            skuKit: vals.skuKit ?? "",
            gerarSkuKit: vals.gerarSkuKit ?? false,
            produto: vals.produto ?? "",
            variante: vals.variante ?? "",
            customValues: vals.customValues ?? null,
          });
        } else if (tableOf(t) === "productReservations") {
          if (productReservationInsertCollisionOnce) {
            productReservationInsertCollisionOnce = false;
            productReservations.push({
              productNumber: vals.productNumber,
              skuRowId: 999,
              isVoided: false,
            });
            throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
          }
          const duplicate = productReservations.some(
            (row) =>
              row.productNumber === vals.productNumber ||
              (row.skuRowId != null && row.skuRowId === vals.skuRowId),
          );
          if (duplicate) throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
          productReservations.push({
            productNumber: vals.productNumber,
            skuRowId: vals.skuRowId,
            isVoided: vals.isVoided ?? false,
          });
          return { insertId: 30_002 };
        } else if (tableOf(t) === "variantReservations") {
          const duplicate = variantReservations.some(
            (row) =>
              row.skuRowId === vals.skuRowId ||
              (row.tipoSku === vals.tipoSku &&
                row.categoryKey === vals.categoryKey &&
                row.productNumber === vals.productNumber &&
                row.variantNumber === vals.variantNumber),
          );
          if (duplicate) throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
          variantReservations.push({ id: variantReservations.length + 1, ...vals });
          return { insertId: variantReservations.length };
        } else if (tableOf(t) === "skuValueReservations") {
          if (skuValueReservationRows.some((row) => row.normalizedSku === vals.normalizedSku)) {
            const mysqlError = Object.assign(new Error("Duplicate entry"), {
              code: "ER_DUP_ENTRY",
              errno: 1062,
            });
            if (wrapSkuValueDuplicateErrorOnce) {
              wrapSkuValueDuplicateErrorOnce = false;
              throw Object.assign(new Error("Failed query: insert into `sku_value_reservations`"), {
                cause: mysqlError,
              });
            }
            throw mysqlError;
          }
          skuValueReservationRows.push({ id: skuValueReservationRows.length + 1, ...vals });
          return { insertId: skuValueReservationRows.length };
        } else if (tableOf(t) === "changeLogs") {
          if (changeLogInsertFailureOnce) {
            changeLogInsertFailureOnce = false;
            throw new Error("Falha simulada no histórico");
          }
          changeLogs.push({ id: changeLogs.length + 1, ...vals });
          return { insertId: changeLogs.length };
        }
      },
    }),
    update: (t: unknown) => ({
      set: (patch: any) => ({
        where: async (cond: any) => {
          const arr = dataFor(tableOf(t));
          if (
            tableOf(t) === "skuRows" &&
            typeof patch.sku === "string" &&
            manualDuplicateWinnerBeforeCasOnce &&
            patch.sku === manualDuplicateWinnerBeforeCasOnce.sku
          ) {
            const race = manualDuplicateWinnerBeforeCasOnce;
            const loser = arr.find((row) => row.id === race.loserRowId);
            const winner = arr.find((row) => row.id === race.winnerRowId);
            if (winner) {
              winner.sku = race.sku;
              winner.skuMode = "manual";
              winner.revision = (winner.revision ?? 0) + 1;
            }
            if (loser) loser.revision = (loser.revision ?? 0) + 1;
            manualDuplicateWinnerBeforeCasOnce = null;
          }
          if (tableOf(t) === "skuRows" && patch.customValues !== undefined && customValueConcurrentPatchOnce) {
            const target = arr.find((row) => row.id === 1);
            if (target) {
              const remote = target.customValues ? JSON.parse(target.customValues) : {};
              remote[customValueConcurrentPatchOnce.key] = customValueConcurrentPatchOnce.value;
              target.customValues = JSON.stringify(remote);
            }
            customValueConcurrentPatchOnce = null;
          }
          let affectedRows = 0;
          for (const r of arr) {
            if (!matchRow(r, cond)) continue;
            const resolved = { ...patch };
            if (resolved.revision?.kind === "sql") resolved.revision = (r.revision ?? 0) + 1;
            Object.assign(r, resolved);
            affectedRows += 1;
          }
          return { affectedRows };
        },
      }),
    }),
    delete: (t: unknown) => ({
      where: async (cond: any) => {
        if (tableOf(t) === "variations") {
          const idx = variations.findIndex((r) => matchRow(r, cond));
          if (idx >= 0) variations.splice(idx, 1);
        } else if (tableOf(t) === "skuValueReservations") {
          for (let idx = skuValueReservationRows.length - 1; idx >= 0; idx -= 1) {
            if (matchRow(skuValueReservationRows[idx], cond)) {
              skuValueReservationRows.splice(idx, 1);
            }
          }
        }
      },
    }),
    transaction: async (callback: (tx: any) => Promise<any>) => {
      const snapshot = {
        variations: structuredClone(variations),
        skuRows: structuredClone(skuRows),
        productReservations: structuredClone(productReservations),
        variantReservations: structuredClone(variantReservations),
        skuValueReservationRows: structuredClone(skuValueReservationRows),
        changeLogs: structuredClone(changeLogs),
      };
      try {
        return await callback(makeDb());
      } catch (error) {
        variations = snapshot.variations;
        skuRows = snapshot.skuRows;
        productReservations = snapshot.productReservations;
        variantReservations = snapshot.variantReservations;
        skuValueReservationRows = snapshot.skuValueReservationRows;
        changeLogs = snapshot.changeLogs;
        throw error;
      }
    },

  };
}

vi.mock("./db", () => ({
  getDb: vi.fn(async () => makeDb()),
}));

import {
  skuVariations,
  skuSheetRows,
  skuSheetCustomColumns,
  skuProductNumberReservations,
  skuVariantNumberReservations,
  skuValueReservations,
  skuChangeLog,
} from "../drizzle/schema";
(skuVariations as any).id = { __c: "id" };
(skuVariations as any).skuRowId = { __c: "skuRowId" };
(skuVariations as any).variationIndex = { __c: "variationIndex" };
(skuVariations as any).variationSku = { __c: "variationSku" };
(skuVariations as any).ean = { __c: "ean" };
(skuVariations as any).mlb = { __c: "mlb" };
(skuVariations as any).done = { __c: "done" };
(skuVariations as any).isDeleted = { __c: "isDeleted" };
(skuVariations as any).revision = { __c: "revision" };

(skuSheetRows as any).id = { __c: "id" };
(skuSheetRows as any).position = { __c: "position" };
(skuSheetRows as any).sku = { __c: "sku" };
(skuSheetRows as any).isDeleted = { __c: "isDeleted" };
(skuSheetRows as any).revision = { __c: "revision" };
(skuSheetRows as any).customValues = { __c: "customValues" };

(skuProductNumberReservations as any).productNumber = { __c: "productNumber" };
(skuProductNumberReservations as any).skuRowId = { __c: "skuRowId" };
(skuProductNumberReservations as any).isVoided = { __c: "isVoided" };

(skuVariantNumberReservations as any).id = { __c: "id" };
(skuVariantNumberReservations as any).skuRowId = { __c: "skuRowId" };
(skuVariantNumberReservations as any).tipoSku = { __c: "tipoSku" };
(skuVariantNumberReservations as any).categoryKey = { __c: "categoryKey" };
(skuVariantNumberReservations as any).productNumber = { __c: "productNumber" };
(skuVariantNumberReservations as any).variantNumber = { __c: "variantNumber" };

(skuValueReservations as any).id = { __c: "id" };
(skuValueReservations as any).normalizedSku = { __c: "normalizedSku" };
(skuValueReservations as any).sourceType = { __c: "sourceType" };
(skuValueReservations as any).sourceKey = { __c: "sourceKey" };

(skuSheetCustomColumns as any).id = { __c: "id" };
(skuSheetCustomColumns as any).position = { __c: "position" };

import {
  addVariation,
  deleteVariation,
  getVariations,
  upsertVariation,
  applySkuDecision,
  deleteSkuRow,
  getSkuDecisionContext,
  updateSkuRow,
  editMainSkuManually,
  editVariationSkuManually,
  setCustomValue,
} from "./skuSheetDb";

beforeEach(() => {
  variations = [];
  varSeq = 1;
  variationInsertCollisionOnce = false;
  productReservationInsertCollisionOnce = false;
  productReservations = [{ productNumber: 10, skuRowId: 1, isVoided: false }];
  variantReservations = [
    {
      id: 1,
      skuRowId: 1,
      tipoSku: "1",
      categoryKey: "serviços",
      productNumber: 10,
      variantNumber: 1,
    },
  ];
  skuValueReservationRows = [
    {
      id: 1,
      normalizedSku: "1-servicos-10-1",
      originalSku: "1-SERVICOS-10-1",
      sourceType: "main",
      sourceKey: "1",
    },
  ];
  changeLogs = [];
  changeLogInsertFailureOnce = false;
  customValueConcurrentPatchOnce = null;
  wrapSkuValueDuplicateErrorOnce = false;
  manualDuplicateWinnerBeforeCasOnce = null;
  skuRows = [
    {
      id: 1,
      position: 1,
      tipoSku: "1",
      categoryName: "Serviços",
      productNumber: 10,
      variantNumber: 1,
      sku: "1-SERVICOS-10-1",
      skuKit: "",
      gerarSkuKit: false,
      produto: "Produto A",
      variante: "Variante X",
      caracteristicas: "Azul",
      skuMode: "legacy",
      skuSourceRowId: null,
      skuDecisionAt: null,
      isDeleted: false,
      deletedAt: null,
      revision: 1,
      customValues: null,
    },
  ];
});

describe("getVariations", () => {
  it("retorna 10 variações com SKUs derivados quando não há dados no banco", async () => {
    const result = await getVariations(1, "1-SERVICOS-10-1");
    expect(result).toHaveLength(10);
    expect(result[0].variationSku).toBe("1-SERVICOS-10-1-01");
    expect(result[9].variationSku).toBe("1-SERVICOS-10-1-10");
    expect(result[0].ean).toBe("");
    expect(result[0].mlb).toBe("");
    expect(result[0].done).toBe(false);
  });

  it("retorna dados existentes do banco mesclados com placeholders", async () => {
    variations = [
      { id: 1, skuRowId: 1, variationIndex: 3, variationSku: "1-SERVICOS-10-1-03", ean: "789123", mlb: "MLB001", done: true },
      { id: 2, skuRowId: 1, variationIndex: 7, variationSku: "1-SERVICOS-10-1-07", ean: "456789", mlb: "", done: false },
    ];
    const result = await getVariations(1, "1-SERVICOS-10-1");
    expect(result).toHaveLength(10);
    // Variação 3 com dados
    expect(result[2].variationIndex).toBe(3);
    expect(result[2].ean).toBe("789123");
    expect(result[2].mlb).toBe("MLB001");
    expect(result[2].done).toBe(true);
    // Variação 7 com dados parciais
    expect(result[6].variationIndex).toBe(7);
    expect(result[6].ean).toBe("456789");
    expect(result[6].mlb).toBe("");
    // Variação 1 sem dados
    expect(result[0].ean).toBe("");
    expect(result[0].done).toBe(false);
  });

  it("gera SKUs vazios quando baseSku é vazio", async () => {
    const result = await getVariations(1, "");
    expect(result[0].variationSku).toBe("");
    expect(result[9].variationSku).toBe("");
  });

  it("oculta uma variação excluída sem renumerar as demais", async () => {
    variations = [
      { id: 1, skuRowId: 1, variationIndex: 3, variationSku: "1-SERVICOS-10-1-03", ean: "", mlb: "", done: false, isDeleted: true },
    ];
    const result = await getVariations(1, "1-SERVICOS-10-1");
    expect(result).toHaveLength(9);
    expect(result.some((row) => row.variationIndex === 3)).toBe(false);
    expect(result.some((row) => row.variationIndex === 4)).toBe(true);
  });
});

describe("upsertVariation", () => {
  it("insere uma nova variação quando não existe", async () => {
    const result = await upsertVariation(1, 5, "1-SERVICOS-10-1", { ean: "111222", mlb: "MLB999", done: true, expectedRevision: 0 });
    expect(result.variationIndex).toBe(5);
    expect(result.variationSku).toBe("1-SERVICOS-10-1-05");
    expect(result.ean).toBe("111222");
    expect(result.mlb).toBe("MLB999");
    expect(result.done).toBe(true);
    // Verifica que foi inserido no store
    expect(variations).toHaveLength(1);
    expect(variations[0].skuRowId).toBe(1);
    expect(variations[0].variationIndex).toBe(5);
  });

  it("atualiza uma variação existente", async () => {
    variations = [
      { id: 10, skuRowId: 1, variationIndex: 2, variationSku: "1-SERVICOS-10-1-02", ean: "old", mlb: "oldmlb", done: false },
    ];
    const result = await upsertVariation(1, 2, "1-SERVICOS-10-1", { ean: "new-ean", expectedRevision: 1 });
    expect(result.ean).toBe("new-ean");
    // mlb preservado do existente
    expect(result.mlb).toBe("oldmlb");
    // Verifica que o store foi atualizado (variationSku recalculado)
    expect(variations[0].variationSku).toBe("1-SERVICOS-10-1-02");
  });

  it("atualiza apenas o campo done sem alterar ean/mlb", async () => {
    variations = [
      { id: 20, skuRowId: 1, variationIndex: 1, variationSku: "1-SERVICOS-10-1-01", ean: "abc", mlb: "def", done: false },
    ];
    const result = await upsertVariation(1, 1, "1-SERVICOS-10-1", { done: true, expectedRevision: 1 });
    expect(result.done).toBe(true);
    expect(result.ean).toBe("abc");
    expect(result.mlb).toBe("def");
  });

  it("gera variationSku correto com padding de dois dígitos", async () => {
    const result = await upsertVariation(1, 1, "2-BAMBU-5-3", { ean: "x", expectedRevision: 0 });
    expect(result.variationSku).toBe("2-BAMBU-5-3-01");
  });

  it("permite editar manualmente o SKU da variação", async () => {
    variations = [
      { id: 30, skuRowId: 1, variationIndex: 2, variationSku: "1-SERVICOS-10-1-02", ean: "", mlb: "", done: false },
    ];
    const { updated: result } = await editVariationSkuManually({
      skuRowId: 1,
      variationIndex: 2,
      baseSku: "1-SERVICOS-10-1",
      newSku: "SKU-MANUAL-02",
      expectedRevision: 1,
      actor: "Teste automatizado",
    });
    expect(result.variationSku).toBe("SKU-MANUAL-02");
    expect(variations[0].variationSku).toBe("SKU-MANUAL-02");
    expect(changeLogs).toContainEqual(
      expect.objectContaining({
        action: "manual_variation_sku_edit",
        authorizedBy: "Guilherme",
        affectedCount: 1,
      }),
    );
  });

  it("permite que uma variação repita exatamente o SKU principal", async () => {
    variations = [
      { id: 31, skuRowId: 1, variationIndex: 1, variationSku: "1-SERVICOS-10-1-01", ean: "", mlb: "", done: false, revision: 1 },
    ];

    const result = await editVariationSkuManually({
      skuRowId: 1,
      variationIndex: 1,
      baseSku: "1-SERVICOS-10-1",
      newSku: "1-SERVICOS-10-1",
      expectedRevision: 1,
      actor: "Teste automatizado",
    });

    expect(result.updated).toMatchObject({
      variationSku: "1-SERVICOS-10-1",
      revision: 2,
    });
    expect(skuValueReservationRows.filter((row) => row.normalizedSku === "1-servicos-10-1")).toHaveLength(1);
    expect(changeLogs).toContainEqual(
      expect.objectContaining({ action: "manual_variation_sku_edit", affectedCount: 1 }),
    );
  });

  it("preserva o SKU manual ao editar apenas EAN, MLB ou OK", async () => {
    variations = [
      { id: 31, skuRowId: 1, variationIndex: 2, variationSku: "SKU-MANUAL-02", ean: "antigo", mlb: "", done: false },
    ];
    const result = await upsertVariation(1, 2, "1-SERVICOS-10-1", { ean: "novo", expectedRevision: 1 });
    expect(result.variationSku).toBe("SKU-MANUAL-02");
    expect(variations[0].variationSku).toBe("SKU-MANUAL-02");
  });

  it("salva metadados quando a reserva idempotente vem encapsulada pelo Drizzle", async () => {
    variations = [
      {
        id: 310,
        skuRowId: 1,
        variationIndex: 5,
        variationSku: "1-SERVICOS-10-1-05",
        ean: "EAN-ANTIGO",
        mlb: "",
        done: false,
        revision: 1,
      },
    ];
    skuValueReservationRows.push({
      id: 2,
      normalizedSku: "1-servicos-10-1-05",
      originalSku: "1-SERVICOS-10-1-05",
      sourceType: "variation",
      sourceKey: "1:5",
    });
    wrapSkuValueDuplicateErrorOnce = true;

    const result = await upsertVariation(1, 5, "1-SERVICOS-10-1", {
      ean: "EAN-NOVO",
      expectedRevision: 1,
    });

    expect(result).toMatchObject({
      variationSku: "1-SERVICOS-10-1-05",
      ean: "EAN-NOVO",
      revision: 2,
    });
    expect(skuValueReservationRows.filter((row) => row.normalizedSku === "1-servicos-10-1-05")).toHaveLength(1);
  });

  it("permite repetição manual mesmo quando a reserva pertence a outra origem", async () => {
    skuValueReservationRows.push({
      id: 2,
      normalizedSku: "sku-de-outra-variacao",
      originalSku: "SKU-DE-OUTRA-VARIACAO",
      sourceType: "variation",
      sourceKey: "99:7",
    });
    wrapSkuValueDuplicateErrorOnce = true;

    const result = await editVariationSkuManually({
      skuRowId: 1,
      variationIndex: 5,
      baseSku: "1-SERVICOS-10-1",
      newSku: "SKU-DE-OUTRA-VARIACAO",
      expectedRevision: 0,
      actor: "Teste automatizado",
    });

    expect(result.updated.variationSku).toBe("SKU-DE-OUTRA-VARIACAO");
    expect(variations).toHaveLength(1);
    expect(skuValueReservationRows.find((row) => row.normalizedSku === "sku-de-outra-variacao")).toMatchObject({
      sourceKey: "99:7",
    });
  });

  it("continua bloqueando repetição na criação automática de uma variação", async () => {
    skuValueReservationRows.push({
      id: 2,
      normalizedSku: "1-servicos-10-1-05",
      originalSku: "1-SERVICOS-10-1-05",
      sourceType: "variation",
      sourceKey: "99:5",
    });

    await expect(
      upsertVariation(1, 5, "1-SERVICOS-10-1", {
        ean: "EAN-AUTOMATICO",
        expectedRevision: 0,
      }),
    ).rejects.toThrow("SKU_VARIACAO_DUPLICADO");
    expect(variations).toHaveLength(0);
  });

  it("reverte SKU e reserva da variação se o histórico falhar", async () => {
    variations = [
      { id: 301, skuRowId: 1, variationIndex: 2, variationSku: "SKU-ORIGINAL", ean: "", mlb: "", done: false, revision: 1 },
    ];
    changeLogInsertFailureOnce = true;
    await expect(
      editVariationSkuManually({
        skuRowId: 1,
        variationIndex: 2,
        baseSku: "1-SERVICOS-10-1",
        newSku: "SKU-NAO-PERSISTIDO",
        expectedRevision: 1,
        actor: "Teste automatizado",
      }),
    ).rejects.toThrow("Falha simulada no histórico");
    expect(variations[0]).toMatchObject({ variationSku: "SKU-ORIGINAL", revision: 1 });
    expect(skuValueReservationRows.some((row) => row.normalizedSku === "sku-nao-persistido")).toBe(false);
    expect(changeLogs).toHaveLength(0);
  });

  it("bloqueia SKU manual vazio", async () => {
    await expect(
      editVariationSkuManually({
        skuRowId: 1,
        variationIndex: 2,
        baseSku: "1-SERVICOS-10-1",
        newSku: "   ",
        expectedRevision: 0,
        actor: "Teste automatizado",
      }),
    ).rejects.toThrow("SKU_VARIACAO_OBRIGATORIO");
    expect(variations).toHaveLength(0);
  });

  it("permite SKU manual repetido usando normalização de espaços, pontos e caixa", async () => {
    variations = [
      { id: 32, skuRowId: 1, variationIndex: 2, variationSku: "SKU-EXISTENTE", ean: "", mlb: "", done: false, isDeleted: false },
    ];
    skuValueReservationRows.push({
      id: 2,
      normalizedSku: "sku-existente",
      originalSku: "SKU-EXISTENTE",
      sourceType: "variation",
      sourceKey: "1:2",
    });
    const result = await editVariationSkuManually({
      skuRowId: 1,
      variationIndex: 3,
      baseSku: "1-SERVICOS-10-1",
      newSku: " sku.existente ",
      expectedRevision: 0,
      actor: "Teste automatizado",
    });
    expect(result.updated.variationSku).toBe("sku.existente");
    expect(variations).toHaveLength(2);
    expect(skuValueReservationRows.filter((row) => row.normalizedSku === "sku-existente")).toHaveLength(1);
  });

  it("preserva um SKU repetido manualmente ao editar seus metadados depois", async () => {
    variations = [
      { id: 32, skuRowId: 1, variationIndex: 2, variationSku: "SKU-REPETIDO", ean: "ANTIGO", mlb: "", done: false, revision: 1 },
      { id: 33, skuRowId: 9, variationIndex: 1, variationSku: "SKU-REPETIDO", ean: "", mlb: "", done: false, revision: 1 },
    ];
    skuValueReservationRows.push({
      id: 2,
      normalizedSku: "sku-repetido",
      originalSku: "SKU-REPETIDO",
      sourceType: "variation",
      sourceKey: "9:1",
    });

    const result = await upsertVariation(1, 2, "1-SERVICOS-10-1", {
      ean: "NOVO",
      expectedRevision: 1,
    });
    expect(result).toMatchObject({ variationSku: "SKU-REPETIDO", ean: "NOVO", revision: 2 });
    expect(skuValueReservationRows.filter((row) => row.normalizedSku === "sku-repetido")).toHaveLength(1);
  });

  it("não permite editar nem ressuscitar um índice já excluído", async () => {
    variations = [
      { id: 33, skuRowId: 1, variationIndex: 6, variationSku: "SKU-TOMBSTONE", ean: "", mlb: "", done: false, isDeleted: true },
    ];
    await expect(
      editVariationSkuManually({
        skuRowId: 1,
        variationIndex: 6,
        baseSku: "1-SERVICOS-10-1",
        newSku: "SKU-NOVO",
        expectedRevision: 1,
        actor: "Teste automatizado",
      }),
    ).rejects.toThrow("VARIACAO_EXCLUIDA_PERMANENTE");
    expect(variations[0].variationSku).toBe("SKU-TOMBSTONE");
    expect(variations[0].isDeleted).toBe(true);
  });

  it("permite repetir manualmente o SKU de uma variação excluída sem ressuscitá-la", async () => {
    variations = [
      { id: 34, skuRowId: 1, variationIndex: 6, variationSku: "SKU.RESERVADO", ean: "", mlb: "", done: false, isDeleted: true },
    ];
    skuValueReservationRows.push({
      id: 2,
      normalizedSku: "sku-reservado",
      originalSku: "SKU.RESERVADO",
      sourceType: "variation",
      sourceKey: "1:6",
    });
    const result = await editVariationSkuManually({
      skuRowId: 1,
      variationIndex: 7,
      baseSku: "1-SERVICOS-10-1",
      newSku: " sku-reservado ",
      expectedRevision: 0,
      actor: "Teste automatizado",
    });
    expect(result.updated.variationSku).toBe("sku-reservado");
    expect(variations.find((row) => row.variationIndex === 6)?.isDeleted).toBe(true);
    expect(variations.find((row) => row.variationIndex === 7)?.isDeleted).toBe(false);
  });

  it("não sobrescreve uma variação inserida simultaneamente por outra aba", async () => {
    variationInsertCollisionOnce = true;
    await expect(
      upsertVariation(1, 8, "1-SERVICOS-10-1", {
        ean: "EAN-DA-SEGUNDA-ABA",
        expectedRevision: 0,
      }),
    ).rejects.toThrow("VARIACAO_CONCORRENTE");
    expect(variations).toHaveLength(1);
    expect(variations[0]).toMatchObject({ variationIndex: 8, ean: "", revision: 1 });
    expect(skuValueReservationRows).toContainEqual(
      expect.objectContaining({
        normalizedSku: "1-servicos-10-1-08",
        sourceType: "variation",
        sourceKey: "1:8",
      }),
    );
  });

  it("rejeita edição de variação baseada em revisão desatualizada", async () => {
    variations = [
      { id: 35, skuRowId: 1, variationIndex: 2, variationSku: "SKU-2", ean: "original", mlb: "", done: false, revision: 2 },
    ];
    await expect(
      upsertVariation(1, 2, "1-SERVICOS-10-1", { ean: "stale", expectedRevision: 1 }),
    ).rejects.toThrow("VARIACAO_CONCORRENTE");
    expect(variations[0].ean).toBe("original");
  });
});

describe("gestão manual de variações", () => {
  it("edita explicitamente somente o SKU da variação", async () => {
    variations = [
      { id: 39, skuRowId: 1, variationIndex: 2, variationSku: "1-SERVICOS-10-1-02", ean: "EAN", mlb: "MLB", done: true, revision: 1 },
    ];
    const result = await editVariationSkuManually({
      skuRowId: 1,
      variationIndex: 2,
      baseSku: "1-SERVICOS-10-1",
      newSku: "VARIACAO-MANUAL-02",
      expectedRevision: 1,
      actor: "Teste automatizado",
    });
    expect(result.previousSku).toBe("1-SERVICOS-10-1-02");
    expect(result.updated).toMatchObject({
      variationSku: "VARIACAO-MANUAL-02",
      ean: "EAN",
      mlb: "MLB",
      done: true,
      revision: 2,
    });
  });

  it("adiciona a primeira variação manual como índice 11", async () => {
    const result = await addVariation(1, "1-SERVICOS-10-1");
    expect(result.variationIndex).toBe(11);
    expect(result.variationSku).toBe("1-SERVICOS-10-1-11");
  });

  it("exclui logicamente e não altera os índices das outras variações", async () => {
    variations = [
      { id: 40, skuRowId: 1, variationIndex: 2, variationSku: "1-SERVICOS-10-1-02", ean: "EAN2", mlb: "MLB2", done: true, isDeleted: false },
      { id: 41, skuRowId: 1, variationIndex: 4, variationSku: "1-SERVICOS-10-1-04", ean: "EAN4", mlb: "MLB4", done: false, isDeleted: false },
    ];

    variations[0].revision = 9; // outra pessoa editou depois que o diálogo foi aberto
    await deleteVariation(1, 2, "1-SERVICOS-10-1");

    expect(variations.find((row) => row.variationIndex === 2)?.isDeleted).toBe(true);
    expect(variations.find((row) => row.variationIndex === 4)?.variationIndex).toBe(4);
    expect(variations.find((row) => row.variationIndex === 4)?.variationSku).toBe("1-SERVICOS-10-1-04");
  });

  it("não reutiliza índice excluído ao adicionar outra variação", async () => {
    variations = [
      { id: 50, skuRowId: 1, variationIndex: 11, variationSku: "1-SERVICOS-10-1-11", ean: "", mlb: "", done: false, isDeleted: true },
    ];

    const result = await addVariation(1, "1-SERVICOS-10-1");
    expect(result.variationIndex).toBe(12);
    expect(result.variationSku).toBe("1-SERVICOS-10-1-12");
  });

  it("tenta o índice seguinte quando outra aba reserva a mesma variação", async () => {
    variationInsertCollisionOnce = true;
    const result = await addVariation(1, "1-SERVICOS-10-1");
    expect(result.variationIndex).toBe(12);
    expect(variations.map((row) => row.variationIndex)).toEqual([11, 12]);
  });

  it("cria um tombstone ao excluir um placeholder ainda não persistido", async () => {
    await deleteVariation(1, 5, "1-SERVICOS-10-1");
    expect(variations).toHaveLength(1);
    expect(variations[0]).toMatchObject({
      variationIndex: 5,
      variationSku: "1-SERVICOS-10-1-05",
      isDeleted: true,
    });
    const visible = await getVariations(1, "1-SERVICOS-10-1");
    expect(visible.some((row) => row.variationIndex === 5)).toBe(false);
  });

  it("conclui a exclusão quando outra aba cria o placeholder no mesmo instante", async () => {
    variationInsertCollisionOnce = true;
    await expect(deleteVariation(1, 7, "1-SERVICOS-10-1")).resolves.toEqual({ ok: true });
    expect(variations).toHaveLength(1);
    expect(variations[0]).toMatchObject({ variationIndex: 7, isDeleted: true, revision: 2 });
  });
});

describe("colunas personalizadas colaborativas", () => {
  it("preserva chaves diferentes quando duas pessoas salvam a mesma linha ao mesmo tempo", async () => {
    skuRows[0].customValues = JSON.stringify({ "100": "existente" });
    customValueConcurrentPatchOnce = { key: "102", value: "Rafaela" };

    const updated = await setCustomValue(1, 101, "Guilherme");

    expect(JSON.parse(updated?.customValues ?? "{}")).toEqual({
      "100": "existente",
      "101": "Guilherme",
      "102": "Rafaela",
    });
    expect(JSON.parse(skuRows[0].customValues ?? "{}")).toEqual({
      "100": "existente",
      "101": "Guilherme",
      "102": "Rafaela",
    });
  });
});

describe("política imutável da linha principal", () => {
  function addPendingRow() {
    skuRows.push({
      ...skuRows[0],
      id: 2,
      position: 2,
      sku: "",
      skuKit: "",
      productNumber: null,
      variantNumber: null,
      skuMode: "pending",
      skuSourceRowId: null,
      skuDecisionAt: null,
      isDeleted: false,
      deletedAt: null,
      revision: 1,
    });
  }

  it("exige decisão quando produto, variante e características são idênticos", async () => {
    addPendingRow();
    const context = await getSkuDecisionContext(2);
    expect(context.requiresDecision).toBe(true);
    expect(context.revision).toBe(1);
    expect(context.matches).toEqual([
      expect.objectContaining({ id: 1, sku: "1-SERVICOS-10-1", isDeleted: false }),
    ]);
  });

  it("reutiliza exatamente o SKU existente somente após escolha explícita", async () => {
    addPendingRow();
    const updated = await applySkuDecision({
      skuRowId: 2,
      mode: "reuse",
      sourceRowId: 1,
      expectedRevision: 1,
    });
    expect(updated).toMatchObject({
      productNumber: 10,
      variantNumber: 1,
      sku: "1-SERVICOS-10-1",
      skuMode: "reuse",
      skuSourceRowId: 1,
      revision: 2,
    });
    expect(skuRows[0].sku).toBe("1-SERVICOS-10-1");
    expect(skuRows[0].revision).toBe(1);
  });

  it("gera nova variante acima do maior histórico para o mesmo produto", async () => {
    addPendingRow();
    const updated = await applySkuDecision({
      skuRowId: 2,
      mode: "auto",
      expectedRevision: 1,
    });
    expect(updated).toMatchObject({
      productNumber: 10,
      variantNumber: 2,
      sku: "1-SERVICOS-10-2",
      skuMode: "auto",
    });
    expect(variantReservations.map((row) => row.variantNumber)).toEqual([1, 2]);
  });

  it("mantém a Variante editável em uma linha nova até a confirmação no card", async () => {
    addPendingRow();
    const named = await updateSkuRow(2, { produto: "Produto novo editável" }, 1);
    expect(named).toMatchObject({
      productNumber: 11,
      variantNumber: null,
      sku: "",
      skuMode: "pending",
      revision: 2,
    });

    const edited = await updateSkuRow(2, { variante: "VARIANTE FINAL CORRETA" }, 2);
    expect(edited).toMatchObject({
      productNumber: 11,
      variante: "VARIANTE FINAL CORRETA",
      variantNumber: null,
      sku: "",
      skuMode: "pending",
      revision: 3,
    });

    const context = await getSkuDecisionContext(2);
    expect(context).toMatchObject({ requiresDecision: true, matches: [] });
  });

  it("permite SKU repetido quando a decisão é manual", async () => {
    addPendingRow();
    const updated = await applySkuDecision({
      skuRowId: 2,
      mode: "manual",
      manualSku: " 1.servicos.10.1 ",
      expectedRevision: 1,
    });
    expect(updated).toMatchObject({ sku: "1.servicos.10.1", skuMode: "manual" });
    expect(skuValueReservationRows.filter((row) => row.normalizedSku === "1-servicos-10-1")).toHaveLength(1);
  });

  it("rejeita uma decisão baseada em revisão desatualizada", async () => {
    addPendingRow();
    skuRows[1].revision = 2;
    await expect(
      applySkuDecision({
        skuRowId: 2,
        mode: "reuse",
        sourceRowId: 1,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("SKU_DECISION_STALE");
  });

  it.each(["reuse", "auto", "manual"] as const)(
    "não permite decisão %s em uma linha já finalizada",
    async (mode) => {
      await expect(
        applySkuDecision({
          skuRowId: 1,
          mode,
          sourceRowId: mode === "reuse" ? 2 : undefined,
          manualSku: mode === "manual" ? "SKU-ALTERADO" : undefined,
          expectedRevision: 1,
        }),
      ).rejects.toThrow("SKU_DECISION_NOT_ALLOWED");
      expect(skuRows[0].sku).toBe("1-SERVICOS-10-1");
      expect(skuRows[0].revision).toBe(1);
    },
  );

  it("bloqueia mudança de identidade em SKU finalizado", async () => {
    await expect(
      updateSkuRow(1, { produto: "Outro produto" }, 1),
    ).rejects.toThrow("SKU_FINALIZADO_IMUTAVEL");
    expect(skuRows[0]).toMatchObject({ produto: "Produto A", sku: "1-SERVICOS-10-1", revision: 1 });
  });

  it("permite editar metadado não estrutural sem tocar no SKU finalizado", async () => {
    const updated = await updateSkuRow(1, { eanGtin: "789" }, 1);
    expect(updated).toMatchObject({ eanGtin: "789", sku: "1-SERVICOS-10-1", revision: 2 });
  });

  it("rejeita update comum baseado em revisão desatualizada", async () => {
    await expect(updateSkuRow(1, { eanGtin: "789" }, 99)).rejects.toThrow("SKU_DECISION_STALE");
    expect(skuRows[0].eanGtin).toBeUndefined();
  });

  it("ignora o insertId técnico do TiDB e não reutiliza Nº Produto excluído", async () => {
    skuRows[0].isDeleted = true;
    addPendingRow();
    const pending = await updateSkuRow(2, { produto: "Produto A" }, 1);
    expect(pending).toMatchObject({
      productNumber: 11,
      variantNumber: null,
      sku: "",
      skuMode: "pending",
      revision: 2,
    });
    const updated = await applySkuDecision({
      skuRowId: 2,
      mode: "auto",
      expectedRevision: 2,
    });
    expect(updated).toMatchObject({ productNumber: 11, variantNumber: 1, sku: "1-SERVICOS-11-1", skuMode: "auto" });
    expect(productReservations.map((row) => row.productNumber)).toEqual([10, 11]);
  });

  it("ignora reserva técnica anulada e continua após o maior número comercial válido", async () => {
    productReservations.push({
      productNumber: 30_002,
      skuRowId: null,
      isVoided: true,
    });
    addPendingRow();

    const pending = await updateSkuRow(2, { produto: "Produto realmente novo" }, 1);

    expect(pending).toMatchObject({
      productNumber: 11,
      variantNumber: null,
      sku: "",
      skuMode: "pending",
    });
    const context = await getSkuDecisionContext(2);
    expect(context).toMatchObject({ requiresDecision: true, matches: [] });
    const updated = await applySkuDecision({ skuRowId: 2, mode: "auto", expectedRevision: 2 });
    expect(updated).toMatchObject({ productNumber: 11, variantNumber: 1, sku: "1-SERVICOS-11-1", skuMode: "auto" });
    expect(productReservations).toContainEqual({
      productNumber: 11,
      skuRowId: 2,
      isVoided: false,
    });
    expect(productReservations).toContainEqual({
      productNumber: 30_002,
      skuRowId: null,
      isVoided: true,
    });
  });

  it("tenta o próximo número quando outra pessoa reserva o mesmo candidato", async () => {
    productReservationInsertCollisionOnce = true;
    addPendingRow();

    const pending = await updateSkuRow(2, { produto: "Produto concorrente" }, 1);

    expect(pending).toMatchObject({
      productNumber: 12,
      variantNumber: null,
      sku: "",
      skuMode: "pending",
    });
    const updated = await applySkuDecision({ skuRowId: 2, mode: "auto", expectedRevision: 2 });
    expect(updated).toMatchObject({ productNumber: 12, variantNumber: 1, sku: "1-SERVICOS-12-1", skuMode: "auto" });
    expect(productReservations.map((row) => row.productNumber)).toEqual([10, 11, 12]);
  });

  it("atribui números comerciais diferentes a duas criações paralelas", async () => {
    addPendingRow();
    skuRows.push({
      ...skuRows[1],
      id: 3,
      position: 3,
      revision: 1,
    });

    const [firstPending, secondPending] = await Promise.all([
      updateSkuRow(2, { produto: "Produto paralelo A" }, 1),
      updateSkuRow(3, { produto: "Produto paralelo B" }, 1),
    ]);

    expect([firstPending?.productNumber, secondPending?.productNumber].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([11, 12]);
    expect(firstPending).toMatchObject({ sku: "", skuMode: "pending", revision: 2 });
    expect(secondPending).toMatchObject({ sku: "", skuMode: "pending", revision: 2 });
    const [first, second] = await Promise.all([
      applySkuDecision({ skuRowId: 2, mode: "auto", expectedRevision: 2 }),
      applySkuDecision({ skuRowId: 3, mode: "auto", expectedRevision: 2 }),
    ]);
    expect(new Set([first.sku, second.sku]).size).toBe(2);
    expect(productReservations.map((row) => row.productNumber).sort((a, b) => a - b)).toEqual([10, 11, 12]);
  });

  it("permite duas linhas escolherem simultaneamente o mesmo SKU manual", async () => {
    addPendingRow();
    skuRows.push({
      ...skuRows[1],
      id: 3,
      position: 3,
      produto: "Produto C",
      variante: "Variante Z",
      revision: 1,
    });

    const results = await Promise.allSettled([
      applySkuDecision({
        skuRowId: 2,
        mode: "manual",
        manualSku: "SKU-CONCORRENTE",
        expectedRevision: 1,
      }),
      applySkuDecision({
        skuRowId: 3,
        mode: "manual",
        manualSku: "sku.concorrente",
        expectedRevision: 1,
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(0);
    expect(skuRows.filter((row) => row.skuMode === "manual")).toHaveLength(2);
    expect(skuValueReservationRows.filter((row) => row.normalizedSku === "sku-concorrente")).toHaveLength(1);
  });

  it("mantém a reserva append-only quando o criador perde o CAS e outro manual vence", async () => {
    addPendingRow();
    skuRows.push({
      ...skuRows[1],
      id: 3,
      position: 3,
      produto: "Produto vencedor",
      variante: "Variante vencedora",
      revision: 1,
    });
    manualDuplicateWinnerBeforeCasOnce = {
      loserRowId: 2,
      winnerRowId: 3,
      sku: "1-SERVICOS-10-1-05",
    };

    await expect(
      applySkuDecision({
        skuRowId: 2,
        mode: "manual",
        manualSku: "1-SERVICOS-10-1-05",
        expectedRevision: 1,
      }),
    ).rejects.toThrow("SKU_DECISION_STALE");

    expect(skuRows.find((row) => row.id === 3)).toMatchObject({
      sku: "1-SERVICOS-10-1-05",
      skuMode: "manual",
    });
    expect(skuValueReservationRows).toContainEqual(
      expect.objectContaining({
        normalizedSku: "1-servicos-10-1-05",
        sourceType: "main",
        sourceKey: "2",
      }),
    );
    await expect(
      upsertVariation(1, 5, "1-SERVICOS-10-1", {
        ean: "AUTO-BLOQUEADO",
        expectedRevision: 0,
      }),
    ).rejects.toThrow("SKU_VARIACAO_DUPLICADO");
  });

  it("edita manualmente só o texto do SKU principal e preserva números e variações", async () => {
    skuRows[0].skuKit = "SKU-KIT-PRESERVADO";
    variations = [
      { id: 80, skuRowId: 1, variationIndex: 1, variationSku: "1-SERVICOS-10-1-01", ean: "EAN", mlb: "MLB", done: false },
    ];
    const result = await editMainSkuManually({
      skuRowId: 1,
      newSku: "SKU-LIVRE-999",
      expectedRevision: 1,
      actor: "Teste automatizado",
    });
    expect(result.previousSku).toBe("1-SERVICOS-10-1");
    expect(result.updated).toMatchObject({
      sku: "SKU-LIVRE-999",
      productNumber: 10,
      variantNumber: 1,
      skuKit: "SKU-KIT-PRESERVADO",
      skuMode: "manual",
      revision: 2,
    });
    expect(variations[0]).toMatchObject({
      variationSku: "1-SERVICOS-10-1-01",
      ean: "EAN",
      mlb: "MLB",
    });
    expect(skuValueReservationRows).toContainEqual(
      expect.objectContaining({ normalizedSku: "sku-livre-999", sourceKey: "1" }),
    );
    expect(skuValueReservationRows).toContainEqual(
      expect.objectContaining({ normalizedSku: "1-servicos-10-1", sourceKey: "1" }),
    );
    expect(changeLogs).toContainEqual(
      expect.objectContaining({
        action: "manual_sku_edit",
        authorizedBy: "Guilherme",
        affectedCount: 1,
      }),
    );
  });

  it("reverte SKU principal e reserva se o histórico falhar", async () => {
    changeLogInsertFailureOnce = true;
    await expect(
      editMainSkuManually({
        skuRowId: 1,
        newSku: "SKU-NAO-PERSISTIDO",
        expectedRevision: 1,
        actor: "Teste automatizado",
      }),
    ).rejects.toThrow("Falha simulada no histórico");
    expect(skuRows[0]).toMatchObject({ sku: "1-SERVICOS-10-1", revision: 1 });
    expect(skuValueReservationRows.some((row) => row.normalizedSku === "sku-nao-persistido")).toBe(false);
    expect(changeLogs).toHaveLength(0);
  });

  it("permite repetir o SKU de outra linha e registra como edição manual", async () => {
    skuRows.push({
      ...skuRows[0],
      id: 2,
      position: 2,
      sku: "SKU-ANTIGO-2",
      productNumber: 20,
      variantNumber: 3,
      revision: 1,
    });
    skuValueReservationRows.push({
      id: 2,
      normalizedSku: "sku-antigo-2",
      originalSku: "SKU-ANTIGO-2",
      sourceType: "main",
      sourceKey: "2",
    });
    const result = await editMainSkuManually({
      skuRowId: 2,
      newSku: "1-SERVICOS-10-1",
      expectedRevision: 1,
      actor: "Teste automatizado",
    });
    expect(result.updated).toMatchObject({
      sku: "1-SERVICOS-10-1",
      productNumber: 20,
      variantNumber: 3,
      skuMode: "manual",
      skuSourceRowId: null,
    });
  });

  it("permite digitar o SKU de outro produto diferente", async () => {
    skuRows.push({
      ...skuRows[0],
      id: 2,
      position: 2,
      produto: "Outro produto",
      variante: "Outra variante",
      sku: "SKU-OUTRO-PRODUTO",
      revision: 1,
    });
    skuValueReservationRows.push({
      id: 2,
      normalizedSku: "sku-outro-produto",
      originalSku: "SKU-OUTRO-PRODUTO",
      sourceType: "main",
      sourceKey: "2",
    });
    const result = await editMainSkuManually({
      skuRowId: 1,
      newSku: "SKU-OUTRO-PRODUTO",
      expectedRevision: 1,
      actor: "Teste automatizado",
    });
    expect(result.updated).toMatchObject({ sku: "SKU-OUTRO-PRODUTO", skuMode: "manual" });
    expect(skuRows[1].sku).toBe("SKU-OUTRO-PRODUTO");
    expect(skuValueReservationRows.filter((row) => row.normalizedSku === "sku-outro-produto")).toHaveLength(1);
  });

  it("rejeita edição manual principal baseada em revisão desatualizada", async () => {
    await expect(
      editMainSkuManually({
        skuRowId: 1,
        newSku: "SKU-NOVO",
        expectedRevision: 99,
        actor: "Teste automatizado",
      }),
    ).rejects.toThrow("SKU_DECISION_STALE");
    expect(skuRows[0].sku).toBe("1-SERVICOS-10-1");
  });

  it("permite SKU principal manual que também pertence a uma variação", async () => {
    variations = [
      { id: 81, skuRowId: 1, variationIndex: 1, variationSku: "SKU-DA-VARIACAO", ean: "", mlb: "", done: false },
    ];
    skuValueReservationRows.push({
      id: 2,
      normalizedSku: "sku-da-variacao",
      originalSku: "SKU-DA-VARIACAO",
      sourceType: "variation",
      sourceKey: "1:1",
    });
    const result = await editMainSkuManually({
      skuRowId: 1,
      newSku: "sku.da.variacao",
      expectedRevision: 1,
      actor: "Teste automatizado",
    });
    expect(result.updated).toMatchObject({ sku: "sku.da.variacao", skuMode: "manual" });
    expect(variations[0].variationSku).toBe("SKU-DA-VARIACAO");
  });

  it("exclui logicamente sem apagar nem renumerar o registro", async () => {
    const before = { ...skuRows[0] };
    skuRows[0].revision = 7; // simula uma edição feita por outro usuário
    await deleteSkuRow(1);
    expect(skuRows).toHaveLength(1);
    expect(skuRows[0]).toMatchObject({
      id: before.id,
      sku: before.sku,
      productNumber: before.productNumber,
      variantNumber: before.variantNumber,
      isDeleted: true,
      revision: 8,
    });
    await expect(deleteSkuRow(1)).resolves.toMatchObject({ isDeleted: true });
  });
});
