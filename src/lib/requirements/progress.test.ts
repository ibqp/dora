import { describe, expect, it } from "vitest";

import { FieldStatus, REQUIREMENT_FIELD_KEYS } from "./fields";
import { calculateCompleteness, calculateRequirementsCompleteness, countCompletedFields, listIncompleteFields } from "./progress";
import { createInitialRequirementFields } from "./schemas";

describe("completeness", () => {
  it("is completed / total * 100, rounded", () => {
    expect(calculateCompleteness(0)).toBe(0);
    expect(calculateCompleteness(1)).toBe(6);
    expect(calculateCompleteness(9)).toBe(50);
    expect(calculateCompleteness(17)).toBe(94);
    expect(calculateCompleteness(18)).toBe(100);
    expect(calculateCompleteness(25)).toBe(100);
  });

  it("counts only PROVIDED fields", () => {
    const fields = createInitialRequirementFields();
    fields.problemStatement = { value: "Churn is rising", status: FieldStatus.PROVIDED, clarificationCount: 0 };
    fields.keyMetrics = { value: "churn rate", status: FieldStatus.PROVIDED, clarificationCount: 1 };
    fields.dataSources = { value: null, status: FieldStatus.SKIPPED, clarificationCount: 2 };
    fields.intendedUsers = { value: "people", status: FieldStatus.NEEDS_CLARIFICATION, clarificationCount: 1 };

    expect(countCompletedFields(fields)).toBe(2);
    expect(calculateRequirementsCompleteness(fields)).toBe(11);
    expect(listIncompleteFields(fields)).toHaveLength(16);
    expect(listIncompleteFields(fields)).toContain("dataSources");
  });

  it("is 100 only when all 18 fields are provided", () => {
    const fields = createInitialRequirementFields();
    for (const key of REQUIREMENT_FIELD_KEYS) fields[key] = { value: "x", status: FieldStatus.PROVIDED, clarificationCount: 0 };
    expect(calculateRequirementsCompleteness(fields)).toBe(100);
    fields.validationCriteria = { value: null, status: FieldStatus.SKIPPED, clarificationCount: 0 };
    expect(calculateRequirementsCompleteness(fields)).toBe(94);
  });
});
