/**
 * Persistence services for discovery sessions and their messages.
 * No discovery logic lives here: callers (API routes, the discovery service) decide what to store.
 */
import type { AssistantRole, DiscoveryStage, MessageRole, Scenario } from "@/generated/prisma/enums";
import type {
  ChatMessageDto,
  ChatSessionDetail,
  ChatSessionState,
  ChatSessionSummary,
  RequirementsProgress,
  SendMessageResponse,
} from "@/lib/api/types";
import { buildRequirementsProgress } from "@/lib/mock-ai/progress";
import type { RequirementFieldKey } from "@/lib/requirements/fields";
import type { RequirementFields } from "@/lib/requirements/schemas";
import { getPrisma, type DbClient, type PrismaClient } from "@/server/db/client";
import { hasPrismaErrorCode, PrismaErrorCode } from "@/server/db/errors";
import { NotFoundError, SessionBusyError } from "@/server/errors";

import {
  messageSelect,
  messagesInOrder,
  sessionDetailSelect,
  sessionStateSelect,
  sessionSummarySelect,
  toMessageDto,
  toRequirementsProgress,
  toSessionDetail,
  toSessionState,
  toSessionSummary,
} from "./serializers";

export interface NewMessage {
  role: MessageRole;
  content: string;
  /** Idempotency key for user submissions; unique across all messages. */
  clientRequestId?: string;
  /** Defaults to the time of insertion. */
  createdAt?: Date;
}

/** Discovery state to store after a turn (the engine result, already validated). */
export interface DiscoveryOutcome {
  scenario: Scenario | null;
  stage: DiscoveryStage;
  fields: RequirementFields;
  currentField: RequirementFieldKey | null;
  proposedSolution: string | null;
  completenessPercentage: number;
}

export interface UserTurn {
  content: string;
  clientRequestId: string;
  /** When the server received the message (before the simulated delay). */
  receivedAt: Date;
  assistantReply: string;
  outcome: DiscoveryOutcome;
}

/** Runs `work` in the given transaction, or opens a new one on the shared client. */
async function inTransaction<T>(db: DbClient, work: (tx: DbClient) => Promise<T>): Promise<T> {
  // Transaction clients have no $transaction method.
  return "$transaction" in db ? (db as PrismaClient).$transaction((tx) => work(tx)) : work(db);
}

function requirementStateData(outcome: DiscoveryOutcome) {
  return {
    fields: outcome.fields,
    currentField: outcome.currentField,
    proposedSolution: outcome.proposedSolution,
    completenessPercentage: outcome.completenessPercentage,
  };
}

async function createMessages(tx: DbClient, sessionId: string, messages: readonly NewMessage[]) {
  const created: ChatMessageDto[] = [];
  for (const message of messages) {
    const row = await tx.message.create({
      data: {
        sessionId,
        role: message.role,
        content: message.content,
        clientRequestId: message.clientRequestId ?? null,
        ...(message.createdAt ? { createdAt: message.createdAt } : {}),
      },
      select: messageSelect,
    });
    created.push(toMessageDto(row));
  }
  return created;
}

function turnMessages(turn: UserTurn): NewMessage[] {
  return [
    { role: "USER", content: turn.content, clientRequestId: turn.clientRequestId, createdAt: turn.receivedAt },
    { role: "ASSISTANT", content: turn.assistantReply },
  ];
}

export async function listSessions(db: DbClient = getPrisma()): Promise<ChatSessionSummary[]> {
  const rows = await db.chatSession.findMany({
    select: sessionSummarySelect,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  return rows.map(toSessionSummary);
}

export async function getSessionDetail(
  sessionId: string,
  db: DbClient = getPrisma(),
): Promise<ChatSessionDetail> {
  const row = await db.chatSession.findUnique({
    where: { id: sessionId },
    select: { ...sessionDetailSelect, messages: messagesInOrder },
  });
  if (!row) throw new NotFoundError("Session");
  return toSessionDetail(row);
}

/** Progress view of a session's stored requirement state. */
export async function getRequirementsProgress(
  sessionId: string,
  db: DbClient = getPrisma(),
): Promise<RequirementsProgress> {
  const row = await db.chatSession.findUnique({
    where: { id: sessionId },
    select: { id: true, currentStage: true, requirementState: { select: { fields: true, currentField: true } } },
  });
  if (!row) throw new NotFoundError("Session");
  return toRequirementsProgress(row.id, row.currentStage, row.requirementState);
}

export async function getSessionState(sessionId: string, db: DbClient = getPrisma()): Promise<ChatSessionState> {
  const row = await db.chatSession.findUnique({ where: { id: sessionId }, select: sessionStateSelect });
  if (!row) throw new NotFoundError("Session");
  return toSessionState(row);
}

/** Session fields and stored requirement state needed to continue a discovery conversation. */
export async function loadDiscoveryRecord(sessionId: string, db: DbClient = getPrisma()) {
  const row = await db.chatSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      scenario: true,
      assistantRole: true,
      currentStage: true,
      requirementState: { select: { fields: true, currentField: true, proposedSolution: true } },
    },
  });
  if (!row) throw new NotFoundError("Session");
  return row;
}

/**
 * Atomically creates a session with the first exchange: the user message, DORA's reply and the
 * requirement state produced by the engine. Throws a unique-constraint error (P2002) if the
 * clientRequestId was already used.
 */
export async function createSessionFromFirstTurn(
  turn: UserTurn & { title: string; assistantRole: AssistantRole },
  db: PrismaClient = getPrisma(),
): Promise<ChatSessionDetail> {
  return db.$transaction(async (tx) => {
    const session = await tx.chatSession.create({
      data: {
        title: turn.title,
        scenario: turn.outcome.scenario,
        assistantRole: turn.assistantRole,
        currentStage: turn.outcome.stage,
        requirementState: { create: requirementStateData(turn.outcome) },
      },
      select: { id: true },
    });
    await createMessages(tx, session.id, turnMessages(turn));
    return getSessionDetail(session.id, tx);
  });
}

/**
 * Atomically stores one exchange of an existing session and releases its processing lock.
 * Fails with SessionBusyError if the lock is no longer held by `lockToken`, in which case
 * nothing is written.
 */
export async function saveTurn(
  sessionId: string,
  lockToken: string,
  turn: UserTurn,
  db: PrismaClient = getPrisma(),
): Promise<SendMessageResponse> {
  return db.$transaction(async (tx) => {
    const released = await tx.chatSession.updateMany({
      where: { id: sessionId, processingToken: lockToken },
      data: {
        scenario: turn.outcome.scenario,
        currentStage: turn.outcome.stage,
        processingToken: null,
        processingStartedAt: null,
        updatedAt: new Date(),
      },
    });
    if (released.count !== 1) {
      // Either another request took over an expired lock, or the session was deleted meanwhile.
      const exists = await tx.chatSession.count({ where: { id: sessionId } });
      throw exists ? new SessionBusyError() : new NotFoundError("Session");
    }

    const [userMessage, assistantMessage] = await createMessages(tx, sessionId, turnMessages(turn));
    await tx.requirementState.update({ where: { sessionId }, data: requirementStateData(turn.outcome) });
    return {
      session: await getSessionState(sessionId, tx),
      messages: [userMessage!, assistantMessage!],
      requirements: buildRequirementsProgress({
        stage: turn.outcome.stage,
        fields: turn.outcome.fields,
        currentField: turn.outcome.currentField,
      }),
    };
  });
}

/** The user message stored with this idempotency key and the DORA reply that followed it. */
export async function findStoredExchange(clientRequestId: string, db: DbClient = getPrisma()) {
  const userMessage = await db.message.findUnique({
    where: { clientRequestId },
    select: { ...messageSelect, sessionId: true, sequence: true },
  });
  if (!userMessage) return null;
  const reply = await db.message.findFirst({
    where: { sessionId: userMessage.sessionId, role: "ASSISTANT", sequence: { gt: userMessage.sequence } },
    orderBy: { sequence: "asc" },
    select: messageSelect,
  });
  return { sessionId: userMessage.sessionId, userMessage, reply };
}

/**
 * Appends messages to an existing session in insertion order and marks the session as updated.
 * Pass a transaction client to combine this with other writes.
 */
export async function appendMessages(
  sessionId: string,
  messages: readonly NewMessage[],
  db: DbClient = getPrisma(),
): Promise<ChatMessageDto[]> {
  return inTransaction(db, async (tx) => {
    try {
      await tx.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.RecordNotFound)) throw new NotFoundError("Session");
      throw error;
    }
    return createMessages(tx, sessionId, messages);
  });
}

export interface SessionUpdate {
  title?: string;
  assistantRole?: AssistantRole;
}

/**
 * Renames a session and/or changes its assistant role. Only these columns change: messages,
 * collected requirements and the discovery stage are untouched.
 */
export async function updateSession(
  sessionId: string,
  update: SessionUpdate,
  db: DbClient = getPrisma(),
): Promise<ChatSessionSummary> {
  try {
    const row = await db.chatSession.update({
      where: { id: sessionId },
      data: {
        ...(update.title !== undefined ? { title: update.title } : {}),
        ...(update.assistantRole !== undefined ? { assistantRole: update.assistantRole } : {}),
      },
      select: sessionSummarySelect,
    });
    return toSessionSummary(row);
  } catch (error) {
    if (hasPrismaErrorCode(error, PrismaErrorCode.RecordNotFound)) throw new NotFoundError("Session");
    throw error;
  }
}

/** Deletes a session; messages, requirement state and BRD are removed by ON DELETE CASCADE. */
export async function deleteSession(sessionId: string, db: DbClient = getPrisma()): Promise<void> {
  try {
    await db.chatSession.delete({ where: { id: sessionId } });
  } catch (error) {
    if (hasPrismaErrorCode(error, PrismaErrorCode.RecordNotFound)) throw new NotFoundError("Session");
    throw error;
  }
}
