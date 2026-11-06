import type { PricingInput } from "./pricing";
import type { ProductReportRecord, ScenarioOptionSets } from "./decisionReport";

export const ALPHA_REPUTATION = "green" as const;
export const ALPHA_LOGISTIC = "agency" as const;
export const ALPHA_PROFILE_LABEL = "Verde · Agência";
export const ALPHA_LOGISTICS = [ALPHA_LOGISTIC] as const;
export const ALPHA_COMPACT_MARGINS = [10, 15, 20, 25] as const;

export function isAlphaProfile(
  input: Pick<PricingInput, "reputation" | "logistic">
): boolean {
  return (
    input.reputation === ALPHA_REPUTATION && input.logistic === ALPHA_LOGISTIC
  );
}

/** Projection only: callers must not persist this over a saved product implicitly. */
export function alphaProfileInput(input: PricingInput): PricingInput {
  return { ...input, reputation: ALPHA_REPUTATION, logistic: ALPHA_LOGISTIC };
}

export function alphaScenarioOptions(
  margins?: readonly number[]
): ScenarioOptionSets {
  return {
    logistics: [ALPHA_LOGISTIC],
    reputations: [ALPHA_REPUTATION],
    ...(margins ? { margins } : {}),
  };
}

/** Drop stale calculation snapshots only on this temporary comparison copy. */
export function alphaComparisonRecord(
  record: ProductReportRecord
): ProductReportRecord {
  const { snapshot: _snapshot, ...rest } = record;
  return { ...rest, input: alphaProfileInput(record.input), resultPrice: null };
}
