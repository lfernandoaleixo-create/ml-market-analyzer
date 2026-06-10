/**
 * Helpers for the product-name search/filter used in product rankings.
 *
 * Matching is case-insensitive and diacritics-insensitive so that, e.g.,
 * searching "agua" matches "Água" and "SHAMPOO" matches "shampoo". Keeping the
 * logic here (instead of inline in a component) makes it unit-testable.
 */

/** Lowercase + strip diacritics (accents) for tolerant comparison. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Filter a list of products by a free-text query against their `title`.
 * An empty/whitespace-only query returns the list unchanged (same reference).
 */
export function filterProductsByName<T extends { title: string }>(
  products: T[],
  query: string,
): T[] {
  const q = normalizeText(query.trim());
  if (!q) return products;
  return products.filter((p) => normalizeText(p.title).includes(q));
}
