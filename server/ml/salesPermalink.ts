/** Sales links must come from order/item metadata, never from an inferred URL. */
export function salesPermalink(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const link = value.trim();
  try {
    const url = new URL(link);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return undefined;
    // This is the old synthetic fallback, not a Mercado Livre listing permalink.
    if (
      url.hostname === "produto.mercadolivre.com.br" &&
      /^\/MLB\d+\/?$/i.test(url.pathname)
    )
      return undefined;
    return link;
  } catch {
    return undefined;
  }
}
