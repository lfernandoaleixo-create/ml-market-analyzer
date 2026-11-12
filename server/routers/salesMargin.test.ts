import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarginCollectionSnapshot } from "../salesMargin/provider";
import type { MarginReportPreview, MarginSale } from "../../shared/salesMargin";
const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  verify: vi.fn(),
  reports: vi.fn(),
  costs: vi.fn(),
  save: vi.fn(),
  upload: vi.fn(),
  parser: vi.fn(),
}));
vi.mock("../salesMargin/provider", async () => {
  const actual = await vi.importActual<
    typeof import("../salesMargin/provider")
  >("../salesMargin/provider");
  return {
    ...actual,
    getSalesMarginCollection: mocks.collection,
    verifySalesMarginAccount: mocks.verify,
  };
});
vi.mock("../salesMargin/db", () => ({
  listMarginReports: mocks.reports,
  listMarginCosts: mocks.costs,
  saveMarginCost: mocks.save,
  importMarginReport: mocks.upload,
}));
vi.mock("../salesMargin/reportParser", () => ({
  parseMarginReport: mocks.parser,
}));
import { SalesMarginProviderError } from "../salesMargin/provider";
import { salesMarginRouter } from "./salesMargin";
const SELLER = "3308178634";
const bounds = {
  fromMs: Date.parse("2026-11-01T00:00:00Z"),
  toMs: Date.parse("2026-11-30T23:59:59.999Z"),
};
const sale = (patch: Partial<MarginSale> = {}): MarginSale => ({
  operationId: "1001",
  saleDate: "2026-11-12T12:00:00Z",
  items: [{ itemId: "MLB123", title: "Produto", sku: "KEEP-SKU", quantity: 1 }],
  gross: 111.93,
  deductions: 32.02,
  net: 79.91,
  financialStatus: "confirmed",
  source: "api",
  charges: [],
  taxesWithheld: 0,
  released: true,
  ...patch,
});
const preview = (
  patch: Partial<MarginReportPreview> = {}
): MarginReportPreview => ({
  fileName: "loja.csv",
  fileHash: "a".repeat(64),
  format: "ml_sales",
  rowCount: 1,
  operations: [sale({ source: "report" })],
  fromDate: "2026-11-12",
  toDate: "2026-11-12",
  warnings: [],
  ...patch,
});
function caller(auth = true) {
  return salesMarginRouter.createCaller({
    user: auth ? { id: 7, role: "user" } : null,
    req: {},
    res: {},
  } as never);
}
beforeEach(() => {
  vi.clearAllMocks();
  const snapshot: MarginCollectionSnapshot = {
    ownerUserId: 42,
    sellerId: SELLER,
    nickname: "LOJA",
    asOf: 100,
    stale: false,
    partial: false,
    capped: false,
    operations: [sale()],
  };
  mocks.collection.mockResolvedValue(snapshot);
  mocks.verify.mockResolvedValue({
    ownerUserId: 42,
    sellerId: SELLER,
    nickname: "LOJA",
    token: "MOCK_ONLY",
    deadlineAt: 100,
  });
  mocks.reports.mockResolvedValue({ reports: [], count: 0, partial: false });
  mocks.costs.mockResolvedValue([]);
  mocks.parser.mockReturnValue(preview());
  mocks.upload.mockResolvedValue({
    id: 1,
    duplicate: false,
    rowCount: 1,
    operations: 1,
  });
  mocks.save.mockImplementation(
    async (_owner, _seller, _actor, input) => input
  );
});
describe("salesMargin protected router", () => {
  it("requires authentication for all five procedures before I/O", async () => {
    const guest = caller(false);
    await expect(guest.dashboard(bounds)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(guest.refresh(bounds)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      guest.previewReport({ fileName: "loja.csv", base64: "YQ==" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      guest.importReport({
        fileName: "loja.csv",
        base64: "YQ==",
        confirmedStore: true,
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      guest.saveCost({ operationId: "1001", productCost: 0, extraCosts: 0 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.parser).not.toHaveBeenCalled();
  });
  it("accepts ordinary authenticated users and scopes reads to the verified shared owner/seller", async () => {
    const result = await caller().dashboard(bounds);
    expect(mocks.collection).toHaveBeenCalledWith(7, bounds, false);
    expect(mocks.reports).toHaveBeenCalledWith(42, SELLER);
    expect(mocks.costs).toHaveBeenCalledWith(42, SELLER);
    expect(result).toMatchObject({
      sellerId: SELLER,
      reportCount: 0,
      rows: [{ net: 79.91, result: null, resultStatus: "missing_cost" }],
    });
  });
  it("refresh bypasses collection TTL and returns a MarginDashboard", async () => {
    const result = await caller().refresh(bounds);
    expect(mocks.collection).toHaveBeenCalledWith(7, bounds, true);
    expect(result.rows).toHaveLength(1);
    expect(result.summary.operations).toBe(1);
  });
  it("reads costs and reports fresh even when provider returns the same cached collection", async () => {
    const user = caller();
    await user.dashboard(bounds);
    mocks.costs.mockResolvedValue([
      { operationId: "1001", productCost: 20, extraCosts: 0, note: "Manual" },
    ]);
    const result = await user.dashboard(bounds);
    expect(result.rows[0]).toMatchObject({
      result: 59.91,
      resultStatus: "confirmed",
      costNote: "Manual",
    });
    expect(mocks.costs).toHaveBeenCalledTimes(2);
    expect(mocks.reports).toHaveBeenCalledTimes(2);
  });
  it("uses the last-uploaded photograph per operation, never sums overlapping report events", async () => {
    mocks.reports.mockResolvedValue({
      count: 2,
      partial: false,
      reports: [
        {
          id: 1,
          createdAt: new Date("2026-11-13"),
          operations: [sale({ source: "report", net: 50 })],
        },
        {
          id: 2,
          createdAt: new Date("2026-11-14"),
          operations: [sale({ source: "report", net: 70 })],
        },
      ],
    });
    const result = await caller().dashboard(bounds);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ source: "report", net: 70 });
    expect(result.summary.net).toBe(70);
  });
  it("report refund snapshot overrides a confirmed API net without a positive result", async () => {
    mocks.reports.mockResolvedValue({
      count: 1,
      partial: false,
      reports: [
        {
          id: 1,
          createdAt: new Date(),
          operations: [
            sale({
              net: null,
              deductions: null,
              financialStatus: "refund_pending",
            }),
          ],
        },
      ],
    });
    mocks.costs.mockResolvedValue([
      { operationId: "1001", productCost: 0, extraCosts: 0, note: "" },
    ]);
    expect((await caller().dashboard(bounds)).rows[0]).toMatchObject({
      financialStatus: "refund_pending",
      net: null,
      result: null,
      resultStatus: "pending_financial",
    });
  });
  it("retains new report-only operations inside bounds and excludes others", async () => {
    mocks.reports.mockResolvedValue({
      count: 1,
      partial: false,
      reports: [
        {
          id: 1,
          createdAt: new Date(),
          operations: [
            sale({ operationId: "2002" }),
            sale({ operationId: "outside", saleDate: "2026-10-30T12:00:00Z" }),
          ],
        },
      ],
    });
    expect(
      (await caller().dashboard(bounds)).rows.map(row => row.operationId)
    ).toEqual(["2002", "1001"]);
  });
  it("includes date-only report snapshots on the first Brazilian day, not the prior UTC day", async () => {
    mocks.collection.mockResolvedValue({
      ownerUserId: 42,
      sellerId: SELLER,
      nickname: "LOJA",
      asOf: 100,
      stale: false,
      partial: false,
      capped: false,
      operations: [],
    });
    mocks.reports.mockResolvedValue({
      count: 1,
      partial: false,
      reports: [
        {
          id: 1,
          createdAt: new Date(),
          operations: [
            sale({ operationId: "local-day", saleDate: "2026-11-01" }),
            sale({ operationId: "prior", saleDate: "2026-10-31" }),
          ],
        },
      ],
    });
    const result = await caller().dashboard({
      fromMs: Date.parse("2026-11-01T00:00:00-03:00"),
      toMs: Date.parse("2026-11-01T23:59:59.999-03:00"),
    });
    expect(result.rows.map(row => row.operationId)).toEqual(["local-day"]);
  });
  it("supplements a missing report SKU only using exact unique operation/itemID", async () => {
    mocks.reports.mockResolvedValue({
      count: 1,
      partial: false,
      reports: [
        {
          id: 1,
          createdAt: new Date(),
          operations: [
            sale({
              items: [
                {
                  itemId: "MLB123",
                  title: "Different report title",
                  sku: null,
                  quantity: 1,
                },
              ],
            }),
          ],
        },
      ],
    });
    expect((await caller().dashboard(bounds)).rows[0].items[0]).toMatchObject({
      sku: "KEEP-SKU",
      title: "Different report title",
    });
  });
  it.each([null, "OTHER"])(
    "never guesses report SKU by matching title for item id %s",
    async itemId => {
      mocks.reports.mockResolvedValue({
        count: 1,
        partial: false,
        reports: [
          {
            id: 1,
            createdAt: new Date(),
            operations: [
              sale({
                items: [{ itemId, title: "Produto", sku: null, quantity: 1 }],
              }),
            ],
          },
        ],
      });
      mocks.costs.mockResolvedValue([
        { operationId: "1001", productCost: 0, extraCosts: 0, note: "" },
      ]);
      expect((await caller().dashboard(bounds)).rows[0]).toMatchObject({
        result: null,
        resultStatus: "missing_sku",
      });
    }
  );
  it("does not supplement ambiguous duplicated item IDs", async () => {
    const item = { itemId: "MLB123", title: "Produto", sku: null, quantity: 1 };
    mocks.reports.mockResolvedValue({
      count: 1,
      partial: false,
      reports: [
        {
          id: 1,
          createdAt: new Date(),
          operations: [sale({ items: [item, item] })],
        },
      ],
    });
    expect(
      (await caller().dashboard(bounds)).rows[0].items.every(
        item => item.sku === null
      )
    ).toBe(true);
  });
  it("report read truncation marks partial/capped and withholds full-period totals", async () => {
    mocks.reports.mockResolvedValue({
      reports: [],
      count: 1000,
      partial: true,
    });
    const result = await caller().dashboard(bounds);
    expect(result).toMatchObject({
      partial: true,
      capped: true,
      warning: expect.stringMatching(/1.000/),
    });
    expect(result.summary).toMatchObject({
      gross: null,
      net: null,
      result: null,
      knownNet: 79.91,
    });
  });
  it("previews only after verifying the store", async () => {
    const result = await caller().previewReport({
      fileName: "loja.csv",
      base64: "YQ==",
    });
    expect(result).toEqual(preview());
    expect(mocks.verify).toHaveBeenCalledWith(7);
    expect(mocks.parser).toHaveBeenCalledWith("loja.csv", "YQ==");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("requires explicit store confirmation and scopes import with uploader identity", async () => {
    await expect(
      caller().importReport({
        fileName: "loja.csv",
        base64: "YQ==",
        confirmedStore: false,
      } as never)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.upload).not.toHaveBeenCalled();
    const result = await caller().importReport({
      fileName: "loja.csv",
      base64: "YQ==",
      confirmedStore: true,
    });
    expect(mocks.upload).toHaveBeenCalledWith(42, SELLER, 7, preview());
    expect(result).toMatchObject({ ok: true, duplicate: false });
  });
  it("returns duplicate outcome without reprocessing dashboard totals", async () => {
    mocks.upload.mockResolvedValue({
      id: 1,
      duplicate: true,
      rowCount: 1,
      operations: 1,
    });
    expect(
      await caller().importReport({
        fileName: "loja.csv",
        base64: "YQ==",
        confirmedStore: true,
      })
    ).toMatchObject({ duplicate: true });
  });
  it.each([
    { productCost: null, extraCosts: null },
    { productCost: 0, extraCosts: 0 },
  ])(
    "persists explicit null/zero total-order costs, only through new cost storage %j",
    async values => {
      const input = { operationId: "1001", ...values, note: "Manual" };
      const result = await caller().saveCost(input);
      expect(mocks.verify).toHaveBeenCalledWith(7);
      expect(mocks.save).toHaveBeenCalledWith(42, SELLER, 7, input);
      expect(result).toMatchObject({ ok: true, cost: input });
      expect(mocks.upload).not.toHaveBeenCalled();
    }
  );
  it.each([-1, NaN, Infinity, 0.001, 10.123, 1_000_000_000])(
    "rejects invalid cost %s before persistence",
    async productCost => {
      await expect(
        caller().saveCost({ operationId: "1001", productCost, extraCosts: 0 })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mocks.save).not.toHaveBeenCalled();
    }
  );
  it("rejects oversized base64 before parsing or verifying the account", async () => {
    await expect(
      caller().previewReport({
        fileName: "loja.csv",
        base64: "a".repeat(2_800_000),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.parser).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("preserves only static allowlisted parser guidance", async () => {
    const message =
      "Cabeçalho não suportado. Use ML Por venda ou MP account money com referência do pedido, valores e data da transação.";
    mocks.parser.mockImplementation(() => {
      throw new Error(message);
    });
    const error = await caller()
      .previewReport({ fileName: "loja.csv", base64: "YQ==" })
      .catch(error => error);
    expect(error).toMatchObject({ code: "BAD_REQUEST", message });
    expect(error.cause).toBeUndefined();
  });
  it("rejects inverted bounds before provider I/O", async () => {
    await expect(
      caller().dashboard({ fromMs: 2, toMs: 1 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.collection).not.toHaveBeenCalled();
  });
  it("sanitizes unknown DB/API/parser errors without causes containing secrets", async () => {
    mocks.costs.mockRejectedValue(
      new Error("SELECT secret_TOKEN buyer@test.invalid")
    );
    const error = await caller()
      .dashboard(bounds)
      .catch(error => error);
    expect(error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(error.message).not.toMatch(/SELECT|secret|buyer/);
    expect(error.cause).toBeUndefined();
    mocks.parser.mockImplementation(() => {
      throw new Error("buyer@test.invalid raw spreadsheet");
    });
    const fileError = await caller()
      .previewReport({ fileName: "loja.csv", base64: "YQ==" })
      .catch(error => error);
    expect(fileError.code).toBe("BAD_REQUEST");
    expect(fileError.message).not.toMatch(/buyer|spreadsheet/);
    expect(fileError.cause).toBeUndefined();
  });
  it("rejects wrong store for imports and cost writes without performing persistence", async () => {
    mocks.verify.mockRejectedValue(
      new SalesMarginProviderError("FORBIDDEN", "Loja incorreta.")
    );
    await expect(
      caller().saveCost({ operationId: "1001", productCost: 0, extraCosts: 0 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller().importReport({
        fileName: "loja.csv",
        base64: "YQ==",
        confirmedStore: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.parser).not.toHaveBeenCalled();
  });
});
