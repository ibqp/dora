import { connection } from "next/server";

import { brdIdSchema, updateBrdRequestSchema } from "@/lib/api/chat-schemas";
import type { BrdResponse } from "@/lib/api/types";
import { parseJsonBody, parseRouteParam, withErrorHandling } from "@/server/api/http";
import { getBrdDetail, updateBrd } from "@/server/brds/brd-service";

/** A BRD with its seven sections; missing values are null ("Not specified"). */
export const GET = withErrorHandling(async (_request: Request, context: RouteContext<"/api/brds/[id]">) => {
  await connection();
  const { id } = await context.params;
  const body: BrdResponse = { brd: await getBrdDetail(parseRouteParam("id", id, brdIdSchema)) };
  return Response.json(body);
});

/**
 * Saves manual edits: `{ title?, content?: { [fieldKey]: string | null } }`. Only the fields sent
 * are changed; empty text clears a field. Changed fields are marked as manually edited, and
 * status and completeness are recalculated from the saved content.
 */
export const PATCH = withErrorHandling(async (request: Request, context: RouteContext<"/api/brds/[id]">) => {
  const { id } = await context.params;
  const brdId = parseRouteParam("id", id, brdIdSchema);
  const update = await parseJsonBody(request, updateBrdRequestSchema);
  const body: BrdResponse = { brd: await updateBrd(brdId, update) };
  return Response.json(body);
});
