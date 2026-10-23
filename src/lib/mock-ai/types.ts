import type { AssistantRole, DiscoveryStage, Scenario } from "@/generated/prisma/enums";
import type { RequirementFieldKey } from "@/lib/requirements/fields";
import type { RequirementFields } from "@/lib/requirements/schemas";

/** Everything the engine needs to continue a conversation. Serializable; no message history. */
export interface DiscoveryState {
  /** Null until the first message has been classified. */
  scenario: Scenario | null;
  stage: DiscoveryStage;
  /** Field DORA is currently asking about (the "expected field"), or null. */
  currentField: RequirementFieldKey | null;
  /**
   * Solution named in the initial request (e.g. "customer churn dashboard"). Kept as context for
   * XY-problem validation only — never counted as a requirement.
   */
  proposedSolution: string | null;
  fields: RequirementFields;
}

export interface EngineInput {
  /** The user's message, already validated as non-empty by the API. */
  message: string;
  state: DiscoveryState;
  role: AssistantRole;
}

export type ClassificationConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface ClassificationResult {
  scenario: Scenario;
  confidence: ClassificationConfidence;
  /** Matched dictionary terms of the chosen scenario (empty for the generic fallback). */
  matchedTerms: string[];
  scores: Record<Exclude<Scenario, "GENERIC_ANALYTICS">, number>;
}

export type UnclearReason = "NON_ANSWER" | "TOO_VAGUE" | "SOLUTION_NOT_PROBLEM" | "SOLUTION_NOT_OUTCOME";

export type SkipReason = "USER_REQUEST" | "MAX_CLARIFICATIONS";

export type EngineEvent =
  | { type: "SCENARIO_CLASSIFIED"; classification: ClassificationResult }
  | { type: "PROPOSED_SOLUTION_DETECTED"; solution: string }
  | { type: "STAGE_CHANGED"; from: DiscoveryStage; to: DiscoveryStage }
  | { type: "FIELD_PROVIDED"; field: RequirementFieldKey; value: string; source: "ANSWER" | "STATEMENT" }
  | { type: "FIELD_NEEDS_CLARIFICATION"; field: RequirementFieldKey; reason: UnclearReason }
  | { type: "FIELD_SKIPPED"; field: RequirementFieldKey; reason: SkipReason }
  | { type: "FIELD_CORRECTED"; field: RequirementFieldKey; previousValue: string | null; value: string }
  | { type: "CORRECTION_AMBIGUOUS"; reason: "NO_FIELD" | "MULTIPLE_FIELDS" | "UNUSABLE_VALUE" }
  | { type: "STATEMENT_CONFLICT"; field: RequirementFieldKey; existingValue: string; statedValue: string }
  | { type: "QUESTION_ASKED"; field: RequirementFieldKey; kind: QuestionKind }
  | { type: "REQUIREMENTS_CONFIRMED" };

export type QuestionKind = "INITIAL" | "CLARIFICATION" | "REPEAT";

export interface EngineResult {
  state: DiscoveryState;
  reply: string;
  /** Deterministic completeness of `state.fields` (0–100). */
  completenessPercentage: number;
  /** True when DORA suggests generating the BRD in this reply. */
  suggestBrd: boolean;
  events: EngineEvent[];
}
