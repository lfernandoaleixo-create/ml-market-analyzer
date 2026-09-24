import "dotenv/config";
import { getDriveBackupConfig, isConnected } from "../server/driveBackupDb";
import { refreshAccessToken } from "../server/backup/googleDrive";
import { listHeartbeatJobs } from "../server/_core/heartbeat";
import { storageGetSignedUrl } from "../server/storage";
import { listAllSkuRows } from "../server/skuSheetDb";
import * as XLSX from "xlsx";

const config = await getDriveBackupConfig();
const expectedTechnicalProductRows = (await listAllSkuRows()).length;
let tokenStatus: "missing" | "valid" | "invalid" = "missing";
let tokenError = "";
if (isConnected(config)) {
  try {
    await refreshAccessToken(config.refreshToken!);
    tokenStatus = "valid";
  } catch (error) {
    tokenStatus = "invalid";
    tokenError = error instanceof Error ? error.message.replace(/refresh_token[^ ]*/gi, "[redacted]") : "erro desconhecido";
  }
}

let schedule: unknown = null;
let scheduleError = "";
try {
  const jobs = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
  schedule = jobs.jobs.find((job) => job.name === "drive-backup-diario") ?? null;
} catch (error) {
  scheduleError = error instanceof Error ? error.message : "erro desconhecido";
}

let internalBackup = {
  exists: false,
  bytes: 0,
  sheetCount: 0,
  technicalProductRows: 0,
  includesSkuValueReservations: false,
  includesProductNumberVoidMarker: false,
};
if (config.lastInternalBackupKey) {
  const signedUrl = await storageGetSignedUrl(config.lastInternalBackupKey);
  const response = await fetch(signedUrl);
  if (response.ok) {
    const bytes = Buffer.from(await response.arrayBuffer());
    const workbook = XLSX.read(bytes, { type: "buffer" });
    const technicalRows = XLSX.utils.sheet_to_json(
      workbook.Sheets["_Produtos_Tecnico"],
      { defval: "" },
    );
    const productReservationRows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets["_Reservas_Num_Produto"],
      { header: 1, defval: "" },
    );
    internalBackup = {
      exists: true,
      bytes: bytes.length,
      sheetCount: workbook.SheetNames.length,
      technicalProductRows: technicalRows.length,
      includesSkuValueReservations: workbook.SheetNames.includes("_Reservas_Valor_SKU"),
      includesProductNumberVoidMarker: productReservationRows[0]?.includes("isVoided") ?? false,
    };
  }
}

console.log(JSON.stringify({
  config: {
    enabled: config.enabled,
    scheduleHourUtc: config.scheduleHourUtc,
    hasRefreshToken: isConnected(config),
    accountEmailConfigured: Boolean(config.googleEmail),
    lastBackupAt: config.lastBackupAt,
    lastStatus: config.lastStatus,
    lastError: config.lastError,
  },
  tokenStatus,
  tokenError,
  schedule,
  scheduleError,
  internalBackup,
}, null, 2));
const validInternalBackup =
  internalBackup.exists &&
  internalBackup.technicalProductRows === expectedTechnicalProductRows &&
  internalBackup.includesSkuValueReservations &&
  internalBackup.includesProductNumberVoidMarker;
process.exit(validInternalBackup ? 0 : 1);
