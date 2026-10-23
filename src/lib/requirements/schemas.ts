/**
 * Zod schemas for the JSON columns of RequirementState and BusinessRequirementsDocument.
 * All reads and writes of those columns must be validated with these schemas.
 */
import { z } from "zod";

import {
  FIELD_STATUSES,
  FieldStatus,
  REQUIREMENT_FIELD_KEYS,
  type RequirementFieldKey,
} from "./fields";

export const requirementFieldKeySchema = z.enum(REQUIREMENT_FIELD_KEYS);
export const fieldStatusSchema = z.enum(FIELD_STATUSES);

export const requirementFieldStateSchema = z
  .object({
    value: z.string().trim().min(1).nullable(),
    status: fieldStatusSchema,
    clarificationCount: z.number().int().min(0),
  })
  .strict()
  .refine((field) => field.status !== FieldStatus.PROVIDED || field.value !== null, {
    message: "A PROVIDED field must have a value",
    path: ["value"],
  });

export type RequirementFieldState = z.infer<typeof requirementFieldStateSchema>;

/** Exhaustive: every one of the 18 field keys must be present, unknown keys are rejected. */
export const requirementFieldsSchema = z.record(
  requirementFieldKeySchema,
  requirementFieldStateSchema,
);

export type RequirementFields = z.infer<typeof requirementFieldsSchema>;

/** BRD content: every field key maps to its text, or null when not specified. */
export const brdContentSchema = z.record(
  requirementFieldKeySchema,
  z.string().trim().min(1).nullable(),
);

export type BrdContent = z.infer<typeof brdContentSchema>;

/** Manual edit metadata: only fields edited by a user appear here. */
export const brdManualEditsSchema = z.partialRecord(
  requirementFieldKeySchema,
  z.object({ editedAt: z.iso.datetime() }).strict(),
);

export type BrdManualEdits = z.infer<typeof brdManualEditsSchema>;

function mapFieldKeys<T>(build: (key: RequirementFieldKey) => T): Record<RequirementFieldKey, T> {
  return Object.fromEntries(REQUIREMENT_FIELD_KEYS.map((key) => [key, build(key)])) as Record<
    RequirementFieldKey,
    T
  >;
}

/** Initial state for a new session: every field missing, no clarification attempts. */
export function createInitialRequirementFields(): RequirementFields {
  return mapFieldKeys(() => ({
    value: null,
    status: FieldStatus.MISSING,
    clarificationCount: 0,
  }));
}

/** Empty BRD content: every field "Not specified". */
export function createEmptyBrdContent(): BrdContent {
  return mapFieldKeys(() => null);
}
