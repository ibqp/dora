import { generateBrdRequestSchema, sessionIdSchema } from "@/lib/api/chat-schemas";
import type { BrdResponse } from "@/lib/api/types";
import { parseJsonBody, parseRouteParam, withErrorHandling } from "@/server/api/http";
import { generateBrdForSession } from "@/server/brds/brd-service";

/**
 * Generates the session's BRD from its structured requirements.
 * - 201: created (Draft or Ready for Review, depending on completeness)
 * - 200: the session already has a BRD; it is returned unchanged
 * - 409 INCOMPLETE_REQUIREMENTS: fields are missing and `allowIncomplete` was not set
 */
export const POST = withErrorHandling(async (request: Request, context: RouteContext<"/api/chats/[id]/brd">) => {
  const { id } = await context.params;
  const sessionId = parseRouteParam("id", id, sessionIdSchema);
  const options = await parseJsonBody(request, generateBrdRequestSchema);
  const { brd, created } = await generateBrdForSession(sessionId, options);
  const body: BrdResponse = { brd };
  return Response.json(body, { status: created ? 201 : 200, headers: { Location: `/api/brds/${brd.id}` } });
});
