import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteSkuRow: vi.fn(),
  deleteVariation: vi.fn(),
  logSkuChange: vi.fn(),
}));

vi.mock("./skuSheetDb", () => ({
  createSkuRow: vi.fn(),
  deleteSkuRow: mocks.deleteSkuRow,
  listSkuRows: vi.fn(),
  updateSkuRow: vi.fn(),
  listCustomColumns: vi.fn(),
  createCustomColumn: vi.fn(),
  renameCustomColumn: vi.fn(),
  deleteCustomColumn: vi.fn(),
  setCustomValue: vi.fn(),
  repairVariantNumbers: vi.fn(),
  getVariations: vi.fn(),
  upsertVariation: vi.fn(),
  addVariation: vi.fn(),
  deleteVariation: mocks.deleteVariation,
  getSkuDecisionContext: vi.fn(),
  applySkuDecision: vi.fn(),
  editMainSkuManually: vi.fn(),
  editVariationSkuManually: vi.fn(),
}));

vi.mock("./skuProtection", () => ({
  validateSkuPassword: vi.fn(),
  logSkuChange: mocks.logSkuChange,
  listSkuChangeLog: vi.fn(),
}));

import { skuSheetRouter } from "./routers/skuSheet";

function regularUserContext() {
  return {
    req: {} as never,
    res: {} as never,
    user: {
      id: 77,
      openId: "rafaela-user",
      name: "Rafaela",
      email: "rafaela@example.com",
      loginMethod: "password",
      role: "user" as const,
      lastSignedIn: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

describe("acesso colaborativo à exclusão de SKU", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteSkuRow.mockResolvedValue({
      id: 12,
      sku: "SKU-12",
      productNumber: 12,
      variantNumber: 1,
      isDeleted: false,
    });
    mocks.deleteVariation.mockResolvedValue({ ok: true });
    mocks.logSkuChange.mockResolvedValue(undefined);
  });

  it("permite que usuário comum exclua uma linha sem senha e sem revisão", async () => {
    const caller = skuSheetRouter.createCaller(regularUserContext());
    await expect(caller.delete({ id: 12 })).resolves.toEqual({ ok: true });
    expect(mocks.deleteSkuRow).toHaveBeenCalledWith(12);
    expect(mocks.logSkuChange).toHaveBeenCalledWith(
      expect.objectContaining({ authorizedBy: "Rafaela", action: "logical_delete" }),
    );
  });

  it("permite que usuário comum exclua uma variação sem senha e sem revisão", async () => {
    const caller = skuSheetRouter.createCaller(regularUserContext());
    await expect(
      caller.deleteVariation({ skuRowId: 12, variationIndex: 3, baseSku: "SKU-12" }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.deleteVariation).toHaveBeenCalledWith(12, 3, "SKU-12");
  });
});
