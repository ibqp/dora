import { connection } from "next/server";

import { sessionIdSchema } from "@/lib/api/chat-schemas";
import type { RequirementsResponse } from "@/lib/api/types";
import { parseRouteParam, withErrorHandling } from "@/server/api/http";
import { getRequirementsProgress } from "@/server/sessions/session-service";

/** Structured requirements of a session: completeness, stages and the status of all 18 fields. */
export const GET = withErrorHandling(async (_request: Request, context: RouteContext<"/api/chats/[id]/requirements">) => {
  await connection();
  const { id } = await context.params;
  const sessionId = parseRouteParam("id", id, sessionIdSchema);
  const body: RequirementsResponse = { sessionId, requirements: await getRequirementsProgress(sessionId) };
  return Response.json(body);
});
