import {
  calculate,
  getAcquisition,
  money,
  solveTarget,
  type KitItem,
  type Listing,
  type Logistic,
  type PricingInput,
  type PricingResult,
  type Reputation,
  type ShippingMode,
} from "./pricing";
import type { SaleDestination } from "./destinationTaxes";
import { SHIPPING_CHECKED_AT } from "./tariffs";
import { mandatoryFreeShippingChoiceReason } from "./freeShippingControl";

export type ReportMode = "target" | "sale";
export type MatrixDestination = SaleDestination;
export type MatrixListing = Listing;
export type MatrixLogistic = Logistic;
export type MatrixReputation = Reputation | (string & {});
export type MatrixShippingMode = Extract<ShippingMode, "auto" | "rapid">;

/** The explicit fixed advertising amounts used by the full audit matrix. */
export const DEFAULT_MATRIX_ADS_AMOUNTS = [2, 4, 6, 8] as const;
/** @deprecated Use DEFAULT_MATRIX_ADS_AMOUNTS. Values are reais, not percentages. */
export const DEFAULT_MATRIX_ADS_PERCENTAGES = DEFAULT_MATRIX_ADS_AMOUNTS;
export const DEFAULT_MATRIX_DESTINATIONS = ["inside", "outside"] as const;
export const DEFAULT_MATRIX_LISTINGS = ["classic", "premium"] as const;
export const DEFAULT_MATRIX_MARGINS = [10, 15, 20, 25, 30] as const;
export const DEFAULT_MATRIX_LOGISTICS = [
  "agency",
  "collection",
  "full",
  "flex",
  "other",
] as const;
export const DEFAULT_MATRIX_REPUTATIONS = [
  "green",
  "new",
  "yellow",
  "red",
] as const;
export const DEFAULT_MATRIX_SHIPPING_MODES = ["auto", "rapid"] as const;

/** Names of the optional offer; mandatory marketplace rules still apply. */
export const MATRIX_SHIPPING_LABELS: Record<MatrixShippingMode, string> = {
  auto: "Sem frete grátis",
  rapid: "Com frete grátis",
};

export const MATRIX_OPTION_COUNTS = {
  ads: DEFAULT_MATRIX_ADS_AMOUNTS.length,
  destinations: DEFAULT_MATRIX_DESTINATIONS.length,
  listings: DEFAULT_MATRIX_LISTINGS.length,
  margins: DEFAULT_MATRIX_MARGINS.length,
  logistics: DEFAULT_MATRIX_LOGISTICS.length,
  reputations: DEFAULT_MATRIX_REPUTATIONS.length,
  shippingModes: DEFAULT_MATRIX_SHIPPING_MODES.length,
} as const;

export const DEFAULT_MATRIX_SCENARIO_COUNT =
  MATRIX_OPTION_COUNTS.ads *
  MATRIX_OPTION_COUNTS.destinations *
  MATRIX_OPTION_COUNTS.listings *
  MATRIX_OPTION_COUNTS.margins *
  MATRIX_OPTION_COUNTS.logistics *
  MATRIX_OPTION_COUNTS.shippingModes;

/** Four-reputation audit is available only when the caller asks for it. */
export const FULL_MATRIX_SCENARIO_COUNT =
  DEFAULT_MATRIX_SCENARIO_COUNT * MATRIX_OPTION_COUNTS.reputations;

export interface ProductReportRecordInput extends Record<string, unknown> {
  input: PricingInput;
  mode: ReportMode;
  goal: number;
  resultPrice?: number | null;
  at?: string | Date | number;
  id?: string;
  snapshot?: unknown;
}

/**
 * A persisted report keeps the original input and optional raw calculation
 * snapshot. Unknown fields are intentionally retained for existingSaved and
 * future history records.
 */
export interface ProductReportRecord extends Record<string, unknown> {
  id: string;
  at: string;
  input: PricingInput;
  mode: ReportMode;
  goal: number;
  resultPrice: number | null;
  snapshot?: unknown;
}

export interface ReportResolution {
  input: PricingInput;
  result: PricingResult;
  price: number | null;
  valid: boolean;
  reason?: string;
  source: "snapshot" | "calculated";
  snapshot?: unknown;
}

export interface ScenarioMatrixResult {
  id: string;
  /** Fixed advertising cost in reais per sale/KIT. */
  adsAmount: number;
  /** @deprecated API alias for adsAmount; it is not a percentage. */
  adsPercent: number;
  destination: MatrixDestination;
  listing: MatrixListing;
  marginGoal: number;
  logistic: MatrixLogistic;
  reputation: MatrixReputation;
  shippingMode: MatrixShippingMode;
  taxRegime: "destination" | "legacy";
  input: PricingInput;
  price: number | null;
  result: PricingResult | null;
  shipping: number | null;
  valid: boolean;
  reason?: string;
}
export type ScenarioResult = ScenarioMatrixResult;

export interface ScenarioOptionSets {
  adsAmounts?: readonly number[];
  /** @deprecated Values are interpreted as fixed reais amounts. */
  adsPercentages?: readonly number[];
  /** Alias accepted by callers that model the axes as `ads`. */
  ads?: readonly number[];
  destinations?: readonly MatrixDestination[];
  listings?: readonly MatrixListing[];
  margins?: readonly number[];
  logistics?: readonly MatrixLogistic[];
  reputations?: readonly MatrixReputation[];
  shippingModes?: readonly MatrixShippingMode[];
}

export interface ScenarioMatrixOptions extends ScenarioOptionSets {
  /** A smaller set is useful for UI previews and deterministic unit tests. */
  optionSets?: ScenarioOptionSets;
  yieldEvery?: number;
  cache?: Map<string, ScenarioEvaluation>;
}

export type ScenarioProgressCallback = (
  completed: number,
  total: number
) => void;

interface ScenarioEvaluation {
  price: number | null;
  result: PricingResult | null;
  shipping: number | null;
  valid: boolean;
  reason?: string;
}

export interface FlowNode {
  id: string;
  stage: string;
  label: string;
  selected: boolean;
  kind: "fixed" | "choice" | "result";
}

export interface FlowEdge {
  from: string;
  to: string;
  selected: boolean;
}

export interface FlowSource {
  format: "json";
  checkedAt: string;
  nodes: readonly FlowNode[];
  edges: readonly FlowEdge[];
  legend: readonly { key: string; label: string; color: string }[];
  mermaid: string;
}

const MONEY_EPSILON = 1e-9;
const VALID_REPUTATIONS = new Set<string>(DEFAULT_MATRIX_REPUTATIONS);
const VALID_LOGISTICS = new Set<string>(DEFAULT_MATRIX_LOGISTICS);
const VALID_LISTINGS = new Set<string>(DEFAULT_MATRIX_LISTINGS);
const VALID_DESTINATIONS = new Set<string>(DEFAULT_MATRIX_DESTINATIONS);
const VALID_SHIPPING_MODES = new Set<string>(DEFAULT_MATRIX_SHIPPING_MODES);

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // The small recursive fallback preserves values such as NaN in old
      // browsers where structuredClone cannot clone an application object.
    }
  }
  if (Array.isArray(value)) return value.map(item => cloneValue(item)) as T;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source)) result[key] = cloneValue(source[key]);
  return result as T;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    const child = object[key];
    if (child && typeof child === "object" && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }
  return Object.freeze(value);
}

function normalizeAt(value: string | Date | number | undefined): string {
  if (value === undefined) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeResultPrice(value: unknown): number | null {
  return finite(value) && value > 0 ? money(value) : null;
}

/** Creates a history record without mutating any caller-owned object. */
export function createProductReportRecord<T extends ProductReportRecordInput>(
  raw: T
): ProductReportRecord & T {
  const at = normalizeAt(raw.at);
  const id = raw.id === undefined || raw.id === "" ? at : String(raw.id);
  const copy = cloneValue({
    ...raw,
    id,
    at,
    input: raw.input,
    resultPrice: normalizeResultPrice(raw.resultPrice),
  }) as ProductReportRecord & T;
  return deepFreeze(copy);
}

/** Alias kept for callers that use the report-builder naming convention. */
export const buildProductReportRecord = createProductReportRecord;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function resultFromSnapshot(snapshot: unknown): PricingResult | null {
  const candidate =
    isRecord(snapshot) && isRecord(snapshot.result)
      ? snapshot.result
      : snapshot;
  if (!isRecord(candidate)) return null;
  if (typeof candidate.valid !== "boolean" || !finite(candidate.price)) {
    return null;
  }
  // A valid persisted result must retain the values required by the report.
  // Invalid old snapshots are intentionally not turned into a fake R$0 result.
  if (candidate.valid && candidate.price <= 0) return null;
  return cloneValue(candidate) as unknown as PricingResult;
}

/** Resolve an exact persisted snapshot first, then calculate from the record. */
export function resolveProductReport(
  record: ProductReportRecord
): ReportResolution {
  const input = cloneValue(record.input);
  const snapshotResult = resultFromSnapshot(record.snapshot);
  if (snapshotResult) {
    return {
      input,
      result: snapshotResult,
      price: snapshotResult.valid
        ? normalizeResultPrice(snapshotResult.price)
        : null,
      valid: snapshotResult.valid,
      reason: snapshotResult.valid ? undefined : snapshotResult.error,
      source: "snapshot",
      snapshot: cloneValue(record.snapshot),
    };
  }

  if (record.mode === "target") {
    const target = solveTarget(input, record.goal, input.listing);
    if (target.result && target.price !== null && target.result.valid) {
      return {
        input,
        result: target.result,
        price: normalizeResultPrice(target.price),
        valid: true,
        source: "calculated",
      };
    }
    const invalid = calculate(input, 0, input.listing);
    return {
      input,
      result: invalid,
      price: null,
      valid: false,
      reason: target.error ?? invalid.error,
      source: "calculated",
    };
  }

  const price =
    normalizeResultPrice(record.resultPrice) ??
    normalizeResultPrice(input.price);
  if (price !== null) {
    const sale = calculate(input, price, input.listing);
    return {
      input,
      result: sale,
      price: sale.valid ? price : null,
      valid: sale.valid,
      reason: sale.valid ? undefined : sale.error,
      source: "calculated",
    };
  }
  const invalid = calculate(input, 0, input.listing);
  return {
    input,
    result: invalid,
    price: null,
    valid: false,
    reason: "Preço da venda não informado.",
    source: "calculated",
  };
}

interface NormalizedScenarioOptionSets {
  adsAmounts: readonly number[];
  destinations: readonly MatrixDestination[];
  listings: readonly MatrixListing[];
  margins: readonly number[];
  logistics: readonly MatrixLogistic[];
  reputations: readonly MatrixReputation[];
  shippingModes: readonly MatrixShippingMode[];
}

function normalizedOptions(
  options: ScenarioMatrixOptions = {},
  input?: PricingInput
): NormalizedScenarioOptionSets {
  const source = { ...(options.optionSets ?? {}), ...options };
  const values = <T>(
    candidate: readonly T[] | undefined,
    fallback: readonly T[]
  ): readonly T[] => (candidate && candidate.length > 0 ? candidate : fallback);
  return {
    adsAmounts: values(
      source.adsAmounts ?? source.adsPercentages ?? source.ads,
      DEFAULT_MATRIX_ADS_AMOUNTS
    ),
    destinations: values(source.destinations, DEFAULT_MATRIX_DESTINATIONS),
    listings: values(source.listings, DEFAULT_MATRIX_LISTINGS),
    margins: values(source.margins, DEFAULT_MATRIX_MARGINS),
    logistics: values(source.logistics, DEFAULT_MATRIX_LOGISTICS),
    // The selected profile is a fixed root input for the normal report. The
    // four-profile comparison remains possible through an explicit axis.
    reputations: values(
      source.reputations,
      input ? [input.reputation] : [DEFAULT_MATRIX_REPUTATIONS[0]]
    ),
    shippingModes: values(source.shippingModes, DEFAULT_MATRIX_SHIPPING_MODES),
  };
}

export function getScenarioMatrixCount(
  input?: PricingInput,
  options?: ScenarioMatrixOptions
): number;
export function getScenarioMatrixCount(options?: ScenarioMatrixOptions): number;
export function getScenarioMatrixCount(
  inputOrOptions: PricingInput | ScenarioMatrixOptions = {},
  suppliedOptions: ScenarioMatrixOptions = {}
): number {
  const isInput =
    "productType" in inputOrOptions && "kitItems" in inputOrOptions;
  const input = isInput ? (inputOrOptions as PricingInput) : undefined;
  const options = isInput
    ? suppliedOptions
    : (inputOrOptions as ScenarioMatrixOptions);
  const selected = normalizedOptions(options, input);
  return (
    selected.adsAmounts.length *
    selected.destinations.length *
    selected.listings.length *
    selected.margins.length *
    selected.logistics.length *
    selected.reputations.length *
    selected.shippingModes.length
  );
}

function fixedDifal(input: PricingInput): number {
  return finite(input.taxDifal) ? input.taxDifal : 16;
}

type ScenarioInputChoices = Pick<
  ScenarioMatrixResult,
  "destination" | "listing" | "logistic" | "reputation" | "shippingMode"
> & {
  adsAmount?: number;
  /** @deprecated API alias for adsAmount; it is not a percentage. */
  adsPercent?: number;
};

type ScenarioAxisChoices = ScenarioInputChoices &
  Pick<ScenarioMatrixResult, "marginGoal">;

function scenarioAdsAmount(choices: ScenarioInputChoices): number {
  return finite(choices.adsAmount)
    ? choices.adsAmount
    : finite(choices.adsPercent)
      ? choices.adsPercent
      : Number.NaN;
}

/** Clone the input and apply only one matrix axis at a time. */
export function buildScenarioInput(
  input: PricingInput,
  choices: ScenarioInputChoices
): PricingInput {
  const cloned = cloneValue(input);
  const usesDestinationTaxes = input.useDestinationTaxes === true;
  const adsAmount = scenarioAdsAmount(choices);
  return {
    ...cloned,
    kitItems: Array.isArray(cloned.kitItems)
      ? cloned.kitItems.map(item => ({ ...item }))
      : [],
    adsMode: "rs",
    ads: adsAmount,
    // A historical record that used the old single-tax fields must not be
    // silently migrated while being printed. Destination choices remain
    // visible as comparative axes, but the legacy calculation keeps its own
    // ICMS/DIFAL values and semantics.
    useDestinationTaxes: usesDestinationTaxes,
    saleDestination: usesDestinationTaxes
      ? choices.destination
      : input.saleDestination,
    listing: choices.listing,
    logistic: choices.logistic,
    reputation: choices.reputation as PricingInput["reputation"],
    shippingMode: choices.shippingMode,
    condition: "new",
    automaticShippingOnly: true,
    // These are disabled by the current Alpha UI and must not leak an old
    // saved value into a matrix row.
    categoryDiscountEligible: false,
    promotion: 0,
    reservePercent: 0,
    taxDifal: usesDestinationTaxes
      ? choices.destination === "outside"
        ? fixedDifal(input)
        : 0
      : input.taxDifal,
    fullExtra: finite(input.fullExtra) ? input.fullExtra : 0,
  };
}

function calculationInputFingerprint(input: PricingInput): string {
  const metadataOnly = new Set(["description", "productSku", "kitSku"]);
  const normalized = Object.keys(input)
    .filter(key => key !== "logistic" && !metadataOnly.has(key))
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = cloneValue(
        (input as unknown as Record<string, unknown>)[key]
      );
      return result;
    }, {});
  return JSON.stringify(normalized);
}

function canonicalLogistic(
  scenarioInput: PricingInput,
  listing: Listing
): string {
  const eligibility = calculate(scenarioInput, 1, listing);
  if (!eligibility.valid) return scenarioInput.logistic;
  if (
    scenarioInput.logistic === "agency" ||
    scenarioInput.logistic === "collection"
  ) {
    return "table";
  }
  if (
    scenarioInput.logistic === "full" &&
    (scenarioInput.fullExtra ?? 0) === 0
  ) {
    return "table";
  }
  return scenarioInput.logistic;
}

function scenarioCacheKey(
  scenarioInput: PricingInput,
  choices: ScenarioAxisChoices
): string {
  return [
    calculationInputFingerprint(scenarioInput),
    scenarioAdsAmount(choices),
    choices.destination,
    choices.listing,
    choices.marginGoal,
    canonicalLogistic(scenarioInput, choices.listing),
    choices.reputation,
    choices.shippingMode,
  ].join("|");
}

function evaluateScenario(
  scenarioInput: PricingInput,
  choices: Pick<ScenarioMatrixResult, "marginGoal" | "listing" | "shippingMode">
): ScenarioEvaluation {
  const target = solveTarget(
    scenarioInput,
    choices.marginGoal,
    choices.listing
  );
  const result = target.result;
  if (
    target.price === null ||
    result === null ||
    !result.valid ||
    !finite(result.price) ||
    result.price <= 0 ||
    !finite(result.shipping) ||
    result.shipping < 0 ||
    result.margin + MONEY_EPSILON < choices.marginGoal
  ) {
    return {
      price: null,
      result: null,
      shipping: null,
      valid: false,
      reason:
        target.error ??
        result?.error ??
        "Cenário indisponível para o perfil atual.",
    };
  }

  if (choices.shippingMode === "auto") {
    const blockedChoiceReason = mandatoryFreeShippingChoiceReason(
      scenarioInput,
      result
    );
    if (blockedChoiceReason) {
      return {
        price: null,
        result: null,
        shipping: null,
        valid: false,
        reason: blockedChoiceReason,
      };
    }
  }

  return {
    price: money(target.price as number),
    result,
    shipping: money(result.shipping),
    valid: true,
  };
}

function makeScenarioResult(
  index: number,
  baseInput: PricingInput,
  choices: ScenarioAxisChoices,
  evaluation: ScenarioEvaluation
): ScenarioMatrixResult {
  const adsAmount = scenarioAdsAmount(choices);
  return deepFreeze({
    id: `scenario-${String(index + 1).padStart(4, "0")}`,
    ...choices,
    adsAmount,
    // Keep the old property for consumers that have not migrated yet. It is
    // deliberately the same fixed amount and must not be formatted as %.
    adsPercent: adsAmount,
    taxRegime:
      baseInput.useDestinationTaxes === true ? "destination" : "legacy",
    input: buildScenarioInput(baseInput, choices),
    price: evaluation.price,
    result: evaluation.result ? cloneValue(evaluation.result) : null,
    shipping: evaluation.shipping,
    valid: evaluation.valid,
    ...(evaluation.reason ? { reason: evaluation.reason } : {}),
  });
}

export interface ScenarioLogisticGroup {
  id: string;
  logistics: readonly MatrixLogistic[];
  valid: boolean;
  representative: ScenarioMatrixResult;
  rows: readonly ScenarioMatrixResult[];
}

function scenarioAxisKey(row: ScenarioMatrixResult): string {
  return [
    row.adsAmount,
    row.destination,
    row.listing,
    row.marginGoal,
    row.reputation,
    row.shippingMode,
  ].join("|");
}

function scenarioVectorSignature(
  rows: readonly ScenarioMatrixResult[]
): string {
  return [...rows]
    .sort((left, right) =>
      scenarioAxisKey(left).localeCompare(scenarioAxisKey(right))
    )
    .map(row =>
      [
        scenarioAxisKey(row),
        row.valid,
        row.price,
        row.result?.margin ?? null,
        row.shipping,
        row.result?.shippingLabel ?? null,
      ].join(":")
    )
    .join(";");
}

/** Group only equal full result vectors; unavailable logistics stay separate. */
export function groupEquivalentScenarioRows(
  rows: readonly ScenarioMatrixResult[]
): ScenarioLogisticGroup[] {
  const byLogistic = new Map<MatrixLogistic, ScenarioMatrixResult[]>();
  for (const row of rows) {
    const list = byLogistic.get(row.logistic) ?? [];
    list.push(row);
    byLogistic.set(row.logistic, list);
  }
  const groups = new Map<string, ScenarioLogisticGroup>();
  for (const [logistic, logisticRows] of byLogistic.entries()) {
    const valid = logisticRows.every(row => row.valid);
    const signature = valid
      ? `valid:${scenarioVectorSignature(logisticRows)}`
      : `unavailable:${logistic}`;
    const existing = groups.get(signature);
    if (existing) {
      groups.set(signature, {
        ...existing,
        logistics: Object.freeze([...existing.logistics, logistic]),
        rows: Object.freeze([...existing.rows, ...logisticRows]),
      });
      continue;
    }
    groups.set(signature, {
      id: `logistics-group-${groups.size + 1}`,
      logistics: Object.freeze([logistic]),
      valid,
      representative: logisticRows[0],
      rows: Object.freeze([...logisticRows]),
    });
  }
  return [...groups.values()];
}

function yieldToHost(): Promise<void> {
  return new Promise(resolve => {
    if (typeof setTimeout === "function") setTimeout(resolve, 0);
    else resolve();
  });
}

/**
 * Builds every requested row without freezing the UI. Duplicate option paths
 * are cached for solving but never removed from the returned audit matrix.
 */
export async function generateScenarioMatrix(
  input: PricingInput,
  onProgress?: ScenarioProgressCallback,
  options?: ScenarioMatrixOptions
): Promise<ScenarioMatrixResult[]>;
export async function generateScenarioMatrix(
  input: PricingInput,
  options?: ScenarioMatrixOptions
): Promise<ScenarioMatrixResult[]>;
export async function generateScenarioMatrix(
  input: PricingInput,
  callbackOrOptions?: ScenarioProgressCallback | ScenarioMatrixOptions,
  suppliedOptions: ScenarioMatrixOptions = {}
): Promise<ScenarioMatrixResult[]> {
  const callback =
    typeof callbackOrOptions === "function" ? callbackOrOptions : undefined;
  const options =
    typeof callbackOrOptions === "function"
      ? suppliedOptions
      : (callbackOrOptions ?? suppliedOptions);
  const selected = normalizedOptions(options, input);
  const total = getScenarioMatrixCount(input, options);
  const rows: ScenarioMatrixResult[] = [];
  const cache = options.cache ?? new Map<string, ScenarioEvaluation>();
  const yieldEvery = Math.max(1, Math.floor(options.yieldEvery ?? 24));
  let completed = 0;

  for (const adsAmount of selected.adsAmounts) {
    for (const destination of selected.destinations) {
      for (const listing of selected.listings) {
        for (const marginGoal of selected.margins) {
          for (const logistic of selected.logistics) {
            for (const reputation of selected.reputations) {
              for (const shippingMode of selected.shippingModes) {
                const choices = {
                  adsAmount,
                  adsPercent: adsAmount,
                  destination,
                  listing,
                  marginGoal,
                  logistic,
                  reputation,
                  shippingMode,
                } as const;
                const scenarioInput = buildScenarioInput(input, choices);
                const key = scenarioCacheKey(scenarioInput, choices);
                let evaluation = cache.get(key);
                if (!evaluation) {
                  evaluation = evaluateScenario(scenarioInput, choices);
                  cache.set(key, evaluation);
                }
                rows.push(
                  makeScenarioResult(rows.length, input, choices, evaluation)
                );
                completed += 1;
                callback?.(completed, total);
                if (completed % yieldEvery === 0) await yieldToHost();
              }
            }
          }
        }
      }
    }
  }
  if (completed === 0) callback?.(0, total);
  return rows;
}

function selectedAxisValue<T>(value: T, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value) ? value : fallback;
}

/** Synchronous five-margin view used by the selected-only PDF scope. */
export function buildSelectedScenarioRows(
  input: PricingInput
): ScenarioMatrixResult[] {
  // Preserve custom values in the selected-only comparison. A historical
  // percentage input is not rewritten; this derived comparison is rebuilt as
  // a fixed reais amount by buildScenarioInput.
  const adsAmount = finite(input.ads)
    ? input.ads
    : DEFAULT_MATRIX_ADS_AMOUNTS[0];
  const destination = selectedAxisValue(
    input.saleDestination,
    DEFAULT_MATRIX_DESTINATIONS,
    DEFAULT_MATRIX_DESTINATIONS[0]
  );
  const listing = selectedAxisValue(
    input.listing,
    DEFAULT_MATRIX_LISTINGS,
    DEFAULT_MATRIX_LISTINGS[0]
  );
  const logistic = selectedAxisValue(
    input.logistic,
    DEFAULT_MATRIX_LOGISTICS,
    DEFAULT_MATRIX_LOGISTICS[0]
  );
  const reputation = selectedAxisValue(
    input.reputation,
    DEFAULT_MATRIX_REPUTATIONS,
    DEFAULT_MATRIX_REPUTATIONS[0]
  );
  const shippingMode = selectedAxisValue(
    input.shippingMode as MatrixShippingMode,
    DEFAULT_MATRIX_SHIPPING_MODES,
    DEFAULT_MATRIX_SHIPPING_MODES[0]
  );
  return DEFAULT_MATRIX_MARGINS.map((marginGoal, index) => {
    const choices = {
      adsAmount,
      adsPercent: adsAmount,
      destination,
      listing,
      marginGoal,
      logistic,
      reputation,
      shippingMode,
    } as const;
    const scenarioInput = buildScenarioInput(input, choices);
    return makeScenarioResult(
      index,
      input,
      choices,
      evaluateScenario(scenarioInput, choices)
    );
  });
}

/**
 * Synchronous selected-flow view: the current advertising/destination/logistic
 * profile crossed with both listings, both automatic shipping modes and the
 * five margin targets (20 explicit paths, never a full 800-row matrix).
 */
export function buildSelectedFlowRows(
  input: PricingInput
): ScenarioMatrixResult[] {
  const adsAmount = finite(input.ads)
    ? input.ads
    : DEFAULT_MATRIX_ADS_AMOUNTS[0];
  const destination = selectedAxisValue(
    input.saleDestination,
    DEFAULT_MATRIX_DESTINATIONS,
    DEFAULT_MATRIX_DESTINATIONS[0]
  );
  const logistic = selectedAxisValue(
    input.logistic,
    DEFAULT_MATRIX_LOGISTICS,
    DEFAULT_MATRIX_LOGISTICS[0]
  );
  const reputation = selectedAxisValue(
    input.reputation,
    DEFAULT_MATRIX_REPUTATIONS,
    DEFAULT_MATRIX_REPUTATIONS[0]
  );
  return DEFAULT_MATRIX_LISTINGS.flatMap(listing =>
    DEFAULT_MATRIX_SHIPPING_MODES.flatMap(shippingMode =>
      DEFAULT_MATRIX_MARGINS.map((marginGoal, index) => {
        const choices = {
          adsAmount,
          adsPercent: adsAmount,
          destination,
          listing,
          marginGoal,
          logistic,
          reputation,
          shippingMode,
        } as const;
        const scenarioInput = buildScenarioInput(input, choices);
        return makeScenarioResult(
          DEFAULT_MATRIX_SHIPPING_MODES.length *
            DEFAULT_MATRIX_MARGINS.length *
            DEFAULT_MATRIX_LISTINGS.indexOf(listing) +
            DEFAULT_MATRIX_MARGINS.length *
              DEFAULT_MATRIX_SHIPPING_MODES.indexOf(shippingMode) +
            index,
          input,
          choices,
          evaluateScenario(scenarioInput, choices)
        );
      })
    )
  );
}

function flowValue(value: unknown): string {
  return String(value)
    .replace(/[\r\n|{}]/g, " ")
    .trim();
}

function formatAdsAmount(value: number): string {
  return `R$${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function flowAdsValues(input: PricingInput): readonly number[] {
  const values: number[] = [...DEFAULT_MATRIX_ADS_AMOUNTS];
  if (finite(input.ads) && !values.includes(input.ads)) values.push(input.ads);
  return values;
}

function selectedChoice(
  input: PricingInput,
  stage: string,
  value: string
): boolean {
  switch (stage) {
    case "ads":
      return finite(input.ads) && formatAdsAmount(input.ads) === value;
    case "destination":
      return input.saleDestination === value;
    case "listing":
      return input.listing === value;
    case "logistic":
      return input.logistic === value;
    case "reputation":
      return input.reputation === value;
    case "shipping":
      return input.shippingMode === value;
    case "margin":
      return false;
    default:
      return false;
  }
}

function mermaidFromFlow(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[]
): string {
  const lines = ["flowchart LR"];
  for (const node of nodes) {
    const safe = node.label.replace(/"/g, "'").replace(/\n/g, "<br/>");
    lines.push(`  ${node.id}["${safe}"]`);
  }
  for (const edge of edges) lines.push(`  ${edge.from} --> ${edge.to}`);
  return lines.join("\n");
}

/** Deterministic JSON-first flow source; no generated visual is involved. */
export function buildFlowSource(
  input: PricingInput,
  goal?: number
): FlowSource {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const stages: Array<{
    key: string;
    label: string;
    values: readonly string[];
  }> = [
    {
      key: "ads",
      label: "Publicidade",
      values: flowAdsValues(input).map(formatAdsAmount),
    },
    {
      key: "destination",
      label: "Destino",
      values: [...DEFAULT_MATRIX_DESTINATIONS],
    },
    { key: "listing", label: "Anúncio", values: [...DEFAULT_MATRIX_LISTINGS] },
    {
      key: "logistic",
      label: "Logística",
      values: [...DEFAULT_MATRIX_LOGISTICS],
    },
    {
      key: "reputation",
      label: "Reputação fixa",
      values: [String(input.reputation)],
    },
    { key: "shipping", label: "Envio", values: ["auto", "rapid"] },
    {
      key: "margin",
      label: "Margem alvo",
      values: DEFAULT_MATRIX_MARGINS.map(value => `${value}%`),
    },
  ];
  nodes.push({
    id: "fixed",
    stage: "fixed",
    label: `Entradas fixas\n${flowValue(input.description || "Produto")}\nSKU ${flowValue((input.productType === "kit" ? input.kitSku : input.productSku) || "—")}\nReputação ${flowValue(input.reputation)}`,
    selected: true,
    kind: "fixed",
  });
  let previous = ["fixed"];
  for (const stage of stages) {
    const current: string[] = [];
    for (const value of stage.values) {
      const id = `${stage.key}-${value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;
      current.push(id);
      nodes.push({
        id,
        stage: stage.key,
        label: `${stage.label}\n${stage.key === "shipping" ? MATRIX_SHIPPING_LABELS[value as MatrixShippingMode] : value}`,
        selected:
          stage.key === "margin"
            ? finite(goal) && value === `${goal}%`
            : selectedChoice(input, stage.key, value),
        kind: "choice",
      });
      for (const from of previous) {
        edges.push({
          from,
          to: id,
          selected: Boolean(
            nodes.find(node => node.id === from)?.selected &&
              (stage.key === "margin"
                ? finite(goal) && value === `${goal}%`
                : selectedChoice(input, stage.key, value))
          ),
        });
      }
    }
    previous = current;
  }
  const selectedMargin = finite(goal) ? `${goal}%` : "margens comparadas";
  const resultId = "selected-result";
  nodes.push({
    id: resultId,
    stage: "result",
    label: `Preço final do cenário selecionado\n${selectedMargin} (meta do registro)`,
    selected: true,
    kind: "result",
  });
  for (const from of previous)
    edges.push({
      from,
      to: resultId,
      selected: nodes.find(node => node.id === from)?.selected === true,
    });
  const legend = [
    { key: "fixed", label: "Entrada fixa", color: "#5b21b6" },
    { key: "choice", label: "Escolha auditada", color: "#f3c74f" },
    { key: "selected", label: "Caminho selecionado", color: "#16805b" },
    {
      key: "unsupported",
      label: "Perfil não suportado pelo automático",
      color: "#9ca3af",
    },
  ] as const;
  return {
    format: "json",
    checkedAt: SHIPPING_CHECKED_AT,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    legend,
    mermaid: mermaidFromFlow(nodes, edges),
  };
}

function formulaSafe(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = formulaSafe(raw);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const MATRIX_CSV_HEADERS = [
  "id",
  "adsAmount",
  "destination",
  "listing",
  "marginGoal",
  "logistic",
  "reputation",
  "shippingMode",
  "taxRegime",
  "valid",
  "price",
  "shipping",
  "realMargin",
  "productCost",
  "totalCosts",
  "weightUsed",
  "dimensionalWeight",
  "shippingLabel",
  "weightBand",
  "reason",
] as const;

/** Exports every row, including invalid/unsupported rows, without formula injection. */
export function scenarioMatrixToCsv(
  rows: readonly ScenarioMatrixResult[]
): string {
  const lines = [MATRIX_CSV_HEADERS.join(",")];
  for (const row of rows) {
    const values = [
      row.id,
      finite(row.adsAmount)
        ? row.adsAmount
        : finite(row.adsPercent)
          ? row.adsPercent
          : null,
      row.destination,
      row.listing,
      row.marginGoal,
      row.logistic,
      row.reputation,
      row.shippingMode,
      row.taxRegime,
      row.valid,
      row.price,
      row.shipping,
      row.result?.margin ?? null,
      row.result?.productCost ?? null,
      row.result?.totalCosts ?? null,
      row.result?.weightUsed ?? null,
      row.result?.dimensionalWeight ?? null,
      row.result?.shippingLabel ?? null,
      row.result?.weightBand ?? null,
      row.reason ?? null,
    ];
    lines.push(values.map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
export const exportScenarioMatrixCsv = scenarioMatrixToCsv;
export const exportScenarioMatrixCSV = scenarioMatrixToCsv;

export function getReportAcquisition(input: PricingInput) {
  return getAcquisition(input);
}

export { SHIPPING_CHECKED_AT };
export type { KitItem, PricingInput, PricingResult };
