import { connection } from "next/server";

import { withErrorHandling } from "@/server/api/http";
import { getPrisma } from "@/server/db/client";

/**
 * Liveness/readiness probe for Docker and Railway health checks: 200 when the server runs and
 * PostgreSQL answers, otherwise 503 DATABASE_UNAVAILABLE.
 */
export const GET = withErrorHandling(async () => {
  await connection();
  await getPrisma().$queryRaw`SELECT 1`;
  return Response.json({ status: "ok", database: "ok" }, { headers: { "Cache-Control": "no-store" } });
});
