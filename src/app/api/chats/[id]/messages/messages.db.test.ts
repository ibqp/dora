import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatSessionDetail, SendMessageResponse } from "@/lib/api/types";
import { createInitialDiscoveryState, processTurn } from "@/lib/mock-ai";
import { getPrisma } from "@/server/db/client";
import { ensureAppSettings } from "@/server/db/settings";
import { simulateResponseDelay } from "@/server/discovery/delay";
import { PROCESSING_LOCK_TIMEOUT_MS } from "@/server/sessions/processing-lock";

import { GET as GET_ONE, PATCH } from "../route";
import { POST as CREATE } from "../../route";
import { POST } from "./route";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("@/server/discovery/delay", () => ({ simulateResponseDelay: vi.fn(async () => {}) }));

const prisma = getPrisma();
const createdSessionIds = new Set<string>();
const delay = vi.mocked(simulateResponseDelay);

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });

async function startSession(content = "I need a customer churn dashboard.") {
  const response = await CREATE(jsonRequest("http://localhost/api/chats", "POST", { content, clientRequestId: randomUUID() }));
  expect(response.status).toBe(201);
  const { session } = (await response.json()) as { session: ChatSessionDetail };
  createdSessionIds.add(session.id);
  return session;
}

function send(sessionId: string, content: string, clientRequestId: string = randomUUID()) {
  return POST(jsonRequest(`http://localhost/api/chats/${sessionId}/messages`, "POST", { content, clientRequestId }), context(sessionId));
}

async function messageCount(sessionId: string) {
  return prisma.message.count({ where: { sessionId } });
}

/** Makes the next simulated delay wait until `release()` is called. */
function holdNextDelay() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let started!: () => void;
  const reached = new Promise<void>((resolve) => (started = resolve));
  delay.mockImplementationOnce(async () => {
    started();
    await gate;
  });
  return { release, reached };
}

beforeEach(() => {
  delay.mockClear();
});

afterEach(async () => {
  await prisma.chatSession.deleteMany({ where: { id: { in: [...createdSessionIds] } } });
  createdSessionIds.clear();
});

describe("POST /api/chats/[id]/messages", () => {
  it("stores the user message, DORA's engine reply and the updated requirement state", async () => {
    const session = await startSession();
    const answer = "Postpaid churn rose from 1.2% to 1.8% and we cannot see which customers will leave.";

    const response = await send(session.id, answer);
    expect(response.status).toBe(201);
    const body = (await response.json()) as SendMessageResponse;

    // The reply is exactly what the Mock AI engine produces for this state and message.
    const first = processTurn({ message: "I need a customer churn dashboard.", state: createInitialDiscoveryState(), role: session.assistantRole });
    const expected = processTurn({ message: answer, state: first.state, role: session.assistantRole });
    expect(body.messages.map((m) => [m.role, m.content])).toEqual([
      ["USER", answer],
      ["ASSISTANT", expected.reply],
    ]);
    expect(body.session).toMatchObject({ currentStage: "BUSINESS_PROBLEM_VALIDATION", completenessPercentage: 6 });

    const state = await prisma.requirementState.findUniqueOrThrow({ where: { sessionId: session.id } });
    expect(state.fields).toEqual(expected.state.fields);
    expect(state).toMatchObject({ currentField: "desiredOutcome", completenessPercentage: 6 });
    expect(await messageCount(session.id)).toBe(4);
  });

  it("waits for the configured delay before storing the turn, without holding a transaction", async () => {
    const settings = await ensureAppSettings(prisma);
    const session = await startSession();
    const held = holdNextDelay();

    const pending = send(session.id, "Churn increased by 20% last quarter and we do not know why");
    await held.reached;
    expect(delay).toHaveBeenLastCalledWith(settings.mockResponseDelayMs);

    // Nothing is stored yet, and the session row is not locked by an open transaction.
    expect(await messageCount(session.id)).toBe(2);
    const rename = await PATCH(jsonRequest(`http://localhost/api/chats/${session.id}`, "PATCH", { title: "Renamed meanwhile" }), context(session.id));
    expect(rename.status).toBe(200);

    held.release();
    expect((await pending).status).toBe(201);
    expect(await messageCount(session.id)).toBe(4);
  });

  it("rejects an overlapping message with 409 SESSION_BUSY and stores only the first", async () => {
    const session = await startSession();
    const held = holdNextDelay();

    const first = send(session.id, "Churn increased by 20% last quarter and we do not know why");
    await held.reached;
    const overlapping = await send(session.id, "Another message while DORA is typing");
    expect(overlapping.status).toBe(409);
    expect((await overlapping.json()).error.code).toBe("SESSION_BUSY");

    held.release();
    expect((await first).status).toBe(201);
    const detail = (await (await GET_ONE(new Request("http://localhost"), context(session.id))).json()) as { session: ChatSessionDetail };
    expect(detail.session.messages).toHaveLength(4);
    expect(detail.session.messages.map((m) => m.content)).not.toContain("Another message while DORA is typing");
  });

  it("returns the stored exchange when a submission is retried, without processing it again", async () => {
    const session = await startSession();
    const clientRequestId = randomUUID();
    const content = "Churn increased by 20% last quarter and we do not know why";

    const first = (await (await send(session.id, content, clientRequestId)).json()) as SendMessageResponse;
    const retry = await send(session.id, content, clientRequestId);
    expect(retry.status).toBe(200);
    expect(retry.headers.get("Idempotent-Replayed")).toBe("true");
    expect(((await retry.json()) as SendMessageResponse).messages).toEqual(first.messages);
    expect(await messageCount(session.id)).toBe(4);
  });

  it("rejects reuse of an idempotency key for a different message or session", async () => {
    const session = await startSession();
    const other = await startSession("Sales dashboard please");
    const clientRequestId = randomUUID();
    await send(session.id, "Churn increased by 20% last quarter", clientRequestId);

    expect((await send(session.id, "Something else", clientRequestId)).status).toBe(409);
    expect((await send(other.id, "Churn increased by 20% last quarter", clientRequestId)).status).toBe(409);
  });

  it("stores nothing and releases the lock when processing fails", async () => {
    const session = await startSession();
    const before = await prisma.requirementState.findUniqueOrThrow({ where: { sessionId: session.id } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    delay.mockImplementationOnce(async () => {
      throw new Error("simulated failure");
    });

    const failed = await send(session.id, "Churn increased by 20% last quarter");
    expect(failed.status).toBe(500);
    expect(await messageCount(session.id)).toBe(2);
    const after = await prisma.requirementState.findUniqueOrThrow({ where: { sessionId: session.id } });
    expect(after.fields).toEqual(before.fields);
    expect(after.updatedAt).toEqual(before.updatedAt);
    const lock = await prisma.chatSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(lock.processingToken).toBeNull();

    // The same submission can be retried successfully.
    expect((await send(session.id, "Churn increased by 20% last quarter")).status).toBe(201);
  });

  it("takes over an abandoned lock but respects a fresh one", async () => {
    const session = await startSession();
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { processingToken: "crashed", processingStartedAt: new Date(Date.now() - PROCESSING_LOCK_TIMEOUT_MS - 1000) },
    });
    expect((await send(session.id, "Churn increased by 20% last quarter")).status).toBe(201);

    await prisma.chatSession.update({ where: { id: session.id }, data: { processingToken: "active", processingStartedAt: new Date() } });
    expect((await send(session.id, "Another answer")).status).toBe(409);
  });

  it("returns 404 if the session is deleted while DORA is typing, and stores nothing", async () => {
    const session = await startSession();
    const held = holdNextDelay();
    const pending = send(session.id, "Churn increased by 20% last quarter");
    await held.reached;
    await prisma.chatSession.delete({ where: { id: session.id } });
    held.release();

    expect((await pending).status).toBe(404);
    expect(await messageCount(session.id)).toBe(0);
  });

  it("returns 500 for corrupted stored state and releases the lock", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const session = await startSession();
    await prisma.requirementState.update({ where: { sessionId: session.id }, data: { fields: { broken: true } } });

    const response = await send(session.id, "Churn increased by 20% last quarter");
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
    expect((await prisma.chatSession.findUniqueOrThrow({ where: { id: session.id } })).processingToken).toBeNull();
  });

  it.each([
    ["unknown session", "cmh3x8k2f0000abcd1234efgh", { content: "Hi", clientRequestId: randomUUID() }, 404],
    ["malformed id", "not-an-id", { content: "Hi", clientRequestId: randomUUID() }, 400],
  ])("returns the right error for an %s", async (_label, id, body, status) => {
    const response = await POST(jsonRequest(`http://localhost/api/chats/${id}/messages`, "POST", body), context(id));
    expect(response.status).toBe(status);
  });

  it("rejects empty messages and unknown fields", async () => {
    const session = await startSession();
    const empty = await POST(jsonRequest("http://localhost", "POST", { content: "  ", clientRequestId: randomUUID() }), context(session.id));
    expect(empty.status).toBe(400);
    const extra = await POST(
      jsonRequest("http://localhost", "POST", { content: "Hi", clientRequestId: randomUUID(), role: "ASSISTANT" }),
      context(session.id),
    );
    expect(extra.status).toBe(400);
    expect(await messageCount(session.id)).toBe(2);
  });
});

describe("conversation restore (Scenario C)", () => {
  it("returns all messages in order with stage, role and progress after several turns", async () => {
    const session = await startSession();
    await send(session.id, "Churn increased by 20% last quarter and we do not know why");
    await send(session.id, "Reduce churn by identifying at-risk customers early");
    await send(session.id, "Today the retention team gets a monthly Excel list");

    const response = await GET_ONE(new Request("http://localhost"), context(session.id));
    const { session: restored } = (await response.json()) as { session: ChatSessionDetail };
    expect(restored.messages.map((m) => m.role)).toEqual(["USER", "ASSISTANT", "USER", "ASSISTANT", "USER", "ASSISTANT", "USER", "ASSISTANT"]);
    expect(restored).toMatchObject({
      currentStage: "REQUIREMENTS_DISCOVERY",
      assistantRole: session.assistantRole,
      completenessPercentage: 17,
    });
  });
});
