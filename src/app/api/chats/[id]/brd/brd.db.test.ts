import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { BrdResponse, ChatSessionDetail, ListBrdsResponse } from "@/lib/api/types";
import { FieldStatus, REQUIREMENT_FIELD_KEYS } from "@/lib/requirements/fields";
import { createInitialRequirementFields } from "@/lib/requirements/schemas";
import { getPrisma } from "@/server/db/client";

import { GET as GET_BRD } from "../../../brds/[id]/route";
import { GET as LIST_BRDS } from "../../../brds/route";
import { POST as SEND } from "../messages/route";
import { DELETE, GET as GET_SESSION } from "../route";
import { POST as CREATE } from "../../route";
import { POST } from "./route";

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

async function startSession(content = "I need a customer churn dashboard.") {
  const response = await CREATE(json("POST", { content, clientRequestId: randomUUID() }));
  const { session } = (await response.json()) as { session: ChatSessionDetail };
  createdSessionIds.add(session.id);
  return session;
}

const generate = (sessionId: string, body: unknown = {}) => POST(json("POST", body), context(sessionId));

async function markAllProvided(sessionId: string) {
  const fields = createInitialRequirementFields();
  for (const key of REQUIREMENT_FIELD_KEYS) fields[key] = { value: `Stated ${key}`, status: FieldStatus.PROVIDED, clarificationCount: 0 };
  await prisma.requirementState.update({ where: { sessionId }, data: { fields, completenessPercentage: 100 } });
}

afterEach(async () => {
  await prisma.chatSession.deleteMany({ where: { id: { in: [...createdSessionIds] } } });
  createdSessionIds.clear();
});

describe("POST /api/chats/[id]/brd", () => {
  it("warns about missing fields and creates nothing without consent", async () => {
    const session = await startSession();
    const response = await generate(session.id);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("INCOMPLETE_REQUIREMENTS");
    expect(body.error.issues).toHaveLength(18);
    expect(body.error.issues[0]).toEqual({ path: "problemStatement", message: "Problem statement is not specified" });
    expect(await prisma.businessRequirementsDocument.count({ where: { sessionId: session.id } })).toBe(0);
  });

  it("creates a Draft from incomplete requirements with missing values not specified (Scenario D)", async () => {
    const session = await startSession();
    const answer = "Postpaid churn rose to 1.8% and we cannot see who will leave";
    await SEND(json("POST", { content: answer, clientRequestId: randomUUID() }), context(session.id));

    const response = await generate(session.id, { allowIncomplete: true });
    expect(response.status).toBe(201);
    const { brd } = (await response.json()) as BrdResponse;
    expect(brd).toMatchObject({
      status: "DRAFT",
      completenessPercentage: 6,
      sessionId: session.id,
      title: "BRD: I need a customer churn dashboard",
    });
    const fields = brd.sections.flatMap((section) => section.fields);
    expect(fields).toHaveLength(18);
    expect(fields.filter((field) => field.value !== null)).toEqual([
      { key: "problemStatement", label: "Problem statement", value: answer, manuallyEdited: false },
    ]);
    expect(brd.missingFields).toHaveLength(17);

    const stored = await prisma.businessRequirementsDocument.findUniqueOrThrow({ where: { sessionId: session.id } });
    expect(stored.status).toBe("DRAFT");
    expect(stored.manualEdits).toEqual({});
  });

  it("creates a Ready for Review BRD from complete requirements", async () => {
    const session = await startSession();
    await markAllProvided(session.id);
    const response = await generate(session.id);
    expect(response.status).toBe(201);
    const { brd } = (await response.json()) as BrdResponse;
    expect(brd).toMatchObject({ status: "READY_FOR_REVIEW", completenessPercentage: 100, missingFields: [] });
    expect(brd.sections.flatMap((s) => s.fields).every((f) => f.value === `Stated ${f.key}`)).toBe(true);
  });

  it("never creates a second BRD for a session", async () => {
    const session = await startSession();
    const first = (await (await generate(session.id, { allowIncomplete: true })).json()) as BrdResponse;
    await markAllProvided(session.id);

    const again = await generate(session.id, { allowIncomplete: true });
    expect(again.status).toBe(200);
    expect(((await again.json()) as BrdResponse).brd).toEqual(first.brd);
    expect(await prisma.businessRequirementsDocument.count({ where: { sessionId: session.id } })).toBe(1);
  });

  it("creates exactly one BRD under concurrent requests", async () => {
    const session = await startSession();
    const responses = await Promise.all(Array.from({ length: 5 }, () => generate(session.id, { allowIncomplete: true })));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    const ids = await Promise.all(responses.map(async (r) => ((await r.json()) as BrdResponse).brd.id));
    expect(new Set(ids).size).toBe(1);
    expect(await prisma.businessRequirementsDocument.count({ where: { sessionId: session.id } })).toBe(1);
  });

  it("validates the request and the session", async () => {
    const session = await startSession();
    expect((await generate(session.id, { allowIncomplete: "yes" })).status).toBe(400);
    expect((await generate(session.id, { force: true })).status).toBe(400);
    expect((await generate("cmh3x8k2f0000abcd1234efgh", { allowIncomplete: true })).status).toBe(404);
    expect((await generate("bad id", { allowIncomplete: true })).status).toBe(400);
  });
});

describe("BRD list and detail", () => {
  it("lists BRDs and returns details that survive reloads", async () => {
    const session = await startSession();
    const { brd } = (await (await generate(session.id, { allowIncomplete: true })).json()) as BrdResponse;

    const list = (await (await LIST_BRDS()).json()) as ListBrdsResponse;
    expect(list.brds.find((item) => item.id === brd.id)).toMatchObject({
      title: brd.title,
      status: "DRAFT",
      sessionId: session.id,
      sessionTitle: session.title,
    });

    const detail = await GET_BRD(new Request("http://localhost"), context(brd.id));
    expect(detail.status).toBe(200);
    expect(((await detail.json()) as BrdResponse).brd).toEqual(brd);

    const sessionDetail = (await (await GET_SESSION(new Request("http://localhost"), context(session.id))).json()) as {
      session: ChatSessionDetail;
    };
    expect(sessionDetail.session.brd).toEqual({ id: brd.id, status: "DRAFT", updatedAt: brd.updatedAt });
  });

  it("returns 404 for unknown BRDs and after the session was deleted", async () => {
    const session = await startSession();
    const { brd } = (await (await generate(session.id, { allowIncomplete: true })).json()) as BrdResponse;
    expect((await GET_BRD(new Request("http://localhost"), context("cmh3x8k2f0000abcd1234efgh"))).status).toBe(404);
    expect((await GET_BRD(new Request("http://localhost"), context("bad id"))).status).toBe(400);

    await DELETE(new Request("http://localhost", { method: "DELETE" }), context(session.id));
    expect((await GET_BRD(new Request("http://localhost"), context(brd.id))).status).toBe(404);
  });

  it("has no BRD reference before generation", async () => {
    const session = await startSession();
    expect(session.brd).toBeNull();
  });
});
