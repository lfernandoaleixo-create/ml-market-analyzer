import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ausente");
  process.exit(1);
}

const x = new URL(url);
const conn = await mysql.createConnection({
  host: x.hostname,
  port: Number(x.port || 4000),
  user: decodeURIComponent(x.username),
  password: decodeURIComponent(x.password),
  database: x.pathname.replace(/^\//, ""),
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  connectTimeout: 20000,
});

const [rows] = await conn.query("SELECT * FROM `kit_sheet_rows` ORDER BY position ASC, id ASC");
console.log("linhas de kit:", rows.length);

let updated = 0;
for (const r of rows) {
  // Monta o bloco de Características preservando os campos legados que não têm
  // equivalente direto no formato SKU (nada se perde, só fica visível ali).
  const extras = [];
  if (r.embalagem) extras.push(`Embalagem: ${r.embalagem}`);
  if (r.categoria) extras.push(`Categoria (kit): ${r.categoria}`);
  if (r.formadoPor) extras.push(`Formado por: ${r.formadoPor}`);
  const flags = [];
  if (r.dimensoesGs1) flags.push(`Dimensões GS1: ${r.dimensoesGs1}`);
  if (r.baseAjustado) flags.push(`Base ajustado: ${r.baseAjustado}`);
  if (r.mlAjustado) flags.push(`ML ajustado: ${r.mlAjustado}`);
  if (flags.length) extras.push(flags.join(" | "));
  if (r.observacao) extras.push(`Obs.: ${r.observacao}`);

  // Preserva qualquer característica já existente, anexando os extras legados.
  const prevCarac = (r.caracteristicas || "").trim();
  const caracParts = [];
  if (prevCarac) caracParts.push(prevCarac);
  if (extras.length) caracParts.push(extras.join("\n"));
  const caracteristicas = caracParts.join("\n");

  await conn.execute(
    `UPDATE \`kit_sheet_rows\` SET
       produto = CASE WHEN produto = '' THEN ? ELSE produto END,
       embProfundidade = CASE WHEN embProfundidade = '' THEN ? ELSE embProfundidade END,
       embLargura = CASE WHEN embLargura = '' THEN ? ELSE embLargura END,
       embAltura = CASE WHEN embAltura = '' THEN ? ELSE embAltura END,
       embPeso = CASE WHEN embPeso = '' THEN ? ELSE embPeso END,
       tipoSku = CASE WHEN tipoSku = '' THEN '3' ELSE tipoSku END,
       caracteristicas = ?
     WHERE id = ?`,
    [
      r.kit || "",
      r.profundidade || "",
      r.largura || "",
      r.alturaComprimento || "",
      r.kg || "",
      caracteristicas,
      r.id,
    ],
  );
  updated++;
}

console.log("linhas atualizadas:", updated);

// Verificação rápida
const [sample] = await conn.query(
  "SELECT id, produto, tipoSku, embProfundidade, embLargura, embAltura, embPeso, LEFT(caracteristicas, 80) AS carac FROM `kit_sheet_rows` ORDER BY position ASC LIMIT 3",
);
console.log("amostra pós-migração:");
for (const s of sample) console.log(JSON.stringify(s));

await conn.end();
console.log("OK");
