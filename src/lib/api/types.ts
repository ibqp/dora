/** JSON shapes returned by the API. Dates are ISO 8601 strings. */
import type {
  AssistantRole,
  DiscoveryStage,
  DocumentStatus,
  MessageRole,
  Scenario,
} from "@/generated/prisma/enums";
import type { BrdSectionView, MissingRequirement } from "@/lib/brd/generation";
import type { RequirementsProgress } from "@/lib/mock-ai/progress";

export type { RequirementFieldProgress, RequirementSectionProgress, RequirementsProgress, StageProgress } from "@/lib/mock-ai/progress";

export interface ChatSessionSummary {
  id: string;
  title: string;
  /** Null until the rule-based classifier has assigned a scenario. */
  scenario: Scenario | null;
  assistantRole: AssistantRole;
  currentStage: DiscoveryStage;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageDto {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

/** Session with its current requirements progress. */
export interface ChatSessionState extends ChatSessionSummary {
  /** Requirements completeness (0–100), calculated by the discovery engine. */
  completenessPercentage: number;
}

/** The session's BRD, if one has been generated (at most one per session). */
export interface BrdReference {
  id: string;
  status: DocumentStatus;
  updatedAt: string;
}

export interface ChatSessionDetail extends ChatSessionState {
  /** Ordered oldest first. */
  messages: ChatMessageDto[];
  /** Stage list and per-field requirement status for the progress panel. */
  requirements: RequirementsProgress;
  brd: BrdReference | null;
}

export type { BrdFieldView, BrdSectionView, MissingRequirement } from "@/lib/brd/generation";

export interface BrdSummary {
  id: string;
  title: string;
  status: DocumentStatus;
  /** Share of required fields with content (0–100). */
  completenessPercentage: number;
  sessionId: string;
  sessionTitle: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrdDetail extends BrdSummary {
  /** The seven BRD sections; a null value means "Not specified". */
  sections: BrdSectionView[];
  /** Fields without content, in document order. */
  missingFields: MissingRequirement[];
}

export interface ListBrdsResponse {
  brds: BrdSummary[];
}

export interface BrdResponse {
  brd: BrdDetail;
}

export interface ListChatsResponse {
  sessions: ChatSessionSummary[];
}

export interface ChatSessionResponse {
  session: ChatSessionDetail;
}

/** PATCH /api/chats/[id] (rename and/or role change). */
export interface UpdateChatResponse {
  session: ChatSessionSummary;
}

/** POST /api/chats/[id]/messages: the stored user message and DORA's reply, in order. */
export interface SendMessageResponse {
  session: ChatSessionState;
  messages: [ChatMessageDto, ChatMessageDto];
  requirements: RequirementsProgress;
}

/** GET /api/chats/[id]/requirements */
export interface RequirementsResponse {
  sessionId: string;
  requirements: RequirementsProgress;
}

/** GET /api/settings */
export interface SettingsResponse {
  settings: {
    defaultAssistantRole: AssistantRole;
    mockResponseDelayMs: number;
  };
}

export type ApiErrorCode =
  | "INVALID_JSON"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "SESSION_BUSY"
  | "INCOMPLETE_REQUIREMENTS"
  | "DATABASE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ApiErrorIssue {
  path: string;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    issues?: ApiErrorIssue[];
  };
}
