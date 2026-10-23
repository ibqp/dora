/**
 * Per-session processing lock that prevents overlapping message processing.
 *
 * Acquiring is one atomic UPDATE (no transaction is held open during the simulated delay).
 * The lock is released by the transaction that stores the turn, or explicitly on failure.
 * A lock older than PROCESSING_LOCK_TIMEOUT_MS is considered abandoned (e.g. after a crash).
 */
import { getPrisma, type DbClient } from "@/server/db/client";
import { NotFoundError, SessionBusyError } from "@/server/errors";

export const PROCESSING_LOCK_TIMEOUT_MS = 30_000;

export async function acquireProcessingLock(
  sessionId: string,
  token: string,
  db: DbClient = getPrisma(),
  now: Date = new Date(),
): Promise<void> {
  const staleBefore = new Date(now.getTime() - PROCESSING_LOCK_TIMEOUT_MS);
  const { count } = await db.chatSession.updateMany({
    where: {
      id: sessionId,
      OR: [{ processingToken: null }, { processingStartedAt: { lt: staleBefore } }],
    },
    data: { processingToken: token, processingStartedAt: now },
  });
  if (count === 1) return;

  const exists = await db.chatSession.count({ where: { id: sessionId } });
  throw exists ? new SessionBusyError() : new NotFoundError("Session");
}

/** Releases the lock if it is still held by `token`. Safe to call more than once. */
export async function releaseProcessingLock(sessionId: string, token: string, db: DbClient = getPrisma()): Promise<void> {
  await db.chatSession.updateMany({
    where: { id: sessionId, processingToken: token },
    data: { processingToken: null, processingStartedAt: null },
  });
}
