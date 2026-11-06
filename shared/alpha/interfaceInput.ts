import type { PricingInput } from "./pricing";
import { DESTINATION_TAX_DEFAULTS } from "./destinationTaxes";

const AUTOMATIC_SHIPPING_REPUTATIONS: readonly string[] = ["green", "new"];
const AUTOMATIC_SHIPPING_LOGISTICS: readonly string[] = [
  "agency",
  "collection",
  "full",
];
type InterfaceInput = PricingInput & { automaticShippingOnly?: boolean };

/**
 * Normaliza entradas carregadas pela interface sem mutar o snapshot bruto.
 *
 * A interface atual sempre trabalha com produto novo, envio automático, o
 * perfil de impostos por destino e sem ofertas, reserva ou desconto de
 * categoria. Entradas já nesse formato são devolvidas por identidade; toda
 * migração necessária cria uma cópia rasa e preserva os demais campos.
 */
export function normalizeInterfaceInput(input: PricingInput): PricingInput {
  const interfaceInput = input as InterfaceInput;
  const hasLegacyCostMode = input?.costMode === "kg";
  const hasLegacyShippingMode = input?.shippingMode === "manual";
  const hasAutomaticShippingOnly =
    interfaceInput?.automaticShippingOnly === true;
  const hasDestinationTaxProfile = input?.useDestinationTaxes === true;
  const hasCurrentRemovedFields =
    input?.categoryDiscountEligible === false &&
    input?.promotion === 0 &&
    input?.reservePercent === 0;

  if (
    hasAutomaticShippingOnly &&
    !hasLegacyCostMode &&
    !hasLegacyShippingMode &&
    input.condition === "new" &&
    hasDestinationTaxProfile &&
    hasCurrentRemovedFields &&
    input.adsMode === "rs" &&
    (input.shippingMode === "auto" || input.shippingMode === "rapid")
  ) {
    return input;
  }

  const normalized = {
    ...input,
    condition: "new",
    automaticShippingOnly: true,
    adsMode: "rs",
    useDestinationTaxes: true,
    categoryDiscountEligible: false,
    promotion: 0,
    reservePercent: 0,
    saleDestination:
      input.saleDestination ?? DESTINATION_TAX_DEFAULTS.saleDestination,
    taxIcmsInside:
      input.taxIcmsInside ?? DESTINATION_TAX_DEFAULTS.taxIcmsInside,
    taxIcmsOutside:
      input.taxIcmsOutside ?? DESTINATION_TAX_DEFAULTS.taxIcmsOutside,
    taxIcmsTransfer:
      input.taxIcmsTransfer ?? DESTINATION_TAX_DEFAULTS.taxIcmsTransfer,
    // A GUI legada tinha um único campo percentual de DIFAL. O preset novo
    // começa em 16%; um perfil já migrado preserva inclusive o modo privado
    // em reais para históricos e carregamentos antigos.
    difalMode: hasDestinationTaxProfile
      ? (input.difalMode ?? "percent")
      : "percent",
    taxDifal: hasDestinationTaxProfile ? (input.taxDifal ?? 16) : 16,
  } as PricingInput;

  if (hasLegacyCostMode) {
    const productKg = input.productKg;
    normalized.cost =
      Number.isFinite(productKg) && productKg > 0
        ? input.cost * productKg
        : Number.NaN;
    normalized.costMode = "unit";
    normalized.productKg = 1;
  }

  if (hasLegacyShippingMode) normalized.shippingMode = "auto";

  return normalized;
}

/**
 * Retorna se a entrada pertence ao mesmo perfil usado pela tabela automática
 * do motor: reputação verde ou nova, condição nova e logística suportada.
 */
export function isAutomaticShippingSupported(input: PricingInput): boolean {
  if (!input || typeof input !== "object") return false;

  return (
    AUTOMATIC_SHIPPING_REPUTATIONS.includes(input.reputation) &&
    input.condition === "new" &&
    AUTOMATIC_SHIPPING_LOGISTICS.includes(input.logistic)
  );
}

/**
 * Indica se uma entrada ainda contém algum modo ou condição removida da
 * interface.
 */
export function removedInputModes(input: PricingInput): boolean {
  return (
    input?.costMode === "kg" ||
    input?.shippingMode === "manual" ||
    input?.condition === "used" ||
    input?.adsMode === "percent"
  );
}

const COST_MODE_MIGRATION_NOTICE =
  "O custo por quilo foi convertido para custo por item, preservando a quantidade de itens.";
const SHIPPING_MODE_MIGRATION_NOTICE =
  "O valor de frete informado foi preservado nos dados, mas o modo manual foi trocado pelo envio automático.";
const CONDITION_MIGRATION_NOTICE =
  "A condição do produto foi alterada para Novo para usar a tabela de frete automático.";
const DESTINATION_TAX_MIGRATION_NOTICE =
  "Os impostos estaduais foram reorganizados por destino; confira venda, transferência e DIFAL no perfil da simulação.";
const REMOVED_COSTS_MIGRATION_NOTICE =
  "Ofertas e reserva anteriores foram removidas do cálculo da interface.";
const DISCOUNT_MIGRATION_NOTICE =
  "O desconto por categoria foi removido da interface; confira as comissões.";
const ADVERTISING_MIGRATION_NOTICE =
  "Publicidade corrigida para reais por venda, mantendo o número informado. Confira o valor; a simulação foi recalculada sem alterar o registro original.";

function isNonZeroFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

/**
 * Descreve as mudanças feitas entre uma entrada legada e sua forma atual.
 * Retorna null quando não houve migração de modo removido ou de campo da
 * interface. O aviso é somente leitura e não modifica nenhum snapshot.
 */
export function getInterfaceMigrationNotice(
  before: PricingInput,
  after: PricingInput
): string | null {
  const costModeMigrated =
    before?.costMode === "kg" && after?.costMode === "unit";
  const shippingModeMigrated =
    before?.shippingMode === "manual" && after?.shippingMode !== "manual";
  const conditionMigrated =
    before?.condition === "used" && after?.condition === "new";
  const destinationTaxMigrated =
    before?.useDestinationTaxes !== true &&
    after?.useDestinationTaxes === true &&
    // Keep the focused legacy condition notice stable when no tax value was
    // present in an old used-product snapshot.
    before?.condition !== "used";
  const removedCostsMigrated =
    after?.promotion === 0 &&
    after?.reservePercent === 0 &&
    (isNonZeroFinite(before?.promotion) ||
      isNonZeroFinite(before?.reservePercent));
  const discountMigrated =
    before?.categoryDiscountEligible === true &&
    after?.categoryDiscountEligible === false;
  const notices: string[] = [];

  if (costModeMigrated) notices.push(COST_MODE_MIGRATION_NOTICE);
  if (shippingModeMigrated) notices.push(SHIPPING_MODE_MIGRATION_NOTICE);
  if (conditionMigrated) notices.push(CONDITION_MIGRATION_NOTICE);
  if (destinationTaxMigrated) notices.push(DESTINATION_TAX_MIGRATION_NOTICE);
  if (removedCostsMigrated) notices.push(REMOVED_COSTS_MIGRATION_NOTICE);
  if (discountMigrated) notices.push(DISCOUNT_MIGRATION_NOTICE);
  if (before?.adsMode === "percent" && after?.adsMode === "rs")
    notices.push(ADVERTISING_MIGRATION_NOTICE);

  return notices.length > 0 ? notices.join(" ") : null;
}
