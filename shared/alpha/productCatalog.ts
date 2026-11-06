import type { PricingInput, PricingResult } from "./pricing";

export type CatalogProductMode = "target" | "sale";
export type CatalogProductStatus = "draft" | "ready";

export interface ProductCategoryAnswer {
  category: string;
  categoryId: string | null;
  source: string;
  explanation: string;
  confidence: string | number;
  alternatives: string[];
}

export interface ProductCatalogRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  input: PricingInput;
  goal: number;
  mode: CatalogProductMode;
  categoryAnswer?: ProductCategoryAnswer | null;
  status: CatalogProductStatus;
  resultPrice: number | null;
}

/** The editable state accepted by createCatalogProduct/updateCatalogProduct. */
export interface CatalogProductState {
  input: PricingInput;
  goal: number;
  mode: CatalogProductMode;
  categoryAnswer?: ProductCategoryAnswer | null;
  result?: PricingResult | null;
}

export type CatalogProductNow = string | number | Date;

export interface CatalogProductOptions {
  id?: string;
  now?: CatalogProductNow;
  existing?: ProductCatalogRecord;
  /** These fields also make the `(input, options)` form convenient. */
  goal?: number;
  mode?: CatalogProductMode;
  categoryAnswer?: ProductCategoryAnswer | null;
  result?: PricingResult | null;
}

export interface CatalogProductFilter {
  query?: string;
  productType?: "all" | "single" | "kit";
  calculationType?: "all" | "estimated" | "real";
  status?: "all" | CatalogProductStatus;
}

const CATALOG_VERSION = 1;
const SPECIAL_NUMBER_KEY = "__precifica_number__";
const SPECIAL_NUMBER_VALUES = new Set(["NaN", "Infinity", "-Infinity"]);
const MAX_ID_LENGTH = 256;
const MAX_TIMESTAMP_LENGTH = 128;
const MAX_CATEGORY_STRING_LENGTH = 2_000;
const MAX_EXPLANATION_LENGTH = 10_000;
const MAX_ALTERNATIVES = 100;
const MAX_ALTERNATIVE_LENGTH = 2_000;
const PRICING_NUMBER_FIELDS = [
  "cost",
  "productKg",
  "itemQuantity",
  "operation",
  "packaging",
  "promotion",
  "ads",
  "taxFederal",
  "taxPis",
  "taxCofins",
  "taxIrpj",
  "taxCsll",
  "taxIcms",
  "taxIcmsInside",
  "taxIcmsOutside",
  "taxIcmsTransfer",
  "taxDifal",
  "taxDifalValue",
  "classicRate",
  "premiumRate",
  "price",
  "weight",
  "weightExact",
  "length",
  "width",
  "height",
  "manualShipping",
  "manualFixedFee",
  "manualFixedLimit",
  "fullExtra",
  "reservePercent",
] as const;

/** Errors from malformed persisted catalog data are intentionally explicit. */
export class ProductCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductCatalogError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);

  // Node/browser targets used by this package provide structuredClone. This
  // fallback is only for older local adapters and retains special numbers.
  return JSON.parse(JSON.stringify(value, numberReplacer), numberReviver) as T;
}

function boundedString(
  value: unknown,
  field: string,
  maxLength: number,
  options: { allowEmpty?: boolean } = {}
): string {
  if (typeof value !== "string") {
    throw new ProductCatalogError(`${field} must be a string.`);
  }
  if (!options.allowEmpty && value.trim() === "") {
    throw new ProductCatalogError(`${field} must not be empty.`);
  }
  if (value.length > maxLength) {
    throw new ProductCatalogError(`${field} exceeds ${maxLength} characters.`);
  }
  return value;
}

function numberValue(value: unknown, field: string): number {
  // NaN and infinities are valid incomplete numeric values in the pricing
  // form, so this deliberately checks the primitive type only.
  if (typeof value !== "number") {
    throw new ProductCatalogError(`${field} must be a number.`);
  }
  return value;
}

function normalizeNow(value: CatalogProductNow | undefined): string {
  if (value === undefined) return new Date().toISOString();
  if (typeof value === "string") {
    return boundedString(value, "now", MAX_TIMESTAMP_LENGTH);
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new ProductCatalogError("now must be a valid date.");
    }
    return value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new ProductCatalogError("now must be a valid timestamp.");
    }
    return date.toISOString();
  }
  throw new ProductCatalogError(
    "now must be a string, Date, or finite timestamp."
  );
}

function generatedId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `product-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function validateId(value: unknown, field = "id"): string {
  return boundedString(value, field, MAX_ID_LENGTH);
}

function validateCategoryAnswer(
  value: unknown
): ProductCategoryAnswer | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isObject(value)) {
    throw new ProductCatalogError("categoryAnswer must be an object or null.");
  }

  const category = boundedString(
    value.category,
    "categoryAnswer.category",
    MAX_CATEGORY_STRING_LENGTH,
    { allowEmpty: true }
  );
  const categoryId = value.categoryId;
  if (categoryId !== null && typeof categoryId !== "string") {
    throw new ProductCatalogError(
      "categoryAnswer.categoryId must be a string or null."
    );
  }
  if (typeof categoryId === "string" && categoryId.length > MAX_ID_LENGTH) {
    throw new ProductCatalogError(
      `categoryAnswer.categoryId exceeds ${MAX_ID_LENGTH} characters.`
    );
  }
  const source = boundedString(
    value.source,
    "categoryAnswer.source",
    MAX_CATEGORY_STRING_LENGTH,
    { allowEmpty: true }
  );
  const explanation = boundedString(
    value.explanation,
    "categoryAnswer.explanation",
    MAX_EXPLANATION_LENGTH,
    { allowEmpty: true }
  );
  const confidence = value.confidence;
  if (typeof confidence === "string") {
    boundedString(confidence, "categoryAnswer.confidence", 200, {
      allowEmpty: true,
    });
  } else if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new ProductCatalogError("Confiança da categoria inválida.");
  }
  if (!Array.isArray(value.alternatives)) {
    throw new ProductCatalogError(
      "categoryAnswer.alternatives must be an array."
    );
  }
  if (value.alternatives.length > MAX_ALTERNATIVES) {
    throw new ProductCatalogError(
      `categoryAnswer.alternatives cannot contain more than ${MAX_ALTERNATIVES} items.`
    );
  }
  const alternatives = value.alternatives.map((alternative, index) =>
    boundedString(
      alternative,
      `categoryAnswer.alternatives[${index}]`,
      MAX_ALTERNATIVE_LENGTH,
      { allowEmpty: true }
    )
  );

  // Do not return the original object: category answers are part of the
  // persisted record and must not remain aliased to caller-owned data.
  return {
    category,
    categoryId: categoryId === null ? null : categoryId,
    source,
    explanation,
    confidence,
    alternatives,
  };
}

function validateInputObject(value: unknown): PricingInput {
  if (!isObject(value)) {
    throw new ProductCatalogError(
      "input must be a complete object; pricing defaults are never invented."
    );
  }

  // Identification is the only pricing-level constraint for catalog records.
  // All other pricing fields are allowed to be incomplete, including missing
  // fields and non-finite numbers. This preserves the current form exactly.
  for (const field of ["description", "productSku", "kitSku"] as const) {
    if (
      hasOwn(value, field) &&
      value[field] !== undefined &&
      typeof value[field] !== "string"
    ) {
      throw new ProductCatalogError(
        `input.${field} must be a string when present.`
      );
    }
    if (
      typeof value[field] === "string" &&
      value[field].length > MAX_CATEGORY_STRING_LENGTH
    ) {
      throw new ProductCatalogError(
        `input.${field} exceeds ${MAX_CATEGORY_STRING_LENGTH} characters.`
      );
    }
  }

  for (const field of PRICING_NUMBER_FIELDS) {
    if (
      hasOwn(value, field) &&
      value[field] !== undefined &&
      typeof value[field] !== "number"
    ) {
      throw new ProductCatalogError(
        `input.${field} must be a number when present.`
      );
    }
  }

  if (
    hasOwn(value, "kitItems") &&
    value.kitItems !== undefined &&
    value.kitItems !== null
  ) {
    if (!Array.isArray(value.kitItems)) {
      throw new ProductCatalogError(
        "input.kitItems must be an array when present."
      );
    }
    value.kitItems.forEach((row, index) => {
      if (!isObject(row)) {
        throw new ProductCatalogError(
          `input.kitItems[${index}] must be an object.`
        );
      }
      for (const field of ["quantity", "unitCost"] as const) {
        if (
          hasOwn(row, field) &&
          row[field] !== undefined &&
          typeof row[field] !== "number"
        ) {
          throw new ProductCatalogError(
            `input.kitItems[${index}].${field} must be a number when present.`
          );
        }
      }
    });
  }

  const productType = value.productType;
  const activeSku = productType === "kit" ? value.kitSku : value.productSku;
  const description =
    typeof value.description === "string" ? value.description : "";
  const sku = typeof activeSku === "string" ? activeSku : "";
  if (description.trim() === "" && sku.trim() === "") {
    throw new ProductCatalogError(
      "input needs an identifying description or the active SKU."
    );
  }

  return value as unknown as PricingInput;
}

/** Validate a stored record without normalizing or filling any field. */
export function validateProductCatalogRecord(
  value: unknown,
  options: { forBackup?: boolean } = {}
): ProductCatalogRecord {
  if (!isObject(value)) {
    throw new ProductCatalogError("record must be an object.");
  }
  const id = validateId(value.id);
  const createdAt = boundedString(
    value.createdAt,
    "createdAt",
    MAX_TIMESTAMP_LENGTH
  );
  const updatedAt = boundedString(
    value.updatedAt,
    "updatedAt",
    MAX_TIMESTAMP_LENGTH
  );
  const input = validateInputObject(value.input);
  const goal = numberValue(value.goal, "goal");

  if (value.mode !== "target" && value.mode !== "sale") {
    throw new ProductCatalogError("mode must be target or sale.");
  }
  const mode = value.mode;
  const categoryAnswer = validateCategoryAnswer(value.categoryAnswer);

  if (value.status !== "draft" && value.status !== "ready") {
    throw new ProductCatalogError("status must be draft or ready.");
  }
  const resultPrice = value.resultPrice;
  if (resultPrice !== null && typeof resultPrice !== "number") {
    throw new ProductCatalogError(
      "resultPrice must be a finite number or null."
    );
  }
  if (value.status === "ready") {
    if (
      typeof resultPrice !== "number" ||
      !Number.isFinite(resultPrice) ||
      resultPrice <= 0
    ) {
      throw new ProductCatalogError(
        "ready records require a finite resultPrice greater than zero."
      );
    }
  } else if (resultPrice !== null) {
    throw new ProductCatalogError(
      "draft records must have a null resultPrice."
    );
  }
  if (options.forBackup && value.input === undefined) {
    throw new ProductCatalogError(
      "record.input is required; no pricing defaults are inferred."
    );
  }

  // Validation must not strip unknown record/input/kit-row fields. Returning a
  // clone also prevents callers from mutating the validated value through this
  // helper.
  const cloned = cloneValue(value) as Record<string, unknown>;
  cloned.id = id;
  cloned.createdAt = createdAt;
  cloned.updatedAt = updatedAt;
  cloned.input = cloneValue(input);
  cloned.goal = goal;
  cloned.mode = mode;
  if (categoryAnswer !== undefined)
    cloned.categoryAnswer = cloneValue(categoryAnswer);
  cloned.status = value.status;
  cloned.resultPrice = resultPrice;
  return cloned as unknown as ProductCatalogRecord;
}

function isStateEnvelope(
  value: unknown
): value is Partial<CatalogProductState> & Record<string, unknown> {
  return (
    isObject(value) &&
    hasOwn(value, "input") &&
    (hasOwn(value, "goal") ||
      hasOwn(value, "mode") ||
      hasOwn(value, "result") ||
      hasOwn(value, "categoryAnswer"))
  );
}

interface ResolvedState {
  input: PricingInput;
  goal: number;
  mode: CatalogProductMode;
  categoryAnswer?: ProductCategoryAnswer | null;
  result?: PricingResult | null;
}

function resolveState(
  stateOrInput: CatalogProductState | PricingInput,
  options: CatalogProductOptions | undefined
): ResolvedState {
  const source = isStateEnvelope(stateOrInput)
    ? stateOrInput
    : ({ input: stateOrInput } as Record<string, unknown>);
  const merged = {
    ...source,
    ...(options ?? {}),
  } as Record<string, unknown>;

  if (!hasOwn(merged, "input")) {
    throw new ProductCatalogError("input is required.");
  }
  const input = validateInputObject(merged.input);
  const goal = numberValue(merged.goal, "goal");
  if (merged.mode !== "target" && merged.mode !== "sale") {
    throw new ProductCatalogError("mode must be target or sale.");
  }
  const categoryAnswer = validateCategoryAnswer(merged.categoryAnswer);
  const result = merged.result;
  if (result !== undefined && result !== null && !isObject(result)) {
    throw new ProductCatalogError(
      "result must be a PricingResult object or null."
    );
  }

  return {
    input,
    goal,
    mode: merged.mode,
    categoryAnswer,
    result: result as PricingResult | null | undefined,
  };
}

function hasValidResult(
  result: PricingResult | null | undefined
): result is PricingResult {
  return (
    isObject(result) &&
    result.valid === true &&
    typeof result.price === "number" &&
    Number.isFinite(result.price) &&
    result.price > 0
  );
}

function recordFromState(
  stateOrInput: CatalogProductState | PricingInput,
  options: CatalogProductOptions | undefined,
  existing?: ProductCatalogRecord
): ProductCatalogRecord {
  const state = resolveState(stateOrInput, options);
  const validResult = hasValidResult(state.result);
  const timestamp = normalizeNow(options?.now);
  const base = existing
    ? (cloneValue(existing) as unknown as Record<string, unknown>)
    : {};
  const id = existing
    ? validateId(existing.id)
    : options?.id === undefined
      ? generatedId()
      : validateId(options.id, "id");
  const createdAt = existing
    ? boundedString(existing.createdAt, "createdAt", MAX_TIMESTAMP_LENGTH)
    : timestamp;

  const record: ProductCatalogRecord = {
    ...base,
    id,
    createdAt,
    updatedAt: timestamp,
    input: cloneValue(state.input),
    goal: state.goal,
    mode: state.mode,
    categoryAnswer:
      state.categoryAnswer === undefined
        ? null
        : cloneValue(state.categoryAnswer),
    status: validResult ? "ready" : "draft",
    resultPrice: validResult ? state.result!.price : null,
  } as ProductCatalogRecord;

  // Validate the generated record too, so the public constructor and backup
  // parser share exactly the same invariants.
  return validateProductCatalogRecord(record);
}

export function createCatalogProduct(
  state: CatalogProductState,
  options?: CatalogProductOptions
): ProductCatalogRecord;
export function createCatalogProduct(
  input: PricingInput,
  options: CatalogProductOptions & { goal: number; mode: CatalogProductMode }
): ProductCatalogRecord;
export function createCatalogProduct(
  stateOrInput: CatalogProductState | PricingInput,
  options: CatalogProductOptions = {}
): ProductCatalogRecord {
  return recordFromState(stateOrInput, options, options.existing);
}

export function updateCatalogProduct(
  existing: ProductCatalogRecord,
  state: CatalogProductState,
  options?: Omit<CatalogProductOptions, "existing" | "id">
): ProductCatalogRecord;
export function updateCatalogProduct(
  existing: ProductCatalogRecord,
  input: PricingInput,
  options: Omit<CatalogProductOptions, "existing" | "id"> & {
    goal: number;
    mode: CatalogProductMode;
  }
): ProductCatalogRecord;
export function updateCatalogProduct(
  existing: ProductCatalogRecord,
  stateOrInput: CatalogProductState | PricingInput,
  options: Omit<CatalogProductOptions, "existing" | "id"> = {}
): ProductCatalogRecord {
  // Validate/clone the old record before using its identity metadata. The
  // original object and its KIT rows remain untouched.
  const prior = validateProductCatalogRecord(existing);
  return recordFromState(stateOrInput, options, prior);
}

function numberReplacer(_key: string, value: unknown): unknown {
  if (typeof value !== "number" || Number.isFinite(value)) return value;
  return {
    [SPECIAL_NUMBER_KEY]: Number.isNaN(value)
      ? "NaN"
      : value === Infinity
        ? "Infinity"
        : "-Infinity",
  };
}

function numberReviver(_key: string, value: unknown): unknown {
  if (!isObject(value) || Object.keys(value).length !== 1) return value;
  if (!hasOwn(value, SPECIAL_NUMBER_KEY)) return value;
  const marker = value[SPECIAL_NUMBER_KEY];
  if (!SPECIAL_NUMBER_VALUES.has(marker as string)) return value;
  if (marker === "NaN") return Number.NaN;
  if (marker === "Infinity") return Infinity;
  return -Infinity;
}

function stringifyPortable(value: unknown): string {
  try {
    const json = JSON.stringify(value, numberReplacer);
    if (json === undefined) throw new Error("value is not JSON serializable");
    return json;
  } catch (error) {
    if (error instanceof ProductCatalogError) throw error;
    throw new ProductCatalogError(
      `Could not serialize product catalog: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function parseJson(json: string): unknown {
  if (typeof json !== "string") {
    throw new ProductCatalogError(
      "Invalid product catalog backup: JSON must be a string."
    );
  }
  try {
    return JSON.parse(json, numberReviver);
  } catch (error) {
    throw new ProductCatalogError(
      `Invalid product catalog backup: malformed JSON${
        error instanceof Error && error.message ? ` (${error.message})` : "."
      }`
    );
  }
}

function validateEnvelopeVersion(value: unknown): Record<string, unknown> {
  if (!isObject(value)) {
    throw new ProductCatalogError(
      "Invalid product catalog backup: expected an object envelope."
    );
  }
  if (value.version !== CATALOG_VERSION) {
    throw new ProductCatalogError(
      `Invalid product catalog backup: unsupported version ${String(value.version)}.`
    );
  }
  return value;
}

function validateRecordCollection(records: unknown): ProductCatalogRecord[] {
  if (!Array.isArray(records)) {
    throw new ProductCatalogError(
      "Invalid product catalog backup: records must be an array."
    );
  }
  const seen = new Set<string>();
  return records.map((record, index) => {
    try {
      const validated = validateProductCatalogRecord(record, {
        forBackup: true,
      });
      if (seen.has(validated.id)) {
        throw new ProductCatalogError(`duplicate record id ${validated.id}.`);
      }
      seen.add(validated.id);
      return validated;
    } catch (error) {
      if (error instanceof ProductCatalogError) {
        throw new ProductCatalogError(
          `Invalid product catalog backup: record ${index + 1}: ${error.message}`
        );
      }
      throw error;
    }
  });
}

/** Serialize a catalog as a versioned, local/cloud-neutral JSON envelope. */
export function serializeCatalogProducts(
  records: readonly ProductCatalogRecord[]
): string {
  if (!Array.isArray(records)) {
    throw new ProductCatalogError("records must be an array.");
  }
  const validated = validateRecordCollection(records);
  return stringifyPortable({ version: CATALOG_VERSION, records: validated });
}

/** Parse and validate a catalog backup; corrupt data is never converted to []. */
export function parseCatalogProducts(json: string): ProductCatalogRecord[] {
  const envelope = validateEnvelopeVersion(parseJson(json));
  if (hasOwn(envelope, "record") && !hasOwn(envelope, "records")) {
    return [validateProductCatalogRecord(envelope.record, { forBackup: true })];
  }
  return validateRecordCollection(envelope.records);
}

/** Serialize one record for a database/blob adapter using the same versioning. */
export function serializeCatalogProduct(record: ProductCatalogRecord): string {
  const validated = validateProductCatalogRecord(record);
  return stringifyPortable({ version: CATALOG_VERSION, record: validated });
}

/** Companion parser for the single-record adapter format. */
export function parseCatalogProduct(json: string): ProductCatalogRecord {
  const envelope = validateEnvelopeVersion(parseJson(json));
  if (!hasOwn(envelope, "record")) {
    throw new ProductCatalogError(
      "Invalid product catalog backup: single-record envelope is missing record."
    );
  }
  return validateProductCatalogRecord(envelope.record, { forBackup: true });
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function searchableValues(record: ProductCatalogRecord): string[] {
  const input = record.input as PricingInput & Record<string, unknown>;
  const values: string[] = [];
  if (typeof input.description === "string") values.push(input.description);

  // Only the SKU for the selected product type is included. Searching a
  // hidden/inactive top-level SKU could display a catalog record as the wrong
  // product type after a form switch.
  const activeSku =
    input.productType === "kit" ? input.kitSku : input.productSku;
  if (typeof activeSku === "string") values.push(activeSku);

  if (Array.isArray(input.kitItems)) {
    for (const row of input.kitItems) {
      if (!isObject(row)) continue;
      for (const key of ["sku", "description", "name"]) {
        if (typeof row[key] === "string") values.push(row[key]);
      }
    }
  }
  return values;
}

/** Filter without mutating the source array; result order is newest updatedAt first. */
export function filterCatalogProducts(
  records: readonly ProductCatalogRecord[],
  filter: CatalogProductFilter = {}
): ProductCatalogRecord[] {
  const query =
    typeof filter.query === "string"
      ? normalizeSearch(filter.query.trim())
      : "";
  const productType = filter.productType ?? "all";
  const calculationType = filter.calculationType ?? "all";
  const status = filter.status ?? "all";

  const filtered = records.filter(record => {
    const input = record.input as PricingInput & Record<string, unknown>;
    if (productType !== "all" && input.productType !== productType)
      return false;
    if (calculationType !== "all" && input.calculationType !== calculationType)
      return false;
    if (status !== "all" && record.status !== status) return false;
    if (query === "") return true;
    return searchableValues(record).some(value =>
      normalizeSearch(value).includes(query)
    );
  });

  return filtered
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const rightTime = Date.parse(right.record.updatedAt);
      const leftTime = Date.parse(left.record.updatedAt);
      if (
        Number.isFinite(rightTime) &&
        Number.isFinite(leftTime) &&
        rightTime !== leftTime
      ) {
        return rightTime - leftTime;
      }
      const byText = right.record.updatedAt.localeCompare(
        left.record.updatedAt
      );
      return byText || left.index - right.index;
    })
    .map(entry => entry.record);
}
