import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

// Route handlers are invoked directly, outside a Next.js request scope, where `connection()`
// (which only marks a handler as request-time) would throw.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
// Skip the simulated typing delay in tests.
vi.mock("@/server/discovery/delay", () => ({ simulateResponseDelay: vi.fn(async () => {}) }));

import type { ChatSessionDetail } from "@/lib/api/types";
import { createEmptyBrdContent, createInitialRequirementFields, requirementFieldsSchema } from "@/lib/requirements/schemas";
import { getPrisma } from "@/server/db/client";
import { ensureAppSettings } from "@/server/db/settings";
import { appendMessages } from "@/server/sessions/session-service";

import { DELETE, GET as GET_ONE, PATCH } from "./[id]/route";
import { GET as LIST, POST } from "./route";

const prisma = getPrisma();
const createdSessionIds = new Set<string>();

function post(body: unknown, contentType = "application/json") {
  return POST(
    new Request("http://localhost/api/chats", {
      method: "POST",
      headers: { "content-type": contentType },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patch(id: string, body: unknown) {
  return PATCH(
    new Request(`http://localhost/api/chats/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    context(id),
  );
}

const getOne = (id: string) => GET_ONE(new Request(`http://localhost/api/chats/${id}`), context(id));
const remove = (id: string) => DELETE(new Request(`http://localhost/api/chats/${id}`, { method: "DELETE" }), context(id));

async function createSession(content = "I need a customer churn dashboard.") {
  const response = await post({ content, clientRequestId: randomUUID() });
  expect(response.status).toBe(201);
  const { session } = (await response.json()) as { session: ChatSessionDetail };
  createdSessionIds.add(session.id);
  return session;
}

afterEach(async () => {
  await prisma.chatSession.deleteMany({ where: { id: { in: [...createdSessionIds] } } });
  createdSessionIds.clear();
});

describe("POST /api/chats (first message)", () => {
  it("creates the session with the first user message, DORA's reply and the requirement state", async () => {
    const settings = await ensureAppSettings(prisma);
    const session = await createSession("I need a customer churn dashboard. For the retention team.");

    expect(session.title).toBe("I need a customer churn dashboard");
    expect(session.scenario).toBe("CUSTOMER_CHURN");
    expect(session.assistantRole).toBe(settings.defaultAssistantRole);
    expect(session.currentStage).toBe("BUSINESS_PROBLEM_VALIDATION");
    expect(session.completenessPercentage).toBe(0);
    expect(session.messages.map((m) => [m.role, m.content])).toEqual([
      ["USER", "I need a customer churn dashboard. For the retention team."],
      ["ASSISTANT", expect.stringContaining("what business problem are you trying to solve")],
    ]);

    const state = await prisma.requirementState.findUniqueOrThrow({ where: { sessionId: session.id } });
    expect(requirementFieldsSchema.parse(state.fields)).toEqual(createInitialRequirementFields());
    expect(state).toMatchObject({ currentField: "problemStatement", proposedSolution: "customer churn dashboard" });
  });

  it("stores the role chosen before the first message", async () => {
    const response = await post({ content: "Hello", clientRequestId: randomUUID(), assistantRole: "BRD_GENERATOR" });
    const { session } = (await response.json()) as { session: ChatSessionDetail };
    createdSessionIds.add(session.id);
    expect(session.assistantRole).toBe("BRD_GENERATOR");
  });

  it("returns the existing session when the same submission is repeated", async () => {
    const body = { content: "Sales dashboard for Q3", clientRequestId: randomUUID() };
    const first = await post(body);
    const second = await post(body);
    const firstSession = ((await first.json()) as { session: ChatSessionDetail }).session;
    const secondSession = ((await second.json()) as { session: ChatSessionDetail }).session;
    createdSessionIds.add(firstSession.id);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    expect(secondSession).toEqual(firstSession);
    expect(await prisma.message.count({ where: { clientRequestId: body.clientRequestId } })).toBe(1);
    expect(await prisma.message.count({ where: { sessionId: firstSession.id } })).toBe(2);
  });

  it("creates exactly one session for concurrent duplicate submissions", async () => {
    const body = { content: "Network outage report", clientRequestId: randomUUID() };
    const responses = await Promise.all(Array.from({ length: 5 }, () => post(body)));
    const sessions = await Promise.all(responses.map(async (r) => ((await r.json()) as { session: ChatSessionDetail }).session));
    sessions.forEach((s) => createdSessionIds.add(s.id));

    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(sessions.map((s) => s.id)).size).toBe(1);
    expect(await prisma.chatSession.count({ where: { id: { in: sessions.map((s) => s.id) } } })).toBe(1);
  });

  it("rejects reuse of an idempotency key for different content with 409", async () => {
    const clientRequestId = randomUUID();
    const first = await post({ content: "First request", clientRequestId });
    createdSessionIds.add(((await first.json()) as { session: ChatSessionDetail }).session.id);

    const conflict = await post({ content: "Different request", clientRequestId });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it.each([
    ["empty content", { content: "  ", clientRequestId: randomUUID() }, 400, "VALIDATION_ERROR"],
    ["missing idempotency key", { content: "Hi" }, 400, "VALIDATION_ERROR"],
    ["malformed JSON", "{", 400, "INVALID_JSON"],
  ])("rejects %s without creating a session", async (_label, body, status, code) => {
    const before = await prisma.chatSession.count();
    const response = await post(body);
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(await prisma.chatSession.count()).toBe(before);
  });

  it("rejects non-JSON bodies with 415", async () => {
    const response = await post("content=Hi", "application/x-www-form-urlencoded");
    expect(response.status).toBe(415);
  });
});

describe("GET /api/chats", () => {
  it("lists sessions, most recently updated first", async () => {
    const older = await createSession("Older request");
    const newer = await createSession("Newer request");

    const response = await LIST();
    expect(response.status).toBe(200);
    const { sessions } = (await response.json()) as { sessions: { id: string }[] };
    const ids = sessions.map((s) => s.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));

    // New activity moves a session to the top.
    await appendMessages(older.id, [{ role: "ASSISTANT", content: "Follow-up" }]);
    const reordered = ((await (await LIST()).json()) as { sessions: { id: string }[] }).sessions.map((s) => s.id);
    expect(reordered.indexOf(older.id)).toBeLessThan(reordered.indexOf(newer.id));
  });
});

describe("GET /api/chats/[id]", () => {
  it("returns messages in insertion order, including messages written in one transaction", async () => {
    const session = await createSession("First");
    await appendMessages(session.id, [
      { role: "ASSISTANT", content: "Second" },
      { role: "USER", content: "Third", clientRequestId: randomUUID() },
      { role: "ASSISTANT", content: "Fourth" },
    ]);

    const response = await getOne(session.id);
    expect(response.status).toBe(200);
    const { session: detail } = (await response.json()) as { session: ChatSessionDetail };
    expect(detail.messages.map((m) => [m.role, m.content])).toEqual([
      ["USER", "First"],
      ["ASSISTANT", expect.any(String)],
      ["ASSISTANT", "Second"],
      ["USER", "Third"],
      ["ASSISTANT", "Fourth"],
    ]);
  });

  it("returns 404 for an unknown session and 400 for a malformed id", async () => {
    expect((await getOne("cmh3x8k2f0000abcd1234efgh")).status).toBe(404);
    const malformed = await getOne("not a valid id");
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /api/chats/[id]", () => {
  it("renames a session and persists the new title", async () => {
    const session = await createSession();
    const response = await patch(session.id, { title: "  Churn  analysis for retention " });
    expect(response.status).toBe(200);
    expect((await response.json()).session.title).toBe("Churn analysis for retention");

    const reloaded = (await (await getOne(session.id)).json()) as { session: ChatSessionDetail };
    expect(reloaded.session.title).toBe("Churn analysis for retention");
  });

  it("rejects invalid titles and unknown fields with 400", async () => {
    const session = await createSession();
    expect((await patch(session.id, { title: "   " })).status).toBe(400);
    expect((await patch(session.id, { title: "x".repeat(121) })).status).toBe(400);
    expect((await patch(session.id, { title: "Ok", currentStage: "BRD_GENERATION" })).status).toBe(400);
  });

  it("returns 404 for an unknown session", async () => {
    expect((await patch("cmh3x8k2f0000abcd1234efgh", { title: "Renamed" })).status).toBe(404);
  });
});

describe("DELETE /api/chats/[id]", () => {
  it("deletes the session with its messages, requirement state and BRD", async () => {
    const session = await createSession();
    await appendMessages(session.id, [{ role: "ASSISTANT", content: "Reply" }]);
    await prisma.businessRequirementsDocument.create({
      data: { sessionId: session.id, title: "BRD", content: createEmptyBrdContent() },
    });

    const response = await remove(session.id);
    expect(response.status).toBe(204);

    expect(await prisma.chatSession.count({ where: { id: session.id } })).toBe(0);
    expect(await prisma.message.count({ where: { sessionId: session.id } })).toBe(0);
    expect(await prisma.requirementState.count({ where: { sessionId: session.id } })).toBe(0);
    expect(await prisma.businessRequirementsDocument.count({ where: { sessionId: session.id } })).toBe(0);
    expect((await getOne(session.id)).status).toBe(404);
  });

  it("returns 404 when the session does not exist", async () => {
    expect((await remove("cmh3x8k2f0000abcd1234efgh")).status).toBe(404);
  });
});
