import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { BrdDetail, BrdResponse, ChatSessionDetail, RegenerateBrdResponse } from "@/lib/api/types";
import { FieldStatus, REQUIREMENT_FIELD_KEYS } from "@/lib/requirements/fields";
import { createInitialRequirementFields, type RequirementFields } from "@/lib/requirements/schemas";
import { getPrisma } from "@/server/db/client";

import { POST as GENERATE } from "../../chats/[id]/brd/route";
import { POST as CREATE } from "../../chats/route";
import { POST as REGENERATE } from "./regenerate/route";
import { GET, PATCH } from "./route";

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

const patch = (brdId: string, body: unknown) => PATCH(json("PATCH", body), context(brdId));
const regenerate = (brdId: string) => REGENERATE(new Request("http://localhost", { method: "POST" }), context(brdId));
const get = async (brdId: string) => ((await (await GET(new Request("http://localhost"), context(brdId))).json()) as BrdResponse).brd;
const fieldValues = (brd: BrdDetail) =>
  Object.fromEntries(brd.sections.flatMap((section) => section.fields).map((field) => [field.key, field.value]));
const editedKeys = (brd: BrdDetail) =>
  brd.sections.flatMap((section) => section.fields).filter((field) => field.manuallyEdited).map((field) => field.key);

async function setRequirements(sessionId: string, fields: RequirementFields) {
  await prisma.requirementState.update({ where: { sessionId }, data: { fields } });
}

function provided(keys: readonly string[], prefix = "Stated"): RequirementFields {
  const fields = createInitialRequirementFields();
  for (const key of REQUIREMENT_FIELD_KEYS) {
    if (keys.includes(key)) fields[key] = { value: `${prefix} ${key}`, status: FieldStatus.PROVIDED, clarificationCount: 0 };
  }
  return fields;
}

/** A session with a BRD generated while only `problemStatement` was provided. */
async function draftBrd(): Promise<{ session: ChatSessionDetail; brd: BrdDetail }> {
  const response = await CREATE(json("POST", { content: "I need a customer churn dashboard.", clientRequestId: randomUUID() }));
  const { session } = (await response.json()) as { session: ChatSessionDetail };
  createdSessionIds.add(session.id);
  await setRequirements(session.id, provided(["problemStatement"]));
  const generated = await GENERATE(json("POST", { allowIncomplete: true }), context(session.id));
  return { session, brd: ((await generated.json()) as BrdResponse).brd };
}

afterEach(async () => {
  await prisma.chatSession.deleteMany({ where: { id: { in: [...createdSessionIds] } } });
  createdSessionIds.clear();
});

describe("PATCH /api/brds/[id]", () => {
  it("persists manual edits, marks them and recalculates completeness", async () => {
    const { brd } = await draftBrd();
    const response = await patch(brd.id, {
      title: "  Churn   BRD ",
      content: { problemStatement: "Edited problem", keyMetrics: "Monthly churn rate\nper segment" },
    });
    expect(response.status).toBe(200);
    const saved = ((await response.json()) as BrdResponse).brd;

    expect(saved).toMatchObject({ id: brd.id, title: "Churn BRD", status: "DRAFT", completenessPercentage: 11 });
    expect(fieldValues(saved)).toMatchObject({ problemStatement: "Edited problem", keyMetrics: "Monthly churn rate\nper segment" });
    expect(editedKeys(saved)).toEqual(["problemStatement", "keyMetrics"]);
    expect(saved.missingFields).toHaveLength(16);
    expect(saved.updatedAt > brd.updatedAt).toBe(true);
    // Survives a reload.
    expect(await get(brd.id)).toEqual(saved);

    const stored = await prisma.businessRequirementsDocument.findUniqueOrThrow({ where: { id: brd.id } });
    expect(Object.keys(stored.manualEdits as object).sort()).toEqual(["keyMetrics", "problemStatement"]);
  });

  it("stores a cleared field as null and downgrades a complete BRD to Draft", async () => {
    const { session, brd } = await draftBrd();
    await setRequirements(session.id, provided(REQUIREMENT_FIELD_KEYS));
    const complete = ((await (await regenerate(brd.id)).json()) as RegenerateBrdResponse).brd;
    expect(complete).toMatchObject({ status: "READY_FOR_REVIEW", completenessPercentage: 100 });

    const saved = ((await (await patch(brd.id, { content: { dataSources: "  ", keyMetrics: null } })).json()) as BrdResponse).brd;
    expect(fieldValues(saved)).toMatchObject({ dataSources: null, keyMetrics: null });
    expect(saved).toMatchObject({ status: "DRAFT", completenessPercentage: 89 });
    expect(saved.missingFields.map((field) => field.key)).toEqual(["dataSources", "keyMetrics"]);

    const filled = ((await (await patch(brd.id, { content: { dataSources: "CRM", keyMetrics: "Churn rate" } })).json()) as BrdResponse)
      .brd;
    expect(filled).toMatchObject({ status: "READY_FOR_REVIEW", completenessPercentage: 100 });
  });

  it("does not change the BRD when nothing differs from the saved content", async () => {
    const { brd } = await draftBrd();
    const saved = ((await (await patch(brd.id, { title: brd.title, content: { problemStatement: " Stated problemStatement " } })).json()) as BrdResponse)
      .brd;
    expect(saved).toEqual(brd);
    expect(editedKeys(saved)).toEqual([]);
  });

  it("validates the request", async () => {
    const { brd } = await draftBrd();
    expect((await patch(brd.id, {})).status).toBe(400);
    expect((await patch(brd.id, { content: {} })).status).toBe(400);
    expect((await patch(brd.id, { content: { unknownField: "x" } })).status).toBe(400);
    expect((await patch(brd.id, { content: { keyMetrics: 42 } })).status).toBe(400);
    expect((await patch(brd.id, { content: { keyMetrics: "x".repeat(4001) } })).status).toBe(400);
    expect((await patch(brd.id, { title: "   " })).status).toBe(400);
    expect((await patch(brd.id, { status: "READY_FOR_REVIEW" })).status).toBe(400);
    expect((await patch("cmh3x8k2f0000abcd1234efgh", { title: "x" })).status).toBe(404);
    expect((await patch("bad id", { title: "x" })).status).toBe(400);
    expect(await get(brd.id)).toEqual(brd);
  });
});

describe("POST /api/brds/[id]/regenerate", () => {
  it("preserves manual edits, fills empty fields and keeps the BRD identity (Scenario E)", async () => {
    const { session, brd } = await draftBrd();
    await patch(brd.id, { title: "My BRD", content: { problemStatement: "Edited problem", intendedUsers: "Retention team" } });
    await setRequirements(session.id, provided(["problemStatement", "intendedUsers", "dataSources", "keyMetrics"], "Latest"));

    const response = await regenerate(brd.id);
    expect(response.status).toBe(200);
    const result = (await response.json()) as RegenerateBrdResponse;

    expect(result.brd).toMatchObject({ id: brd.id, sessionId: session.id, title: "My BRD", createdAt: brd.createdAt });
    expect(fieldValues(result.brd)).toMatchObject({
      problemStatement: "Edited problem",
      intendedUsers: "Retention team",
      dataSources: "Latest dataSources",
      keyMetrics: "Latest keyMetrics",
    });
    expect(result.filledFields).toEqual([
      { key: "dataSources", label: "Data sources" },
      { key: "keyMetrics", label: "Key business metrics" },
    ]);
    expect(editedKeys(result.brd)).toEqual(["problemStatement", "intendedUsers"]);
    expect(result.brd).toMatchObject({ status: "DRAFT", completenessPercentage: 22 });
    expect(await prisma.businessRequirementsDocument.count({ where: { sessionId: session.id } })).toBe(1);
    expect(await get(brd.id)).toEqual(result.brd);
  });

  it("becomes Ready for Review when all fields have content", async () => {
    const { session, brd } = await draftBrd();
    await patch(brd.id, { content: { successCriteria: "Churn below 1.5%" } });
    await setRequirements(session.id, provided(REQUIREMENT_FIELD_KEYS));

    const { brd: regenerated } = (await (await regenerate(brd.id)).json()) as RegenerateBrdResponse;
    expect(regenerated).toMatchObject({ status: "READY_FOR_REVIEW", completenessPercentage: 100, missingFields: [] });
    expect(fieldValues(regenerated)["successCriteria"]).toBe("Churn below 1.5%");
  });

  it("changes nothing when no empty field can be filled", async () => {
    const { brd } = await draftBrd();
    const result = (await (await regenerate(brd.id)).json()) as RegenerateBrdResponse;
    expect(result.filledFields).toEqual([]);
    expect(result.brd).toEqual(brd);
  });

  it("serializes concurrent saves and regenerations without losing edits", async () => {
    const { session, brd } = await draftBrd();
    await setRequirements(session.id, provided(REQUIREMENT_FIELD_KEYS));
    const responses = await Promise.all([
      patch(brd.id, { content: { keyMetrics: "Edited metric" } }),
      regenerate(brd.id),
      patch(brd.id, { content: { dataSources: "Edited sources" } }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);

    const final = await get(brd.id);
    expect(fieldValues(final)).toMatchObject({ keyMetrics: "Edited metric", dataSources: "Edited sources" });
    expect(editedKeys(final).sort()).toEqual(["dataSources", "keyMetrics"]);
    expect(final.status).toBe("READY_FOR_REVIEW");
  });

  it("returns 404 for unknown BRDs and 400 for invalid ids", async () => {
    expect((await regenerate("cmh3x8k2f0000abcd1234efgh")).status).toBe(404);
    expect((await regenerate("bad id")).status).toBe(400);
  });
});
