import { defaultInput, type PricingInput } from "./pricing";
import { applyCompanyTax } from "./companyProfile";
import { getProductType } from "./productIdentification";
import { hydrateKitComposition } from "./kitComposition";
import { normalizePackagingDimensions } from "./packagingSelection";
import { getPackagingPreset } from "./packagingCatalog";
import { normalizeWeightEntry } from "./weightSelection";
import { normalizeInterfaceInput } from "./interfaceInput";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function preserveIncompletePackaging(
  input: PricingInput,
  preserveIncomplete: boolean
): PricingInput {
  if (!preserveIncomplete) return normalizePackagingDimensions(input);

  const preset = getPackagingPreset(input.packagingPreset);
  if (!preset) return input;

  // A saved preset is a reference only while its persisted sides still match
  // the catalog. Keep the user's measured coordinates (including an unknown
  // height) rather than replacing them with catalog dimensions and height 0.
  if (input.length === preset.sideA && input.width === preset.sideB) {
    return input;
  }

  return { ...input, packagingPreset: "custom" };
}

/** Restores saved inputs. Product drafts keep absent/invalid numbers invalid. */
export function restorePricingInput(
  value: unknown,
  simplify = true,
  preserveIncomplete = false
): PricingInput {
  if (!value || typeof value !== "object") {
    return simplify
      ? normalizeInterfaceInput({ ...defaultInput })
      : { ...defaultInput };
  }
  const out = structuredClone(defaultInput);
  const record = value as Record<string, unknown>;
  const incompleteNumericFields: (keyof PricingInput)[] = [];
  for (const key of Object.keys(defaultInput) as (keyof PricingInput)[]) {
    const candidate = record[key];
    const expected = defaultInput[key];
    if (preserveIncomplete && typeof expected === "number") {
      if (!isFiniteNumber(candidate)) incompleteNumericFields.push(key);
      (out as unknown as Record<string, unknown>)[key] = isFiniteNumber(
        candidate
      )
        ? candidate
        : Number.NaN;
    } else if (preserveIncomplete && typeof expected === "string") {
      // Product drafts may be identified by a SKU alone. Never resurrect the
      // example description (or another string default) for absent text.
      (out as unknown as Record<string, unknown>)[key] =
        typeof candidate === "string" ? candidate : "";
    } else if (
      typeof candidate === typeof expected &&
      (typeof candidate !== "number" || Number.isFinite(candidate))
    ) {
      (out as unknown as Record<string, unknown>)[key] = candidate;
    }
  }
  const enums = {
    calculationType: ["estimated", "real"],
    costMode: ["unit", "kg"],
    adsMode: ["rs", "percent"],
    difalMode: ["percent", "rs"],
    weightInputMode: ["exact", "band"],
    listing: ["classic", "premium"],
    reputation: ["green", "new", "yellow", "red"],
    condition: ["new", "used"],
    logistic: ["agency", "collection", "full", "flex", "other"],
    shippingMode: ["auto", "rapid", "manual"],
    packagingPreset: ["custom", "p", "m", "g", "gg"],
  } as const;
  for (const key of Object.keys(enums) as (keyof typeof enums)[]) {
    if (!(enums[key] as readonly string[]).includes(String(out[key]))) {
      (out as unknown as Record<string, unknown>)[key] = defaultInput[key];
    }
  }
  out.productType = getProductType(record.productType, out.itemQuantity);
  const restored = applyCompanyTax(
    normalizeWeightEntry(
      preserveIncompletePackaging(
        hydrateKitComposition(out, record.kitItems),
        preserveIncomplete
      )
    )
  );
  const simplified = simplify ? normalizeInterfaceInput(restored) : restored;

  // Interface migration intentionally supplies defaults for old interactive
  // records. It must not do that for an explicitly incomplete private draft.
  if (!preserveIncomplete || incompleteNumericFields.length === 0) {
    return simplified;
  }

  const preserved = { ...simplified };
  for (const key of incompleteNumericFields) {
    (preserved as unknown as Record<string, unknown>)[key] = Number.NaN;
  }
  return preserved;
}
