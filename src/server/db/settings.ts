import type { AppSettings } from "@/generated/prisma/client";

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
