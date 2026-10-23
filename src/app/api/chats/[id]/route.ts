import { connection } from "next/server";

import { sessionIdSchema, updateChatRequestSchema } from "@/lib/api/chat-schemas";
import type { ChatSessionResponse, UpdateChatResponse } from "@/lib/api/types";
import { parseJsonBody, parseRouteParam, withErrorHandling } from "@/server/api/http";
import { deleteSession, getSessionDetail, updateSession } from "@/server/sessions/session-service";

type Context = RouteContext<"/api/chats/[id]">;

async function sessionIdFrom(context: Context): Promise<string> {
  const { id } = await context.params;
  return parseRouteParam("id", id, sessionIdSchema);
}

/** Returns a session with its messages in order. */
export const GET = withErrorHandling(async (_request: Request, context: Context) => {
  await connection();
  const body: ChatSessionResponse = { session: await getSessionDetail(await sessionIdFrom(context)) };
  return Response.json(body);
});

/**
 * Renames a session and/or changes its assistant role. A role change keeps all messages and
 * collected requirements; the new role applies from DORA's next response.
 */
export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  const sessionId = await sessionIdFrom(context);
  const update = await parseJsonBody(request, updateChatRequestSchema);
  const body: UpdateChatResponse = { session: await updateSession(sessionId, update) };
  return Response.json(body);
});

/** Deletes a session together with its messages, requirement state and BRD. */
export const DELETE = withErrorHandling(async (_request: Request, context: Context) => {
  await deleteSession(await sessionIdFrom(context));
  return new Response(null, { status: 204 });
});
