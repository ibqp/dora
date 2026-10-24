import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatSessionDetail, RequirementsResponse, SendMessageResponse } from "@/lib/api/types";
import { createInitialDiscoveryState, processTurn } from "@/lib/mock-ai";
import { getPrisma } from "@/server/db/client";

import { POST as SEND } from "../messages/route";
import { GET as GET_ONE, PATCH } from "../route";
import { POST as CREATE } from "../../route";
import { GET } from "./route";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("@/server/discovery/delay", () => ({ simulateResponseDelay: vi.fn(async () => {}) }));

const prisma = getPrisma();
const createdSessionIds = new Set<string>();
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (url: string, method: string, body: unknown) =>
  new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function start(content: string, assistantRole?: string) {
  const response = await CREATE(json("http://localhost/api/chats", "POST", { content, clientRequestId: randomUUID(), ...(assistantRole ? { assistantRole } : {}) }));
  const { session } = (await response.json()) as { session: ChatSessionDetail };
  createdSessionIds.add(session.id);
  return session;
}

async function send(id: string, content: string) {
  const response = await SEND(json("http://localhost", "POST", { content, clientRequestId: randomUUID() }), context(id));
  expect(response.status).toBe(201);
  return (await response.json()) as SendMessageResponse;
}

const patch = (id: string, body: unknown) => PATCH(json("http://localhost", "PATCH", body), context(id));
const detail = async (id: string) => ((await (await GET_ONE(new Request("http://localhost"), context(id))).json()) as { session: ChatSessionDetail }).session;

afterEach(async () => {
  await prisma.chatSession.deleteMany({ where: { id: { in: [...createdSessionIds] } } });
  createdSessionIds.clear();
});

describe("GET /api/chats/[id]/requirements", () => {
  it("returns completeness, stages and field statuses derived from the stored requirement state", async () => {
    const session = await start("I need a customer churn dashboard.");
    await send(session.id, "skip");
    await send(session.id, "Reduce churn by identifying at-risk customers early");

    const response = await GET(new Request("http://localhost"), context(session.id));
    expect(response.status).toBe(200);
    const { sessionId, requirements } = (await response.json()) as RequirementsResponse;
    expect(sessionId).toBe(session.id);
    // 5 messages exchanged, but only one field provided; the skipped problem does not count.
    expect(requirements).toMatchObject({ completenessPercentage: 6, completedCount: 1, totalCount: 18, stage: "REQUIREMENTS_DISCOVERY" });
    const fields = Object.fromEntries(requirements.sections.flatMap((s) => s.fields).map((f) => [f.key, f]));
    expect(fields.problemStatement).toMatchObject({ status: "SKIPPED", value: null });
    expect(fields.desiredOutcome).toMatchObject({ status: "PROVIDED", value: "Reduce churn by identifying at-risk customers early" });
    expect(fields.currentSituation).toMatchObject({ status: "MISSING", isCurrent: true });
    expect(requirements.stages.map((s) => s.status)).toEqual(["completed", "completed", "current", "upcoming", "upcoming", "upcoming"]);
  });

  it("returns 404 for an unknown session and 400 for a malformed id", async () => {
    expect((await GET(new Request("http://localhost"), context("cmh3x8k2f0000abcd1234efgh"))).status).toBe(404);
    expect((await GET(new Request("http://localhost"), context("bad id"))).status).toBe(400);
  });

  it("is included in message responses and the session detail", async () => {
    const session = await start("I need a customer churn dashboard.");
    expect(session.requirements.stage).toBe("BUSINESS_PROBLEM_VALIDATION");
    const turn = await send(session.id, "Postpaid churn rose to 1.8% and we cannot see who will leave");
    expect(turn.requirements.completenessPercentage).toBe(6);
    expect((await detail(session.id)).requirements).toEqual(turn.requirements);
  });
});

describe("assistant role switching (Scenario H)", () => {
  it("stores the role chosen before the first message", async () => {
    const session = await start("I need a customer churn dashboard.", "XY_PROBLEM_DIAGNOSTIC");
    expect(session.assistantRole).toBe("XY_PROBLEM_DIAGNOSTIC");
  });

  it("changes the role without touching messages, requirements or stage", async () => {
    const session = await start("I need a customer churn dashboard.");
    await send(session.id, "Postpaid churn rose to 1.8% and we cannot see who will leave");
    await send(session.id, "Reduce churn by identifying at-risk customers early");
    const before = await detail(session.id);
    const stateBefore = await prisma.requirementState.findUniqueOrThrow({ where: { sessionId: session.id } });

    const response = await patch(session.id, { assistantRole: "DATA_REQUIREMENTS_ANALYST" });
    expect(response.status).toBe(200);
    expect((await response.json()).session.assistantRole).toBe("DATA_REQUIREMENTS_ANALYST");

    const after = await detail(session.id);
    expect(after.assistantRole).toBe("DATA_REQUIREMENTS_ANALYST");
    expect(after.messages).toEqual(before.messages);
    expect(after.requirements).toEqual(before.requirements);
    expect(after.currentStage).toBe(before.currentStage);
    const stateAfter = await prisma.requirementState.findUniqueOrThrow({ where: { sessionId: session.id } });
    expect(stateAfter).toEqual(stateBefore);
  });

  it("applies the new role's priorities and templates to the next response", async () => {
    const opening = "I need a customer churn dashboard.";
    const problem = "Postpaid churn rose to 1.8% and we cannot see who will leave";
    const outcome = "Reduce churn by identifying at-risk customers early";
    const session = await start(opening);
    await send(session.id, problem);
    await patch(session.id, { assistantRole: "DATA_REQUIREMENTS_ANALYST" });
    const turn = await send(session.id, outcome);

    // Same conversation through the engine: default role for two turns, then the analyst role.
    const t1 = processTurn({ message: opening, state: createInitialDiscoveryState(), role: "REQUIREMENTS_DISCOVERY" });
    const t2 = processTurn({ message: problem, state: t1.state, role: "REQUIREMENTS_DISCOVERY" });
    const t3 = processTurn({ message: outcome, state: t2.state, role: "DATA_REQUIREMENTS_ANALYST" });
    expect(turn.messages[1].content).toBe(t3.reply);
    expect(turn.requirements.currentField).toBe("keyMetrics");
    expect(turn.messages[1].content).toContain("Which KPIs should be calculated");
  });

  it("restores role, stage and completeness after reload", async () => {
    const session = await start("I need a customer churn dashboard.");
    await send(session.id, "Postpaid churn rose to 1.8% and we cannot see who will leave");
    await patch(session.id, { assistantRole: "BRD_GENERATOR" });

    const reloaded = await detail(session.id);
    expect(reloaded).toMatchObject({
      assistantRole: "BRD_GENERATOR",
      currentStage: "BUSINESS_PROBLEM_VALIDATION",
      completenessPercentage: 6,
    });
    expect(reloaded.requirements.completenessPercentage).toBe(6);
  });

  it("rejects unknown roles and empty updates", async () => {
    const session = await start("Hello");
    expect((await patch(session.id, { assistantRole: "ORACLE" })).status).toBe(400);
    expect((await patch(session.id, {})).status).toBe(400);
    expect((await detail(session.id)).assistantRole).toBe(session.assistantRole);
  });

  it("keeps the role of existing sessions when the default role changes", async () => {
    const session = await start("Hello");
    const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: 1 } });
    try {
      await prisma.appSettings.update({ where: { id: 1 }, data: { defaultAssistantRole: "BRD_GENERATOR" } });
      expect((await detail(session.id)).assistantRole).toBe(session.assistantRole);
      const newer = await start("Hello again");
      expect(newer.assistantRole).toBe("BRD_GENERATOR");
    } finally {
      await prisma.appSettings.update({ where: { id: 1 }, data: { defaultAssistantRole: settings.defaultAssistantRole } });
    }
  });
});
