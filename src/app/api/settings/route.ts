import { connection } from "next/server";

import type { SettingsResponse } from "@/lib/api/types";
import { withErrorHandling } from "@/server/api/http";
import { ensureAppSettings } from "@/server/db/settings";

/** The shared settings record (read-only here; editing is part of the Settings feature). */
export const GET = withErrorHandling(async () => {
  await connection();
  const settings = await ensureAppSettings();
  const body: SettingsResponse = {
    settings: { defaultAssistantRole: settings.defaultAssistantRole, mockResponseDelayMs: settings.mockResponseDelayMs },
  };
  return Response.json(body);
});
