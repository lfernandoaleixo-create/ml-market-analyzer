export type PackagingPresetId = "custom" | "p" | "m" | "g" | "gg";

type CatalogPackagingPreset = {
  readonly id: Exclude<PackagingPresetId, "custom">;
  readonly label: "P" | "M" | "G" | "GG";
  readonly sideA: number;
  readonly sideB: number;
  readonly status: "used" | "not_used" | "future";
  readonly statusLabel: "Em uso" | "Não utilizada" | "Ainda não disponível";
  readonly usage: string;
};

export const PACKAGING_PRESETS = [
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
] as const satisfies readonly CatalogPackagingPreset[];

export type PackagingPreset = (typeof PACKAGING_PRESETS)[number];

const JEWELRY_WORDS =
  /\b(?:joia|joias|colar|colares|brinco|brincos|pulseira|pulseiras|anel|aneis|pingente|pingentes|bijoia|bijoias)\b/;
const TENT_WORDS = /\b(?:barraca|barracas)\b|\btendas?\s+infantils?\b/;
const WATCH_WORDS = /\b(?:relogio|relogios)\b/;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function classify(value: string): { jewelry: boolean; tent: boolean } {
  const normalized = normalize(value);
  return {
    jewelry: JEWELRY_WORDS.test(normalized),
    tent: TENT_WORDS.test(normalized),
  };
}

function selectPreset(jewelry: boolean, tent: boolean): PackagingPreset | null {
  if (jewelry === tent) return null;
  return (
    PACKAGING_PRESETS.find(preset => preset.id === (jewelry ? "p" : "g")) ??
    null
  );
}

export function getPackagingPreset(
  id: string | undefined | null
): PackagingPreset | null {
  if (!id) return null;
  return PACKAGING_PRESETS.find(preset => preset.id === id) ?? null;
}

export function suggestPackaging(
  description: string,
  category: string
): PackagingPreset | null {
  const normalizedDescription = normalize(description);
  const descriptionClassification = classify(description);

  // A description is the explicit signal. Conflicting explicit terms are
  // ambiguous and must not be resolved by choosing one size arbitrarily.
  if (descriptionClassification.jewelry || descriptionClassification.tent) {
    return selectPreset(
      descriptionClassification.jewelry,
      descriptionClassification.tent
    );
  }

  const normalizedCategory = normalize(category);
  const categorySeparator = normalizedCategory.lastIndexOf(">");
  const categoryToClassify =
    categorySeparator >= 0
      ? normalizedCategory.slice(categorySeparator + 1).trim()
      : normalizedCategory;
  const categoryClassification = classify(categoryToClassify);

  // A broad category such as "Joias e Relógios" must not turn a watch into a
  // jewelry-packaging suggestion when the description has no specific signal.
  const watchWithoutSpecificDescription =
    WATCH_WORDS.test(normalizedDescription) &&
    !descriptionClassification.jewelry &&
    !descriptionClassification.tent;
  const broadWatchCategory =
    categorySeparator < 0 && WATCH_WORDS.test(normalizedCategory);
  if (watchWithoutSpecificDescription || broadWatchCategory) return null;

  return selectPreset(
    categoryClassification.jewelry,
    categoryClassification.tent
  );
}
