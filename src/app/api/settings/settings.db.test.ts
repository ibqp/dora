import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { AssistantRole } from "@/generated/prisma/enums";
import type { ChatSessionDetail, SettingsResponse } from "@/lib/api/types";
import { MAX_RESPONSE_DELAY_MS } from "@/lib/settings/settings";
import { getPrisma } from "@/server/db/client";
import { APP_SETTINGS_ID } from "@/server/db/settings";
import { simulateResponseDelay } from "@/server/discovery/delay";
import { PROCESSING_LOCK_TIMEOUT_MS } from "@/server/sessions/processing-lock";

import { POST as SEND } from "../chats/[id]/messages/route";
import { GET as GET_SESSION } from "../chats/[id]/route";
import { POST as CREATE } from "../chats/route";
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
const patch = (body: unknown) => PATCH(json("PATCH", body));
const read = async () => ((await (await GET()).json()) as SettingsResponse).settings;

async function start(content = "I need a customer churn dashboard."): Promise<ChatSessionDetail> {
  const response = await CREATE(json("POST", { content, clientRequestId: randomUUID() }));
  const { session } = (await response.json()) as { session: ChatSessionDetail };
  createdSessionIds.add(session.id);
  return session;
}

// The settings record is shared: remember its values and restore them after every test.
let original: { defaultAssistantRole: AssistantRole; mockResponseDelayMs: number };
beforeAll(async () => {
  const { defaultAssistantRole, mockResponseDelayMs } = await prisma.appSettings.findUniqueOrThrow({ where: { id: APP_SETTINGS_ID } });
  original = { defaultAssistantRole, mockResponseDelayMs };
});

afterEach(async () => {
  await prisma.appSettings.update({ where: { id: APP_SETTINGS_ID }, data: original });
  await prisma.chatSession.deleteMany({ where: { id: { in: [...createdSessionIds] } } });
  createdSessionIds.clear();
});

describe("GET /api/settings", () => {
  it("returns the stored default role and simulated delay", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const stored = await prisma.appSettings.findUniqueOrThrow({ where: { id: APP_SETTINGS_ID } });
    expect(await response.json()).toEqual({
      settings: {
        defaultAssistantRole: stored.defaultAssistantRole,
        mockResponseDelayMs: stored.mockResponseDelayMs,
        updatedAt: stored.updatedAt.toISOString(),
      },
    });
  });
});

describe("PATCH /api/settings", () => {
  it("persists both settings in PostgreSQL", async () => {
    const response = await patch({ defaultAssistantRole: "DATA_REQUIREMENTS_ANALYST", mockResponseDelayMs: 2300 });
    expect(response.status).toBe(200);
    const { settings } = (await response.json()) as SettingsResponse;
    expect(settings).toMatchObject({ defaultAssistantRole: "DATA_REQUIREMENTS_ANALYST", mockResponseDelayMs: 2300 });
    // A fresh read (as after a page reload) returns the saved values.
    expect(await read()).toEqual(settings);
    expect(await prisma.appSettings.count()).toBe(1);
  });

  it("changes only the setting that is sent", async () => {
    await patch({ defaultAssistantRole: "BRD_GENERATOR", mockResponseDelayMs: 800 });
    await patch({ mockResponseDelayMs: 0 });
    expect(await read()).toMatchObject({ defaultAssistantRole: "BRD_GENERATOR", mockResponseDelayMs: 0 });
    await patch({ defaultAssistantRole: "XY_PROBLEM_DIAGNOSTIC" });
    expect(await read()).toMatchObject({ defaultAssistantRole: "XY_PROBLEM_DIAGNOSTIC", mockResponseDelayMs: 0 });
  });

  it("accepts the bounds and rejects invalid values without changing anything", async () => {
    expect((await patch({ mockResponseDelayMs: 0 })).status).toBe(200);
    expect((await patch({ mockResponseDelayMs: 5000 })).status).toBe(200);
    const before = await read();
    for (const body of [
      {},
      { mockResponseDelayMs: -1 },
      { mockResponseDelayMs: 5001 },
      { mockResponseDelayMs: 1.5 },
      { mockResponseDelayMs: "1500" },
      { mockResponseDelayMs: null },
      { defaultAssistantRole: "ORACLE" },
      { temperature: 0.7 },
    ]) {
      const response = await patch(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    }
    const notJson = await PATCH(new Request("http://localhost", { method: "PATCH", body: "x" }));
    expect(notJson.status).toBe(415);
    expect(await read()).toEqual(before);
  });

  it("is also bounded by the database (CHECK constraint)", async () => {
    await expect(prisma.appSettings.update({ where: { id: APP_SETTINGS_ID }, data: { mockResponseDelayMs: 5001 } })).rejects.toThrow();
    await expect(prisma.appSettings.update({ where: { id: APP_SETTINGS_ID }, data: { mockResponseDelayMs: -1 } })).rejects.toThrow();
  });

  it("keeps the maximum delay below the processing-lock timeout", () => {
    expect(MAX_RESPONSE_DELAY_MS * 2).toBeLessThan(PROCESSING_LOCK_TIMEOUT_MS);
  });
});

describe("Applying the settings", () => {
  it("gives new sessions the default role and leaves existing sessions' roles unchanged", async () => {
    await patch({ defaultAssistantRole: "XY_PROBLEM_DIAGNOSTIC" });
    const existing = await start();
    expect(existing.assistantRole).toBe("XY_PROBLEM_DIAGNOSTIC");

    await patch({ defaultAssistantRole: "BRD_GENERATOR" });
    const newer = await start();
    expect(newer.assistantRole).toBe("BRD_GENERATOR");

    const reloaded = (await (await GET_SESSION(new Request("http://localhost"), context(existing.id))).json()) as {
      session: ChatSessionDetail;
    };
    expect(reloaded.session.assistantRole).toBe("XY_PROBLEM_DIAGNOSTIC");

    // A role chosen explicitly for the first message wins over the default.
    const response = await CREATE(
      json("POST", { content: "Sales dashboard", clientRequestId: randomUUID(), assistantRole: "DATA_REQUIREMENTS_ANALYST" }),
    );
    const explicit = ((await response.json()) as { session: ChatSessionDetail }).session;
    createdSessionIds.add(explicit.id);
    expect(explicit.assistantRole).toBe("DATA_REQUIREMENTS_ANALYST");
  });

  it("uses the current delay for the next DORA response", async () => {
    const delay = vi.mocked(simulateResponseDelay);
    await patch({ mockResponseDelayMs: 2300 });
    const session = await start();
    expect(delay).toHaveBeenLastCalledWith(2300);

    await patch({ mockResponseDelayMs: 400 });
    const response = await SEND(json("POST", { content: "Churn rose to 1.8% last quarter", clientRequestId: randomUUID() }), context(session.id));
    expect(response.status).toBe(201);
    expect(delay).toHaveBeenLastCalledWith(400);
  });
});
