import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import * as XLSX from "xlsx";
import type { MarginItem, MarginReportPreview, MarginSale } from "../../shared/salesMargin";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_INFLATED_BYTES = 30 * 1024 * 1024;
const MAX_ROWS = 5000;
const SHEET_ROWS = 5002;
const MAX_COLUMNS = 128;
const MAX_CELL_LENGTH = 32768;
const MAX_AMOUNT = 1e9;
const MP_SELLER_ID = "3308178634";
const MP_SALE_TYPES = new Set(["payment", "sale", "settlement", "refund", "chargeback", "dispute", "payment refund", "settlement refund", "chargeback reversal", "dispute reversal", "refund reversal", "venda", "pagamento", "reembolso", "estorno"]);
type Value = string | number | boolean | null | undefined;
type Field = "id" | "saleDate" | "eventDate" | "type" | "gross" | "net" | "fees" | "details" | "title" | "sku" | "quantity" | "itemId" | "currency" | "taxes" | "eventId" | "sellerId";
type Header = { row: number; format: MarginReportPreview["format"]; fields: Partial<Record<Field, number>> };
type Table = { rows: Value[][]; formulas: Set<string>; name: string; date1904: boolean };
const norm = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const aliases: Record<Field, string[]> = {
  id: ["Número da operação", "Numero de operacao", "ID da operação", "EXTERNAL_REFERENCE", "ORDER_ID"],
  saleDate: ["Data da venda", "Data de venda", "TRANSACTION_DATE", "DATE_CREATED", "TRANSACTION_CREATION_DATE"],
  eventDate: ["Data da operação", "Data de operação", "SETTLEMENT_DATE", "RELEASE_DATE", "DATE"],
  type: ["Tipo de operação", "Tipo da operação", "TRANSACTION_TYPE"],
  gross: ["Valor bruto (=)", "Valor bruto", "TRANSACTION_AMOUNT"],
  net: ["Valor líquido após tarifas (=)", "Valor líquido após tarifas", "SETTLEMENT_NET_AMOUNT", "REAL_AMOUNT"],
  fees: ["Valor total de tarifas (-)", "Valor total de tarifas", "FEE_AMOUNT", "FEES_AMOUNT"],
  details: ["Detalhes de tarifas", "Detalhes das tarifas", "FEE_DETAILS"],
  title: ["Título do anúncio", "Nome do produto", "Descrição produto", "Descrição do produto"],
  sku: ["SKU", "Código SKU", "SELLER_SKU"],
  quantity: ["Quantidade", "QUANTITY"],
  itemId: ["Número do anúncio", "MLB", "ITEM_ID"],
  currency: ["Moeda", "CURRENCY", "CURRENCY_ID", "TRANSACTION_CURRENCY", "SETTLEMENT_CURRENCY"],
  taxes: ["TAXES_AMOUNT"],
  eventId: ["SOURCE_ID", "EVENT_ID", "ID do evento", "ID evento", "ID"],
  sellerId: ["USER_ID"],
};
const aliasMap = new Map<string, Field>(Object.entries(aliases).flatMap(([field, names]) => names.map(name => [norm(name), field as Field] as const)));
const fail = (message: string): never => { throw new Error(message); };
const empty = (value: Value) => value === null || value === undefined || typeof value === "string" && (!value.trim() || value.trim().toLowerCase() === "null");
const rowEmpty = (row: Value[]) => row.every(empty);

function decodeFile(base64: string): Buffer {
  if (typeof base64 !== "string" || !base64 || base64.length > Math.ceil(MAX_FILE_BYTES / 3) * 4) fail("Arquivo inválido ou maior que 2 MB.");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) fail("Base64 inválido.");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) fail("Arquivo vazio ou maior que 2 MB.");
  return bytes;
}

function checkRange(ref: string) {
  if (!/^[A-Z]+[1-9]\d*(?::[A-Z]+[1-9]\d*)?$/.test(ref)) fail("Intervalo XLSX inválido.");
  const range = XLSX.utils.decode_range(ref);
  if (range.e.r >= SHEET_ROWS || range.e.c >= MAX_COLUMNS) fail("Planilha excede o limite de linhas ou de 128 colunas.");
}

// Inspect ZIP metadata and bounded inflation before SheetJS allocates worksheets/shared strings.
// This accepts ordinary single-disk XLSX only, not encrypted ZIP, ZIP64 or ambiguous archives.
function checkXlsxZip(bytes: Buffer) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { eocd = i; break; }
  }
  if (eocd < 0) fail("XLSX ZIP inválido.");
  const count = bytes.readUInt16LE(eocd + 10);
  const size = bytes.readUInt32LE(eocd + 12);
  const offset = bytes.readUInt32LE(eocd + 16);
  if (bytes.readUInt16LE(eocd + 4) || bytes.readUInt16LE(eocd + 6) || bytes.readUInt16LE(eocd + 20) || count !== bytes.readUInt16LE(eocd + 8) || !count || count > 256 || offset + size !== eocd) fail("XLSX ZIP não suportado.");
  let pos = offset, total = 0;
  const names = new Set<string>();
  const spans: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    if (pos + 46 > eocd || bytes.readUInt32LE(pos) !== 0x02014b50) fail("Diretório ZIP inválido.");
    const flags = bytes.readUInt16LE(pos + 8), method = bytes.readUInt16LE(pos + 10);
    const compressed = bytes.readUInt32LE(pos + 20), uncompressed = bytes.readUInt32LE(pos + 24);
    const nameLength = bytes.readUInt16LE(pos + 28), extraLength = bytes.readUInt16LE(pos + 30), commentLength = bytes.readUInt16LE(pos + 32);
    const local = bytes.readUInt32LE(pos + 42);
    const next = pos + 46 + nameLength + extraLength + commentLength;
    if (next > eocd || flags & 1 || ![0, 8].includes(method) || compressed === 0xffffffff || uncompressed === 0xffffffff || local === 0xffffffff || bytes.readUInt16LE(pos + 34)) fail("Entrada ZIP não suportada.");
    const nameBytes = bytes.subarray(pos + 46, pos + 46 + nameLength);
    const name = nameBytes.toString("utf8");
    if (names.has(name) || name.includes("..") || name.startsWith("/") || name.includes("\\")) fail("Nome ZIP inválido ou duplicado.");
    names.add(name);
    total += uncompressed;
    if (total > MAX_INFLATED_BYTES || uncompressed > Math.max(1, compressed) * 200) fail("XLSX excede o limite descompactado de 30 MB ou a taxa de compressão segura.");
    if (local + 30 > offset || bytes.readUInt32LE(local) !== 0x04034b50) fail("Cabeçalho ZIP inválido.");
    const localNameLength = bytes.readUInt16LE(local + 26), localExtraLength = bytes.readUInt16LE(local + 28);
    const start = local + 30 + localNameLength + localExtraLength, end = start + compressed;
    if (end > offset || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method || !bytes.subarray(local + 30, local + 30 + localNameLength).equals(nameBytes)) fail("Entrada ZIP inconsistente.");
    // SheetJS trusts local sizes even with a data descriptor. Permit zero placeholders,
    // but never let a malicious local size bypass the central-directory inflation cap.
    const localCompressed = bytes.readUInt32LE(local + 18), localUncompressed = bytes.readUInt32LE(local + 22);
    if ((localCompressed !== compressed && (!(flags & 8) || localCompressed !== 0)) || (localUncompressed !== uncompressed && (!(flags & 8) || localUncompressed !== 0))) fail("Tamanho ZIP inconsistente.");
    spans.push([local, end]);
    const data = method === 0 ? bytes.subarray(start, end) : inflateRawSync(bytes.subarray(start, end), { maxOutputLength: Math.max(1, uncompressed) });
    if (data.length !== uncompressed) fail("Tamanho descompactado XLSX inconsistente.");
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
      const xml = data.toString("utf8");
      for (const match of xml.matchAll(/<(?:\w+:)?dimension\b[^>]*\bref=["']([^"']+)["']/g)) checkRange(match[1]);
      let rowTags = 0, cellsInRow = 0;
      for (const tag of xml.matchAll(/<(?:\w+:)?(row|c)\b/g)) {
        if (tag[1] === "row") { cellsInRow = 0; if (++rowTags > SHEET_ROWS) fail("Planilha excede o limite de linhas."); }
        else if (++cellsInRow > MAX_COLUMNS) fail("Planilha excede o limite de 128 colunas.");
      }
      for (const match of xml.matchAll(/<(?:\w+:)?c\b[^>]*\br=["']([^"']+)["']/g)) checkRange(match[1]);
      for (const match of xml.matchAll(/<(?:\w+:)?row\b[^>]*\br=["'](\d+)["']/g)) if (Number(match[1]) > SHEET_ROWS) fail("Planilha excede o limite de linhas.");
    }
    pos = next;
  }
  if (pos !== eocd || !names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) fail("Arquivo não é XLSX.");
  spans.sort((a, b) => a[0] - b[0]);
  if (spans.some((span, i) => i > 0 && span[0] < spans[i - 1][1])) fail("Entradas ZIP sobrepostas.");
}

function csvRows(text: string, delimiter: string, maxRows = SHEET_ROWS): Value[][] {
  const rows: Value[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  const pushCell = () => { row.push(cell); cell = ""; closed = false; if (row.length > MAX_COLUMNS) fail("CSV excede o limite de 128 colunas."); };
  const pushRow = () => { pushCell(); rows.push(row); row = []; if (rows.length > maxRows) fail("CSV excede o limite de linhas."); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += c;
    } else if (c === delimiter) pushCell();
    else if (c === "\n" || c === "\r") { pushRow(); if (c === "\r" && text[i + 1] === "\n") i++; }
    else if (c === '"') { if (cell || closed) fail("Aspas CSV inválidas."); quoted = true; }
    else { if (closed) fail("CSV contém caracteres após aspas."); cell += c; }
    if (cell.length > MAX_CELL_LENGTH) fail("Célula excede o limite de tamanho.");
  }
  if (quoted) fail("CSV contém aspas não fechadas.");
  if (cell || row.length || closed) pushRow();
  return rows;
}

function readCsv(bytes: Buffer): Table {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); } catch { return fail("CSV deve usar UTF-8."); }
  if (text.includes("\0") || /^\s*(?:<!doctype|<html|<table)/i.test(text)) fail("Arquivo não é CSV.");
  const separator = /^sep=([;,\t])\r?\n/i.exec(text);
  if (separator) text = text.slice(separator[0].length);
  let best: Value[][] | undefined, score = -1;
  let firstError: unknown;
  for (const delimiter of separator ? [separator[1]] : [";", ",", "\t"]) {
    try {
      const rows = csvRows(text, delimiter);
      const candidate = Math.max(0, ...rows.slice(0, 30).map(row => row.reduce<number>((sum, value) => sum + (aliasMap.has(norm(value)) ? 1 : 0), 0)));
      if (candidate > score) { score = candidate; best = rows; }
    } catch (error) { if (separator) throw error; firstError ??= error; }
  }
  if (score <= 0 && firstError) throw firstError;
  if (!best) fail("CSV inválido ou excede os limites de linhas/colunas.");
  return { rows: best!, formulas: new Set(), name: "", date1904: false };
}

function readXlsx(bytes: Buffer): Table[] {
  try { checkXlsxZip(bytes); } catch (error) { if (error instanceof Error && !error.message.startsWith("Cannot")) throw error; return fail("XLSX inválido ou excede o limite descompactado."); }
  const workbook = XLSX.read(bytes, { type: "buffer", sheetRows: SHEET_ROWS, cellDates: false, cellFormula: true, cellHTML: false, cellText: false, bookVBA: false });
  if (!workbook.SheetNames.length || workbook.SheetNames.length > 16) fail("Quantidade de planilhas não suportada.");
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    if (sheet["!fullref"]) checkRange(sheet["!fullref"]);
    if (sheet["!ref"]) checkRange(sheet["!ref"]);
    const formulas = new Set<string>();
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith("!")) continue;
      checkRange(address);
      if (typeof cell.v === "string" && cell.v.length > MAX_CELL_LENGTH) fail("Célula excede o limite de tamanho.");
      if (cell.f || cell.t === "e") formulas.add(address);
    }
    // Range starts at A1 so preambles and sparse header offsets retain their coordinates.
    const rows = sheet["!ref"] ? XLSX.utils.sheet_to_json<Value[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true, range: `A1:${XLSX.utils.encode_cell(XLSX.utils.decode_range(sheet["!ref"]).e)}` }) : [];
    return { rows, formulas, name, date1904: !!workbook.Workbook?.WBProps?.date1904 };
  });
}

function findHeader(table: Table): Header | null {
  if (/\bpor liberac(?:ao|oes)\b|\bby release\b/.test(norm(table.name))) fail("Relatório por liberação não é suportado; use Por venda.");
  for (let r = 0; r < Math.min(30, table.rows.length); r++) {
    const row = table.rows[r];
    if (row.some(value => /\bpor liberac(?:ao|oes)\b|\bby release\b/.test(norm(value)))) fail("Relatório por liberação não é suportado; use Por venda.");
    const fields: Header["fields"] = {};
    let duplicate = false;
    row.forEach((value, c) => { const field = aliasMap.get(norm(value)); if (field) { if (fields[field] !== undefined) duplicate = true; else fields[field] = c; } });
    const has = (...names: Field[]) => names.every(name => fields[name] !== undefined);
    const names = row.map(norm);
    const mp = names.includes("external reference") || names.includes("order id");
    if (!has("id", "saleDate", "gross", "net") || !(mp ? has("eventId") || has("type") : has("type"))) continue;
    if (mp && (!names.includes("transaction amount") || !(names.includes("settlement net amount") || names.includes("real amount")) || !names.includes("transaction date"))) continue;
    if (!mp && !names.includes("data da venda") && !names.includes("data de venda")) continue;
    if (duplicate) fail("Cabeçalho contém colunas financeiras/identificadoras ambíguas.");
    if (row.some((value, c) => table.formulas.has(XLSX.utils.encode_cell({ r, c })) || typeof value === "string" && /^[=+@]/.test(value.trim()))) fail("Cabeçalho inseguro: fórmulas não são aceitas.");
    return { row: r, fields, format: mp ? "mp_account_money" : "ml_sales" };
  }
  return null;
}

function identifier(value: Value, label: string, required = false): string | null {
  if (empty(value)) { if (required) fail(`${label} ausente.`); return null; }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) fail(`${label} numérico inseguro; exporte como texto.`);
    return String(value);
  }
  if (typeof value !== "string") fail(`${label} inválido.`);
  const text = (value as string).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(text) || /^\d+(?:\.\d+)?e[+-]?\d+$/i.test(text)) fail(`${label} inválido; identificadores devem ser texto exato.`);
  return text;
}

function money(value: Value): number | null {
  if (empty(value)) return null;
  let amount: number;
  if (typeof value === "number") amount = value;
  else if (typeof value === "string") {
    let text = value.trim().replace(/\u00a0/g, " ");
    let sign = 1;
    if (/^\(.*\)$/.test(text)) { sign = -1; text = text.slice(1, -1).trim(); }
    text = text.replace(/^(?:R\$|BRL)\s*/i, "").replace(/\s*BRL$/i, "").trim();
    if (text.startsWith("-")) { if (sign < 0) fail("Valor financeiro inválido."); sign = -1; text = text.slice(1); }
    if (text.includes(",") && text.includes(".")) {
      if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(text)) text = text.replace(/\./g, "").replace(",", ".");
      else if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(text)) text = text.replace(/,/g, "");
      else fail("Valor financeiro inválido.");
    } else if (text.includes(",")) { if (!/^\d+,\d{1,2}$/.test(text)) fail("Valor financeiro inválido."); text = text.replace(",", "."); }
    else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
    else if (!/^\d+(?:\.\d{1,2})?$/.test(text)) fail("Valor financeiro inválido.");
    amount = sign * Number(text);
  } else return fail("Valor financeiro inválido.");
  if (!Number.isFinite(amount) || Math.abs(amount) > MAX_AMOUNT) fail("Valor financeiro não finito ou acima de 1 bilhão.");
  return Math.sign(amount) * Math.round((Math.abs(amount) + Number.EPSILON) * 100);
}

function calendar(year: number, month: number, day: number): string {
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) fail("Data inválida.");
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) fail("Data de calendário inválida.");
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type ParsedDate = { day: string; key: string };
function dateValue(value: Value, date1904: boolean): ParsedDate | null {
  if (empty(value)) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 1 || value > 2958465) fail("Data Excel inválida.");
    const parsed = XLSX.SSF.parse_date_code(value, { date1904 });
    if (!parsed) fail("Data Excel inválida.");
    const day = calendar(parsed.y, parsed.m, parsed.d);
    if (Number.isInteger(value)) return { day, key: day };
    return { day, key: `${day}T${String(parsed.H).padStart(2, "0")}:${String(parsed.M).padStart(2, "0")}:${String(parsed.S).padStart(2, "0")}-03:00` };
  }
  if (typeof value !== "string") fail("Data inválida.");
  const text = (value as string).trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(text);
  if (!br && !iso) fail("Data inválida; use DD/MM/AAAA ou ISO.");
  const match = (br ?? iso)!;
  const day = calendar(Number(br ? match[3] : match[1]), Number(match[2]), Number(br ? match[1] : match[3]));
  if (!match[4]) return { day, key: day };
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) fail("Horário inválido.");
  const zone = iso?.[8] ?? "-03:00";
  if (zone !== "Z" && (Number(zone.slice(1, 3)) > 14 || Number(zone.slice(4)) > 59 || Number(zone.slice(1, 3)) === 14 && Number(zone.slice(4)) !== 0)) fail("Fuso horário inválido.");
  const timestamp = `${day}T${match[4]}:${match[5]}:${String(second).padStart(2, "0")}${iso?.[7] ? `.${iso[7]}` : ""}${zone}`;
  const instant = new Date(timestamp);
  if (!Number.isFinite(instant.getTime())) fail("Data/hora inválida.");
  const local = new Date(instant.getTime() - 3 * 60 * 60 * 1000);
  const localDay = calendar(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
  return { day: localDay, key: instant.toISOString() };
}

function currency(value: Value) {
  if (!empty(value) && (typeof value !== "string" || !/^(BRL|R\$)$/i.test(value.trim()))) fail("Somente valores em BRL são suportados.");
}
const units = (cents: number | null) => cents === null ? null : (cents === 0 ? 0 : cents / 100);

type Group = { saleDate: string | null; items: Map<string, MarginItem>; gross: number; net: number; taxes: number; allGross: boolean; allNet: boolean; allTaxes: boolean; mismatch: boolean };

/** Pure, local preview. Does not persist, fetch, or return the original report payload. */
export function parseMarginReport(fileName: string, base64: string): MarginReportPreview {
  if (typeof fileName !== "string" || !/\.(csv|xlsx)$/i.test(fileName)) fail("Use um arquivo CSV ou XLSX.");
  if (/\bpor liberac(?:ao|oes)\b|\bby release\b/.test(norm(fileName.split(/[\\/]/).pop()))) fail("Relatório por liberação não é suportado; use Por venda.");
  const bytes = decodeFile(base64);
  const isXlsx = /\.xlsx$/i.test(fileName);
  let tables: Table[];
  try { tables = isXlsx ? readXlsx(bytes) : [readCsv(bytes)]; } catch (error) { if (error instanceof Error) throw error; return fail("Arquivo inválido."); }
  const supported = tables.map(table => ({ table, header: findHeader(table) })).filter((entry): entry is { table: Table; header: Header } => entry.header !== null);
  if (supported.length !== 1) fail(supported.length ? "Importe uma única planilha de vendas por arquivo." : "Cabeçalho não suportado. Use ML Por venda ou MP account money com referência do pedido, valores e data da transação.");
  const { table, header } = supported[0];
  const warnings = new Set<string>();
  if (tables.some(other => other !== table && other.rows.some(row => !rowEmpty(row)))) warnings.add("Planilhas auxiliares não foram importadas.");
  const groups = new Map<string, Group>();
  const events = new Map<string, Array<{ signature: string; date: ParsedDate | null; saleDay: string | null; missingDate: boolean; dateOnlyDay: string | null }>>();
  const ambiguous = new Set<string>();
  let rowCount = 0;
  for (let r = header.row + 1; r < table.rows.length; r++) {
    const row = table.rows[r];
    if (rowEmpty(row)) continue;
    if (++rowCount > MAX_ROWS) fail("Relatório excede o limite de 5000 linhas de dados.");
    const get = (field: Field): Value => {
      const c = header.fields[field];
      if (c === undefined) return null;
      if (table.formulas.has(XLSX.utils.encode_cell({ r, c }))) fail(`Fórmula ou erro XLSX na linha ${r + 1}; exporte valores estáticos.`);
      return row[c];
    };
    currency(get("currency"));
    const operationId = identifier(get("id"), "Número da operação", true)!;
    const eventId = identifier(get("eventId"), "ID do evento");
    const saleDate = dateValue(get("saleDate"), table.date1904);
    const eventDate = dateValue(get("eventDate"), table.date1904);
    const type = empty(get("type")) ? "" : norm(get("type"));
    if (header.format === "mp_account_money") {
      if (header.fields.sellerId !== undefined && identifier(get("sellerId"), "USER_ID", true) !== MP_SELLER_ID) fail("Relatório MP pertence a outra conta; somente a loja autorizada pode ser importada.");
      if (!/^\d+$/.test(operationId)) fail("Referência MP sem correlação inequívoca com pedido; prefira o relatório ML Por venda.");
      if (!MP_SALE_TYPES.has(type)) fail("Fluxo MP desconhecido ou não relacionado a venda (saque/payout/transferência); prefira ML Por venda com eventos de vendas identificados.");
    }
    if (!type && !eventId) fail(`Tipo de operação ou ID do evento ausente na linha ${r + 1}.`);
    const gross = money(get("gross")), net = money(get("net")), fees = money(get("fees")), taxes = money(get("taxes"));
    const itemId = identifier(get("itemId"), "Número do anúncio");
    const skuValue = get("sku");
    if (typeof skuValue === "number" && !Number.isSafeInteger(skuValue)) fail("SKU numérico inseguro; exporte como texto.");
    const sku = empty(skuValue) ? null : String(skuValue).trim().slice(0, 160);
    const title = empty(get("title")) ? "Produto não informado" : String(get("title")).trim().slice(0, 500);
    const quantityValue = get("quantity");
    const quantity = empty(quantityValue) ? null : Number(quantityValue);
    if (quantity !== null && (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1e6 || typeof quantityValue === "boolean")) fail("Quantidade inválida.");
    const details = get("details");
    if (!empty(details)) warnings.add("Detalhes de tarifas não foram classificados; exibimos apenas os descontos líquidos agregados.");
    const signature = JSON.stringify([operationId, gross, net, fees, taxes, saleDate?.day ?? null]);
    if (eventId) {
      const key = JSON.stringify([eventId, type]);
      const records = events.get(key) ?? [];
      const financialSignature = JSON.stringify([operationId, gross, net, fees, taxes]);
      const matching = records.filter(record => {
        if (!record.date || !eventDate) return true;
        if (record.date.day !== eventDate.day) return false;
        if (!record.date.key.includes("T") || !eventDate.key.includes("T")) return true;
        return Date.parse(record.date.key) === Date.parse(eventDate.key);
      });
      if (matching.length > 1) fail("Evento duplicado com identificação ambígua; confira as datas do relatório.");
      const prior = matching[0];
      if (!prior && records.some(record => record.missingDate || (eventDate && record.dateOnlyDay === eventDate.day))) fail("Evento duplicado com identificação ambígua; confira as datas do relatório.");
      if (prior) {
        if (prior.signature !== financialSignature || (prior.saleDay && saleDate && prior.saleDay !== saleDate.day)) fail("Evento duplicado com valores ou operação conflitantes.");
        warnings.add("Eventos repetidos com ID inequívoco foram contabilizados uma única vez.");
        prior.missingDate ||= !eventDate;
        if (eventDate && !eventDate.key.includes("T")) prior.dateOnlyDay = eventDate.day;
        if (!prior.date || (!prior.date.key.includes("T") && eventDate?.key.includes("T"))) prior.date = eventDate;
        prior.saleDay ??= saleDate?.day ?? null;
        const group = groups.get(operationId)!;
        if (saleDate) {
          if (group.saleDate && group.saleDate !== saleDate.day) fail("Uma operação contém datas de venda conflitantes.");
          group.saleDate = saleDate.day;
        }
        if (itemId || sku || title !== "Produto não informado") {
          const item = { itemId, title, sku, quantity };
          group.items.set(JSON.stringify(item), item);
        }
        continue;
      }
      records.push({ signature: financialSignature, date: eventDate, saleDay: saleDate?.day ?? null, missingDate: !eventDate, dateOnlyDay: eventDate && !eventDate.key.includes("T") ? eventDate.day : null });
      events.set(key, records);
    } else {
      const key = JSON.stringify([signature, type, eventDate?.key ?? "", itemId, sku, title, quantity]);
      if (ambiguous.has(key)) warnings.add("Linhas iguais sem ID do evento foram mantidas; confirme possíveis duplicidades no relatório.");
      ambiguous.add(key);
    }
    let group = groups.get(operationId);
    if (!group) { group = { saleDate: null, items: new Map(), gross: 0, net: 0, taxes: 0, allGross: true, allNet: true, allTaxes: true, mismatch: false }; groups.set(operationId, group); }
    if (saleDate) {
      if (group.saleDate && group.saleDate !== saleDate.day) fail("Uma operação contém datas de venda conflitantes.");
      group.saleDate = saleDate.day;
    }
    group.allGross &&= gross !== null; group.allNet &&= net !== null; group.allTaxes &&= taxes !== null;
    group.gross += gross ?? 0; group.net += net ?? 0; group.taxes += taxes ?? 0;
    if ([group.gross, group.net, group.taxes].some(value => !Number.isSafeInteger(value) || Math.abs(value) > MAX_AMOUNT * 100)) fail("Total da operação excede 1 bilhão.");
    if (gross !== null && net !== null && fees !== null && gross - net !== fees) { group.mismatch = true; warnings.add("Tarifas explícitas divergem de bruto menos líquido; operações afetadas aguardam conferência."); }
    if (itemId || sku || title !== "Produto não informado") {
      const item = { itemId, title, sku, quantity };
      group.items.set(JSON.stringify(item), item);
    }
  }
  if (!rowCount || !groups.size) fail("Relatório não contém operações.");
  const operations: MarginSale[] = Array.from(groups, ([operationId, group]) => {
    if (!group.saleDate) fail("Operação sem data da venda; data de liberação/operação não substitui data da venda.");
    const gross = group.allGross ? group.gross : null, net = group.allNet ? group.net : null;
    const deductions = gross !== null && net !== null ? gross - net : null;
    const confirmed = gross !== null && net !== null && !group.mismatch;
    const items = Array.from(group.items.values());
    if (!items.length || items.some(item => !item.sku)) warnings.add("Há produtos sem SKU; vincule-os manualmente antes de calcular o lucro.");
    if (!confirmed) warnings.add("Há operações com financeiro pendente; valores ausentes não foram tratados como zero.");
    return {
      operationId, saleDate: group.saleDate!, items, gross: units(gross), net: units(net), deductions: units(deductions),
      financialStatus: confirmed ? "confirmed" : "pending", source: "report", taxesWithheld: group.allTaxes ? units(group.taxes) : null, released: null,
      charges: deductions === null ? [] : [{ key: "reported_net_deductions", label: "Descontos líquidos informados", category: "other", amount: units(deductions)! }],
      ...(!confirmed ? { pendingReason: group.mismatch ? "Tarifas divergentes; confira o relatório." : "Bruto ou líquido ausente em um evento da operação." } : {}),
    };
  });
  operations.sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.operationId.localeCompare(b.operationId));
  const safeName = fileName.split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f<>:"|?*]/g, "_").trim().slice(0, 160) || (isXlsx ? "relatorio.xlsx" : "relatorio.csv");
  return { fileHash: createHash("sha256").update(bytes).digest("hex"), fileName: safeName, format: header.format, rowCount, operations, fromDate: operations[0].saleDate, toDate: operations[operations.length - 1].saleDate, warnings: Array.from(warnings) };
}
