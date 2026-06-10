import { describe, it, expect } from "vitest";
import { normalizeText, filterProductsByName } from "./productSearch";

describe("normalizeText", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalizeText("ÁGUA Sanitária")).toBe("agua sanitaria");
    expect(normalizeText("Coração")).toBe("coracao");
  });
});

describe("filterProductsByName", () => {
  const products = [
    { title: "Shampoo Antiqueda 400ml" },
    { title: "Condicionador Hidratante" },
    { title: "Água Micelar Demaquilante" },
    { title: "Máscara Capilar Reparadora" },
  ];

  it("returns the same list (by reference) for an empty query", () => {
    expect(filterProductsByName(products, "")).toBe(products);
    expect(filterProductsByName(products, "   ")).toBe(products);
  });

  it("matches case-insensitively", () => {
    const r = filterProductsByName(products, "SHAMPOO");
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe("Shampoo Antiqueda 400ml");
  });

  it("matches ignoring accents in both query and title", () => {
    // query without accent should match accented title
    expect(filterProductsByName(products, "agua")).toHaveLength(1);
    // query with accent should still match
    expect(filterProductsByName(products, "máscara")).toHaveLength(1);
  });

  it("matches partial substrings anywhere in the title", () => {
    expect(filterProductsByName(products, "hidrat")).toHaveLength(1);
    expect(filterProductsByName(products, "400")).toHaveLength(1);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterProductsByName(products, "inexistente")).toEqual([]);
  });
});
