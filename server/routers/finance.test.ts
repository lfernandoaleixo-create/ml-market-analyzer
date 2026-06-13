import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the finance router (the "Lucratividade Real" feature).
 *
 * The DB layer (tax config) and the BaseLinker client/provider are mocked so we
 * assert the wiring and config logic without any network/DB:
 *  - status reflects BaseLinker configured flag + stored TTS toggle
 *  - getConfig hydrates defaults over a partial stored config
 *  - toggleTts persists the new flag and rehydrates the config
 *  - saveConfig persists the full config and inventory id
 *  - profitability fails clearly when BaseLinker is not configured
 */

const db = { getTaxConfigRow: vi.fn(), upsertTaxConfigRow: vi.fn() };
const bl = {
  isBaselinkerConfigured: vi.fn(),
  callBaselinker: vi.fn(),
};

vi.mock("../dbMl", () => ({
  getTaxConfigRow: (...a: unknown[]) => db.getTaxConfigRow(...a),
  upsertTaxConfigRow: (...a: unknown[]) => db.upsertTaxConfigRow(...a),
}));

vi.mock("../baselinker/client", async () => {
  const actual = await vi.importActual<typeof import("../baselinker/client")>(
    "../baselinker/client",
  );
  return {
    ...actual,
    isBaselinkerConfigured: (...a: unknown[]) => bl.isBaselinkerConfigured(...a),
    callBaselinker: (...a: unknown[]) => bl.callBaselinker(...a),
  };
});

// Keep provider/Ads inert (they would do network I/O).
vi.mock("../baselinker/provider", () => ({
  getInventories: vi.fn(async () => []),
  getProductCosts: vi.fn(async () => ({ byId: new Map(), bySku: new Map() })),
  getOrders: vi.fn(async () => []),
}));
vi.mock("../ml/oauthMl", () => ({
  ensureUserAccessToken: vi.fn(async () => null),
  forceRefreshUserAccessToken: vi.fn(async () => null),
}));

function protectedContext() {
  return {
    user: { id: 1, role: "user" },
    req: { protocol: "https", headers: { cookie: "" } },
    res: {},
  } as never;
}

async function makeCaller() {
  vi.resetModules();
  const { appRouter } = await import("../routers");
  return appRouter.createCaller(protectedContext());
}

beforeEach(() => {
  vi.clearAllMocks();
  db.upsertTaxConfigRow.mockResolvedValue({ ttsEnabled: false });
});

describe("finance.status", () => {
  it("reports BaseLinker configured and stored TTS flag", async () => {
    bl.isBaselinkerConfigured.mockReturnValue(true);
    db.getTaxConfigRow.mockResolvedValue({
      ttsEnabled: true,
      baselinkerInventoryId: 54206,
      config: {},
    });
    const caller = await makeCaller();
    const res = await caller.finance.status();
    expect(res).toEqual({
      baselinkerConfigured: true,
      ttsEnabled: true,
      inventoryId: 54206,
      hasConfig: true,
    });
  });

  it("defaults to not-configured / TTS off when nothing stored", async () => {
    bl.isBaselinkerConfigured.mockReturnValue(false);
    db.getTaxConfigRow.mockResolvedValue(null);
    const caller = await makeCaller();
    const res = await caller.finance.status();
    expect(res.baselinkerConfigured).toBe(false);
    expect(res.ttsEnabled).toBe(false);
    expect(res.hasConfig).toBe(false);
  });
});

describe("finance.getConfig", () => {
  it("hydrates defaults over a partial stored config", async () => {
    db.getTaxConfigRow.mockResolvedValue({
      ttsEnabled: false,
      config: { pis: 0.5, icmsInternalByUF: { SP: 19 } },
    });
    const caller = await makeCaller();
    const res = await caller.finance.getConfig();
    // Overridden value preserved.
    expect(res.config.pis).toBe(0.5);
    expect(res.config.icmsInternalByUF.SP).toBe(19);
    // Default still present for untouched fields.
    expect(res.config.cofins).toBe(3.0);
    expect(res.config.ttsInterstate).toBe(1.3);
    // UF list exposed for the editor.
    expect(res.ufList).toContain("MG");
    expect(res.ufList.length).toBe(27);
  });
});

describe("finance.toggleTts", () => {
  it("persists the new flag and rehydrates the config", async () => {
    db.getTaxConfigRow.mockResolvedValue({ ttsEnabled: false, config: { pis: 0.65 } });
    db.upsertTaxConfigRow.mockResolvedValue({ ttsEnabled: true });
    const caller = await makeCaller();
    const res = await caller.finance.toggleTts({ enabled: true });
    expect(res).toEqual({ ok: true, ttsEnabled: true });
    expect(db.upsertTaxConfigRow).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        ttsEnabled: true,
        config: expect.objectContaining({ ttsEnabled: true, pis: 0.65 }),
      }),
    );
  });
});

describe("finance.saveConfig", () => {
  it("persists the full config and inventory id", async () => {
    db.upsertTaxConfigRow.mockResolvedValue({ ttsEnabled: false });
    const caller = await makeCaller();
    const config = {
      ttsEnabled: false,
      originUF: "MG",
      pis: 0.65,
      cofins: 3.0,
      irpjEffective: 1.2,
      csllEffective: 1.08,
      icmsInternalOrigin: 18,
      icmsInternalByUF: { SP: 18 },
      fcpByUF: {},
      ttsInterstate: 1.3,
      ttsInternal: 6,
    };
    const res = await caller.finance.saveConfig({ config, inventoryId: 54206 });
    expect(res.ok).toBe(true);
    expect(db.upsertTaxConfigRow).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ ttsEnabled: false, baselinkerInventoryId: 54206 }),
    );
  });
});

describe("finance.profitability", () => {
  it("fails clearly when BaseLinker is not configured", async () => {
    bl.isBaselinkerConfigured.mockReturnValue(false);
    db.getTaxConfigRow.mockResolvedValue(null);
    const caller = await makeCaller();
    await expect(caller.finance.profitability({ days: 30 })).rejects.toThrow(
      /BaseLinker não configurado/,
    );
  });
});
