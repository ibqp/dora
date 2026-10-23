import { sendMessageRequestSchema, sessionIdSchema } from "@/lib/api/chat-schemas";
import { parseJsonBody, parseRouteParam, withErrorHandling } from "@/server/api/http";
import { sendMessage } from "@/server/discovery/discovery-service";

/**
 * Processes a user message with the Mock AI engine and stores the user message, DORA's reply and
 * the updated requirement state in one transaction. Returns 409 SESSION_BUSY while another
 * message of the session is being processed; a retry with the same clientRequestId returns the
 * stored exchange with 200.
 */
export const POST = withErrorHandling(async (request: Request, context: RouteContext<"/api/chats/[id]/messages">) => {
  const { id } = await context.params;
  const sessionId = parseRouteParam("id", id, sessionIdSchema);
  const input = await parseJsonBody(request, sendMessageRequestSchema);
  const { response, created } = await sendMessage(sessionId, input);
  return Response.json(response, {
    status: created ? 201 : 200,
    headers: { "Idempotent-Replayed": String(!created) },
  });
});
