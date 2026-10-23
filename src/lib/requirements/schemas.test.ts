import { describe, expect, it } from "vitest";

import {
  BRD_SECTIONS,
  FieldStatus,
  REQUIREMENT_FIELD_KEYS,
  REQUIREMENT_FIELDS,
  TOTAL_REQUIRED_FIELDS,
} from "./fields";
import {
  brdContentSchema,
  brdManualEditsSchema,
  createEmptyBrdContent,
  createInitialRequirementFields,
  requirementFieldsSchema,
} from "./schemas";

describe("requirement field catalog", () => {
  it("defines 18 unique fields across the seven BRD sections", () => {
    expect(BRD_SECTIONS).toHaveLength(7);
    expect(BRD_SECTIONS.map((section) => section.fields.length)).toEqual([3, 2, 2, 3, 4, 2, 2]);
    expect(TOTAL_REQUIRED_FIELDS).toBe(18);
    expect(new Set(REQUIREMENT_FIELD_KEYS).size).toBe(18);
  });

  it("assigns every field to its section", () => {
    const dataFields = REQUIREMENT_FIELDS.filter((field) => field.section === "dataRequirements");
    expect(dataFields.map((field) => field.key)).toEqual([
      "dataSources",
      "dataElements",
      "reportingPeriod",
      "dataGranularity",
    ]);
  });
});

describe("requirementFieldsSchema", () => {
  it("accepts the initial state, with every field missing and no clarification attempts", () => {
    const fields = requirementFieldsSchema.parse(createInitialRequirementFields());
    expect(Object.keys(fields)).toHaveLength(18);
    for (const field of Object.values(fields)) {
      expect(field).toEqual({ value: null, status: FieldStatus.MISSING, clarificationCount: 0 });
    }
  });

  it("rejects a state with a missing field key", () => {
    const incomplete: Partial<ReturnType<typeof createInitialRequirementFields>> =
      createInitialRequirementFields();
    delete incomplete.problemStatement;
    expect(requirementFieldsSchema.safeParse(incomplete).success).toBe(false);
  });

  it("rejects unknown field keys", () => {
    const fields = { ...createInitialRequirementFields(), budget: createInitialRequirementFields().keyMetrics };
    expect(requirementFieldsSchema.safeParse(fields).success).toBe(false);
  });

  it("rejects a PROVIDED field without a value", () => {
    const fields = createInitialRequirementFields();
    fields.keyMetrics = { value: null, status: FieldStatus.PROVIDED, clarificationCount: 0 };
    expect(requirementFieldsSchema.safeParse(fields).success).toBe(false);
  });

  it("rejects blank values and negative clarification counters", () => {
    const blank = createInitialRequirementFields();
    blank.keyMetrics = { value: "   ", status: FieldStatus.PROVIDED, clarificationCount: 0 };
    expect(requirementFieldsSchema.safeParse(blank).success).toBe(false);

    const negative = createInitialRequirementFields();
    negative.keyMetrics = { value: null, status: FieldStatus.MISSING, clarificationCount: -1 };
    expect(requirementFieldsSchema.safeParse(negative).success).toBe(false);
  });

  it("accepts provided, skipped and needs-clarification fields", () => {
    const fields = createInitialRequirementFields();
    fields.keyMetrics = { value: "Monthly churn rate", status: FieldStatus.PROVIDED, clarificationCount: 0 };
    fields.dataSources = { value: null, status: FieldStatus.SKIPPED, clarificationCount: 2 };
    fields.intendedUsers = { value: "people", status: FieldStatus.NEEDS_CLARIFICATION, clarificationCount: 1 };
    expect(requirementFieldsSchema.safeParse(fields).success).toBe(true);
  });
});

describe("BRD JSON schemas", () => {
  it("accepts empty content with every field not specified", () => {
    const content = brdContentSchema.parse(createEmptyBrdContent());
    expect(Object.values(content).every((value) => value === null)).toBe(true);
  });

  it("accepts partial manual edit metadata and rejects unknown keys or bad timestamps", () => {
    expect(
      brdManualEditsSchema.safeParse({ keyMetrics: { editedAt: "2026-10-23T18:00:00.000Z" } }).success,
    ).toBe(true);
    expect(brdManualEditsSchema.safeParse({}).success).toBe(true);
    expect(
      brdManualEditsSchema.safeParse({ budget: { editedAt: "2026-10-23T18:00:00.000Z" } }).success,
    ).toBe(false);
    expect(brdManualEditsSchema.safeParse({ keyMetrics: { editedAt: "yesterday" } }).success).toBe(
      false,
    );
  });
});
