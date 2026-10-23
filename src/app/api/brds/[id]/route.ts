import { connection } from "next/server";

import { brdIdSchema } from "@/lib/api/chat-schemas";
import type { BrdResponse } from "@/lib/api/types";
import { parseRouteParam, withErrorHandling } from "@/server/api/http";
import { getBrdDetail } from "@/server/brds/brd-service";

/** A BRD with its seven sections; missing values are null ("Not specified"). */
export const GET = withErrorHandling(async (_request: Request, context: RouteContext<"/api/brds/[id]">) => {
  await connection();
  const { id } = await context.params;
  const body: BrdResponse = { brd: await getBrdDetail(parseRouteParam("id", id, brdIdSchema)) };
  return Response.json(body);
});
