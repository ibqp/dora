import { describe, expect, it } from "vitest";

import { FieldStatus, REQUIREMENT_FIELD_KEYS } from "@/lib/requirements/fields";
import { brdContentSchema, createInitialRequirementFields, type RequirementFields } from "@/lib/requirements/schemas";

import {
  buildBrdPdfFileName,
  buildBrdSections,
  buildBrdTitle,
  calculateBrdCompleteness,
  determineBrdStatus,
  generateBrdContent,
  listMissingRequirements,
} from "./generation";

function allProvided(): RequirementFields {
  const fields = createInitialRequirementFields();
  for (const key of REQUIREMENT_FIELD_KEYS) fields[key] = { value: `Value for ${key}`, status: FieldStatus.PROVIDED, clarificationCount: 0 };
  return fields;
}

describe("generateBrdContent", () => {
  it("takes over provided values only and leaves every other field unspecified", () => {
    const fields = createInitialRequirementFields();
    fields.problemStatement = { value: "Churn rose to 1.8%", status: FieldStatus.PROVIDED, clarificationCount: 0 };
    fields.intendedUsers = { value: "people", status: FieldStatus.NEEDS_CLARIFICATION, clarificationCount: 1 };
    fields.dataSources = { value: null, status: FieldStatus.SKIPPED, clarificationCount: 2 };

    const content = generateBrdContent(fields);
    expect(brdContentSchema.safeParse(content).success).toBe(true);
    expect(content.problemStatement).toBe("Churn rose to 1.8%");
    // A vague answer awaiting clarification is not copied into the document.
    expect(content.intendedUsers).toBeNull();
    expect(content.dataSources).toBeNull();
    expect(Object.values(content).filter((value) => value !== null)).toEqual(["Churn rose to 1.8%"]);
  });

  it("never invents content for an empty requirement state", () => {
    const content = generateBrdContent(createInitialRequirementFields());
    expect(Object.keys(content)).toHaveLength(18);
    expect(Object.values(content).every((value) => value === null)).toBe(true);
  });
});

describe("BRD status and completeness", () => {
  it("is a Draft while any required field is missing", () => {
    const fields = allProvided();
    fields.validationCriteria = { value: null, status: FieldStatus.SKIPPED, clarificationCount: 0 };
    const content = generateBrdContent(fields);
    expect(determineBrdStatus(content)).toBe("DRAFT");
    expect(calculateBrdCompleteness(content)).toBe(94);
  });

  it("is Ready for Review only when all 18 fields have content", () => {
    const content = generateBrdContent(allProvided());
    expect(determineBrdStatus(content)).toBe("READY_FOR_REVIEW");
    expect(calculateBrdCompleteness(content)).toBe(100);
  });

  it("lists the missing requirements in document order", () => {
    const fields = allProvided();
    fields.keyMetrics = { value: null, status: FieldStatus.MISSING, clarificationCount: 0 };
    fields.problemStatement = { value: null, status: FieldStatus.SKIPPED, clarificationCount: 2 };
    expect(listMissingRequirements(fields)).toEqual([
      { key: "problemStatement", label: "Problem statement", status: "SKIPPED" },
      { key: "keyMetrics", label: "Key business metrics", status: "MISSING" },
    ]);
  });
});

describe("BRD structure", () => {
  it("has the seven mandatory sections with all 18 fields", () => {
    const sections = buildBrdSections(generateBrdContent(createInitialRequirementFields()), {});
    expect(sections.map((section) => section.title)).toEqual([
      "Business Problem",
      "Business Objectives",
      "Stakeholders",
      "Functional Requirements",
      "Data Requirements",
      "KPIs and Success Metrics",
      "Acceptance Criteria",
    ]);
    expect(sections.flatMap((section) => section.fields)).toHaveLength(18);
  });

  it("marks manually edited fields", () => {
    const sections = buildBrdSections(generateBrdContent(allProvided()), { keyMetrics: { editedAt: "2026-10-23T18:00:00.000Z" } });
    const fields = sections.flatMap((section) => section.fields);
    expect(fields.filter((field) => field.manuallyEdited).map((field) => field.key)).toEqual(["keyMetrics"]);
  });

  it("derives the title from the session title", () => {
    expect(buildBrdTitle("Churn analysis")).toBe("BRD: Churn analysis");
    expect(buildBrdTitle("x".repeat(250))).toHaveLength(200);
  });
});

describe("buildBrdPdfFileName", () => {
  it("derives a safe file name from the title", () => {
    expect(buildBrdPdfFileName("BRD: Churn analysis")).toBe("BRD Churn analysis.pdf");
    expect(buildBrdPdfFileName("BRD: Q3/Q4 sales — \"North\" region?")).toBe("BRD Q3 Q4 sales North region.pdf");
    expect(buildBrdPdfFileName("BRD: Ärger mit Kündigungen")).toBe("BRD Ärger mit Kündigungen.pdf");
    expect(buildBrdPdfFileName("../../etc/passwd")).toBe("etc passwd.pdf");
    expect(buildBrdPdfFileName("***")).toBe("BRD.pdf");
    expect(buildBrdPdfFileName("x".repeat(300))).toHaveLength(104);
  });
});
