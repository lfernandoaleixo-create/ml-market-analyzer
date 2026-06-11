/**
 * Technical-sheet (ficha técnica) completeness logic — the "Raio-X".
 *
 * This mirrors how Mercado Livre (and tools like Seconds) decide whether a
 * listing's technical sheet is COMPLETE or INCOMPLETE:
 *
 *  1. The category exposes a catalog of attributes (GET
 *     /categories/{cat}/technical_specs or /attributes). Each attribute has a
 *     `value_type`, a set of `tags` (e.g. "required", "hidden", "read_only",
 *     "variation_attribute") and possibly allowed `values`.
 *  2. The item carries its own filled attributes (GET /items/{id} → attributes
 *     with value_name / value_id).
 *  3. We cross-reference: an attribute is MISSING when the category expects it
 *     (and it is user-fillable) but the item has no value for it.
 *
 * The functions here are pure so they can be unit-tested without any network.
 */

import type {
  TechAttribute,
  TechAttrValueType,
  TechSpecListing,
  TechSpecsResult,
  TechSpecsSummary,
  ListingStatus,
} from "./account";

/** Raw shape of a category attribute as returned by the ML API. */
export interface RawCategoryAttribute {
  id: string;
  name: string;
  value_type?: string;
  tags?: Record<string, boolean> | string[];
  values?: Array<{ id?: string; name?: string }> | null;
  hierarchy?: string | null;
}

/** Raw shape of an item attribute as returned by the ML API. */
export interface RawItemAttribute {
  id: string;
  name?: string;
  value_name?: string | null;
  value_id?: string | null;
}

/** Normalise the heterogeneous `tags` field (object map OR string array). */
export function hasTag(
  tags: RawCategoryAttribute["tags"],
  tag: string,
): boolean {
  if (!tags) return false;
  if (Array.isArray(tags)) return tags.includes(tag);
  return tags[tag] === true;
}

/** Map ML `value_type` to our editor type. */
export function mapValueType(vt: string | undefined): TechAttrValueType {
  switch (vt) {
    case "number":
      return "number";
    case "number_unit":
      return "number_unit";
    case "list":
      return "list";
    case "boolean":
      return "boolean";
    default:
      return "string";
  }
}

/**
 * Decide whether a category attribute is RELEVANT for the technical-sheet
 * diagnosis. We exclude attributes the seller cannot/should not fill manually:
 *  - hidden / read_only / fixed attributes
 *  - variation-only attributes (handled per-variation, not on the sheet)
 *  - catalog-managed attributes (value comes from the catalog product)
 */
export function isRelevantAttribute(attr: RawCategoryAttribute): boolean {
  // Hidden from the technical sheet UI (both flavours ML uses).
  if (hasTag(attr.tags, "hidden")) return false;
  if (hasTag(attr.tags, "vip_hidden")) return false;
  // Not user-fillable on the sheet.
  if (hasTag(attr.tags, "read_only")) return false;
  if (hasTag(attr.tags, "fixed")) return false;
  // Catalog-managed / inferred values are not filled by the seller.
  if (hasTag(attr.tags, "inferred")) return false;
  // Variation attributes are handled per-variation, not on the main sheet.
  if (hasTag(attr.tags, "allow_variations")) return false;
  if (hasTag(attr.tags, "variation_attribute")) return false;
  return true;
}

/** An attribute is REQUIRED when ML tags it required or catalog_required. */
export function isRequiredAttribute(attr: RawCategoryAttribute): boolean {
  return (
    hasTag(attr.tags, "required") || hasTag(attr.tags, "catalog_required")
  );
}

/** True when the item value for an attribute counts as "filled". */
export function isFilled(value: RawItemAttribute | undefined): boolean {
  if (!value) return false;
  // value_id === "-1" means the seller explicitly marked "Não se aplica".
  // ML treats that as resolved, so we count it as filled (not missing).
  if (value.value_id != null && String(value.value_id).trim() === "-1") return true;
  const name = value.value_name;
  if (name != null && String(name).trim() !== "") return true;
  // Some list attributes carry value_id but a null name; treat id as filled.
  if (value.value_id != null && String(value.value_id).trim() !== "") return true;
  return false;
}

/**
 * Build the per-listing technical-sheet diagnosis from the category attribute
 * catalog and the item's own attributes.
 */
export function diagnoseListing(params: {
  itemId: string;
  title: string;
  status: ListingStatus;
  thumbnail?: string;
  permalink?: string;
  categoryId?: string;
  categoryAttributes: RawCategoryAttribute[];
  itemAttributes: RawItemAttribute[];
}): TechSpecListing {
  const itemMap = new Map<string, RawItemAttribute>();
  for (const a of params.itemAttributes ?? []) {
    if (a && typeof a.id === "string") itemMap.set(a.id, a);
  }

  const relevant = (params.categoryAttributes ?? []).filter(isRelevantAttribute);

  const attributes: TechAttribute[] = relevant.map((attr) => {
    const itemAttr = itemMap.get(attr.id);
    const filled = isFilled(itemAttr);
    return {
      id: attr.id,
      name: attr.name ?? attr.id,
      valueType: mapValueType(attr.value_type),
      required: isRequiredAttribute(attr),
      valueName: filled ? (itemAttr?.value_name ?? null) : null,
      isMissing: !filled,
    };
  });

  // Sort: missing-required first, then missing-optional, then filled.
  attributes.sort((a, b) => {
    const rank = (x: TechAttribute) =>
      x.isMissing && x.required ? 0 : x.isMissing ? 1 : 2;
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });

  const totalAttributes = attributes.length;
  const filledAttributes = attributes.filter((a) => !a.isMissing).length;
  const missingAttributes = totalAttributes - filledAttributes;
  const missingRequired = attributes.filter(
    (a) => a.isMissing && a.required,
  ).length;
  const completeness =
    totalAttributes > 0 ? filledAttributes / totalAttributes : 1;

  return {
    itemId: params.itemId,
    title: params.title,
    status: params.status,
    thumbnail: params.thumbnail,
    permalink: params.permalink,
    categoryId: params.categoryId,
    totalAttributes,
    filledAttributes,
    missingAttributes,
    missingRequired,
    completeness,
    complete: missingAttributes === 0,
    attributes,
  };
}

/** Aggregate per-listing diagnoses into the summary used by the card header. */
export function summarizeTechSpecs(
  items: TechSpecListing[],
  capped = false,
): TechSpecsSummary {
  const total = items.length;
  const complete = items.filter((i) => i.complete).length;
  const incomplete = total - complete;
  const withMissingRequired = items.filter((i) => i.missingRequired > 0).length;
  const totalMissing = items.reduce((s, i) => s + i.missingAttributes, 0);
  const totalMissingRequired = items.reduce((s, i) => s + i.missingRequired, 0);
  const avgCompleteness =
    total > 0 ? items.reduce((s, i) => s + i.completeness, 0) / total : 0;
  return {
    total,
    complete,
    incomplete,
    withMissingRequired,
    avgCompleteness,
    totalMissing,
    totalMissingRequired,
    capped,
  };
}

export function buildTechSpecsResult(
  items: TechSpecListing[],
  capped = false,
): TechSpecsResult {
  return { summary: summarizeTechSpecs(items, capped), items };
}
