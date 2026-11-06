import { describe, expect, it } from "vitest";
import {
  getPackagingPreset,
  PACKAGING_PRESETS,
  suggestPackaging,
} from "./packagingCatalog";

describe("catálogo de embalagens", () => {
  it("preserva exatamente as duas medidas e os status informados", () => {
    expect(PACKAGING_PRESETS).toEqual([
      {
        id: "p",
        label: "P",
        sideA: 20,
        sideB: 30,
        status: "used",
        statusLabel: "Em uso",
        usage: "Joias, inclusive mais de uma caixinha no mesmo pedido",
      },
      {
        id: "m",
        label: "M",
        sideA: 26,
        sideB: 36,
        status: "not_used",
        statusLabel: "Não utilizada",
        usage: "Não utilizada",
      },
      {
        id: "g",
        label: "G",
        sideA: 40,
        sideB: 60,
        status: "used",
        statusLabel: "Em uso",
        usage: "Barraca",
      },
      {
        id: "gg",
        label: "GG",
        sideA: 100,
        sideB: 100,
        status: "future",
        statusLabel: "Ainda não disponível",
        usage: "Referência futura para barracas maiores",
      },
    ]);

    for (const preset of PACKAGING_PRESETS) {
      expect(Object.keys(preset)).toEqual([
        "id",
        "label",
        "sideA",
        "sideB",
        "status",
        "statusLabel",
        "usage",
      ]);
      expect(preset).not.toHaveProperty("height");
      expect(preset).not.toHaveProperty("weight");
      expect(preset).not.toHaveProperty("price");
    }
  });

  it("obtém somente presets reais e retorna null para ids ausentes", () => {
    expect(getPackagingPreset("p")).toBe(PACKAGING_PRESETS[0]);
    expect(getPackagingPreset("gg")).toBe(PACKAGING_PRESETS[3]);
    expect(getPackagingPreset("custom")).toBeNull();
    expect(getPackagingPreset("P")).toBeNull();
    expect(getPackagingPreset(undefined)).toBeNull();
    expect(getPackagingPreset(null)).toBeNull();
  });

  it.each(["Joias", "Anéis", "brincos", "PULSEIRAS", "pingentes", "Bijoias"])(
    "sugere P para a palavra de joia %s, inclusive com acento e plural",
    description => {
      expect(suggestPackaging(description, "")).toBe(PACKAGING_PRESETS[0]);
    }
  );

  it("usa a categoria como fallback quando a descrição não é específica", () => {
    expect(suggestPackaging("Produto artesanal", "Acessórios > Colares")).toBe(
      PACKAGING_PRESETS[0]
    );
    expect(
      suggestPackaging("Produto infantil", "Brinquedos > Tenda infantil")
    ).toBe(PACKAGING_PRESETS[2]);
  });

  it("dá precedência à descrição explícita sobre a categoria", () => {
    expect(suggestPackaging("Brincos dourados", "Camping > Barracas")).toBe(
      PACKAGING_PRESETS[0]
    );
    expect(suggestPackaging("Barraca infantil", "Joias > Colares")).toBe(
      PACKAGING_PRESETS[2]
    );
  });

  it("sugere G para barraca em qualquer capitalização", () => {
    expect(suggestPackaging("BARRACA infantil", "")).toBe(PACKAGING_PRESETS[2]);
    expect(suggestPackaging("Uma tenda infantil", "")).toBe(
      PACKAGING_PRESETS[2]
    );
  });

  it("não sugere tamanho futuro ou não utilizado automaticamente", () => {
    expect(suggestPackaging("Barraca maior", "")).toBe(PACKAGING_PRESETS[2]);
    expect(suggestPackaging("Produto maior", "")).toBeNull();
    expect(suggestPackaging("Produto", "Embalagem GG")).toBeNull();
    expect(suggestPackaging("Produto", "Embalagem M")).toBeNull();
  });

  it("retorna null para conflito entre barraca e joia", () => {
    expect(suggestPackaging("Kit de joias para barraca", "")).toBeNull();
  });

  it("não infere P pelo pai Joias e Relógios para relógios", () => {
    expect(
      suggestPackaging("Relógio de pulso", "Joias e Relógios > Relógios")
    ).toBeNull();
    expect(suggestPackaging("Relógio", "Joias e Relógios")).toBeNull();
  });

  it("retorna null para produto sem relação com o catálogo", () => {
    expect(suggestPackaging("Caneca de cerâmica", "Casa > Cozinha")).toBeNull();
    expect(suggestPackaging("", "")).toBeNull();
  });
});
