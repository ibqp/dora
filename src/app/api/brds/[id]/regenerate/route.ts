import { brdIdSchema } from "@/lib/api/chat-schemas";
import type { RegenerateBrdResponse } from "@/lib/api/types";
import { parseRouteParam, withErrorHandling } from "@/server/api/http";
import { regenerateBrd } from "@/server/brds/brd-service";

/**
 * Regenerates the BRD from the session's latest structured requirements. The BRD keeps its id;
 * fields with content (including manual edits) are preserved and only empty fields are filled.
 * No request body is needed.
 */
export const POST = withErrorHandling(async (_request: Request, context: RouteContext<"/api/brds/[id]/regenerate">) => {
  const { id } = await context.params;
  const body: RegenerateBrdResponse = await regenerateBrd(parseRouteParam("id", id, brdIdSchema));
  return Response.json(body);
});
