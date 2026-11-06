import type { PricingInput } from "./pricing";

export const FEDERAL_TAXES = [
  { label: "PIS", rate: 0.65 },
  { label: "COFINS", rate: 3 },
  { label: "IRPJ", rate: 1.5 },
  { label: "CSLL", rate: 1 },
] as const;

export const FEDERAL_TAX_FIELDS = [
  { key: "taxPis", label: "PIS", rate: 0.65 },
  { key: "taxCofins", label: "COFINS", rate: 3 },
  { key: "taxIrpj", label: "IRPJ", rate: 1.5 },
  { key: "taxCsll", label: "CSLL", rate: 1 },
] as const;

export type FederalTaxKey = (typeof FEDERAL_TAX_FIELDS)[number]["key"];
export type FederalTaxRates = Pick<PricingInput, FederalTaxKey>;

const DEFAULT_FEDERAL_TAX_RATES: FederalTaxRates = {
  taxPis: 0.65,
  taxCofins: 3,
  taxIrpj: 1.5,
  taxCsll: 1,
};

/** Soma taxas decimais, removendo o ruído binário usual do JavaScript. */
export function sumFederalTaxRates(
  rates: FederalTaxRates | readonly number[]
): number {
  const values = Array.isArray(rates)
    ? [...rates]
    : [
        (rates as FederalTaxRates).taxPis,
        (rates as FederalTaxRates).taxCofins,
        (rates as FederalTaxRates).taxIrpj,
        (rates as FederalTaxRates).taxCsll,
      ];

  if (values.some(value => !Number.isFinite(value))) return Number.NaN;

  const total = values.reduce((sum, value) => sum + value, 0);
  return Number(total.toFixed(12));
}

/** Soma padrão das quatro alíquotas federais em pontos percentuais. */
export const FEDERAL_TAX_RATE = sumFederalTaxRates(
  FEDERAL_TAX_FIELDS.map(field => field.rate)
);

/**
 * Lê as quatro taxas do perfil. Campos ausentes/undefined recebem o padrão;
 * valores presentes, inclusive zero e valores inválidos, são preservados para
 * que o chamador possa rejeitá-los sem mascarar o erro.
 */
export function getFederalTaxRates(
  input: Partial<PricingInput> = {}
): FederalTaxRates {
  return {
    taxPis:
      input.taxPis === undefined
        ? DEFAULT_FEDERAL_TAX_RATES.taxPis
        : input.taxPis,
    taxCofins:
      input.taxCofins === undefined
        ? DEFAULT_FEDERAL_TAX_RATES.taxCofins
        : input.taxCofins,
    taxIrpj:
      input.taxIrpj === undefined
        ? DEFAULT_FEDERAL_TAX_RATES.taxIrpj
        : input.taxIrpj,
    taxCsll:
      input.taxCsll === undefined
        ? DEFAULT_FEDERAL_TAX_RATES.taxCsll
        : input.taxCsll,
  };
}

function isValidFederalTaxRate(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Aplica o perfil sem mutar a entrada. O agregado é recalculado a partir das
 * quatro taxas editáveis; qualquer taxa negativa ou não finita invalida o
 * agregado com NaN para que o motor bloqueie a entrada.
 */
export function applyCompanyTax(input: PricingInput): PricingInput {
  const rates = getFederalTaxRates(input);
  const taxFederal = Object.values(rates).every(isValidFederalTaxRate)
    ? sumFederalTaxRates(rates)
    : Number.NaN;

  return {
    ...input,
    ...rates,
    taxFederal,
  };
}

/** Restaura somente as quatro taxas federais e o agregado padrão do perfil. */
export function resetCompanyTax(input: PricingInput): PricingInput {
  const rates = getFederalTaxRates({});
  return {
    ...input,
    ...rates,
    taxFederal: FEDERAL_TAX_RATE,
  };
}
