import { connection } from "next/server";

import { updateSettingsRequestSchema } from "@/lib/api/settings-schemas";
import type { SettingsResponse } from "@/lib/api/types";
import { parseJsonBody, withErrorHandling } from "@/server/api/http";
import { ensureAppSettings, toSettingsDto, updateAppSettings } from "@/server/db/settings";

/** The shared settings record: default assistant role and simulated response delay. */
export const GET = withErrorHandling(async () => {
  await connection();
  const body: SettingsResponse = { settings: toSettingsDto(await ensureAppSettings()) };
  return Response.json(body);
});

/**
 * Updates the settings: `{ defaultAssistantRole?, mockResponseDelayMs? }` (delay 0–5000 ms).
 * Existing sessions keep their role; the delay applies from the next DORA response.
 */
export const PATCH = withErrorHandling(async (request: Request) => {
  const update = await parseJsonBody(request, updateSettingsRequestSchema);
  const body: SettingsResponse = { settings: toSettingsDto(await updateAppSettings(update)) };
  return Response.json(body);
});
