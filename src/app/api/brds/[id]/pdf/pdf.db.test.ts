import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { BrdResponse, ChatSessionDetail } from "@/lib/api/types";
import { getPrisma } from "@/server/db/client";
import { parsePdf } from "../../../../../../tests/pdf-text";

import { POST as GENERATE } from "../../../chats/[id]/brd/route";
import { POST as CREATE } from "../../../chats/route";
import { PATCH } from "../route";
import { GET } from "./route";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("@/server/discovery/delay", () => ({ simulateResponseDelay: vi.fn(async () => {}) }));

const prisma = getPrisma();
const createdSessionIds = new Set<string>();
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (method: string, body: unknown) =>
  new Request("http://localhost", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const squash = (text: string) => text.replace(/\s+/g, "");
const download = (brdId: string) => GET(new Request("http://localhost"), context(brdId));

async function draftBrd() {
  const response = await CREATE(json("POST", { content: "I need a customer churn dashboard.", clientRequestId: randomUUID() }));
  const { session } = (await response.json()) as { session: ChatSessionDetail };
  createdSessionIds.add(session.id);
  const generated = await GENERATE(json("POST", { allowIncomplete: true }), context(session.id));
  return ((await generated.json()) as BrdResponse).brd;
}

afterEach(async () => {
  await prisma.chatSession.deleteMany({ where: { id: { in: [...createdSessionIds] } } });
  createdSessionIds.clear();
});

describe("GET /api/brds/[id]/pdf", () => {
  it("downloads a valid PDF of the saved BRD including manual edits (Scenario F)", async () => {
    const brd = await draftBrd();
    await PATCH(
      json("PATCH", { title: "BRD: Kündigungen – Q4 review", content: { keyMetrics: "Monthly churn rate per segment", dataSources: "CRM, billing" } }),
      context(brd.id),
    );

    const response = await download(brd.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="BRD K_ndigungen Q4 review.pdf"; filename*=UTF-8''BRD%20K%C3%BCndigungen%20Q4%20review.pdf`,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Number(response.headers.get("content-length"))).toBe(bytes.length);
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");

    const pdf = await parsePdf(bytes);
    const text = squash(pdf.text);
    expect(text).toContain(squash("BRD: Kündigungen – Q4 review"));
    expect(text).toContain(squash("Key business metrics · Manually edited Monthly churn rate per segment"));
    expect(text).toContain(squash("Data sources · Manually edited CRM, billing"));
    expect(text).toContain(squash("Status Draft"));
    expect(text).toContain(squash("Completeness 11% (2 of 18 fields specified)"));
    expect(pdf.text.match(/Not specified — missing information/g)).toHaveLength(16);
    expect(pdf.pages.at(-1)?.text).toContain(`Page ${pdf.pages.length} of ${pdf.pages.length}`);
  });

  it("reflects the latest saved content", async () => {
    const brd = await draftBrd();
    await PATCH(json("PATCH", { content: { keyMetrics: "First version" } }), context(brd.id));
    await PATCH(json("PATCH", { content: { keyMetrics: "Second version" } }), context(brd.id));
    const text = (await parsePdf(new Uint8Array(await (await download(brd.id)).arrayBuffer()))).text;
    expect(text).toContain("Second version");
    expect(text).not.toContain("First version");
  });

  it("returns JSON errors for unknown or invalid ids", async () => {
    const missing = await download("cmh3x8k2f0000abcd1234efgh");
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("NOT_FOUND");
    expect((await download("bad id")).status).toBe(400);
  });
});
