import type { AppSettings } from "@/generated/prisma/client";
import type { UpdateSettingsRequest } from "@/lib/api/settings-schemas";
import type { SettingsDto } from "@/lib/api/types";

import { getPrisma, type DbClient } from "./client";

/** The single shared settings record always has this id (enforced by a CHECK constraint). */
export const APP_SETTINGS_ID = 1;

/**
 * Returns the shared settings record, creating it with schema defaults if it does not exist.
 * The initial migration already inserts this row; this is the runtime fallback (e.g. after the
 * row was removed manually). Idempotent, and never creates any other records.
 */
export async function ensureAppSettings(prisma: DbClient = getPrisma()): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    create: { id: APP_SETTINGS_ID },
    update: {},
  });
}

/**
 * Updates the shared settings record (creating it first if it is missing). The new values apply
 * to subsequent requests: the default role to sessions created afterwards (existing sessions keep
 * their own role), the delay to the next DORA response.
 */
export async function updateAppSettings(update: UpdateSettingsRequest, prisma: DbClient = getPrisma()): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    create: { id: APP_SETTINGS_ID, ...update },
    update,
  });
}

export function toSettingsDto(settings: AppSettings): SettingsDto {
  return {
    defaultAssistantRole: settings.defaultAssistantRole,
    mockResponseDelayMs: settings.mockResponseDelayMs,
    updatedAt: settings.updatedAt.toISOString(),
  };
}
