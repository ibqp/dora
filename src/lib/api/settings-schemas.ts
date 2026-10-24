/** Request validation for the settings API. Shared by the route handler and the settings form. */
import { z } from "zod";

import { MAX_RESPONSE_DELAY_MS, MIN_RESPONSE_DELAY_MS } from "@/lib/settings/settings";

import { assistantRoleSchema } from "./chat-schemas";

export const responseDelaySchema = z
  .number({ message: "The delay must be a number of milliseconds" })
  .int("The delay must be a whole number of milliseconds")
  .min(MIN_RESPONSE_DELAY_MS, `The delay must be at least ${MIN_RESPONSE_DELAY_MS} ms`)
  .max(MAX_RESPONSE_DELAY_MS, `The delay must be at most ${MAX_RESPONSE_DELAY_MS} ms`);

/** PATCH /api/settings — changes the default role and/or the simulated response delay. */
export const updateSettingsRequestSchema = z
  .object({
    defaultAssistantRole: assistantRoleSchema.optional(),
    mockResponseDelayMs: responseDelaySchema.optional(),
  })
  .strict()
  .refine((body) => body.defaultAssistantRole !== undefined || body.mockResponseDelayMs !== undefined, {
    message: "Provide a defaultAssistantRole or a mockResponseDelayMs",
  });

export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;
