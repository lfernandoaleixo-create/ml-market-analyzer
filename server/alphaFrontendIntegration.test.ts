import { describe, expect, it } from "vitest";
import { alphaPdfAttemptSignature, alphaPdfBase64, alphaPdfFilename, encodeAlphaReportSnapshot, matchingProjectProducts, projectIdFromSearch, MAX_ALPHA_PDF_BYTES } from "../client/src/alpha/lib/mercatoPdf";
import { attachPdfInputSchema } from "./alpha/documentContracts";

const products = [{ id: 330001, name: "Joias" }, { id: 2, name: "Marmita" }, { id: 7, name: "Fábrica Plástico — Bety" }, { id: 8, name: "Joias" }];

describe("Integração Alpha com o produto real do Projeto", () => {
  it("mostra apenas nomes correspondentes e preserva IDs distintos de nomes repetidos", () => {
    expect(matchingProjectProducts("KIT DE JOIAS FOLHEADAS", products).map(row => row.id)).toEqual([330001, 8]);
    expect(matchingProjectProducts("mar", products).map(row => row.id)).toEqual([2]);
    expect(matchingProjectProducts("Fabrica plastico", products).map(row => row.id)).toEqual([7]);
  });
  it("não inventa correspondências para nome desconhecido ou consulta vazia", () => {
    expect(matchingProjectProducts("", products)).toEqual([]);
    expect(matchingProjectProducts("j", products)).toEqual([]);
    expect(matchingProjectProducts("sapato infantil", products)).toEqual([]);
    expect(matchingProjectProducts("conjunto de bijuterias", products)).toEqual([]);
  });
  it("não confunde a palavra Joias com parte de outra palavra", () => {
    expect(matchingProjectProducts("Antijoias", products)).toEqual([]);
  });
  it("recebe ID real do atalho de Projeto e não limita IDs técnicos altos", () => {
    expect(projectIdFromSearch("?projectProductId=330001")).toBe(330001);
    for (const value of ["", "-1", "1.5", "zero", "9007199254740992"]) expect(projectIdFromSearch(`?projectProductId=${value}`)).toBeNull();
  });
  it("cada geração tem título diferente mesmo quando produto, horário e modalidade coincidem", () => {
    const input = { name: "Kit Joias / prata", scope: "compact" as const, createdAt: new Date("2026-11-06T11:00:00.123Z"), includeProductSheet: false };
    const first = alphaPdfFilename({ ...input, exportId: "12345678-1234-4234-8234-123456789012" });
    const second = alphaPdfFilename({ ...input, exportId: "12345678-1234-4234-8234-123456789013" });
    expect(first).not.toBe(second);
    expect(first).toContain("CalculadoraFinal-Kit-Joias-prata-fluxos-compactos");
    expect(first).not.toContain("/");
    expect(first.length).toBeLessThanOrEqual(255);
    expect(attachPdfInputSchema.shape.filename.safeParse(first).success).toBe(true);
  });
  it("distingue ficha, fluxo selecionado e fluxos completos pelo título", () => {
    const input = { name: "Produto", exportId: "12345678-1234-4234-8234-123456789012", createdAt: new Date("2026-11-06T11:00:00Z"), includeProductSheet: true };
    expect(alphaPdfFilename({ ...input, scope: "selected" })).toContain("fluxo-selecionado-com-ficha");
    expect(alphaPdfFilename({ ...input, scope: "complete" })).toContain("fluxos-completos-com-ficha");
    expect(attachPdfInputSchema.shape.filename.safeParse(alphaPdfFilename({ ...input, name: "A".repeat(600), scope: "complete" })).success).toBe(true);
  });
  it("mantém a tentativa no mesmo ID apesar de renomeação e separa destino/conta/opções diferentes", () => {
    const record = { id: "relatorio-1", price: 49.9 };
    const destination = { ownerId: 1, projectProductId: 330001, label: "Joias" };
    const options = { scope: "compact" };
    const first = alphaPdfAttemptSignature(record, destination, options);
    expect(alphaPdfAttemptSignature(record, { ...destination, label: "Joias — novo título" }, options)).toBe(first);
    expect(alphaPdfAttemptSignature(record, { ...destination, projectProductId: 2 }, options)).not.toBe(first);
    expect(alphaPdfAttemptSignature(record, { ...destination, ownerId: 2 }, options)).not.toBe(first);
    expect(alphaPdfAttemptSignature(record, destination, { scope: "complete" })).not.toBe(first);
  });
  it("o mesmo PDF binário é salvo sem corrupção, inclusive além do limite de spread", () => {
    const bytes = new Uint8Array(150_000);
    for (let index = 0; index < bytes.length; index++) bytes[index] = index % 256;
    expect(Buffer.from(alphaPdfBase64(bytes), "base64")).toEqual(Buffer.from(bytes));
  });
  it("recusa arquivos vazios ou acima de 15 MB sem tentar enviá-los", () => {
    expect(() => alphaPdfBase64(new Uint8Array())).toThrow("15 MB");
    expect(() => alphaPdfBase64(new Uint8Array(MAX_ALPHA_PDF_BYTES + 1))).toThrow("15 MB");
  });
  it("preserva preços inválidos do snapshot explicitamente, sem substituição silenciosa por zero ou null", () => {
    const restored = JSON.parse(encodeAlphaReportSnapshot({ valid: 49.9, invalid: NaN, high: Infinity, low: -Infinity }));
    expect(restored).toEqual({ valid: 49.9, invalid: { $alphaNumber: "NaN" }, high: { $alphaNumber: "Infinity" }, low: { $alphaNumber: "-Infinity" } });
  });
});
