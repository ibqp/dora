import type { DiscoveryStage } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { ChatMessageDto, ChatSessionDetail, ChatSessionState, ChatSessionSummary } from "@/lib/api/types";
import { buildRequirementsProgress, type RequirementsProgress } from "@/lib/mock-ai/progress";
import { requirementFieldKeySchema, requirementFieldsSchema } from "@/lib/requirements/schemas";
import { DataIntegrityError } from "@/server/errors";

export const sessionSummarySelect = {
  id: true,
  title: true,
  scenario: true,
  assistantRole: true,
  currentStage: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ChatSessionSelect;

export const messageSelect = {
  id: true,
  role: true,
  content: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

/** Summary plus requirements completeness. */
export const sessionStateSelect = {
  ...sessionSummarySelect,
  requirementState: { select: { completenessPercentage: true } },
} satisfies Prisma.ChatSessionSelect;

/** Session state plus the stored requirement fields, for detail views. */
export const sessionDetailSelect = {
  ...sessionSummarySelect,
  requirementState: { select: { completenessPercentage: true, fields: true, currentField: true } },
  brd: { select: { id: true, status: true, updatedAt: true } },
} satisfies Prisma.ChatSessionSelect;

/** Messages are always returned in insertion order. */
export const messagesInOrder = {
  select: messageSelect,
  orderBy: { sequence: "asc" },
} satisfies Prisma.ChatSession$messagesArgs;

type SessionSummaryRow = Prisma.ChatSessionGetPayload<{ select: typeof sessionSummarySelect }>;
type SessionStateRow = Prisma.ChatSessionGetPayload<{ select: typeof sessionStateSelect }>;
type SessionDetailRow = Prisma.ChatSessionGetPayload<{ select: typeof sessionDetailSelect }>;
type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

export function toSessionSummary(row: SessionSummaryRow): ChatSessionSummary {
  return {
    id: row.id,
    title: row.title,
    scenario: row.scenario,
    assistantRole: row.assistantRole,
    currentStage: row.currentStage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toMessageDto(row: MessageRow): ChatMessageDto {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toSessionState(row: SessionStateRow): ChatSessionState {
  return { ...toSessionSummary(row), completenessPercentage: row.requirementState?.completenessPercentage ?? 0 };
}

/** Validates stored requirement JSON and builds the progress view; corrupt data is a server error. */
export function toRequirementsProgress(
  sessionId: string,
  stage: DiscoveryStage,
  state: { fields: unknown; currentField: string | null } | null,
): RequirementsProgress {
  const fields = requirementFieldsSchema.safeParse(state?.fields);
  const currentField = requirementFieldKeySchema.nullable().safeParse(state?.currentField ?? null);
  if (!state || !fields.success || !currentField.success) {
    throw new DataIntegrityError(`Stored requirement state of session ${sessionId} is invalid`);
  }
  return buildRequirementsProgress({ stage, fields: fields.data, currentField: currentField.data });
}

export function toSessionDetail(row: SessionDetailRow & { messages: MessageRow[] }): ChatSessionDetail {
  return {
    ...toSessionState(row),
    messages: row.messages.map(toMessageDto),
    requirements: toRequirementsProgress(row.id, row.currentStage, row.requirementState),
    brd: row.brd ? { id: row.brd.id, status: row.brd.status, updatedAt: row.brd.updatedAt.toISOString() } : null,
  };
}
