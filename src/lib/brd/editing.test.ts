import { describe, expect, it } from "vitest";

import { FieldStatus, REQUIREMENT_FIELD_KEYS } from "@/lib/requirements/fields";
import {
  brdContentSchema,
  brdManualEditsSchema,
  createEmptyBrdContent,
  createInitialRequirementFields,
  type RequirementFields,
} from "@/lib/requirements/schemas";

import { applyBrdEdits, normalizeBrdFieldValue, regenerateBrdContent } from "./editing";
import { determineBrdStatus, generateBrdContent } from "./generation";

const EDITED_AT = new Date("2026-10-23T18:00:00.000Z");

function allProvided(): RequirementFields {
  const fields = createInitialRequirementFields();
  for (const key of REQUIREMENT_FIELD_KEYS) fields[key] = { value: `Latest ${key}`, status: FieldStatus.PROVIDED, clarificationCount: 0 };
  return fields;
}

describe("normalizeBrdFieldValue", () => {
  it("trims, unifies line endings and turns empty input into null", () => {
    expect(normalizeBrdFieldValue("  Line one\r\nLine two  ")).toBe("Line one\nLine two");
    expect(normalizeBrdFieldValue(" \n\t ")).toBeNull();
    expect(normalizeBrdFieldValue("")).toBeNull();
    expect(normalizeBrdFieldValue(null)).toBeNull();
  });
});

describe("applyBrdEdits", () => {
  it("stores changed values and marks only those fields as manually edited", () => {
    const content = generateBrdContent(allProvided());
    const result = applyBrdEdits(content, {}, { keyMetrics: "Churn rate per month", dataSources: "Latest dataSources" }, EDITED_AT);

    expect(result.content.keyMetrics).toBe("Churn rate per month");
    // Saving an unchanged value is not a manual edit.
    expect(result.changedFields).toEqual(["keyMetrics"]);
    expect(result.manualEdits).toEqual({ keyMetrics: { editedAt: "2026-10-23T18:00:00.000Z" } });
    expect(brdManualEditsSchema.safeParse(result.manualEdits).success).toBe(true);
    // Inputs are not mutated.
    expect(content.keyMetrics).toBe("Latest keyMetrics");
  });

  it("stores a cleared field as null, which makes the document a Draft", () => {
    const content = generateBrdContent(allProvided());
    const result = applyBrdEdits(content, {}, { successCriteria: "   " }, EDITED_AT);
    expect(result.content.successCriteria).toBeNull();
    expect(result.changedFields).toEqual(["successCriteria"]);
    expect(brdContentSchema.safeParse(result.content).success).toBe(true);
    expect(determineBrdStatus(content)).toBe("READY_FOR_REVIEW");
    expect(determineBrdStatus(result.content)).toBe("DRAFT");
  });

  it("fills a not specified field manually", () => {
    const result = applyBrdEdits(createEmptyBrdContent(), {}, { intendedUsers: "Retention managers" }, EDITED_AT);
    expect(result.content.intendedUsers).toBe("Retention managers");
    expect(Object.keys(result.manualEdits)).toEqual(["intendedUsers"]);
  });

  it("keeps earlier edit metadata of fields that were not changed", () => {
    const manualEdits = { problemStatement: { editedAt: "2026-10-22T10:00:00.000Z" } };
    const content = { ...createEmptyBrdContent(), problemStatement: "Edited earlier" };
    const result = applyBrdEdits(content, manualEdits, { problemStatement: "Edited earlier" }, EDITED_AT);
    expect(result.changedFields).toEqual([]);
    expect(result.manualEdits).toEqual(manualEdits);
  });
});

describe("regenerateBrdContent", () => {
  it("preserves manual edits and fills only empty fields from the latest requirements (Scenario E)", () => {
    const initial = createInitialRequirementFields();
    initial.problemStatement = { value: "Original problem", status: FieldStatus.PROVIDED, clarificationCount: 0 };
    const generated = generateBrdContent(initial);
    const edited = applyBrdEdits(generated, {}, { problemStatement: "Edited problem", keyMetrics: "Edited metric" }, EDITED_AT);

    const result = regenerateBrdContent(edited.content, edited.manualEdits, allProvided());

    expect(result.content.problemStatement).toBe("Edited problem");
    expect(result.content.keyMetrics).toBe("Edited metric");
    expect(result.content.dataSources).toBe("Latest dataSources");
    expect(result.changedFields).toHaveLength(16);
    expect(result.changedFields).not.toContain("problemStatement");
    expect(result.manualEdits).toEqual(edited.manualEdits);
    expect(determineBrdStatus(result.content)).toBe("READY_FOR_REVIEW");
  });

  it("keeps generated content that is not empty, even if the requirement changed since", () => {
    const content = { ...createEmptyBrdContent(), dataSources: "CRM" };
    const result = regenerateBrdContent(content, {}, allProvided());
    expect(result.content.dataSources).toBe("CRM");
  });

  it("does not fill fields whose requirement is not provided", () => {
    const fields = createInitialRequirementFields();
    fields.intendedUsers = { value: "people", status: FieldStatus.NEEDS_CLARIFICATION, clarificationCount: 1 };
    fields.dataSources = { value: null, status: FieldStatus.SKIPPED, clarificationCount: 2 };

    const result = regenerateBrdContent(createEmptyBrdContent(), {}, fields);
    expect(result.changedFields).toEqual([]);
    expect(result.content).toEqual(createEmptyBrdContent());
  });

  it("fills a field the user cleared and counts it as generated again", () => {
    const content = generateBrdContent(allProvided());
    const cleared = applyBrdEdits(content, {}, { reportingPeriod: "" }, EDITED_AT);
    const result = regenerateBrdContent(cleared.content, cleared.manualEdits, allProvided());
    expect(result.content.reportingPeriod).toBe("Latest reportingPeriod");
    expect(result.changedFields).toEqual(["reportingPeriod"]);
    expect(result.manualEdits).toEqual({});
  });
});
