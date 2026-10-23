/**
 * Connects the Mock AI engine with persistence (MASTER_SPEC.md §8):
 * validate → load state → process with the engine → simulated delay (no transaction open)
 * → persist user message, requirement state and DORA reply in one transaction.
 */
import { randomUUID } from "node:crypto";

import type { AssistantRole } from "@/generated/prisma/enums";
import type { ChatSessionDetail, SendMessageResponse } from "@/lib/api/types";
import { createInitialDiscoveryState, discoveryStateSchema, processTurn } from "@/lib/mock-ai";
import type { DiscoveryState, EngineResult } from "@/lib/mock-ai";
import { deriveSessionTitle } from "@/lib/sessions/title";
import { getPrisma, type PrismaClient } from "@/server/db/client";
import { hasPrismaErrorCode, PrismaErrorCode } from "@/server/db/errors";
import { ensureAppSettings } from "@/server/db/settings";
import { DataIntegrityError, IdempotencyConflictError, NotFoundError } from "@/server/errors";
import { acquireProcessingLock, releaseProcessingLock } from "@/server/sessions/processing-lock";
import { toMessageDto } from "@/server/sessions/serializers";
import {
  createSessionFromFirstTurn,
  findStoredExchange,
  getRequirementsProgress,
  getSessionDetail,
  getSessionState,
  loadDiscoveryRecord,
  saveTurn,
  type DiscoveryOutcome,
} from "@/server/sessions/session-service";

import { simulateResponseDelay } from "./delay";

export interface StartDiscoveryInput {
  content: string;
  clientRequestId: string;
  assistantRole?: AssistantRole;
}

export interface SendMessageInput {
  content: string;
  clientRequestId: string;
}

function toOutcome(result: EngineResult): DiscoveryOutcome {
  const { state } = result;
  return {
    scenario: state.scenario,
    stage: state.stage,
    fields: state.fields,
    currentField: state.currentField,
    proposedSolution: state.proposedSolution,
    completenessPercentage: result.completenessPercentage,
  };
}

/** Rebuilds and validates the engine state from the stored session and requirement state. */
function toDiscoveryState(record: Awaited<ReturnType<typeof loadDiscoveryRecord>>): DiscoveryState {
  if (!record.requirementState) throw new DataIntegrityError(`Session ${record.id} has no requirement state`);
  const parsed = discoveryStateSchema.safeParse({
    scenario: record.scenario,
    stage: record.currentStage,
    currentField: record.requirementState.currentField,
    proposedSolution: record.requirementState.proposedSolution,
    fields: record.requirementState.fields,
  });
  if (!parsed.success) {
    throw new DataIntegrityError(`Stored discovery state of session ${record.id} is invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Verifies that a stored exchange is a replay of the same submission in the expected session. */
function assertSameSubmission(
  stored: NonNullable<Awaited<ReturnType<typeof findStoredExchange>>>,
  content: string,
  sessionId?: string,
) {
  const same =
    stored.userMessage.role === "USER" &&
    stored.userMessage.content === content &&
    stored.reply !== null &&
    (sessionId === undefined || stored.sessionId === sessionId);
  if (!same) throw new IdempotencyConflictError();
}

/** Result of replaying a first-message submission, or null if the key is unused. */
async function replayFirstMessage(input: StartDiscoveryInput, db: PrismaClient): Promise<ChatSessionDetail | null> {
  const stored = await findStoredExchange(input.clientRequestId, db);
  if (!stored) return null;
  assertSameSubmission(stored, input.content);
  const session = await getSessionDetail(stored.sessionId, db);
  if (session.messages[0]?.id !== stored.userMessage.id) throw new IdempotencyConflictError();
  return session;
}

/**
 * First message: no session exists yet. The engine processes the initial request, then the
 * session is created together with both messages and the requirement state.
 * Idempotent per clientRequestId (see createSessionFromFirstTurn).
 */
export async function startDiscovery(
  input: StartDiscoveryInput,
  db: PrismaClient = getPrisma(),
): Promise<{ session: ChatSessionDetail; created: boolean }> {
  const replay = await replayFirstMessage(input, db);
  if (replay) return { session: replay, created: false };

  const receivedAt = new Date();
  const settings = await ensureAppSettings(db);
  const assistantRole = input.assistantRole ?? settings.defaultAssistantRole;
  const result = processTurn({ message: input.content, state: createInitialDiscoveryState(), role: assistantRole });

  await simulateResponseDelay(settings.mockResponseDelayMs);

  try {
    const session = await createSessionFromFirstTurn(
      {
        title: deriveSessionTitle(input.content),
        assistantRole,
        content: input.content,
        clientRequestId: input.clientRequestId,
        receivedAt,
        assistantReply: result.reply,
        outcome: toOutcome(result),
      },
      db,
    );
    return { session, created: true };
  } catch (error) {
    // A concurrent duplicate submission stored the session first.
    if (!hasPrismaErrorCode(error, PrismaErrorCode.UniqueConstraintViolation)) throw error;
    const concurrent = await replayFirstMessage(input, db);
    if (!concurrent) throw error;
    return { session: concurrent, created: false };
  }
}

async function replayMessage(
  sessionId: string,
  input: SendMessageInput,
  db: PrismaClient,
): Promise<SendMessageResponse | null> {
  const stored = await findStoredExchange(input.clientRequestId, db);
  if (!stored) return null;
  assertSameSubmission(stored, input.content, sessionId);
  return {
    session: await getSessionState(sessionId, db),
    messages: [toMessageDto(stored.userMessage), toMessageDto(stored.reply!)],
    requirements: await getRequirementsProgress(sessionId, db),
  };
}

/**
 * Subsequent message. Holds the session's processing lock from loading the state until the
 * turn is stored, so concurrent messages of the same session cannot interleave. If anything
 * fails, nothing is stored and the lock is released.
 */
export async function sendMessage(
  sessionId: string,
  input: SendMessageInput,
  db: PrismaClient = getPrisma(),
): Promise<{ response: SendMessageResponse; created: boolean }> {
  const replay = await replayMessage(sessionId, input, db);
  if (replay) return { response: replay, created: false };

  const lockToken = randomUUID();
  await acquireProcessingLock(sessionId, lockToken, db);
  try {
    const receivedAt = new Date();
    const record = await loadDiscoveryRecord(sessionId, db);
    const result = processTurn({ message: input.content, state: toDiscoveryState(record), role: record.assistantRole });
    const settings = await ensureAppSettings(db);

    await simulateResponseDelay(settings.mockResponseDelayMs);

    const saved = await saveTurn(
      sessionId,
      lockToken,
      { content: input.content, clientRequestId: input.clientRequestId, receivedAt, assistantReply: result.reply, outcome: toOutcome(result) },
      db,
    );
    return { response: saved, created: true };
  } catch (error) {
    await releaseProcessingLock(sessionId, lockToken, db).catch((releaseError: unknown) => {
      console.error("[discovery] failed to release processing lock:", releaseError);
    });
    if (hasPrismaErrorCode(error, PrismaErrorCode.UniqueConstraintViolation)) {
      const concurrent = await replayMessage(sessionId, input, db);
      if (concurrent) return { response: concurrent, created: false };
    }
    if (hasPrismaErrorCode(error, PrismaErrorCode.RecordNotFound) || hasPrismaErrorCode(error, PrismaErrorCode.ForeignKeyViolation)) {
      // The session was deleted while the message was being processed.
      throw new NotFoundError("Session");
    }
    throw error;
  }
}
