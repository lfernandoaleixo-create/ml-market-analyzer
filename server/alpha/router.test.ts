import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import { alphaRouter } from "./router";

vi.mock("../db", () => ({ getDb: vi.fn(() => { throw new Error("No real DB in tests"); }) }));
vi.mock("../storage", () => ({ storagePut: vi.fn(() => { throw new Error("No real storage in tests"); }) }));
vi.mock("./llmAdapter", () => ({ invokeLLM: vi.fn(), listLLMModels: vi.fn() }));

const context = (user: TrpcContext["user"]): TrpcContext => ({ user,
  req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });

describe("Composed Alpha protected session API", () => {
  it("requires session for every list/status/category/document procedure", async () => {
    const caller = alphaRouter.createCaller(context(null));
    for (const call of [() => caller.catalog.list(), () => caller.pricing.status(),
      () => caller.pricing.suggestCategory({ description: "barraca infantil" }),
      () => caller.documents.list(undefined), () => caller.documents.attachPdf({ exportId: "66666666-6666-4666-8666-666666666666",
        reportId: "report", filename: "Alpha.pdf", base64: Buffer.from("%PDF-1.7").toString("base64"),
        description: "produto", sku: "sku", options: { scope: "selected", printMode: "duplex", includeProductSheet: false } })]) {
      await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  });
  it("rejects synthetic actors for category/status too", async () => {
    const user = { id: -1, isCron: true, openId: "cron", name: null, email: null,
      loginMethod: "cron", role: "admin" as const, createdAt: new Date(0), updatedAt: new Date(0), lastSignedIn: new Date(0) };
    const caller = alphaRouter.createCaller(context(user));
    await expect(caller.pricing.status()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.pricing.suggestCategory({ description: "barraca infantil" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
