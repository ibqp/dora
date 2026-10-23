/**
 * Central, deterministic completeness calculation (MASTER_SPEC.md §5):
 * completedRequiredFields / totalRequiredFields * 100, rounded to the nearest integer.
 * Only PROVIDED fields count as completed; MISSING, NEEDS_CLARIFICATION and SKIPPED do not.
 */
import { FieldStatus, REQUIREMENT_FIELD_KEYS, TOTAL_REQUIRED_FIELDS, type RequirementFieldKey } from "./fields";
import type { RequirementFields } from "./schemas";

export function calculateCompleteness(completedFields: number, totalFields = TOTAL_REQUIRED_FIELDS): number {
  if (totalFields <= 0) return 0;
  const bounded = Math.min(Math.max(completedFields, 0), totalFields);
  return Math.round((bounded / totalFields) * 100);
}

export function countCompletedFields(fields: RequirementFields): number {
  return REQUIREMENT_FIELD_KEYS.filter((key) => fields[key].status === FieldStatus.PROVIDED).length;
}

export function calculateRequirementsCompleteness(fields: RequirementFields): number {
  return calculateCompleteness(countCompletedFields(fields));
}

/** Fields that are not PROVIDED, in catalog order. */
export function listIncompleteFields(fields: RequirementFields): RequirementFieldKey[] {
  return REQUIREMENT_FIELD_KEYS.filter((key) => fields[key].status !== FieldStatus.PROVIDED);
}
