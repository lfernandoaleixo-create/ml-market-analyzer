import type { PricingInput } from "./pricing";

export type SaleDestination = "inside" | "outside";

export interface StateTaxRates {
  icmsSale: number;
  icmsTransfer: number;
  difalPercent: number;
  difalFixed: number;
}

/** Preset comercial editável usado quando a entrada está no fluxo novo. */
export const DESTINATION_TAX_DEFAULTS = {
  saleDestination: "inside" as SaleDestination,
  taxIcmsInside: 6,
  taxIcmsOutside: 1.3,
  taxIcmsTransfer: 1.5,
  taxDifal: 16,
} as const;

function valueOrDefault(value: number | undefined, fallback: number): number {
  return value === undefined ? fallback : value;
}

/**
 * Obtém as taxas estaduais efetivas sem alterar a entrada.
 *
 * Entradas antigas continuam usando `taxIcms` e os campos legados de DIFAL.
 * No fluxo por destino, DIFAL só existe para venda externa e somente o modo
 * ativo (percentual ou fixo) é exposto ao motor.
 */
export function getStateTaxRates(
  input: Partial<PricingInput> = {}
): StateTaxRates {
  const source = input ?? {};
  const useDestinationTaxes = source.useDestinationTaxes === true;

  if (!useDestinationTaxes) {
    const legacyDifalIsFixed = source.difalMode === "rs";
    return {
      icmsSale: valueOrDefault(source.taxIcms, 0),
      icmsTransfer: 0,
      difalPercent: legacyDifalIsFixed
        ? 0
        : valueOrDefault(source.taxDifal, 0),
      difalFixed: legacyDifalIsFixed
        ? valueOrDefault(source.taxDifalValue, 0)
        : 0,
    };
  }

  const saleDestination = source.saleDestination ?? DESTINATION_TAX_DEFAULTS.saleDestination;
  const outside = saleDestination === "outside";
  const difalIsFixed = source.difalMode === "rs";

  return {
    icmsSale: outside
      ? valueOrDefault(
          source.taxIcmsOutside,
          DESTINATION_TAX_DEFAULTS.taxIcmsOutside
        )
      : valueOrDefault(
          source.taxIcmsInside,
          DESTINATION_TAX_DEFAULTS.taxIcmsInside
        ),
    icmsTransfer: valueOrDefault(
      source.taxIcmsTransfer,
      DESTINATION_TAX_DEFAULTS.taxIcmsTransfer
    ),
    difalPercent:
      outside && !difalIsFixed
        ? valueOrDefault(source.taxDifal, DESTINATION_TAX_DEFAULTS.taxDifal)
        : 0,
    difalFixed:
      outside && difalIsFixed
        ? valueOrDefault(source.taxDifalValue, 0)
        : 0,
  };
}

/** Calcula somente o DIFAL efetivo, uma vez, para a venda informada. */
export function getDifalTax(
  input: Partial<PricingInput> = {},
  price: number = input?.price ?? 0
): number {
  const source = input ?? {};
  const rates = getStateTaxRates(source);
  if (source.difalMode === "rs") return money(rates.difalFixed);
  if (rates.difalPercent === 0) return 0;
  return money(price * (rates.difalPercent / 100));
}

function money(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
