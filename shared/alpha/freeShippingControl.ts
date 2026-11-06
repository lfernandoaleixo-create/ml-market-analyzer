import type { PricingInput, PricingResult } from "./pricing";
import { isAutomaticShippingSupported } from "./interfaceInput";
import { resolvePricingFlow, type PricingMode } from "./pricingFlow";

export const MANDATORY_FREE_SHIPPING_CHOICE_REASON =
  "Sem frete grátis não é permitido: o preço calculado é a partir de R$79 e este perfil exige frete grátis. Escolha Com frete grátis.";
export const FREE_SHIPPING_RULE_URL =
  "https://www.mercadolivre.com.br/ajuda/custos-envio-reputacao-verde-mercado-lider_40538";

export interface FreeShippingControlState {
  kind: "optional" | "mandatory" | "unavailable";
  checked: boolean;
  mandatory: boolean;
  canToggle: boolean;
  reason: string;
  without: PricingResult;
  withFree: PricingResult;
  sameCost: boolean;
}

export function mandatoryFreeShippingChoiceReason(
  input: PricingInput,
  result: Pick<PricingResult, "valid" | "price">
): string | undefined {
  if (result.valid && result.price >= 79 && isAutomaticShippingSupported(input))
    return MANDATORY_FREE_SHIPPING_CHOICE_REASON;
  return undefined;
}

export function freeShippingControlState(
  input: PricingInput,
  without: PricingResult,
  withFree: PricingResult
): FreeShippingControlState {
  const requested = input.shippingMode === "rapid";
  const common = {
    without,
    withFree,
    sameCost:
      without.valid &&
      withFree.valid &&
      without.shipping === withFree.shipping &&
      without.price === withFree.price,
  };
  if (!isAutomaticShippingSupported(input))
    return {
      ...common,
      kind: "unavailable",
      checked: requested,
      mandatory: false,
      canToggle: false,
      reason:
        "Este perfil de reputação/envio não possui cotação automática. Não é possível comparar as opções.",
    };
  if (!without.valid || !withFree.valid)
    return {
      ...common,
      kind: "unavailable",
      checked: requested,
      mandatory: false,
      canToggle: false,
      reason:
        without.error ??
        withFree.error ??
        "Preencha os dados válidos do produto para verificar as opções de frete.",
    };
  if (mandatoryFreeShippingChoiceReason(input, without))
    return {
      ...common,
      kind: "mandatory",
      checked: true,
      mandatory: true,
      canToggle: false,
      reason:
        "Frete grátis obrigatório a partir de R$79 neste perfil. Não há alternativa sem frete grátis para este preço.",
    };
  return {
    ...common,
    kind: "optional",
    checked: requested,
    mandatory: false,
    canToggle: true,
    reason: common.sameCost
      ? "A regra desta faixa resulta no mesmo custo nas duas opções; não há diferença artificial de preço."
      : "Abaixo de R$79 sem a oferta, você pode comparar as duas tarifas e seus preços.",
  };
}

/** Reuse the current result, and resolve only the other shipping alternative. */
export function evaluateFreeShippingControl(
  input: PricingInput,
  mode: PricingMode,
  goal: number,
  current: PricingResult
): FreeShippingControlState {
  const without =
    input.shippingMode === "auto"
      ? current
      : resolvePricingFlow({ ...input, shippingMode: "auto" }, mode, goal)
          .result;
  const withFree =
    input.shippingMode === "rapid"
      ? current
      : resolvePricingFlow({ ...input, shippingMode: "rapid" }, mode, goal)
          .result;
  return freeShippingControlState(input, without, withFree);
}

export function optionalShippingMode(enabled: boolean): "auto" | "rapid" {
  return enabled ? "rapid" : "auto";
}

export function canApplyShippingScenario(
  evaluation: { valid: boolean; blockedChoice?: boolean } | undefined
): boolean {
  return (
    evaluation !== undefined &&
    evaluation.valid &&
    evaluation.blockedChoice !== true
  );
}
