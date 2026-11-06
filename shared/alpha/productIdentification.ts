import type { PricingInput, ProductType } from "./pricing";

/**
 * Normaliza somente a identificação do produto, sem alterar quantidade, custos
 * ou qualquer outro campo usado pelo motor de precificação.
 */
export function getProductType(value: unknown, quantity: unknown): ProductType {
  if (value === "single" || value === "kit") return value;

  return typeof quantity === "number" &&
    Number.isFinite(quantity) &&
    Number.isInteger(quantity) &&
    quantity > 1
    ? "kit"
    : "single";
}

/**
 * Preserva uma identificação válida já armazenada; para dados legados sem um
 * tipo, usa a regra de compatibilidade baseada na quantidade de itens.
 */
export function normalizeProductIdentification(
  input: PricingInput,
  storedType?: unknown
): PricingInput {
  const productType = getProductType(
    storedType === undefined ? input.productType : storedType,
    input.itemQuantity
  );

  if (input.productType === productType) return input;
  return { ...input, productType };
}
