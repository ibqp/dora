import { describe, expect, it } from "vitest";

import { AssistantRole } from "@/generated/prisma/enums";
import { FieldStatus, REQUIREMENT_FIELD_KEYS, type RequirementFieldKey } from "@/lib/requirements/fields";
import { createInitialRequirementFields, type RequirementFields } from "@/lib/requirements/schemas";

import { getStageProgress } from "./progress";
import { ROLE_PROFILES } from "./roles";
import { canTransition, DISCOVERY_STAGE_ORDER, resolveNextStep } from "./state-machine";

function withStatus(fields: RequirementFields, keys: readonly RequirementFieldKey[], status: FieldStatus) {
  for (const key of keys) {
    fields[key] = { value: status === FieldStatus.PROVIDED ? "value" : null, status, clarificationCount: 0 };
  }
  return fields;
}

describe("discovery state machine", () => {
  it("has six stages in the specified order and only moves forward", () => {
    expect(DISCOVERY_STAGE_ORDER).toEqual([
      "INITIAL_REQUEST",
      "BUSINESS_PROBLEM_VALIDATION",
      "REQUIREMENTS_DISCOVERY",
      "REQUIREMENTS_CLARIFICATION",
      "REQUIREMENTS_REVIEW",
      "BRD_GENERATION",
    ]);
    expect(canTransition("REQUIREMENTS_DISCOVERY", "REQUIREMENTS_REVIEW")).toBe(true);
    expect(canTransition("REQUIREMENTS_REVIEW", "BUSINESS_PROBLEM_VALIDATION")).toBe(false);
  });

  it("always starts with business problem validation", () => {
    for (const role of Object.values(AssistantRole)) {
      expect(resolveNextStep(createInitialRequirementFields(), "INITIAL_REQUEST", role)).toEqual({
        stage: "BUSINESS_PROBLEM_VALIDATION",
        field: "problemStatement",
      });
    }
  });

  it("stays in validation until the role's validation fields are resolved", () => {
    const fields = withStatus(createInitialRequirementFields(), ["problemStatement"], FieldStatus.PROVIDED);
    expect(resolveNextStep(fields, "BUSINESS_PROBLEM_VALIDATION", "REQUIREMENTS_DISCOVERY")).toEqual({
      stage: "BUSINESS_PROBLEM_VALIDATION",
      field: "desiredOutcome",
    });
    withStatus(fields, ["desiredOutcome"], FieldStatus.SKIPPED);
    expect(resolveNextStep(fields, "BUSINESS_PROBLEM_VALIDATION", "REQUIREMENTS_DISCOVERY").stage).toBe(
      "REQUIREMENTS_DISCOVERY",
    );
    // The XY role validates all five problem and objective fields.
    expect(resolveNextStep(fields, "BUSINESS_PROBLEM_VALIDATION", "XY_PROBLEM_DIAGNOSTIC")).toEqual({
      stage: "BUSINESS_PROBLEM_VALIDATION",
      field: "currentSituation",
    });
  });

  it("asks missing fields in discovery, then fields needing clarification, then reviews", () => {
    const fields = withStatus(createInitialRequirementFields(), REQUIREMENT_FIELD_KEYS, FieldStatus.PROVIDED);
    withStatus(fields, ["keyMetrics"], FieldStatus.NEEDS_CLARIFICATION);
    withStatus(fields, ["dataSources"], FieldStatus.MISSING);

    expect(resolveNextStep(fields, "REQUIREMENTS_DISCOVERY", "REQUIREMENTS_DISCOVERY")).toEqual({
      stage: "REQUIREMENTS_DISCOVERY",
      field: "dataSources",
    });
    withStatus(fields, ["dataSources"], FieldStatus.SKIPPED);
    expect(resolveNextStep(fields, "REQUIREMENTS_DISCOVERY", "REQUIREMENTS_DISCOVERY")).toEqual({
      stage: "REQUIREMENTS_CLARIFICATION",
      field: "keyMetrics",
    });
    withStatus(fields, ["keyMetrics"], FieldStatus.PROVIDED);
    expect(resolveNextStep(fields, "REQUIREMENTS_CLARIFICATION", "REQUIREMENTS_DISCOVERY")).toEqual({
      stage: "REQUIREMENTS_REVIEW",
      field: null,
    });
  });

  it("never asks about a field that is already provided", () => {
    const fields = createInitialRequirementFields();
    for (const key of REQUIREMENT_FIELD_KEYS) {
      const step = resolveNextStep(fields, "REQUIREMENTS_DISCOVERY", "REQUIREMENTS_DISCOVERY");
      expect(step.field).not.toBeNull();
      expect(fields[step.field!].status).not.toBe(FieldStatus.PROVIDED);
      withStatus(fields, [step.field!], FieldStatus.PROVIDED);
      void key;
    }
    expect(resolveNextStep(fields, "REQUIREMENTS_DISCOVERY", "REQUIREMENTS_DISCOVERY").stage).toBe("REQUIREMENTS_REVIEW");
  });
});

describe("roles", () => {
  it("each role orders all 18 fields and validates the business problem first", () => {
    for (const profile of Object.values(ROLE_PROFILES)) {
      expect([...profile.fieldPriority].sort()).toEqual([...REQUIREMENT_FIELD_KEYS].sort());
      expect(profile.validationFields[0]).toBe("problemStatement");
      expect(profile.validationFields).toContain("desiredOutcome");
    }
  });

  it("roles change question priorities", () => {
    const fields = withStatus(createInitialRequirementFields(), ["problemStatement", "desiredOutcome"], FieldStatus.PROVIDED);
    const next = (role: AssistantRole) => resolveNextStep(fields, "REQUIREMENTS_DISCOVERY", role).field;
    expect(next("REQUIREMENTS_DISCOVERY")).toBe("currentSituation");
    expect(next("DATA_REQUIREMENTS_ANALYST")).toBe("keyMetrics");
    expect(next("BRD_GENERATOR")).toBe("currentSituation");
  });
});

describe("getStageProgress", () => {
  it("marks earlier stages completed and later ones upcoming", () => {
    expect(getStageProgress("REQUIREMENTS_DISCOVERY").map((stage) => stage.status)).toEqual([
      "completed",
      "completed",
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });
});
