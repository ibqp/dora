/** Typed browser client for the chat API. Errors are normalized to ApiClientError. */
import type { AssistantRole } from "@/generated/prisma/enums";

import type {
  ApiErrorCode,
  ApiErrorIssue,
  ApiErrorResponse,
  BrdDetail,
  BrdResponse,
  BrdSummary,
  ListBrdsResponse,
  ChatSessionDetail,
  ChatSessionResponse,
  ChatSessionSummary,
  ListChatsResponse,
  RequirementsProgress,
  RequirementsResponse,
  SendMessageResponse,
  SettingsResponse,
  UpdateChatResponse,
} from "./types";

export type ClientErrorCode = ApiErrorCode | "NETWORK_ERROR" | "UNEXPECTED_RESPONSE";

export class ApiClientError extends Error {
  override readonly name = "ApiClientError";
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly issues: ApiErrorIssue[] = [],
  ) {
    super(message);
  }

  /** Errors worth retrying with the same request (the request may not have been processed). */
  get isRetryable(): boolean {
    return ["NETWORK_ERROR", "SESSION_BUSY", "DATABASE_UNAVAILABLE", "INTERNAL_ERROR", "UNEXPECTED_RESPONSE"].includes(this.code);
  }
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ApiErrorResponse).error?.code === "string"
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError(0, "NETWORK_ERROR", "The server could not be reached. Check your connection and try again.");
  }

  if (response.status === 204) return undefined as T;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError(response.status, "UNEXPECTED_RESPONSE", "The server returned an unexpected response.");
  }
  if (!response.ok) {
    if (isApiErrorResponse(body)) {
      throw new ApiClientError(response.status, body.error.code, body.error.message, body.error.issues ?? []);
    }
    throw new ApiClientError(response.status, "UNEXPECTED_RESPONSE", "The server returned an unexpected response.");
  }
  return body as T;
}

export const chatApi = {
  async list(): Promise<ChatSessionSummary[]> {
    return (await request<ListChatsResponse>("/api/chats")).sessions;
  },

  async get(sessionId: string): Promise<ChatSessionDetail> {
    return (await request<ChatSessionResponse>(`/api/chats/${encodeURIComponent(sessionId)}`)).session;
  },

  async create(input: { content: string; clientRequestId: string; assistantRole?: AssistantRole }): Promise<ChatSessionDetail> {
    return (await request<ChatSessionResponse>("/api/chats", { method: "POST", body: JSON.stringify(input) })).session;
  },

  async sendMessage(sessionId: string, input: { content: string; clientRequestId: string }): Promise<SendMessageResponse> {
    return request<SendMessageResponse>(`/api/chats/${encodeURIComponent(sessionId)}/messages`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async update(sessionId: string, update: { title?: string; assistantRole?: AssistantRole }): Promise<ChatSessionSummary> {
    return (
      await request<UpdateChatResponse>(`/api/chats/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        body: JSON.stringify(update),
      })
    ).session;
  },

  async requirements(sessionId: string): Promise<RequirementsProgress> {
    return (await request<RequirementsResponse>(`/api/chats/${encodeURIComponent(sessionId)}/requirements`)).requirements;
  },

  async remove(sessionId: string): Promise<void> {
    await request<void>(`/api/chats/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  },
};

export const brdApi = {
  async list(): Promise<BrdSummary[]> {
    return (await request<ListBrdsResponse>("/api/brds")).brds;
  },

  async get(brdId: string): Promise<BrdDetail> {
    return (await request<BrdResponse>(`/api/brds/${encodeURIComponent(brdId)}`)).brd;
  },

  /** Creates the session's BRD, or returns the existing one. */
  async generate(sessionId: string, options: { allowIncomplete: boolean }): Promise<BrdDetail> {
    return (
      await request<BrdResponse>(`/api/chats/${encodeURIComponent(sessionId)}/brd`, {
        method: "POST",
        body: JSON.stringify(options),
      })
    ).brd;
  },
};

export const settingsApi = {
  async get(): Promise<SettingsResponse["settings"]> {
    return (await request<SettingsResponse>("/api/settings")).settings;
  },
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
