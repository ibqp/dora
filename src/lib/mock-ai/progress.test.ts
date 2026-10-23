import { describe, expect, it } from "vitest";

import { FieldStatus, REQUIREMENT_FIELD_KEYS } from "@/lib/requirements/fields";
import { createInitialRequirementFields } from "@/lib/requirements/schemas";

import { processTurn } from "./engine";
import { buildRequirementsProgress } from "./progress";
import { createInitialDiscoveryState } from "./state";

describe("buildRequirementsProgress", () => {
  it("starts at 0% with all fields missing and the initial stage current", () => {
    const progress = buildRequirementsProgress(createInitialDiscoveryState());
    expect(progress).toMatchObject({ completenessPercentage: 0, completedCount: 0, totalCount: 18, stage: "INITIAL_REQUEST" });
    expect(progress.stages.map((s) => s.status)).toEqual(["current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(progress.sections.flatMap((s) => s.fields)).toHaveLength(18);
    expect(progress.sections.flatMap((s) => s.fields).every((f) => f.status === "MISSING" && f.value === null)).toBe(true);
  });

  it("counts only provided fields; skipped, missing and unclear fields stay incomplete", () => {
    const fields = createInitialRequirementFields();
    fields.problemStatement = { value: "Churn is rising", status: FieldStatus.PROVIDED, clarificationCount: 0 };
    fields.desiredOutcome = { value: "Reduce churn", status: FieldStatus.PROVIDED, clarificationCount: 0 };
    fields.currentSituation = { value: null, status: FieldStatus.SKIPPED, clarificationCount: 2 };
    fields.businessImpact = { value: "a lot", status: FieldStatus.NEEDS_CLARIFICATION, clarificationCount: 1 };

    const progress = buildRequirementsProgress({ stage: "REQUIREMENTS_DISCOVERY", fields, currentField: "expectedValue" });
    expect(progress).toMatchObject({ completenessPercentage: 11, completedCount: 2 });

    const businessProblem = progress.sections.find((s) => s.key === "businessProblem")!;
    expect(businessProblem).toMatchObject({ completedCount: 1, totalCount: 3 });
    expect(businessProblem.fields.map((f) => [f.key, f.status, f.value])).toEqual([
      ["problemStatement", "PROVIDED", "Churn is rising"],
      ["currentSituation", "SKIPPED", null],
      ["businessImpact", "NEEDS_CLARIFICATION", null],
    ]);
    expect(progress.sections.flatMap((s) => s.fields).filter((f) => f.isCurrent).map((f) => f.key)).toEqual(["expectedValue"]);
    expect(progress.stages.map((s) => s.status).slice(0, 3)).toEqual(["completed", "completed", "current"]);
  });

  it("does not depend on the number of messages exchanged", () => {
    let state = processTurn({ message: "I need a churn dashboard", state: createInitialDiscoveryState(), role: "REQUIREMENTS_DISCOVERY" }).state;
    const before = buildRequirementsProgress(state);
    for (const message of ["hmm", "?", "The data source is CRM."]) {
      state = processTurn({ message, state, role: "REQUIREMENTS_DISCOVERY" }).state;
    }
    const after = buildRequirementsProgress(state);
    // Three more messages, but only one field (data sources) became provided.
    expect(after.completedCount - before.completedCount).toBe(1);
    expect(after.completenessPercentage).toBe(6);
  });

  it("reaches 100% only when all 18 fields are provided", () => {
    const fields = createInitialRequirementFields();
    for (const key of REQUIREMENT_FIELD_KEYS) fields[key] = { value: "x", status: FieldStatus.PROVIDED, clarificationCount: 0 };
    expect(buildRequirementsProgress({ stage: "REQUIREMENTS_REVIEW", fields, currentField: null }).completenessPercentage).toBe(100);
  });
});
