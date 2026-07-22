import { describe, it, expect } from "vitest";
import { validateSkuPassword } from "./skuProtection";

describe("validateSkuPassword", () => {
  it("aceita nomes autorizados (case-insensitive)", () => {
    expect(validateSkuPassword("luis")).toBe("Luis");
    expect(validateSkuPassword("GUILHERME")).toBe("Guilherme");
    expect(validateSkuPassword("Fernando")).toBe("Fernando");
    expect(validateSkuPassword("  bruno  ")).toBe("Bruno");
  });

  it("rejeita nomes não autorizados", () => {
    expect(validateSkuPassword("admin")).toBeNull();
    expect(validateSkuPassword("grupofox")).toBeNull();
    expect(validateSkuPassword("")).toBeNull();
    expect(validateSkuPassword("   ")).toBeNull();
    expect(validateSkuPassword("pedro")).toBeNull();
  });
});
