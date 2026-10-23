import { afterEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import {
  brdContentSchema,
  createEmptyBrdContent,
  createInitialRequirementFields,
  requirementFieldsSchema,
} from "@/lib/requirements/schemas";

import { getPrisma } from "./client";
import { APP_SETTINGS_ID, ensureAppSettings } from "./settings";

const prisma = getPrisma();
const createdSessionIds: string[] = [];

async function createSessionGraph() {
  const session = await prisma.chatSession.create({
    data: {
      title: "Test session",
      scenario: "CUSTOMER_CHURN",
      assistantRole: "REQUIREMENTS_DISCOVERY",
      messages: {
        create: [
          { role: "USER", content: "I need a customer churn dashboard." },
          { role: "ASSISTANT", content: "What business problem are you trying to solve?" },
        ],
      },
      requirementState: {
        create: { fields: createInitialRequirementFields(), currentField: "problemStatement" },
      },
      brd: { create: { title: "Test BRD", content: createEmptyBrdContent() } },
    },
  });
  createdSessionIds.push(session.id);
  return session;
}

function knownErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
}

afterEach(async () => {
  await prisma.chatSession.deleteMany({ where: { id: { in: createdSessionIds.splice(0) } } });
});

describe("ChatSession relationships", () => {
  it("persists a session with messages, requirement state and BRD", async () => {
    const { id } = await createSessionGraph();

    const loaded = await prisma.chatSession.findUniqueOrThrow({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        requirementState: true,
        brd: true,
      },
    });

    expect(loaded.currentStage).toBe("INITIAL_REQUEST");
    expect(loaded.messages.map((message) => message.role)).toEqual(["USER", "ASSISTANT"]);
    expect(loaded.requirementState?.completenessPercentage).toBe(0);
    expect(requirementFieldsSchema.parse(loaded.requirementState?.fields)).toEqual(
      createInitialRequirementFields(),
    );
    expect(loaded.brd?.status).toBe("DRAFT");
    expect(brdContentSchema.parse(loaded.brd?.content)).toEqual(createEmptyBrdContent());
    expect(loaded.brd?.manualEdits).toEqual({});
  });

  it("allows only one requirement state and one BRD per session", async () => {
    const { id } = await createSessionGraph();

    const duplicateState = prisma.requirementState.create({
      data: { sessionId: id, fields: createInitialRequirementFields() },
    });
    await expect(duplicateState).rejects.toSatisfy((error) => knownErrorCode(error) === "P2002");

    const duplicateBrd = prisma.businessRequirementsDocument.create({
      data: { sessionId: id, title: "Second BRD", content: createEmptyBrdContent() },
    });
    await expect(duplicateBrd).rejects.toSatisfy((error) => knownErrorCode(error) === "P2002");
  });

  it("rejects messages for a session that does not exist", async () => {
    const orphan = prisma.message.create({
      data: { sessionId: "does-not-exist", role: "USER", content: "Hello" },
    });
    await expect(orphan).rejects.toSatisfy((error) => knownErrorCode(error) === "P2003");
  });

  it("deletes messages, requirement state and BRD when the session is deleted", async () => {
    const { id } = await createSessionGraph();
    const other = await createSessionGraph();

    await prisma.chatSession.delete({ where: { id } });

    expect(await prisma.message.count({ where: { sessionId: id } })).toBe(0);
    expect(await prisma.requirementState.count({ where: { sessionId: id } })).toBe(0);
    expect(await prisma.businessRequirementsDocument.count({ where: { sessionId: id } })).toBe(0);

    // Unrelated sessions are untouched.
    expect(await prisma.message.count({ where: { sessionId: other.id } })).toBe(2);
    expect(await prisma.requirementState.count({ where: { sessionId: other.id } })).toBe(1);
    expect(await prisma.businessRequirementsDocument.count({ where: { sessionId: other.id } })).toBe(1);
  });

  it("rolls back every record when a transaction fails", async () => {
    const title = `Rollback ${Date.now()}`;
    const transaction = prisma.$transaction(async (tx) => {
      const session = await tx.chatSession.create({
        data: { title, scenario: "GENERIC_ANALYTICS", assistantRole: "BRD_GENERATOR" },
      });
      await tx.message.create({ data: { sessionId: session.id, role: "USER", content: "Hi" } });
      throw new Error("abort");
    });

    await expect(transaction).rejects.toThrow("abort");
    expect(await prisma.chatSession.count({ where: { title } })).toBe(0);
  });

  it("enforces completeness percentages between 0 and 100", async () => {
    const { id } = await createSessionGraph();
    const invalid = prisma.requirementState.update({
      where: { sessionId: id },
      data: { completenessPercentage: 101 },
    });
    await expect(invalid).rejects.toThrow();
  });
});

describe("AppSettings", () => {
  it("is initialized by the migration with defaults", async () => {
    const settings = await prisma.appSettings.findUnique({ where: { id: APP_SETTINGS_ID } });
    expect(settings).not.toBeNull();
    expect(await prisma.appSettings.count()).toBe(1);
  });

  it("ensureAppSettings is idempotent and creates no other records", async () => {
    const sessionsBefore = await prisma.chatSession.count();
    const brdsBefore = await prisma.businessRequirementsDocument.count();

    const first = await ensureAppSettings(prisma);
    const second = await ensureAppSettings(prisma);

    expect(first.id).toBe(APP_SETTINGS_ID);
    expect(second).toEqual(first);
    expect(await prisma.appSettings.count()).toBe(1);
    expect(await prisma.chatSession.count()).toBe(sessionsBefore);
    expect(await prisma.businessRequirementsDocument.count()).toBe(brdsBefore);
  });

  it("recreates the record with defaults if it was removed", async () => {
    const original = await ensureAppSettings(prisma);
    await prisma.appSettings.delete({ where: { id: APP_SETTINGS_ID } });
    try {
      const recreated = await ensureAppSettings(prisma);
      expect(recreated.mockResponseDelayMs).toBe(1500);
      expect(recreated.defaultAssistantRole).toBe("REQUIREMENTS_DISCOVERY");
    } finally {
      await prisma.appSettings.update({
        where: { id: APP_SETTINGS_ID },
        data: {
          mockResponseDelayMs: original.mockResponseDelayMs,
          defaultAssistantRole: original.defaultAssistantRole,
        },
      });
    }
  });

  it("rejects a second settings record", async () => {
    await expect(prisma.appSettings.create({ data: { id: 2 } })).rejects.toThrow();
  });
});
