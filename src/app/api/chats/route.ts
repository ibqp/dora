import { connection } from "next/server";

import { createChatRequestSchema } from "@/lib/api/chat-schemas";
import type { ChatSessionResponse, ListChatsResponse } from "@/lib/api/types";
import { parseJsonBody, withErrorHandling } from "@/server/api/http";
import { startDiscovery } from "@/server/discovery/discovery-service";
import { listSessions } from "@/server/sessions/session-service";

/** Lists all discovery sessions, most recently updated first. */
export const GET = withErrorHandling(async () => {
  await connection();
  const body: ListChatsResponse = { sessions: await listSessions() };
  return Response.json(body);
});

/**
 * Starts a discovery session from the first user message. DORA's reply comes from the Mock AI
 * engine; session, both messages and the requirement state are stored in one transaction.
 * Repeating a request with the same clientRequestId returns the existing session with 200.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const input = await parseJsonBody(request, createChatRequestSchema);
  const { session, created } = await startDiscovery(input);
  const body: ChatSessionResponse = { session };
  return Response.json(body, {
    status: created ? 201 : 200,
    headers: { Location: `/api/chats/${session.id}`, "Idempotent-Replayed": String(!created) },
  });
});
