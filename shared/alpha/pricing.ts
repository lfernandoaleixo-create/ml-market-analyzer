import {
  SHIPPING_PRICE_LABELS,
  SHIPPING_PRICE_STARTS,
  SHIPPING_RAPID_VALUES,
  SHIPPING_VALUES,
  SHIPPING_WEIGHTS,
} from "./tariffs";
import { FEDERAL_TAX_RATE } from "./companyProfile";
import type { PackagingPresetId } from "./packagingCatalog";
import { getAcquisition } from "./kitComposition";
import { getDifalTax, getStateTaxRates } from "./destinationTaxes";
import type { SaleDestination } from "./destinationTaxes";

export { getAcquisition } from "./kitComposition";
export { getDifalTax, getStateTaxRates } from "./destinationTaxes";
export type { SaleDestination } from "./destinationTaxes";

export type CalculationType = "estimated" | "real";
export type ProductType = "single" | "kit";
export type CostMode = "unit" | "kg";
export type AdsMode = "rs" | "percent";
export type DifalMode = "percent" | "rs";
export type Listing = "classic" | "premium";
export type WeightInputMode = "exact" | "band";
export type Reputation = "green" | "new" | "yellow" | "red";
export type Condition = "new" | "used";
export type Logistic = "agency" | "collection" | "full" | "flex" | "other";
export type ShippingMode = "auto" | "rapid" | "manual";

export interface KitItem {
  id: string;
  description: string;
  sku: string;
  quantity: number;
  unitCost: number;
}

export interface PricingInput {
  description: string;
  productSku: string;
  kitSku: string;
  productType: ProductType;
  kitItems: KitItem[];
  category: string;
  categoryDiscountEligible: boolean;
  calculationType: CalculationType;
  packagingPreset: PackagingPresetId;
  costMode: CostMode;
  cost: number;
  productKg: number;
  itemQuantity: number;
  operation: number;
  packaging: number;
  promotion: number;
  adsMode: AdsMode;
  ads: number;
  taxFederal: number;
  taxPis: number;
  taxCofins: number;
  taxIrpj: number;
  taxCsll: number;
  taxIcms: number;
  useDestinationTaxes: boolean;
  saleDestination: SaleDestination;
  taxIcmsInside: number;
  taxIcmsOutside: number;
  taxIcmsTransfer: number;
  taxDifal: number;
  difalMode: DifalMode;
  taxDifalValue: number;
  listing: Listing;
  classicRate: number;
  premiumRate: number;
  price: number;
  weight: number;
  weightInputMode: WeightInputMode;
  weightExact: number;
  length: number;
  width: number;
  height: number;
  reputation: Reputation;
  condition: Condition;
  logistic: Logistic;
  shippingMode: ShippingMode;
  automaticShippingOnly: boolean;
  manualShipping: number;
  manualFixedFee: number;
  manualFixedLimit: number;
  fullExtra: number;
  reservePercent: number;
}

export interface PricingResult {
  price: number;
  productCost: number;
  operation: number;
  packaging: number;
  promotion: number;
  shipping: number;
  fixedFee: number;
  commission: number;
  ads: number;
  taxes: number;
  fullExtra: number;
  reserve: number;
  profit: number;
  margin: number;
  netPayout: number;
  totalCosts: number;
  weightUsed: number;
  dimensionalWeight: number;
  shippingLabel: string;
  priceBand: string;
  weightBand: string;
  warnings: string[];
  valid: boolean;
  error?: string;
  rate: number;
}

export interface SolveTargetResult {
  price: number | null;
  result: PricingResult | null;
  error?: string;
}

/** Arredondamento monetário em centavos, evitando os erros usuais de IEEE-754. */
export function money(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Converte uma taxa expressa em pontos percentuais para multiplicador. */
export function percent(value: number): number {
  return value / 100;
}

/** Calcula somente o componente DIFAL, percentual ou fixo em reais. */
export function getDifalCost(
  input: PricingInput,
  price: number = input.price
): number {
  return getDifalTax(input, price);
}

/**
 * Lê números no formato brasileiro sem aceitar silenciosamente lixo ou sinal
 * negativo como zero. Exemplos: 23,99; 1.234,56; 0; (string vazia).
 */
export function parseLocalized(value: string | number): number {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== "string") return Number.NaN;

  const text = value.trim();
  if (text === "") return 0;

  // Ponto só agrupa milhares; a vírgula é o separador decimal brasileiro.
  const match = /^([+-]?)(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d+))?$/.exec(text);
  if (!match) return Number.NaN;

  const integer = match[2].replace(/\./g, "");
  const fraction = match[3] ? `.${match[3]}` : "";
  const parsed = Number(`${match[1]}${integer}${fraction}`);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export const defaultInput: PricingInput = {
  description: "Kit organizador de cozinha",
  productSku: "",
  kitSku: "",
  productType: "single",
  kitItems: [],
  category: "",
  categoryDiscountEligible: false,
  calculationType: "estimated",
  packagingPreset: "custom",
  costMode: "unit",
  cost: 32,
  productKg: 1,
  itemQuantity: 1,
  operation: 2,
  packaging: 1.5,
  promotion: 0,
  adsMode: "rs",
  ads: 0,
  taxFederal: FEDERAL_TAX_RATE,
  taxPis: 0.65,
  taxCofins: 3,
  taxIrpj: 1.5,
  taxCsll: 1,
  taxIcms: 0,
  useDestinationTaxes: false,
  saleDestination: "inside",
  taxIcmsInside: 6,
  taxIcmsOutside: 1.3,
  taxIcmsTransfer: 1.5,
  taxDifal: 0,
  difalMode: "percent",
  taxDifalValue: 0,
  listing: "classic",
  classicRate: 12,
  premiumRate: 17,
  price: 99.9,
  weight: 0.5,
  weightInputMode: "exact",
  weightExact: 0.5,
  length: 20,
  width: 15,
  height: 10,
  reputation: "green",
  condition: "new",
  logistic: "agency",
  shippingMode: "auto",
  automaticShippingOnly: false,
  manualShipping: 14.75,
  manualFixedFee: 0,
  manualFixedLimit: 79,
  fullExtra: 0,
  reservePercent: 0,
};

const VALID_LISTINGS: readonly Listing[] = ["classic", "premium"];
const VALID_COST_MODES: readonly CostMode[] = ["unit", "kg"];
const VALID_ADS_MODES: readonly AdsMode[] = ["rs", "percent"];
const VALID_DIFAL_MODES: readonly DifalMode[] = ["percent", "rs"];
const VALID_SALE_DESTINATIONS: readonly SaleDestination[] = [
  "inside",
  "outside",
];
const VALID_REPUTATIONS: readonly Reputation[] = [
  "green",
  "new",
  "yellow",
  "red",
];
const VALID_CONDITIONS: readonly Condition[] = ["new", "used"];
const VALID_LOGISTICS: readonly Logistic[] = [
  "agency",
  "collection",
  "full",
  "flex",
  "other",
];
const VALID_SHIPPING_MODES: readonly ShippingMode[] = [
  "auto",
  "rapid",
  "manual",
];
const TABLE_LOGISTICS: readonly Logistic[] = ["agency", "collection", "full"];
const CENT_TOLERANCE = 1e-9;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function selectedRate(input: PricingInput, listing: Listing): number {
  return listing === "premium" ? input.premiumRate : input.classicRate;
}

function isDifalRsMode(input: PricingInput): boolean {
  return input.difalMode === "rs";
}

const CATEGORY_DISCOUNT_MIN_PRICE = 150;
const CATEGORY_DISCOUNT_MAX_PRICE = 700;
const CATEGORY_DISCOUNT_POINTS: Record<Listing, number> = {
  classic: 2,
  premium: 4,
};

/**
 * Retorna a comissão efetiva, em pontos percentuais, sem presumir que toda
 * categoria seja elegível ao desconto oficial.
 */
export function getCommissionRate(
  input: PricingInput,
  price: number = input.price,
  listing: Listing = input.listing
): number {
  const baseRate = selectedRate(input, listing);
  const roundedPrice = isFiniteNumber(price) ? money(price) : price;
  const eligible =
    input.categoryDiscountEligible === true &&
    roundedPrice >= CATEGORY_DISCOUNT_MIN_PRICE &&
    roundedPrice <= CATEGORY_DISCOUNT_MAX_PRICE;
  if (!eligible) return baseRate;
  return Math.max(0, baseRate - CATEGORY_DISCOUNT_POINTS[listing]);
}

function variablePercent(input: PricingInput, rate: number): number {
  const stateTaxRates = getStateTaxRates(input);
  return (
    rate +
    (input.adsMode === "percent" ? input.ads : 0) +
    input.taxFederal +
    stateTaxRates.icmsSale +
    stateTaxRates.icmsTransfer +
    stateTaxRates.difalPercent +
    input.reservePercent
  );
}

function hasCompleteDimensions(input: PricingInput): boolean {
  return input.length > 0 && input.width > 0 && input.height > 0;
}

function dimensionalWeightFor(input: PricingInput): number {
  return hasCompleteDimensions(input)
    ? (input.length * input.width * input.height) / 6000
    : 0;
}

function isTableEligible(input: PricingInput): boolean {
  return (
    (input.reputation === "green" || input.reputation === "new") &&
    input.condition === "new" &&
    TABLE_LOGISTICS.includes(input.logistic)
  );
}

function priceIndex(price: number): number {
  let index = 0;
  for (let i = 0; i < SHIPPING_PRICE_STARTS.length; i += 1) {
    if (price >= SHIPPING_PRICE_STARTS[i]) index = i;
  }
  return index;
}

function weightIndex(weight: number): number {
  for (let i = 0; i < SHIPPING_WEIGHTS.length; i += 1) {
    if (weight <= SHIPPING_WEIGHTS[i]) return i;
  }
  return SHIPPING_WEIGHTS.length - 1;
}

function decimalLabel(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function weightLabel(index: number): string {
  const upper = SHIPPING_WEIGHTS[index];
  if (index === SHIPPING_WEIGHTS.length - 1)
    return `mais de ${decimalLabel(150)} kg`;
  if (index === 0) return `até ${decimalLabel(upper)} kg`;
  return `${decimalLabel(SHIPPING_WEIGHTS[index - 1])}–${decimalLabel(upper)} kg`;
}

function invalidResult(
  input: PricingInput,
  error: string,
  price: number,
  rate: number,
  dimensionalWeight = 0
): PricingResult {
  const safePrice = isFiniteNumber(price) ? money(price) : 0;
  const safeWeight =
    isFiniteNumber(input?.weight) && input.weight >= 0 ? input.weight : 0;
  const usedWeight = Math.max(safeWeight, dimensionalWeight);
  const pIndex = safePrice > 0 ? priceIndex(safePrice) : 0;
  const wIndex = weightIndex(usedWeight);
  return {
    price: safePrice,
    productCost: 0,
    operation: 0,
    packaging: 0,
    promotion: 0,
    shipping: 0,
    fixedFee: 0,
    commission: 0,
    ads: 0,
    taxes: 0,
    fullExtra: 0,
    reserve: 0,
    profit: 0,
    margin: 0,
    netPayout: 0,
    totalCosts: 0,
    weightUsed: usedWeight,
    dimensionalWeight,
    shippingLabel: "",
    priceBand: SHIPPING_PRICE_LABELS[pIndex],
    weightBand: weightLabel(wIndex),
    warnings: [],
    valid: false,
    error,
    rate: isFiniteNumber(rate) ? rate : 0,
  };
}

export interface PackageInputIssue {
  field: "weight" | "length" | "width" | "height";
  message: string;
}

/** Mesma validação para o formulário, o frete e a busca de preço por margem. */
export function getPackageInputIssues(
  input: PricingInput
): PackageInputIssue[] {
  const issues: PackageInputIssue[] = [];
  if (!isFiniteNumber(input.weight) || input.weight < 0) {
    issues.push({
      field: "weight",
      message:
        "Peso inválido: selecione uma faixa ou informe um peso válido em kg, por exemplo 0,263.",
    });
  }
  const dimensions = [
    { field: "length", label: "comprimento", value: input.length },
    { field: "width", label: "largura", value: input.width },
    { field: "height", label: "altura/espessura", value: input.height },
  ] as const;
  const invalidDimensions = dimensions.filter(
    d => !isFiniteNumber(d.value) || d.value < 0
  );
  if (invalidDimensions.length) {
    for (const d of invalidDimensions)
      issues.push({
        field: d.field,
        message: `Dimensões inválidas: informe ${d.label} do pacote fechado em cm, com um valor válido maior que zero.`,
      });
  } else if (
    (dimensions.some(d => d.value > 0) ||
      input.automaticShippingOnly === true ||
      input.logistic === "full") &&
    !hasCompleteDimensions(input)
  ) {
    const missing = dimensions.filter(d => d.value === 0);
    issues.push({
      field: missing[0].field,
      message: `Dimensões parciais: informe ${missing.map(d => d.label).join(" e ")} do pacote fechado, em cm. Não estimamos a medida que falta.`,
    });
  }
  if (input.logistic === "full" && input.automaticShippingOnly === true) {
    if (!isFiniteNumber(input.weight) || input.weight <= 0 || input.weight > 25)
      issues.push({
        field: "weight",
        message:
          "Full: informe peso físico maior que zero e até 25 kg. O limite não é o peso volumétrico.",
      });
    const overSide = dimensions.find(
      d => isFiniteNumber(d.value) && d.value > 120
    );
    if (overSide)
      issues.push({
        field: overSide.field,
        message:
          "Full: nenhum lado pode superar 120 cm no perfil verificado. Confira a elegibilidade na sua conta.",
      });
    if (
      hasCompleteDimensions(input) &&
      input.length + input.width + input.height > 260
    )
      issues.push({
        field: "height",
        message:
          "Full: a soma de comprimento, largura e altura não pode superar 260 cm no perfil verificado.",
      });
  }
  if (
    input.shippingMode !== "manual" &&
    isTableEligible(input) &&
    input.weight === 0 &&
    !hasCompleteDimensions(input)
  ) {
    issues.push({
      field: "weight",
      message:
        "Peso inválido: selecione uma faixa ou informe o peso do pacote em kg. Sem peso, o envio automático exige as três dimensões completas.",
    });
  }
  return issues;
}

function validateInput(
  input: PricingInput,
  price: number | undefined,
  listing: Listing,
  checkPrice: boolean
): string[] {
  if (!input || typeof input !== "object") return ["Entrada inválida."];

  const candidate = input as PricingInput;
  const errors: string[] = [];
  if (!VALID_COST_MODES.includes(candidate.costMode))
    errors.push("Modo de custo inválido.");
  if (!VALID_ADS_MODES.includes(candidate.adsMode))
    errors.push("Modo de publicidade inválido.");
  if (
    candidate.difalMode !== undefined &&
    !VALID_DIFAL_MODES.includes(candidate.difalMode)
  ) {
    errors.push("Modo de DIFAL inválido.");
  }
  if (
    candidate.useDestinationTaxes !== undefined &&
    typeof candidate.useDestinationTaxes !== "boolean"
  ) {
    errors.push("Modo de impostos por destino inválido.");
  }
  if (
    candidate.useDestinationTaxes === true &&
    candidate.saleDestination !== undefined &&
    !VALID_SALE_DESTINATIONS.includes(candidate.saleDestination)
  ) {
    errors.push("Destino da venda inválido.");
  }
  if (
    !VALID_LISTINGS.includes(candidate.listing) ||
    !VALID_LISTINGS.includes(listing)
  ) {
    errors.push("Tipo de anúncio inválido.");
  }
  if (!VALID_REPUTATIONS.includes(candidate.reputation))
    errors.push("Reputação inválida.");
  if (!VALID_CONDITIONS.includes(candidate.condition))
    errors.push("Condição inválida.");
  if (!VALID_LOGISTICS.includes(candidate.logistic))
    errors.push("Logística inválida.");
  if (!VALID_SHIPPING_MODES.includes(candidate.shippingMode))
    errors.push("Modo de envio inválido.");
  if (
    candidate.categoryDiscountEligible !== undefined &&
    typeof candidate.categoryDiscountEligible !== "boolean"
  ) {
    errors.push("Elegibilidade de desconto por categoria inválida.");
  }
  if (candidate.productType !== "single" && candidate.productType !== "kit") {
    errors.push("Tipo de produto inválido.");
  }

  if (
    candidate.automaticShippingOnly &&
    (candidate.shippingMode === "manual" || !isTableEligible(candidate))
  ) {
    errors.push(
      "Frete automático indisponível para o perfil selecionado. A opção de informar frete manual foi retirada."
    );
  }

  if (candidate.productType === "single") {
    const itemQuantity = candidate.itemQuantity ?? 1;
    if (!Number.isInteger(itemQuantity) || itemQuantity <= 0) {
      errors.push(
        "Quantidade de itens inválida: informe um número inteiro maior que zero."
      );
    }
  } else if (candidate.productType === "kit") {
    errors.push(...getAcquisition(candidate).errors);
  }

  const nonNegative: Array<readonly [string, unknown]> = [
    ["operação", candidate.operation],
    ["embalagem", candidate.packaging],
    ["promoção", candidate.promotion],
    ["publicidade", candidate.ads],
    ["taxa federal", candidate.taxFederal],
    ["comissão clássica", candidate.classicRate],
    ["comissão premium", candidate.premiumRate],
    ["frete manual", candidate.manualShipping],
    ["taxa fixa manual", candidate.manualFixedFee],
    ["limite da taxa fixa", candidate.manualFixedLimit],
    ["extra Full", candidate.fullExtra],
    ["reserva", candidate.reservePercent],
  ];

  if (candidate.productType === "single") {
    if (candidate.costMode === "kg")
      nonNegative.unshift(["produto em kg", candidate.productKg]);
    nonNegative.unshift(["custo", candidate.cost]);
  }

  const stateTaxRates = getStateTaxRates(candidate);
  if (candidate.useDestinationTaxes === true) {
    const outside = candidate.saleDestination === "outside";
    nonNegative.push([
      outside ? "taxa ICMS venda externa" : "taxa ICMS venda interna",
      stateTaxRates.icmsSale,
    ]);
    nonNegative.push(["taxa ICMS transferência", stateTaxRates.icmsTransfer]);
    if (outside) {
      nonNegative.push(
        isDifalRsMode(candidate)
          ? ["valor DIFAL", stateTaxRates.difalFixed]
          : ["taxa DIFAL", stateTaxRates.difalPercent]
      );
    }
  } else {
    nonNegative.push(["taxa ICMS", stateTaxRates.icmsSale]);
    nonNegative.push(
      isDifalRsMode(candidate)
        ? ["valor DIFAL", stateTaxRates.difalFixed]
        : ["taxa DIFAL", stateTaxRates.difalPercent]
    );
  }

  for (const [label, value] of nonNegative) {
    if (!isFiniteNumber(value) || value < 0) errors.push(`${label} inválido.`);
  }

  if (checkPrice && (!isFiniteNumber(price) || (price as number) <= 0)) {
    errors.push("Preço inválido: informe um valor maior que zero.");
  }

  errors.push(...getPackageInputIssues(candidate).map(issue => issue.message));

  if (
    candidate.productType === "single" &&
    candidate.costMode === "kg" &&
    candidate.productKg <= 0
  ) {
    errors.push(
      "Peso do produto inválido para custo por kg: informe quantos kg de mercadoria há em cada item no custo de aquisição."
    );
  }

  const validationRate =
    checkPrice && isFiniteNumber(price)
      ? getCommissionRate(candidate, money(price), listing)
      : selectedRate(candidate, listing);
  const baseVariablePercent = variablePercent(
    candidate,
    selectedRate(candidate, listing)
  );
  const discountedVariablePercent = variablePercent(
    candidate,
    getCommissionRate(candidate, CATEGORY_DISCOUNT_MIN_PRICE, listing)
  );
  const percentageInvalid = variablePercent(candidate, validationRate) >= 100;
  const solverHasEligibleRate =
    candidate.categoryDiscountEligible === true &&
    discountedVariablePercent < 100;
  if (
    percentageInvalid &&
    (checkPrice ||
      (baseVariablePercent >= 100 && !solverHasEligibleRate) ||
      baseVariablePercent < 100)
  ) {
    errors.push("A soma das porcentagens de custos deve ser menor que 100%.");
  }

  return errors;
}

function rawStandardShipping(weight: number, price: number): number {
  const row = weightIndex(weight);
  const column = priceIndex(price);
  return SHIPPING_VALUES[row][column];
}

function resolveShipping(
  input: PricingInput,
  price: number,
  usedWeight: number,
  warnings: string[]
): { shipping: number; fixedFee: number; label: string } {
  const eligible = isTableEligible(input);
  const tableMode = input.shippingMode !== "manual" && eligible;
  const row = weightIndex(usedWeight);

  if (!tableMode) {
    const fixedFee =
      price < input.manualFixedLimit ? money(input.manualFixedFee) : 0;
    warnings.push(
      "Frete: valor manual, fora perfil tabela oficial; confirme a elegibilidade e o valor antes de anunciar."
    );
    if (fixedFee > 0) {
      warnings.push(
        "A taxa fixa manual só foi aplicada abaixo do limite informado; ela não é uma tarifa oficial universal."
      );
    }
    return {
      shipping: money(input.manualShipping),
      fixedFee,
      label: "Frete manual (valor informado; fora do perfil da tabela)",
    };
  }

  if (input.shippingMode === "rapid" && price < 79) {
    if (price < 19) {
      warnings.push(
        "Abaixo de R$19, o custo de envio rápido foi limitado a até metade do preço, conforme a nota da tabela oficial."
      );
    }
    return {
      shipping: money(
        price < 19
          ? Math.min(SHIPPING_RAPID_VALUES[row], price / 2)
          : SHIPPING_RAPID_VALUES[row]
      ),
      fixedFee: 0,
      label: "Frete grátis rápido opcional (tabela própria abaixo de R$79)",
    };
  }

  const column = priceIndex(price);
  const tableValue = SHIPPING_VALUES[row][column];
  const shipping = price < 19 ? Math.min(tableValue, price / 2) : tableValue;
  if (price < 19 && shipping < tableValue) {
    warnings.push(
      "Abaixo de R$19, o envio padrão foi limitado a até metade do preço."
    );
  }

  return {
    shipping: money(shipping),
    fixedFee: 0,
    label:
      input.shippingMode === "rapid" && price >= 79
        ? "Tabela padrão (frete rápido sujeito à elegibilidade a partir de R$79)"
        : "Tabela padrão de envio",
  };
}

/** Calcula os custos e o lucro de um preço, sem alterar o input. */
export function calculate(
  input: PricingInput,
  priceOverride?: number,
  listingOverride?: Listing
): PricingResult {
  const listing = listingOverride ?? input?.listing;
  const price = priceOverride ?? input?.price;
  const roundedPrice = isFiniteNumber(price) ? money(price) : price;
  const rate =
    input && VALID_LISTINGS.includes(listing) && isFiniteNumber(roundedPrice)
      ? getCommissionRate(input, roundedPrice, listing)
      : 0;
  const dimensionsAreComplete = Boolean(input && hasCompleteDimensions(input));
  const dimensionalWeight =
    input && dimensionsAreComplete ? dimensionalWeightFor(input) : 0;
  const errors = validateInput(input, roundedPrice, listing, true);
  if (errors.length > 0)
    return invalidResult(
      input,
      errors[0],
      roundedPrice,
      rate,
      dimensionalWeight
    );

  const actualInput = input as PricingInput;
  const weightUsed = Math.max(actualInput.weight, dimensionalWeight);
  const warnings: string[] = [];

  const baseRate = selectedRate(actualInput, listing);
  const discountPoints = baseRate - rate;
  if (discountPoints > CENT_TOLERANCE) {
    warnings.push(
      `Desconto de comissão aplicado: ${decimalLabel(
        discountPoints
      )} pontos percentuais no anúncio ${
        listing === "premium" ? "Premium" : "Clássico"
      } para preços de R$150 a R$700.`
    );
  }

  if (actualInput.weight === 0 && dimensionalWeight > 0) {
    warnings.push(
      "Peso físico informado como 0; o peso dimensional foi usado. Confirme o peso real da embalagem."
    );
  }
  if (weightUsed > 30) {
    warnings.push(
      "Peso acima de 30 kg: confirme a elegibilidade logística; a tabela foi mantida até a última faixa disponível."
    );
  }
  warnings.push(
    "Valor de envio estimado; não é garantia do custo final. A medição real da embalagem pode ajustar o valor."
  );

  const productCost = getAcquisition(actualInput).total;
  const operation = money(actualInput.operation);
  const packaging = money(actualInput.packaging);
  const promotion = money(actualInput.promotion);
  const shippingDetails = resolveShipping(
    actualInput,
    roundedPrice,
    weightUsed,
    warnings
  );
  const shipping = money(shippingDetails.shipping);
  const fixedFee = money(shippingDetails.fixedFee);
  const commission = money(roundedPrice * percent(rate));
  const ads = money(
    actualInput.adsMode === "percent"
      ? roundedPrice * percent(actualInput.ads)
      : actualInput.ads
  );
  const stateTaxRates = getStateTaxRates(actualInput);
  const taxes = money(
    roundedPrice *
      percent(
        actualInput.taxFederal +
          stateTaxRates.icmsSale +
          stateTaxRates.icmsTransfer +
          stateTaxRates.difalPercent
      ) +
      stateTaxRates.difalFixed
  );
  const fullExtra =
    actualInput.logistic === "full" ? money(actualInput.fullExtra) : 0;
  const reserve = money(roundedPrice * percent(actualInput.reservePercent));
  const totalCosts = money(
    productCost +
      operation +
      packaging +
      promotion +
      shipping +
      fixedFee +
      commission +
      ads +
      taxes +
      fullExtra +
      reserve
  );
  const profit = money(roundedPrice - totalCosts);
  const margin = roundedPrice > 0 ? (profit / roundedPrice) * 100 : 0;
  const netPayout = money(roundedPrice - commission - shipping - fixedFee);
  const pIndex = priceIndex(roundedPrice);
  const wIndex = weightIndex(weightUsed);

  return {
    price: roundedPrice,
    productCost,
    operation,
    packaging,
    promotion,
    shipping,
    fixedFee,
    commission,
    ads,
    taxes,
    fullExtra,
    reserve,
    profit,
    margin,
    netPayout,
    totalCosts,
    weightUsed,
    dimensionalWeight,
    shippingLabel: shippingDetails.label,
    priceBand: SHIPPING_PRICE_LABELS[pIndex],
    weightBand: weightLabel(wIndex),
    warnings,
    valid: true,
    rate,
  };
}

function isHalfPriceShippingCapActive(
  input: PricingInput,
  price: number,
  usedWeight: number
): boolean {
  if (input.shippingMode === "manual" || !isTableEligible(input) || price >= 19)
    return false;
  const tableValue =
    input.shippingMode === "rapid"
      ? SHIPPING_RAPID_VALUES[weightIndex(usedWeight)]
      : rawStandardShipping(usedWeight, price);
  return price / 2 < tableValue - CENT_TOLERANCE;
}

function ceilCent(value: number): number {
  return Math.ceil(value * 100 - CENT_TOLERANCE);
}

function solverBoundaries(input: PricingInput): number[] {
  const boundaries = new Set<number>([1]);
  for (const start of SHIPPING_PRICE_STARTS) {
    const cents = Math.round(start * 100);
    if (cents >= 1) boundaries.add(cents);
  }
  if (input.categoryDiscountEligible === true) {
    boundaries.add(CATEGORY_DISCOUNT_MIN_PRICE * 100);
    boundaries.add(CATEGORY_DISCOUNT_MAX_PRICE * 100 + 1);
  }
  // Abaixo de R$19, o envio padrão é limitado a metade do preço somente
  // enquanto P/2 for menor que a tarifa da tabela. Essa mudança é uma quebra
  // interna à primeira faixa e precisa ser tratada como descontinuidade do
  // solver; amostrar só em R$0,01 pode deixar a fórmula com denominador <= 0
  // e fazer o solver pular a parte posterior da faixa.
  if (input.shippingMode !== "manual" && isTableEligible(input)) {
    const dimensionalWeight = dimensionalWeightFor(input);
    const usedWeight = Math.max(input.weight, dimensionalWeight);
    const row = weightIndex(usedWeight);
    const tableValue =
      input.shippingMode === "rapid"
        ? SHIPPING_RAPID_VALUES[row]
        : SHIPPING_VALUES[row][0];
    const capEnd = Math.ceil(2 * tableValue * 100 - CENT_TOLERANCE);
    if (capEnd >= 1 && capEnd < 19 * 100) boundaries.add(capEnd);
  }
  if (input.manualFixedFee > 0 && input.manualFixedLimit > 0) {
    boundaries.add(
      Math.max(1, Math.ceil(input.manualFixedLimit * 100 - CENT_TOLERANCE))
    );
  }
  return [...boundaries].sort((a, b) => a - b);
}

function addCandidateCents(
  target: Set<number>,
  center: number,
  low: number,
  high: number
): void {
  const first = Math.max(low, center - 120);
  const last = Math.min(high, center + 120);
  for (let cents = first; cents <= last; cents += 1) target.add(cents);
}

/**
 * Encontra o menor preço em centavos que atinge a margem alvo. Cada faixa de
 * preço é resolvida separadamente para não atravessar saltos de frete/taxa.
 */
export function solveTarget(
  input: PricingInput,
  targetMargin: number,
  listingOverride?: Listing
): SolveTargetResult {
  if (!isFiniteNumber(targetMargin)) {
    return { price: null, result: null, error: "Margem alvo inválida." };
  }
  if (!input || typeof input !== "object") {
    return { price: null, result: null, error: "Entrada inválida." };
  }

  const listing = listingOverride ?? input.listing;
  const baseErrors = validateInput(input, 1, listing, false);
  const costError = baseErrors.find(error =>
    /^(?:custo|produto em kg) inválido\./i.test(error)
  );
  if (costError) return { price: null, result: null, error: "Custo inválido." };
  if (baseErrors.length > 0) {
    return { price: null, result: null, error: baseErrors[0] };
  }

  const boundaries = solverBoundaries(input);
  const solutions: PricingResult[] = [];
  const dimensionalWeight = dimensionalWeightFor(input);
  const usedWeight = Math.max(input.weight, dimensionalWeight);
  let hasPositiveDenominator = false;

  for (let index = 0; index < boundaries.length; index += 1) {
    const lowCents = boundaries[index];
    const nextBoundary = boundaries[index + 1];
    const highCents =
      nextBoundary === undefined ? Number.MAX_SAFE_INTEGER : nextBoundary - 1;
    if (highCents < lowCents) continue;

    const samplePrice = lowCents / 100;
    const sample = calculate(input, samplePrice, listing);
    if (!sample.valid) continue;

    let fixedBase =
      sample.productCost +
      sample.operation +
      sample.packaging +
      sample.promotion +
      sample.fullExtra +
      (input.adsMode === "rs" ? sample.ads : 0) +
      sample.fixedFee;
    fixedBase += getStateTaxRates(input).difalFixed;
    let shippingSlope = 0;
    if (isHalfPriceShippingCapActive(input, samplePrice, usedWeight)) {
      shippingSlope = 0.5;
    } else {
      fixedBase += sample.shipping;
    }

    const variablePct = variablePercent(input, sample.rate);
    const variableRate = percent(variablePct + targetMargin);
    const denominator = 1 - variableRate - shippingSlope;
    if (denominator > 0) hasPositiveDenominator = true;
    if (denominator <= 0) {
      // A fórmula contínua pode ficar sem denominador positivo por causa do
      // teto P/2. Ainda assim, o arredondamento em centavos pode gerar uma
      // solução em preços muito baixos (por exemplo, custo zero). Como esta
      // faixa é limitada a R$18,99, a varredura completa é pequena e evita
      // perder esse caso sem fazer busca global.
      const boundedHigh = Math.min(highCents, 19 * 100 - 1);
      for (let cents = lowCents; cents <= boundedHigh; cents += 1) {
        const result = calculate(input, cents / 100, listing);
        if (result.valid && result.margin + CENT_TOLERANCE >= targetMargin) {
          solutions.push(result);
          break;
        }
      }
      continue;
    }

    const analytical = fixedBase / denominator;
    let center = Number.isFinite(analytical) ? ceilCent(analytical) : lowCents;
    if (center < lowCents) center = lowCents;
    if (center > highCents) center = highCents;

    const candidates = new Set<number>();
    addCandidateCents(candidates, center, lowCents, highCents);
    candidates.add(lowCents);
    if (highCents !== Number.MAX_SAFE_INTEGER) candidates.add(highCents);

    const ordered = [...candidates].sort((a, b) => a - b);
    for (const cents of ordered) {
      const candidatePrice = cents / 100;
      const result = calculate(input, candidatePrice, listing);
      if (!result.valid) continue;
      // A result that is below the target after all component rounding is never
      // accepted, even if the unrounded analytical expression passed.
      if (result.margin + CENT_TOLERANCE < targetMargin) continue;
      solutions.push(result);
      // The ordered local scan makes the first passing candidate the minimum in
      // this segment; no global binary search crosses a discontinuity.
      break;
    }
  }

  if (solutions.length === 0) {
    return {
      price: null,
      result: null,
      error: hasPositiveDenominator
        ? "Não foi possível encontrar um preço que atinja a margem alvo nas faixas disponíveis."
        : "A soma das porcentagens de custos e da margem alvo deve ser menor que 100%.",
    };
  }

  solutions.sort((a, b) => a.price - b.price);
  const best = solutions[0];
  if (best.margin + CENT_TOLERANCE < targetMargin) {
    return {
      price: null,
      result: null,
      error:
        "O preço calculado ficou abaixo da margem alvo após o arredondamento.",
    };
  }
  return { price: best.price, result: best };
}
