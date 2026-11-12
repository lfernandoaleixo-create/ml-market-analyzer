import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({db:vi.fn(),from:vi.fn()}));
vi.mock("../db",()=>({getDb:mocks.db}));
import { loadSalesMarginBackupRecords } from "./salesMarginBackup";
import { salesMarginReports,salesMarginCosts } from "../../drizzle/schema";
beforeEach(()=>vi.clearAllMocks());
describe("Backup de margem — consultas somente leitura",()=>{
 it("inclui todos os relatórios e custos sem consultar usuários ou SKU",async()=>{mocks.from.mockImplementation(table=>({orderBy:async()=>table===salesMarginReports?[{id:1,operations:[]}]:[{id:2,productCost:"40.00"}]}));mocks.db.mockResolvedValue({select:()=>({from:mocks.from})}); const result=await loadSalesMarginBackupRecords();expect(result.reports).toEqual([{id:1,operations:[]}]);expect(result.costs).toEqual([{id:2,productCost:"40.00"}]);expect(mocks.from.mock.calls.map(call=>call[0])).toEqual([salesMarginReports,salesMarginCosts]);});
 it("banco indisponível não vira backup vazio válido",async()=>{mocks.db.mockResolvedValue(null);await expect(loadSalesMarginBackupRecords()).rejects.toThrow("indisponível");});
 it("falha de uma tabela interrompe a geração",async()=>{mocks.db.mockResolvedValue({select:()=>({from:()=>({orderBy:async()=>{throw Error("Falha de leitura");}})})});await expect(loadSalesMarginBackupRecords()).rejects.toThrow("Falha de leitura");});
});
