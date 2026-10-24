import { connection } from "next/server";

import { brdIdSchema } from "@/lib/api/chat-schemas";
import { buildBrdPdfFileName } from "@/lib/brd/generation";
import { parseRouteParam, withErrorHandling } from "@/server/api/http";
import { getBrdDetail } from "@/server/brds/brd-service";
import { renderBrdPdf } from "@/server/pdf/brd-pdf";

/** RFC 6266 attachment header: ASCII fallback plus the UTF-8 file name (RFC 5987). */
function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Downloads the saved BRD (manual edits included) as a PDF rendered on the server. */
export const GET = withErrorHandling(async (_request: Request, context: RouteContext<"/api/brds/[id]/pdf">) => {
  await connection();
  const { id } = await context.params;
  const brd = await getBrdDetail(parseRouteParam("id", id, brdIdSchema));
  const pdf = await renderBrdPdf(brd);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": contentDisposition(buildBrdPdfFileName(brd.title)),
      "Cache-Control": "no-store",
    },
  });
});
