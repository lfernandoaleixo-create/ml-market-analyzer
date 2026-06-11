import { describe, it, expect } from "vitest";
import {
  hasTag,
  mapValueType,
  isRelevantAttribute,
  isRequiredAttribute,
  isFilled,
  diagnoseListing,
  summarizeTechSpecs,
  type RawCategoryAttribute,
  type RawItemAttribute,
} from "@shared/technicalSpecs";

describe("hasTag", () => {
  it("reads object-style tags", () => {
    expect(hasTag({ required: true }, "required")).toBe(true);
    expect(hasTag({ required: false }, "required")).toBe(false);
  });
  it("reads array-style tags", () => {
    expect(hasTag(["required", "hidden"], "hidden")).toBe(true);
    expect(hasTag(["required"], "hidden")).toBe(false);
  });
  it("handles missing tags", () => {
    expect(hasTag(undefined, "required")).toBe(false);
  });
});

describe("mapValueType", () => {
  it("maps known types", () => {
    expect(mapValueType("number")).toBe("number");
    expect(mapValueType("number_unit")).toBe("number_unit");
    expect(mapValueType("list")).toBe("list");
    expect(mapValueType("boolean")).toBe("boolean");
  });
  it("falls back to string", () => {
    expect(mapValueType(undefined)).toBe("string");
    expect(mapValueType("weird")).toBe("string");
  });
});

describe("isRelevantAttribute", () => {
  it("excludes hidden / vip_hidden / read_only / variation attributes", () => {
    expect(isRelevantAttribute({ id: "A", name: "A", tags: { hidden: true } })).toBe(false);
    expect(isRelevantAttribute({ id: "B", name: "B", tags: { vip_hidden: true } })).toBe(false);
    expect(isRelevantAttribute({ id: "C", name: "C", tags: { read_only: true } })).toBe(false);
    expect(isRelevantAttribute({ id: "D", name: "D", tags: { allow_variations: true } })).toBe(false);
  });
  it("keeps normal and required attributes", () => {
    expect(isRelevantAttribute({ id: "BRAND", name: "Marca", tags: { required: true } })).toBe(true);
    expect(isRelevantAttribute({ id: "X", name: "X", tags: {} })).toBe(true);
  });
});

describe("isRequiredAttribute", () => {
  it("treats required and catalog_required as required", () => {
    expect(isRequiredAttribute({ id: "A", name: "A", tags: { required: true } })).toBe(true);
    expect(isRequiredAttribute({ id: "B", name: "B", tags: { catalog_required: true } })).toBe(true);
    expect(isRequiredAttribute({ id: "C", name: "C", tags: {} })).toBe(false);
  });
});

describe("isFilled", () => {
  it("counts value_name", () => {
    expect(isFilled({ id: "A", value_name: "Acme" })).toBe(true);
  });
  it("counts value_id", () => {
    expect(isFilled({ id: "A", value_name: null, value_id: "123" })).toBe(true);
  });
  it('counts "Não se aplica" (value_id === -1) as filled', () => {
    expect(isFilled({ id: "A", value_name: null, value_id: "-1" })).toBe(true);
  });
  it("treats empty / missing as not filled", () => {
    expect(isFilled({ id: "A", value_name: "  ", value_id: null })).toBe(false);
    expect(isFilled(undefined)).toBe(false);
  });
});

const categoryAttributes: RawCategoryAttribute[] = [
  { id: "BRAND", name: "Marca", value_type: "string", tags: { required: true, catalog_required: true } },
  { id: "MODEL", name: "Modelo", value_type: "string", tags: { required: true } },
  { id: "MATERIAL", name: "Material", value_type: "string", tags: {} },
  { id: "SALE_FORMAT", name: "Formato de venda", value_type: "list", tags: {}, values: [{ id: "1", name: "Unidade" }] },
  { id: "COLOR", name: "Cor", value_type: "string", tags: { allow_variations: true } }, // excluded
  { id: "PAIRS", name: "Pares", value_type: "number", tags: { hidden: true } }, // excluded
];

describe("diagnoseListing", () => {
  it("computes completeness and missing-required correctly", () => {
    const itemAttributes: RawItemAttribute[] = [
      { id: "BRAND", value_name: "Hashi", value_id: "1" }, // filled
      { id: "MATERIAL", value_name: null, value_id: "-1" }, // "Não se aplica" → filled
      // MODEL missing (required), SALE_FORMAT missing (optional)
    ];
    const d = diagnoseListing({
      itemId: "MLB1",
      title: "Produto 1",
      status: "active",
      categoryId: "MLBX",
      categoryAttributes,
      itemAttributes,
    });
    // 4 relevant (BRAND, MODEL, MATERIAL, SALE_FORMAT); COLOR + PAIRS excluded
    expect(d.totalAttributes).toBe(4);
    expect(d.filledAttributes).toBe(2); // BRAND + MATERIAL(N/A)
    expect(d.missingAttributes).toBe(2); // MODEL + SALE_FORMAT
    expect(d.missingRequired).toBe(1); // MODEL
    expect(d.complete).toBe(false);
    expect(d.completeness).toBeCloseTo(0.5, 5);
    // Missing-required must sort first
    expect(d.attributes[0].id).toBe("MODEL");
  });

  it("marks a fully-filled sheet as complete", () => {
    const itemAttributes: RawItemAttribute[] = [
      { id: "BRAND", value_name: "Hashi" },
      { id: "MODEL", value_name: "M1" },
      { id: "MATERIAL", value_name: "Bambu" },
      { id: "SALE_FORMAT", value_name: "Unidade", value_id: "1" },
    ];
    const d = diagnoseListing({
      itemId: "MLB2",
      title: "Produto 2",
      status: "active",
      categoryAttributes,
      itemAttributes,
    });
    expect(d.complete).toBe(true);
    expect(d.missingAttributes).toBe(0);
    expect(d.missingRequired).toBe(0);
    expect(d.completeness).toBe(1);
  });

  it("handles empty category catalog as complete (no expectations)", () => {
    const d = diagnoseListing({
      itemId: "MLB3",
      title: "Produto 3",
      status: "paused",
      categoryAttributes: [],
      itemAttributes: [],
    });
    expect(d.totalAttributes).toBe(0);
    expect(d.complete).toBe(true);
    expect(d.completeness).toBe(1);
  });
});

describe("summarizeTechSpecs", () => {
  it("aggregates counts and averages", () => {
    const a = diagnoseListing({
      itemId: "A", title: "A", status: "active",
      categoryAttributes,
      itemAttributes: [{ id: "BRAND", value_name: "X" }], // missing MODEL(req), MATERIAL, SALE_FORMAT
    });
    const b = diagnoseListing({
      itemId: "B", title: "B", status: "active",
      categoryAttributes,
      itemAttributes: [
        { id: "BRAND", value_name: "X" }, { id: "MODEL", value_name: "Y" },
        { id: "MATERIAL", value_name: "Z" }, { id: "SALE_FORMAT", value_id: "1" },
      ], // complete
    });
    const s = summarizeTechSpecs([a, b], false);
    expect(s.total).toBe(2);
    expect(s.complete).toBe(1);
    expect(s.incomplete).toBe(1);
    expect(s.withMissingRequired).toBe(1); // only A misses a required
    expect(s.totalMissing).toBe(3); // A misses 3
    expect(s.totalMissingRequired).toBe(1); // A misses MODEL
    expect(s.avgCompleteness).toBeCloseTo((0.25 + 1) / 2, 5);
  });
});
