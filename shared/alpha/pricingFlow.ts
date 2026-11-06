import {
  calculate,
  solveTarget,
  type PricingInput,
  type PricingResult,
  type SolveTargetResult,
} from "./pricing";

export type PricingMode = "target" | "sale";

export interface PricingFlowResult {
  target: SolveTargetResult;
  result: PricingResult;
  mode: PricingMode;
}

const TARGET_GOAL_ERROR = "Informe uma margem maior que 0 e menor que 100%.";

/**
 * Resolve o fluxo de precificação sem alterar a entrada nem manter estado.
 *
 * O resultado de `target` é sempre calculado para que consumidores que exibem
 * a sugestão possam usá-lo também quando o resultado principal é uma venda
 * manual. No modo `target`, uma falha nunca reaproveita o preço digitado:
 * devolvemos um PricingResult inválido, com preço zero e o erro do solver.
 */
export function resolvePricingFlow(
  input: PricingInput,
  mode: PricingMode,
  goal: number
): PricingFlowResult {
  const target = solveTarget(input, goal);

  if (mode === "sale") {
    return {
      target,
      result: calculate(input),
      mode,
    };
  }

  if (!Number.isFinite(goal) || goal <= 0 || goal >= 100) {
    const invalid = calculate(input, 0);
    const invalidTarget: SolveTargetResult = {
      price: null,
      result: null,
      error: TARGET_GOAL_ERROR,
    };
    return {
      target: invalidTarget,
      result: {
        ...invalid,
        price: 0,
        valid: false,
        error: invalidTarget.error,
        warnings: [],
      },
      mode: "target",
    };
  }

  if (target.result !== null) {
    return {
      target,
      result: target.result,
      mode: "target",
    };
  }

  // calculate(input, 0) fornece um PricingResult completo e mantém todos os
  // metadados calculados pelo motor. Em uma falha do alvo, porém, o preço
  // digitado não pode reaparecer como se fosse uma venda válida.
  const invalid = calculate(input, 0);
  return {
    target,
    result: {
      ...invalid,
      price: 0,
      valid: false,
      error: target.error,
      warnings: [],
    },
    mode: "target",
  };
}
