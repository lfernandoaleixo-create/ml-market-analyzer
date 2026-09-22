import "dotenv/config";
import { runDriveBackup } from "../server/backup/runBackup";

const result = await runDriveBackup();
console.log(JSON.stringify({
  ok: result.ok,
  internalOk: result.internalOk,
  driveOk: result.driveOk,
  fileName: result.fileName,
  internalKey: result.internalKey,
  error: result.error,
}, null, 2));
process.exit(result.ok ? 0 : 1);
