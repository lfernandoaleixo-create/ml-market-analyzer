import type { PricingInput } from "./pricing";
import { DESTINATION_TAX_DEFAULTS } from "./destinationTaxes";

/** Copia somente a configuração tributária da simulação atual, sem custos do produto. */
export function getStateTaxSettings(input: PricingInput) {
  return {
    useDestinationTaxes: true,
    saleDestination:
      input.saleDestination ?? DESTINATION_TAX_DEFAULTS.saleDestination,
    taxIcmsInside:
      input.taxIcmsInside ?? DESTINATION_TAX_DEFAULTS.taxIcmsInside,
    taxIcmsOutside:
      input.taxIcmsOutside ?? DESTINATION_TAX_DEFAULTS.taxIcmsOutside,
    taxIcmsTransfer:
      input.taxIcmsTransfer ?? DESTINATION_TAX_DEFAULTS.taxIcmsTransfer,
    taxDifal: input.taxDifal ?? DESTINATION_TAX_DEFAULTS.taxDifal,
    difalMode: input.difalMode ?? ("percent" as const),
    taxDifalValue: input.taxDifalValue ?? 0,
  };
}
