import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDriveBackupConfig: vi.fn(),
  updateDriveBackupConfig: vi.fn(),
  isConnected: vi.fn(),
  storagePut: vi.fn(),
  buildSheetsWorkbookBuffer: vi.fn(),
  backupFileName: vi.fn(),
  refreshAccessToken: vi.fn(),
  ensureFolder: vi.fn(),
  uploadXlsx: vi.fn(),
}));

vi.mock("../driveBackupDb", () => ({
  getDriveBackupConfig: mocks.getDriveBackupConfig,
  updateDriveBackupConfig: mocks.updateDriveBackupConfig,
  isConnected: mocks.isConnected,
}));
vi.mock("../storage", () => ({ storagePut: mocks.storagePut }));
vi.mock("./sheetsXlsx", () => ({
  buildSheetsWorkbookBuffer: mocks.buildSheetsWorkbookBuffer,
  backupFileName: mocks.backupFileName,
}));
vi.mock("./googleDrive", () => ({
  refreshAccessToken: mocks.refreshAccessToken,
  ensureFolder: mocks.ensureFolder,
  uploadXlsx: mocks.uploadXlsx,
}));

import { runDriveBackup } from "./runBackup";

const config = {
  id: 1,
  refreshToken: "token-antigo",
  accountEmail: "",
  folderId: "",
  folderName: "Backups Planilha SKU",
  enabled: true,
  scheduleCronTaskUid: "cron-1",
  scheduleHourUtc: 9,
  lastBackupAt: null,
  lastStatus: "",
  lastError: null,
  lastFileId: "",
  lastFileName: "",
  lastInternalBackupAt: null,
  lastInternalBackupKey: "",
  lastInternalBackupFileName: "",
  lastInternalBackupError: null,
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDriveBackupConfig.mockResolvedValue({ ...config });
  mocks.isConnected.mockReturnValue(true);
  mocks.buildSheetsWorkbookBuffer.mockResolvedValue(Buffer.from("xlsx"));
  mocks.backupFileName.mockReturnValue("Planilha-SKU-2026-09-22_06h00.xlsx");
  mocks.storagePut.mockResolvedValue({
    key: "backups/planilha-sku/arquivo_hash.xlsx",
    url: "/manus-storage/backups/planilha-sku/arquivo_hash.xlsx",
  });
  mocks.refreshAccessToken.mockResolvedValue("access-token");
  mocks.ensureFolder.mockResolvedValue("folder-1");
  mocks.uploadXlsx.mockResolvedValue({ id: "drive-file-1", name: "Planilha-SKU.xlsx" });
  mocks.updateDriveBackupConfig.mockResolvedValue(undefined);
});

describe("runDriveBackup — redundância", () => {
  it("mantém backup válido no armazenamento interno quando o token do Drive expira", async () => {
    mocks.refreshAccessToken.mockRejectedValue(new Error("invalid_grant"));

    const result = await runDriveBackup();

    expect(result).toMatchObject({ ok: true, internalOk: true, driveOk: false });
    expect(mocks.storagePut).toHaveBeenCalledOnce();
    expect(mocks.uploadXlsx).not.toHaveBeenCalled();
    expect(mocks.updateDriveBackupConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        lastStatus: "warning",
        lastInternalBackupKey: "backups/planilha-sku/arquivo_hash.xlsx",
        lastInternalBackupError: null,
      }),
    );
  });

  it("conclui as duas cópias quando o Drive está válido", async () => {
    const result = await runDriveBackup();

    expect(result).toMatchObject({ ok: true, internalOk: true, driveOk: true });
    expect(mocks.storagePut).toHaveBeenCalledOnce();
    expect(mocks.uploadXlsx).toHaveBeenCalledOnce();
    expect(mocks.updateDriveBackupConfig).toHaveBeenCalledWith(
      expect.objectContaining({ lastStatus: "ok", lastFileId: "drive-file-1" }),
    );
  });

  it("a cópia do Drive ainda protege quando o armazenamento interno falha", async () => {
    mocks.storagePut.mockRejectedValue(new Error("storage indisponível"));

    const result = await runDriveBackup();

    expect(result).toMatchObject({ ok: true, internalOk: false, driveOk: true });
    expect(mocks.updateDriveBackupConfig).toHaveBeenCalledWith(
      expect.objectContaining({ lastStatus: "warning", lastInternalBackupError: "storage indisponível" }),
    );
  });

  it("reporta falha total se nem o XLSX puder ser gerado", async () => {
    mocks.buildSheetsWorkbookBuffer.mockRejectedValue(new Error("falha de serialização"));

    const result = await runDriveBackup();

    expect(result).toMatchObject({ ok: false, internalOk: false, driveOk: false });
    expect(mocks.storagePut).not.toHaveBeenCalled();
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
    expect(mocks.updateDriveBackupConfig).toHaveBeenCalledWith(
      expect.objectContaining({ lastStatus: "error" }),
    );
  });
});
