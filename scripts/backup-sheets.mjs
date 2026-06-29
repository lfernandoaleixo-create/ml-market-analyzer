import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ausente");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve("backups");
fs.mkdirSync(outDir, { recursive: true });

const tables = [
  "kit_sheet_rows",
  "sku_sheet_rows",
  "kit_sheet_custom_columns",
  "sku_sheet_custom_columns",
];

const x = new URL(url);
console.log("conectando em", x.hostname, x.port);
const conn = await mysql.createConnection({
  host: x.hostname,
  port: Number(x.port || 4000),
  user: decodeURIComponent(x.username),
  password: decodeURIComponent(x.password),
  database: x.pathname.replace(/^\//, ""),
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  connectTimeout: 20000,
});
console.log("conectado");
const summary = {};
for (const t of tables) {
  const [rows] = await conn.query(`SELECT * FROM \`${t}\``);
  const file = path.join(outDir, `${t}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));
  summary[t] = rows.length;
  console.log(`backup ${t}: ${rows.length} linhas -> ${file}`);
}
await conn.end();
console.log("RESUMO:", JSON.stringify(summary));
