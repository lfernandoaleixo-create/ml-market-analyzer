import { describe, expect, it } from "vitest";
import {
  isCategoryResponseCurrent,
  shouldInvalidateSuggestedCategory,
  singleCategoryLabel,
} from "./categorySelection";

describe("categoria única da descrição atual", () => {
  it("mostra uma categoria final, e não os níveis do caminho como várias escolhas", () => {
    expect(
      singleCategoryLabel(
        "Brinquedos e Hobbies › Casinhas e Barracas › Barracas Infantis"
      )
    ).toBe("Barracas Infantis");
    expect(singleCategoryLabel("Joias > Colares")).toBe("Colares");
    expect(singleCategoryLabel("Barracas Infantis")).toBe("Barracas Infantis");
  });
  it("ignora uma resposta da descrição anterior", () => {
    expect(
      isCategoryResponseCurrent(
        "Barraca de brinquedo infantil",
        "Barraca para camping impermeável"
      )
    ).toBe(false);
    expect(
      isCategoryResponseCurrent("Brinco de prata", "Luminária LED220V")
    ).toBe(false);
  });
  it("tolera caixa e espaços sem considerar que o produto mudou", () => {
    expect(
      isCategoryResponseCurrent("  BARRACA  infantil ", "barraca infantil")
    ).toBe(true);
  });
  it("invalida a categoria sugerida ao mudar o produto", () => {
    expect(
      shouldInvalidateSuggestedCategory(
        "Colar de prata",
        "Barraca infantil",
        true
      )
    ).toBe(true);
    expect(
      shouldInvalidateSuggestedCategory(
        "Colar de prata",
        "colar de prata",
        true
      )
    ).toBe(false);
  });
  it("preserva categoria informada manualmente e não modifica nenhum cadastro", () => {
    expect(shouldInvalidateSuggestedCategory("Colar", "Barraca", false)).toBe(
      false
    );
    const original = { category: "A › B", description: "Colar" };
    singleCategoryLabel(original.category);
    expect(original).toEqual({ category: "A › B", description: "Colar" });
  });
});

describe("resposta única, específica e oficial", () => {
  it("aceita uma categoria final e recusa múltiplas escolhas, IA ou baixa confiança", async () => {
    const { isSingleOfficialCategoryResult } = await import(
      "./categorySelection"
    );
    const result = {
      category: "Barracas Infantis",
      categoryId: "MLB278224",
      source: "mercadolivre",
      confidence: "alta",
      alternatives: [] as string[],
    };
    expect(isSingleOfficialCategoryResult(result)).toBe(true);
    expect(
      isSingleOfficialCategoryResult({
        ...result,
        alternatives: ["Barracas de Camping"],
      })
    ).toBe(false);
    expect(
      isSingleOfficialCategoryResult({
        ...result,
        category: "Brinquedos > Barracas Infantis",
      })
    ).toBe(false);
    expect(
      isSingleOfficialCategoryResult({
        ...result,
        categoryId: null,
        source: "ai",
      })
    ).toBe(false);
    expect(
      isSingleOfficialCategoryResult({ ...result, confidence: "media" })
    ).toBe(false);
  });
});

describe("metadado antigo não é confirmação atual", () => {
  it("só mostra API para a resposta validada na sessão e para a categoria correspondente", async () => {
    const { canShowVerifiedCategory } = await import("./categorySelection");
    const answer = {
      category: "Barracas Infantis",
      categoryId: "MLB278224",
      source: "mercadolivre",
      confidence: "alta",
      alternatives: [] as string[],
    };
    expect(canShowVerifiedCategory(answer, answer.category, answer)).toBe(true);
    expect(
      canShowVerifiedCategory({ ...answer }, answer.category, answer)
    ).toBe(false);
    expect(canShowVerifiedCategory(answer, answer.category, null)).toBe(false);
    expect(canShowVerifiedCategory(answer, "Colares", answer)).toBe(false);
    expect(answer.categoryId).toBe("MLB278224");
  });
});
