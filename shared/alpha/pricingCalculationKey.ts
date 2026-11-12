import type { PricingInput } from "./pricing";

/**
 * Identity labels do not affect the current pricing engine. All other fields
 * remain dependencies, including category eligibility and invalid numbers.
 * KIT descriptions participate in validation (blank/nonblank), not arithmetic;
 * their current text/SKU always stays in the live input, never in this key.
 * Never use this computation cache for saving catalog entries or PDF snapshots.
 */
export function pricingCalculationKey(input: PricingInput): string {
  const { description, category, productSku, kitSku, ...financialFields } =
    input;
  const kitItems = Array.isArray(financialFields.kitItems)
    ? financialFields.kitItems.map(item => {
        if (!item || typeof item !== "object") return item;
        const { description, sku, ...effectiveFields } = item;
        return {
          ...effectiveFields,
          descriptionIsPresent:
            typeof description === "string" && description.trim() !== "",
        };
      })
    : financialFields.kitItems;
  return JSON.stringify({ ...financialFields, kitItems }, (_key, value) =>
    typeof value === "number" && !Number.isFinite(value)
      ? { $alphaNumber: String(value) }
      : value
  );
}
