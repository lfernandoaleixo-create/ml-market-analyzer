const normalizedDescription = (value: string): string =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");

export function isCategoryResponseCurrent(
  requestDescription: string,
  currentDescription: string
): boolean {
  return (
    normalizedDescription(requestDescription) ===
    normalizedDescription(currentDescription)
  );
}

export function shouldInvalidateSuggestedCategory(
  previousDescription: string,
  nextDescription: string,
  hasSuggestion: boolean
): boolean {
  return (
    hasSuggestion &&
    !isCategoryResponseCurrent(previousDescription, nextDescription)
  );
}

/** A breadcrumb describes one final category; display only its last name. */
export function singleCategoryLabel(category: string): string {
  return (
    category
      .split(/\s*(?:›|>|→)\s*/)
      .filter(part => part.trim())
      .at(-1)
      ?.trim() ?? ""
  );
}

export function isSingleOfficialCategoryResult(value: {
  category: string;
  categoryId: string | null;
  source: string;
  confidence: string;
  alternatives: string[];
}): boolean {
  return (
    value.source === "mercadolivre" &&
    /^MLB\d+$/.test(value.categoryId ?? "") &&
    value.confidence === "alta" &&
    value.alternatives.length === 0 &&
    value.category.trim().length > 0 &&
    singleCategoryLabel(value.category) === value.category.trim()
  );
}

export function canShowVerifiedCategory(
  value: Parameters<typeof isSingleOfficialCategoryResult>[0] | null,
  currentCategory: string,
  lastVerifiedResponse:
    | Parameters<typeof isSingleOfficialCategoryResult>[0]
    | null
): boolean {
  return (
    value !== null &&
    value === lastVerifiedResponse &&
    value.category === currentCategory &&
    isSingleOfficialCategoryResult(value)
  );
}
