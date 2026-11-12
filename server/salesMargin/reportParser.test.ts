import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { calculateMarginRow } from "../../shared/salesMargin";
import { parseMarginReport } from "./reportParser";

// UNIT ONLY: generated fixtures, no real reports, network, database, or API mocks.
const mlHeader = ["Número da operação", "Data da venda", "Data da operação", "Tipo de operação", "Valor bruto (=)", "Valor total de tarifas (-)", "Valor líquido após tarifas (=)", "Detalhes de tarifas", "Título do anúncio", "SKU", "Quantidade", "Número do anúncio"];
const mpHeader = ["EXTERNAL_REFERENCE", "TRANSACTION_DATE", "SETTLEMENT_DATE", "TRANSACTION_TYPE", "TRANSACTION_AMOUNT", "FEE_AMOUNT", "SETTLEMENT_NET_AMOUNT", "SOURCE_ID", "CURRENCY", "TAXES_AMOUNT"];
const sale = (overrides: Record<number, unknown> = {}) => {
  const row: unknown[] = ["20000000000000001234", "10/11/2026", "11/11/2026", "Venda", "100,00", "22,00", "78,00", "", "Produto sintético", "UNIT-SKU", "1", "MLB123456"];
  for (const [index, value] of Object.entries(overrides)) row[Number(index)] = value;
  return row;
};
function csv(rows: unknown[][], delimiter = ";") {
  return Buffer.from(rows.map(row => row.map(cell => {
    const value = cell === null || cell === undefined ? "" : String(cell);
    return value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(delimiter)).join("\r\n"), "utf8").toString("base64");
}
const parse = (rows: unknown[][], header = mlHeader) => parseMarginReport("fixture.csv", csv([header, ...rows]));
function workbook(rows: unknown[][], sheetName = "Por venda", mutate?: (sheet: XLSX.WorkSheet) => void, date1904 = false): Buffer {
  const book = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet(rows);
  mutate?.(sheet);
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  if (date1904) book.Workbook = { WBProps: { date1904: true } };
  return XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true });
}
// Minimal custom ZIP metadata fixture exercises limits before any SheetJS parse.
function zipEntry(name: string, data: Buffer, declaredSize = data.length): Buffer {
  const compressed = deflateRawSync(data), nameBytes = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(declaredSize, 22); local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(declaredSize, 24); central.writeUInt16LE(nameBytes.length, 28);
  const offset = local.length + nameBytes.length + compressed.length;
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + nameBytes.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([local, nameBytes, compressed, central, nameBytes, eocd]);
}

describe("parseMarginReport — synthetic unit fixtures only", () => {
  it("exports preview, SHA-256 of exact bytes, sanitized filename, and no sensitive payload", () => {
    const payload = csv([[...mlHeader, "Nome do comprador", "CPF", "NF", "PAYER_EMAIL"], [...sale(), "PRIVATE BUYER", "PRIVATE CPF", "PRIVATE NF", "PRIVATE EMAIL"]]);
    const preview = parseMarginReport("../../fixture<>.csv", payload);
    expect(preview).toMatchObject({ fileName: "fixture__.csv", fileHash: createHash("sha256").update(Buffer.from(payload, "base64")).digest("hex"), format: "ml_sales", rowCount: 1, fromDate: "2026-11-10", toDate: "2026-11-10" });
    expect(JSON.stringify(preview)).not.toContain("PRIVATE");
    expect(preview.operations[0]).toMatchObject({ operationId: "20000000000000001234", saleDate: "2026-11-10", gross: 100, net: 78, deductions: 22, financialStatus: "confirmed", taxesWithheld: null, released: null, source: "report" });
  });
  it("groups all distinct sale and shipping events: 100/78 plus shipping -10 gives net 68", () => {
    const result = parse([sale(), sale({ 2: "12/11/2026", 3: "Frete adicional", 4: "0", 5: "10", 6: "-10", 8: "", 9: "", 10: "", 11: "" })]);
    expect(result.rowCount).toBe(2); expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({ gross: 100, net: 68, deductions: 32, financialStatus: "confirmed" });
    expect(result.operations[0].items).toHaveLength(1);
  });
  it("adds signed cancellation reversal to zero, without forcing negative values positive", () => {
    expect(parse([sale(), sale({ 3: "Cancelamento", 4: "-100", 5: "-22", 6: "-78" })]).operations[0]).toMatchObject({ gross: 0, net: 0, deductions: 0, financialStatus: "confirmed" });
  });
  it("preserves a legitimately negative net", () => {
    expect(parse([sale({ 4: "0", 5: "19", 6: "-19" })]).operations[0]).toMatchObject({ gross: 0, net: -19, deductions: 19, financialStatus: "confirmed" });
  });
  it("sums positive credits and signed adjustments", () => {
    expect(parse([sale(), sale({ 3: "Crédito", 4: "5", 5: "0", 6: "5" })]).operations[0]).toMatchObject({ gross: 105, net: 83, deductions: 22 });
  });
  it.each(["", null, "null"])("does not turn missing net (%s) into zero", net => {
    const op = parse([sale({ 6: net })]).operations[0];
    expect(op.net).toBeNull(); expect(op.deductions).toBeNull(); expect(op.charges).toEqual([]); expect(op.financialStatus).toBe("pending");
  });
  it("makes the whole group pending when just one event lacks gross or net", () => {
    const op = parse([sale(), sale({ 3: "Ajuste", 4: "0", 5: "", 6: "" })]).operations[0];
    expect(op.gross).toBe(100); expect(op.net).toBeNull(); expect(op.financialStatus).toBe("pending");
    expect(parse([sale({ 4: "" })]).operations[0].gross).toBeNull();
  });
  it("derives only net deductions; missing explicit fees are not invented subdivisions", () => {
    const op = parse([sale({ 5: "", 7: '{"processing_fee":22}' })]).operations[0];
    expect(op.charges).toEqual([{ key: "reported_net_deductions", label: "Descontos líquidos informados", category: "other", amount: 22 }]);
    expect(op.financialStatus).toBe("confirmed"); expect(op.taxesWithheld).toBeNull();
    expect(parse([sale({ 7: '{"processing_fee":22}' })]).warnings.join(" ")).toMatch(/agregados/);
  });
  it("flags conflicting fee amount without subtracting fees a second time", () => {
    const preview = parse([sale({ 5: "19" })]);
    expect(preview.operations[0]).toMatchObject({ net: 78, deductions: 22, financialStatus: "pending" });
    expect(preview.warnings.join(" ")).toMatch(/divergem/);
  });
  it("leaves taxes unknown unless explicitly supplied", () => {
    const row = ["2001", "2026-11-10", "2026-11-12", "payment", "100", "22", "78", "event-1", "BRL", "3,50"];
    expect(parse([row], mpHeader).operations[0].taxesWithheld).toBe(3.5);
    row[9] = ""; expect(parse([row], mpHeader).operations[0].taxesWithheld).toBeNull();
  });
  it("missing SKU blocks profit until manually linked even with known costs", () => {
    const op = parse([sale({ 9: "" })]).operations[0];
    expect(calculateMarginRow(op, { operationId: op.operationId, productCost: 10, extraCosts: 1, note: "unit" })).toMatchObject({ result: null, resultStatus: "missing_sku" });
  });
  it.each([
    ["R$ 1.234,56", "1.000,00", "234,56", 1234.56, 1000],
    ["1,234.56", "1000.00", "234.56", 1234.56, 1000],
    ["(R$ 100,00)", "(78,00)", "(22,00)", -100, -78],
    ["BRL 100.00", "78.00 BRL", "22,00", 100, 78],
    ["1.234", "1.234", "0", 1234, 1234],
  ])("parses BRL/US formatting %s", (gross, net, fees, expectedGross, expectedNet) => {
    expect(parse([sale({ 4: gross, 5: fees, 6: net })]).operations[0]).toMatchObject({ gross: expectedGross, net: expectedNet, financialStatus: "confirmed" });
  });
  it("rounds typed XLSX numbers to cents", () => {
    const bytes = workbook([mlHeader, sale({ 4: 100.005, 5: 22.005, 6: 78 })]);
    expect(parseMarginReport("typed.xlsx", bytes.toString("base64")).operations[0]).toMatchObject({ gross: 100.01, net: 78, deductions: 22.01, financialStatus: "confirmed" });
  });
  it.each(["abc", "R$ --1", "NaN", "Infinity", "1e3", "1,2,3", "100 USD", "1.00 EUR", "1,234", "1000000001", "(-100)"])("rejects invalid financial value %s rather than ignoring it", value => {
    expect(() => parse([sale({ 6: value })])).toThrow(/financeiro|bilhão/);
  });
  it("rejects invalid explicit fee cells even when gross and net exist", () => {
    expect(() => parse([sale({ 5: "não disponível" })])).toThrow(/financeiro/);
  });
  it("validates leap years and uses saleDate rather than operation date", () => {
    const op = parse([sale({ 1: "29/02/2024", 2: "01/03/2024" })]).operations[0];
    expect(op.saleDate).toBe("2024-02-29");
    expect(() => parse([sale({ 1: "29/02/2023" })])).toThrow(/calendário/);
    expect(() => parse([sale({ 1: "2026-04-31" })])).toThrow(/calendário/);
  });
  it.each([
    ["2026-11-10T01:30:00Z", "2026-11-09"],
    ["2026-11-10T00:30:00-03:00", "2026-11-10"],
    ["2026-11-10T02:00:00+02:00", "2026-11-09"],
    ["2026-11-10 00:01:00", "2026-11-10"],
    ["10/11/2026 00:01", "2026-11-10"],
  ])("interprets %s in BRT", (date, expected) => {
    expect(parse([sale({ 1: date })]).operations[0].saleDate).toBe(expected);
  });
  it.each(["2026-11-10T24:00:00Z", "2026-11-10T12:60:00", "2026-11-10T12:00:00+15:00", "2026-13-01", "10/11/26"])("rejects invalid date %s", date => {
    expect(() => parse([sale({ 1: date })])).toThrow(/Data|Horário|Fuso/);
  });
  it("accepts Excel serial dates but rejects fake 1900 leap day", () => {
    const serial = Math.floor((Date.UTC(2026, 10, 10) - Date.UTC(1899, 11, 30)) / 86400000);
    expect(parseMarginReport("date.xlsx", workbook([mlHeader, sale({ 1: serial, 2: serial + 1 })]).toString("base64")).operations[0].saleDate).toBe("2026-11-10");
    expect(() => parseMarginReport("date.xlsx", workbook([mlHeader, sale({ 1: 60 })]).toString("base64"))).toThrow(/calendário/);
    const serial1904 = Math.floor((Date.UTC(2026, 10, 10) - Date.UTC(1904, 0, 1)) / 86400000);
    expect(parseMarginReport("date.xlsx", workbook([mlHeader, sale({ 1: serial1904 })], "Por venda", undefined, true).toString("base64")).operations[0].saleDate).toBe("2026-11-10");
  });
  it("allows adjustment rows with blank sale date only when the group has its original sale date", () => {
    expect(parse([sale(), sale({ 1: "", 3: "Frete", 4: "0", 5: "10", 6: "-10" })]).operations[0].saleDate).toBe("2026-11-10");
    expect(() => parse([sale({ 1: "" })])).toThrow(/sem data da venda/);
  });
  it("rejects conflicting sale dates within one operation", () => {
    expect(() => parse([sale(), sale({ 1: "12/11/2026" })])).toThrow(/datas de venda conflitantes/);
  });
  it("detects header within first 30 rows and accent/punctuation aliases", () => {
    const header = mlHeader.map(value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/ /g, "_"));
    const rows = Array.from({ length: 29 }, () => ["Relatório sintético Por venda"]);
    const payload = csv([...rows, header, sale()]);
    expect(parseMarginReport("unit.csv", payload).rowCount).toBe(1);
    expect(() => parseMarginReport("unit.csv", csv([...rows, ["extra"], header, sale()]))).toThrow(/Cabeçalho não suportado/);
  });
  it.each(["Nome do produto", "Descrição produto", "Descrição do produto"])("supports product title alias %s", alias => {
    const header = [...mlHeader]; header[8] = alias;
    expect(parse([sale()], header).operations[0].items[0].title).toBe("Produto sintético");
  });
  it("supports comma delimiter, UTF-8 BOM, sep=, and quoted multiline fields", () => {
    const rows = [mlHeader, sale({ 8: 'Produto; com "aspas"\ne linha' })];
    const payload = Buffer.from("\uFEFFsep=,\r\n" + Buffer.from(csv(rows, ","), "base64").toString("utf8")).toString("base64");
    expect(parseMarginReport("unit.csv", payload).operations[0].items[0].title).toContain("\ne linha");
  });
  it("supports MP account money with ORDER_ID, REAL_AMOUNT, SOURCE_ID and TRANSACTION_DATE", () => {
    const header = [...mpHeader]; header[0] = "ORDER_ID"; header[6] = "REAL_AMOUNT";
    const result = parse([["000000000000000000000001", "2026-11-10T11:00:00-03:00", "2026-11-12", "payment", "100", "22", "78", "evt-1", "BRL", ""]], header);
    expect(result.format).toBe("mp_account_money"); expect(result.operations[0].operationId).toBe("000000000000000000000001");
  });
  it("rejects unclassifiable MP SOURCE_ID-only events, accepts recognized sale type without SOURCE_ID", () => {
    const row = ["2001", "2026-11-10", "2026-11-12", "", "100", "22", "78", "event-1", "BRL", ""];
    expect(() => parse([row], mpHeader)).toThrow(/Fluxo MP desconhecido/);
    row[3] = "payment"; row[7] = ""; expect(parse([row], mpHeader).operations[0].financialStatus).toBe("confirmed");
  });
  it("checks MP USER_ID against the authorized seller when present and never returns it", () => {
    const row = ["2001", "2026-11-10", "2026-11-12", "payment", "100", "22", "78", "event-1", "BRL", "", "3308178634"];
    const header = [...mpHeader, "USER_ID"];
    expect(parse([row], header).operations[0].net).toBe(78);
    expect(JSON.stringify(parse([row], header))).not.toContain("3308178634");
    expect(() => parse([[...row.slice(0, 10), "9999999999"]], header)).toThrow(/outra conta/);
    expect(() => parse([row, [...row.slice(0, 10), "9999999999"]], header)).toThrow(/outra conta/);
    expect(() => parse([[...row.slice(0, 10), ""]], header)).toThrow(/USER_ID ausente/);
  });
  it.each(["settlement", "refund", "chargeback", "dispute"])("allows MP sale-related event %s", type => {
    expect(parse([["2001", "2026-11-10", "2026-11-12", type, "100", "22", "78", "event-1", "BRL", ""]], mpHeader).operations[0].net).toBe(78);
  });
  it.each(["WITHDRAWAL", "PAYOUT", "bank_transfer", "transfer", "unknown"])("rejects MP unrelated cashflow %s", type => {
    expect(() => parse([["2001", "2026-11-10", "2026-11-12", type, "100", "22", "78", "event-1", "BRL", ""]], mpHeader)).toThrow(/Fluxo MP desconhecido/);
  });
  it("never substitutes SOURCE_ID for missing order reference and rejects custom non-order references", () => {
    expect(() => parse([["", "2026-11-10", "2026-11-12", "payment", "100", "22", "78", "20000000000000001234", "BRL", ""]], mpHeader)).toThrow(/operação ausente/);
    expect(() => parse([["custom-payment-ref", "2026-11-10", "2026-11-12", "payment", "100", "22", "78", "20000000000000001234", "BRL", ""]], mpHeader)).toThrow(/correlação/);
  });
  it.each(["USD", "ARS", "MXN", "EUR"])("rejects non-BRL currency %s", value => {
    expect(() => parse([[...sale(), value]], [...mlHeader, "Moeda"])).toThrow(/BRL/);
    expect(() => parse([["2001", "2026-11-10", "2026-11-12", "payment", "100", "22", "78", "evt-1", value, ""]], mpHeader)).toThrow(/BRL/);
  });
  it("does not round long text operation IDs and rejects unsafe numeric XLSX IDs", () => {
    expect(parse([sale({ 0: "00020000000000000001234" })]).operations[0].operationId).toBe("00020000000000000001234");
    expect(() => parseMarginReport("unsafe.xlsx", workbook([mlHeader, sale({ 0: 20000000000000001234 })]).toString("base64"))).toThrow(/numérico inseguro/);
    expect(() => parse([sale({ 0: "2.0000000000000001234E+19" })])).toThrow(/identificadores/);
  });
  it("accepts a safe numeric XLSX ID", () => {
    expect(parseMarginReport("safe.xlsx", workbook([mlHeader, sale({ 0: 12345 })]).toString("base64")).operations[0].operationId).toBe("12345");
  });
  it("deduplicates only explicit event ID + type/date and merges repeated item details", () => {
    const header = [...mlHeader, "SOURCE_ID"];
    const result = parse([[...sale(), "evt-1"], [...sale({ 8: "Segundo produto", 9: "SKU-2", 11: "MLB2" }), "evt-1"]], header);
    expect(result.rowCount).toBe(2); expect(result.operations[0].net).toBe(78); expect(result.operations[0].items).toHaveLength(2);
    expect(result.warnings.join(" ")).toMatch(/uma única vez/);
  });
  it.each([false, true])("mesmo evento com data omitida em uma linha não duplica dinheiro (ordem invertida=%s)", reverse => {
    const rows = [[...sale({ 2: "" }), "evt-1"], [...sale({ 1: "", 2: "" }), "evt-1"]];
    if (reverse) rows.reverse();
    const result = parse(rows, [...mlHeader, "SOURCE_ID"]);
    expect(result.operations[0]).toMatchObject({ saleDate: "2026-11-10", gross: 100, net: 78, deductions: 22 });
    expect(result.warnings.join(" ")).toMatch(/uma única vez/);
  });
  it("evento repetido com data da operação ausente e valores conflitantes é rejeitado", () => {
    expect(() => parse([[...sale(), "evt-1"], [...sale({ 1: "", 2: "", 6: "77", 5: "23" }), "evt-1"]], [...mlHeader, "SOURCE_ID"])).toThrow(/Evento duplicado/);
  });
  it("dia sem horário e horário explícito compatíveis não representam dois eventos", () => {
    const result = parse([[...sale({ 2: "11/11/2026" }), "evt-1"], [...sale({ 2: "11/11/2026 10:00" }), "evt-1"]], [...mlHeader, "SOURCE_ID"]);
    expect(result.operations[0].net).toBe(78);
  });
  it("mesmo evento com fusos equivalentes é contabilizado uma vez", () => {
    const result = parse([[...sale({ 2: "2026-11-11T10:00:00-03:00" }), "evt-1"], [...sale({ 2: "2026-11-11T13:00:00Z" }), "evt-1"]], [...mlHeader, "SOURCE_ID"]);
    expect(result.operations[0].net).toBe(78);
  });
  it("sem data não escolhe arbitrariamente entre dois eventos datados diferentes do mesmo ID e tipo", () => {
    const rows = [[...sale({ 2: "11/11/2026" }), "evt-1"], [...sale({ 2: "12/11/2026" }), "evt-1"], [...sale({ 2: "" }), "evt-1"]];
    expect(() => parse(rows, [...mlHeader, "SOURCE_ID"])).toThrow(/ambígua/);
  });
  it.each([[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]])("data ausente e dois eventos datados são rejeitados em toda ordem %s,%s,%s", (a,b,c) => {
    const rows = [[...sale({ 2: "" }), "evt-1"], [...sale({ 2: "11/11/2026" }), "evt-1"], [...sale({ 2: "12/11/2026" }), "evt-1"]];
    expect(() => parse([rows[a],rows[b],rows[c]], [...mlHeader,"SOURCE_ID"])).toThrow(/ambígua/);
  });
  it.each([[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]])("ausência de horário e eventos com horários distintos não dependem da ordem %s,%s,%s", (a,b,c) => {
    const rows = [[...sale({ 2: "11/11/2026" }), "evt-1"], [...sale({ 2: "11/11/2026 10:00" }), "evt-1"], [...sale({ 2: "11/11/2026 11:00" }), "evt-1"]];
    expect(() => parse([rows[a],rows[b],rows[c]], [...mlHeader,"SOURCE_ID"])).toThrow(/ambígua/);
  });
  it("MP sem data de evento não se torna confirmado por estar antes dos movimentos datados", () => {
    const rows = [["2001","2026-11-10","","settlement","100","22","78","evt-1","BRL",""], ["2001","2026-11-10","2026-11-11","settlement","100","22","78","evt-1","BRL",""], ["2001","2026-11-10","2026-11-12","settlement","100","23","77","evt-1","BRL",""]];
    expect(() => parse(rows,mpHeader)).toThrow(/ambígua|conflitantes/);
  });
  it("does not duplicate identical product detail for explicitly repeated ID events", () => {
    const result = parse([[...sale(), "evt-1"], [...sale(), "evt-1"]], [...mlHeader, "ID"]);
    expect(result.operations[0].net).toBe(78);
    expect(result.operations[0].items).toHaveLength(1);
  });
  it("keeps non-finite typed financial values invalid rather than empty", () => {
    const bytes = workbook([mlHeader, sale()], "Por venda", sheet => { sheet.G2 = { t: "n", v: Infinity }; });
    expect(() => parseMarginReport("invalid.xlsx", bytes.toString("base64"))).toThrow(/financeiro|finito/);
  });
  it("rejects conflicting amounts for the same explicitly identified event", () => {
    expect(() => parse([[...sale(), "evt-1"], [...sale({ 5: "23", 6: "77" }), "evt-1"]], [...mlHeader, "SOURCE_ID"])).toThrow(/Evento duplicado/);
  });
  it("counts same source ID on distinct dates/types as distinct events", () => {
    const result = parse([[...sale(), "evt-1"], [...sale({ 2: "12/11/2026", 3: "Ajuste", 4: "0", 5: "10", 6: "-10" }), "evt-1"]], [...mlHeader, "SOURCE_ID"]);
    expect(result.operations[0].net).toBe(68);
  });
  it("keeps equal rows without event IDs and warns about ambiguity", () => {
    const result = parse([sale(), sale()]);
    expect(result.operations[0]).toMatchObject({ gross: 200, net: 156 });
    expect(result.warnings.join(" ")).toMatch(/sem ID do evento foram mantidas/);
  });
  it("deduplicates item detail, not distinct financial movements", () => {
    const result = parse([sale(), sale({ 3: "Outra venda", 4: "20", 5: "0", 6: "20" })]);
    expect(result.operations[0].items).toHaveLength(1); expect(result.operations[0].net).toBe(98);
  });
  it("returns grouped operation count and date bounds deterministically", () => {
    const result = parse([sale({ 0: "op-2", 1: "12/11/2026" }), sale({ 0: "op-1", 1: "08/11/2026" }), sale({ 0: "op-2", 1: "12/11/2026", 3: "Crédito", 4: "10", 5: "0", 6: "10" })]);
    expect(result.rowCount).toBe(3); expect(result.operations).toHaveLength(2); expect(result.fromDate).toBe("2026-11-08"); expect(result.toDate).toBe("2026-11-12");
  });
  it("rejects explicit Por liberação even with otherwise valid sale columns", () => {
    expect(() => parseMarginReport("unit.csv", csv([["Relatório Por liberação"], mlHeader, sale()]))).toThrow(/por liberação/);
    expect(() => parseMarginReport("unit.xlsx", workbook([mlHeader, sale()], "Por liberação").toString("base64"))).toThrow(/por liberação/);
    expect(() => parseMarginReport("relatorio-por-liberacao.csv", csv([mlHeader, sale()]))).toThrow(/por liberação/);
  });
  it("rejects cashflow-only headers and MP without order reference or transaction date", () => {
    const cashflow = [...mlHeader]; cashflow[1] = "Data da liberação";
    expect(() => parse([sale()], cashflow)).toThrow(/Cabeçalho não suportado/);
    const noOrder = [...mpHeader]; noOrder[0] = "PAYER_ID";
    expect(() => parse([["1", "2026-11-10", "2026-11-12", "payment", "100", "22", "78", "event-1", "BRL", ""]], noOrder)).toThrow(/Cabeçalho não suportado/);
    const noDate = [...mpHeader]; noDate[1] = "RELEASE_DATE";
    expect(() => parse([], noDate)).toThrow(/Cabeçalho não suportado/);
  });
  it("rejects unsupported headers, totals/footer rows and ambiguous alias columns", () => {
    expect(() => parseMarginReport("unit.csv", csv([["Preço", "Comprador"], ["100", "synthetic"]]))).toThrow(/Cabeçalho não suportado/);
    expect(() => parse([sale(), ["Total", "", "", "", "100", "22", "78"]])).toThrow(/ausente/);
    expect(() => parse([[...sale(), "100"]], [...mlHeader, "Valor bruto"])).toThrow(/ambíguas/);
  });
  it("rejects spreadsheet formulas/errors in financial fields and unsafe headers", () => {
    const formula = workbook([mlHeader, sale()], "Por venda", sheet => { sheet.E2 = { t: "n", v: 100, f: "50+50" }; });
    expect(() => parseMarginReport("formula.xlsx", formula.toString("base64"))).toThrow(/Fórmula/);
    const error = workbook([mlHeader, sale()], "Por venda", sheet => { sheet.G2 = { t: "e", v: 7 }; });
    expect(() => parseMarginReport("error.xlsx", error.toString("base64"))).toThrow(/Fórmula|erro/);
    const header = [...mlHeader]; header[4] = "=Valor bruto";
    expect(() => parse([sale()], header)).toThrow(/Cabeçalho inseguro/);
    const headerFormula = workbook([mlHeader, sale()], "Por venda", sheet => { sheet.E1.f = '"Valor bruto"'; });
    expect(() => parseMarginReport("header.xlsx", headerFormula.toString("base64"))).toThrow(/Cabeçalho inseguro/);
  });
  it("rejects formula-like financial/operation ID CSV cells", () => {
    expect(() => parse([sale({ 4: "=50+50" })])).toThrow(/financeiro/);
    expect(() => parse([sale({ 0: "=123" })])).toThrow(/identificadores/);
  });
  it("limits input file size before base64 allocation", () => {
    expect(() => parseMarginReport("unit.csv", Buffer.alloc(2 * 1024 * 1024 + 1, 65).toString("base64"))).toThrow(/2 MB/);
    expect(() => parseMarginReport("unit.csv", "A".repeat(3 * 1024 * 1024))).toThrow(/2 MB/);
  });
  it("accepts 5000 CSV data rows, rejects 5001, and limits columns", () => {
    const rows = Array.from({ length: 5000 }, (_, i) => sale({ 0: `unit-${i}` }));
    expect(parse(rows).rowCount).toBe(5000);
    expect(() => parse([...rows, sale()])).toThrow(/5000|limites/);
    expect(() => parseMarginReport("unit.csv", csv([Array.from({ length: 129 }, () => "column")]))).toThrow(/limites|colunas/);
  });
  it("checks XLSX full range and actual cell coordinates before sheet conversion", () => {
    const tooManyRows = workbook([mlHeader, sale()], "Por venda", sheet => { sheet["!ref"] = "A1:L5003"; });
    expect(() => parseMarginReport("rows.xlsx", tooManyRows.toString("base64"))).toThrow(/limite de linhas/);
    const tooManyColumns = workbook([mlHeader, sale()], "Por venda", sheet => { sheet["!ref"] = "A1:DY2"; });
    expect(() => parseMarginReport("cols.xlsx", tooManyColumns.toString("base64"))).toThrow(/128 colunas/);
    const dataRows = Array.from({ length: 5001 }, (_, i) => sale({ 0: `unit-${i}` }));
    expect(() => parseMarginReport("rows.xlsx", workbook([mlHeader, ...dataRows]).toString("base64"))).toThrow(/5000/);
  });
  it("rejects ZIP bombs by metadata total or compression ratio before XLSX reads", () => {
    expect(() => parseMarginReport("bomb.xlsx", zipEntry("xl/worksheets/sheet1.xml", Buffer.from("x"), 31 * 1024 * 1024).toString("base64"))).toThrow(/30 MB/);
    expect(() => parseMarginReport("bomb.xlsx", zipEntry("xl/worksheets/sheet1.xml", Buffer.alloc(1024 * 1024, 65)).toString("base64"))).toThrow(/compressão/);
  });
  it("checks unreferenced XML row/cell counts before SheetJS processing", () => {
    const manyRows = Buffer.from(`<worksheet><sheetData>${"<row/>".repeat(5003)}</sheetData></worksheet>`);
    expect(() => parseMarginReport("bad.xlsx", zipEntry("xl/worksheets/sheet1.xml", manyRows).toString("base64"))).toThrow(/limite de linhas|compressão/);
    const manyCells = Buffer.from(`<worksheet><sheetData><row>${"<c/>".repeat(129)}</row></sheetData></worksheet>`);
    expect(() => parseMarginReport("bad.xlsx", zipEntry("xl/worksheets/sheet1.xml", manyCells).toString("base64"))).toThrow(/128 colunas/);
    expect(() => parseMarginReport("bad.xlsx", zipEntry("xl/worksheets/sheet1.xml", Buffer.from('<worksheet><dimension ref="A1"/><sheetData><row r="1"><c r="XFD1"/></row></sheetData></worksheet>')).toString("base64"))).toThrow(/128 colunas/);
  });
  it("rejects inconsistent inflation metadata and malformed ZIP", () => {
    expect(() => parseMarginReport("bad.xlsx", zipEntry("xl/worksheets/sheet1.xml", Buffer.from("test"), 3).toString("base64"))).toThrow();
    expect(() => parseMarginReport("bad.xlsx", Buffer.from("not a zip").toString("base64"))).toThrow(/ZIP/);
  });
  it("rejects huge local ZIP sizes even when a data descriptor flag is set", () => {
    const bytes = zipEntry("xl/worksheets/sheet1.xml", Buffer.from("test"));
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt16LE(8, 6); bytes.writeUInt16LE(8, central + 8);
    bytes.writeUInt32LE(1024 * 1024 * 1024, 22);
    expect(() => parseMarginReport("bad.xlsx", bytes.toString("base64"))).toThrow(/Tamanho ZIP inconsistente/);
  });
  it("rejects malformed CSV, UTF-8, base64 and unsupported filename", () => {
    expect(() => parseMarginReport("unit.csv", "!!!!")).toThrow(/Base64/);
    expect(() => parseMarginReport("unit.csv", "")).toThrow(/inválido/);
    expect(() => parseMarginReport("unit.xls", csv([mlHeader, sale()]))).toThrow(/CSV ou XLSX/);
    expect(() => parseMarginReport("unit.csv", Buffer.from([0xff]).toString("base64"))).toThrow(/UTF-8/);
    expect(() => parseMarginReport("unit.csv", Buffer.from('sep=;\n"unterminated').toString("base64"))).toThrow(/aspas/);
    expect(() => parse([], mlHeader)).toThrow(/não contém/);
  });
  it("caps sanitized filename length", () => {
    expect(parseMarginReport("a".repeat(200) + ".csv", csv([mlHeader, sale()])).fileName.length).toBe(160);
  });
});
