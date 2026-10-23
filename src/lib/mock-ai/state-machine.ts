/**
 * Explicit six-stage discovery state machine (MASTER_SPEC.md §4).
 *
 *   INITIAL_REQUEST → BUSINESS_PROBLEM_VALIDATION → REQUIREMENTS_DISCOVERY
 *     → REQUIREMENTS_CLARIFICATION → REQUIREMENTS_REVIEW → BRD_GENERATION
 *
 * Stages only move forward. A stage is left when its exit condition holds:
 * - Validation: every validation field of the role is PROVIDED or SKIPPED (mandatory for all roles).
 * - Discovery: no field is MISSING (each field has been asked once).
 * - Clarification: no field NEEDS_CLARIFICATION.
 * - Review: the user confirmed the summary.
 */
import { AssistantRole, DiscoveryStage } from "@/generated/prisma/enums";
import { FieldStatus, type RequirementFieldKey } from "@/lib/requirements/fields";
import type { RequirementFields } from "@/lib/requirements/schemas";

import { getRoleProfile } from "./roles";

export const DISCOVERY_STAGE_ORDER: readonly DiscoveryStage[] = [
  DiscoveryStage.INITIAL_REQUEST,
  DiscoveryStage.BUSINESS_PROBLEM_VALIDATION,
  DiscoveryStage.REQUIREMENTS_DISCOVERY,
  DiscoveryStage.REQUIREMENTS_CLARIFICATION,
  DiscoveryStage.REQUIREMENTS_REVIEW,
  DiscoveryStage.BRD_GENERATION,
];

export const DISCOVERY_STAGE_LABELS: Record<DiscoveryStage, string> = {
  INITIAL_REQUEST: "Initial Request",
  BUSINESS_PROBLEM_VALIDATION: "Business Problem Validation",
  REQUIREMENTS_DISCOVERY: "Requirements Discovery",
  REQUIREMENTS_CLARIFICATION: "Requirements Clarification",
  REQUIREMENTS_REVIEW: "Requirements Review",
  BRD_GENERATION: "BRD Generation",
};

export function stageIndex(stage: DiscoveryStage): number {
  return DISCOVERY_STAGE_ORDER.indexOf(stage);
}

/** Allowed transitions: stay, or move forward. */
export function canTransition(from: DiscoveryStage, to: DiscoveryStage): boolean {
  return stageIndex(to) >= stageIndex(from);
}

export function isUnresolved(fields: RequirementFields, key: RequirementFieldKey): boolean {
  const { status } = fields[key];
  return status === FieldStatus.MISSING || status === FieldStatus.NEEDS_CLARIFICATION;
}

export interface NextStep {
  stage: DiscoveryStage;
  /** Field to ask about next, or null in the review and BRD stages. */
  field: RequirementFieldKey | null;
}

/**
 * Determines the stage and the next field after the fields have been updated. Starts at the
 * current stage and advances through every stage whose exit condition already holds.
 * Must not be called for INITIAL_REQUEST (the first message moves the session to validation).
 */
export function resolveNextStep(
  fields: RequirementFields,
  currentStage: DiscoveryStage,
  role: AssistantRole,
): NextStep {
  const profile = getRoleProfile(role);
  let stage =
    currentStage === DiscoveryStage.INITIAL_REQUEST ? DiscoveryStage.BUSINESS_PROBLEM_VALIDATION : currentStage;

  if (stage === DiscoveryStage.BUSINESS_PROBLEM_VALIDATION) {
    const field = profile.validationFields.find((key) => isUnresolved(fields, key));
    if (field) return { stage, field };
    stage = DiscoveryStage.REQUIREMENTS_DISCOVERY;
  }
  if (stage === DiscoveryStage.REQUIREMENTS_DISCOVERY) {
    const field = profile.fieldPriority.find((key) => fields[key].status === FieldStatus.MISSING);
    if (field) return { stage, field };
    stage = DiscoveryStage.REQUIREMENTS_CLARIFICATION;
  }
  if (stage === DiscoveryStage.REQUIREMENTS_CLARIFICATION) {
    const field = profile.fieldPriority.find((key) => fields[key].status === FieldStatus.NEEDS_CLARIFICATION);
    if (field) return { stage, field };
    stage = DiscoveryStage.REQUIREMENTS_REVIEW;
  }
  return { stage, field: null };
}

/** Stages that resolve an unclear answer immediately instead of deferring it. */
export function clarifiesImmediately(stage: DiscoveryStage): boolean {
  return stage === DiscoveryStage.BUSINESS_PROBLEM_VALIDATION || stage === DiscoveryStage.REQUIREMENTS_CLARIFICATION;
}
