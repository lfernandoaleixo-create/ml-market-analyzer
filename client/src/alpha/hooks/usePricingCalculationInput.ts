import { useMemo } from "react";
import type { PricingInput } from "@shared/alpha/pricing";
import { pricingCalculationKey } from "@shared/alpha/pricingCalculationKey";

/** Computation only: the caller must keep using its live input for fields/save/PDF. */
export function usePricingCalculationInput(input: PricingInput): PricingInput {
  const key = pricingCalculationKey(input);
  // Metadata edits retain this reference; all effective parameters/validations
  // still invalidate it immediately. No timer or deferred/stale financial value.
  return useMemo(() => input, [key]);
}
