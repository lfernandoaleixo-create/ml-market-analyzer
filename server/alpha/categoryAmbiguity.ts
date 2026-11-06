import { TRPCError } from "@trpc/server";

const JEWELRY_INDICATORS = [
  "colar",
  "brinco",
  "pulseira",
  "pingente",
  "joia",
  "prata",
  "semijoia",
  "banhado",
  "gargantilha",
] as const;

const ELECTRICAL_INDICATORS = [
  "luminária",
  "LED",
  "220V",
  "127V",
  "elétrica",
  "iluminação",
  "spot",
  "teto",
  "tomada",
  "fiação",
] as const;

const VOLTAGE_INDICATOR_PATTERN = /^(?:127|220)\s*v$/;

const GENERIC_CATEGORY_WORDS = new Set([
  "produto",
  "kit",
  "barraca",
  "capa",
  "suporte",
]);

export type CategoryAmbiguityReason =
  | "not-point-of-light"
  | "clear-context"
  | "missing-context"
  | "conflicting-context";

export type CategoryAmbiguityAnalysis = {
  matchesPointOfLight: boolean;
  hasJewelryContext: boolean;
  hasElectricalContext: boolean;
  needsClarification: boolean;
  reason: CategoryAmbiguityReason;
};

const normalizeForMatching = (description: string): string =>
  description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const allContextIndicators = [
  ...JEWELRY_INDICATORS,
  ...ELECTRICAL_INDICATORS,
].map(normalizeForMatching);

const compactContextSuffixes = allContextIndicators
  .sort((left, right) => right.length - left.length)
  .map(escapeRegExp)
  .join("|");

const POINT_OF_LIGHT_PATTERN = new RegExp(
  `\\bpontos?\\s*de\\s*luz(?:\\b|(?=(?:${compactContextSuffixes})))`
);

const hasIndicator = (normalized: string, indicator: string): boolean => {
  const normalizedIndicator = normalizeForMatching(indicator);
  const escapedIndicator = escapeRegExp(normalizedIndicator);
  const regularPattern = new RegExp(`\\b${escapedIndicator}\\b`);
  if (regularPattern.test(normalized)) return true;

  // Also accept a compact description such as "ponto de luzprata" or
  // "ponto de luzled", without treating an arbitrary suffix as context.
  const compactAfterLightPattern = new RegExp(
    `(?:^|\\s|luz)${escapedIndicator}(?=\\s|$)`
  );
  return compactAfterLightPattern.test(normalized);
};

const hasAnyIndicator = (
  normalized: string,
  indicators: readonly string[]
): boolean => indicators.some(indicator => hasIndicator(normalized, indicator));

export const analyzeCategoryAmbiguity = (
  description: string
): CategoryAmbiguityAnalysis => {
  const normalized = normalizeForMatching(description);
  const matchesPointOfLight = POINT_OF_LIGHT_PATTERN.test(normalized);

  if (!matchesPointOfLight) {
    return {
      matchesPointOfLight: false,
      hasJewelryContext: false,
      hasElectricalContext: false,
      needsClarification: false,
      reason: "not-point-of-light",
    };
  }

  const hasJewelryContext = hasAnyIndicator(normalized, JEWELRY_INDICATORS);
  const hasElectricalContext = hasAnyIndicator(
    normalized,
    ELECTRICAL_INDICATORS
  );
  const needsClarification = hasJewelryContext === hasElectricalContext;

  return {
    matchesPointOfLight: true,
    hasJewelryContext,
    hasElectricalContext,
    needsClarification,
    reason:
      hasJewelryContext && hasElectricalContext
        ? "conflicting-context"
        : hasJewelryContext || hasElectricalContext
          ? "clear-context"
          : "missing-context",
  };
};

const clarificationMessageFor = (
  analysis: CategoryAmbiguityAnalysis
): string => {
  if (analysis.reason === "conflicting-context") {
    return "A descrição de ponto de luz mistura sinais de joia e de instalação elétrica. Especifique qual é o produto, por exemplo uma joia (colar, brinco ou pingente) ou um item elétrico (luminária, LED ou tomada).";
  }

  return "Ponto de luz pode ser uma joia ou uma instalação elétrica. Especifique qual é o produto, por exemplo uma joia (colar, brinco ou pingente) ou um item elétrico (luminária, LED ou tomada).";
};

export const assertCategoryDescriptionIsUnambiguous = (
  description: string
): void => {
  const analysis = analyzeCategoryAmbiguity(description);
  if (!analysis.needsClarification) return;

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: clarificationMessageFor(analysis),
  });
};

export const assertCategoryDescriptionIsSpecific = (
  description: string
): void => {
  assertCategoryDescriptionIsUnambiguous(description);

  const normalized = normalizeForMatching(description);
  const words = normalized.split(" ").filter(Boolean);
  const isOnlyGenericWords =
    words.length > 0 &&
    words.length <= 2 &&
    words.every(word => GENERIC_CATEGORY_WORDS.has(word));

  if (!isOnlyGenericWords && normalized.length >= 4) return;

  throw new TRPCError({
    code: "BAD_REQUEST",
    message:
      "Especifique o tipo, uso, material ou público do produto para escolher uma categoria final.",
  });
};
