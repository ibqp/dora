import { z } from "zod";

import { DiscoveryStage, Scenario } from "@/generated/prisma/enums";
import {
  createInitialRequirementFields,
  requirementFieldKeySchema,
  requirementFieldsSchema,
} from "@/lib/requirements/schemas";

import type { DiscoveryState } from "./types";

/** Validates a persisted engine state before it is passed to the engine. */
export const discoveryStateSchema = z
  .object({
    scenario: z.enum(Scenario).nullable(),
    stage: z.enum(DiscoveryStage),
    currentField: requirementFieldKeySchema.nullable(),
    proposedSolution: z.string().min(1).nullable(),
    fields: requirementFieldsSchema,
  })
  .strict() satisfies z.ZodType<DiscoveryState>;

/** State of a session before its first message. */
export function createInitialDiscoveryState(): DiscoveryState {
  return {
    scenario: null,
    stage: DiscoveryStage.INITIAL_REQUEST,
    currentField: null,
    proposedSolution: null,
    fields: createInitialRequirementFields(),
  };
}
