import { connection } from "next/server";

import type { ListBrdsResponse } from "@/lib/api/types";
import { withErrorHandling } from "@/server/api/http";
import { listBrds } from "@/server/brds/brd-service";

/** Lists all BRDs, most recently updated first. */
export const GET = withErrorHandling(async () => {
  await connection();
  const body: ListBrdsResponse = { brds: await listBrds() };
  return Response.json(body);
});
