import { describe, expect, it } from "vitest";

import {
  createChatRequestSchema,
  MAX_MESSAGE_LENGTH,
  sessionIdSchema,
  updateChatRequestSchema,
} from "./chat-schemas";

const clientRequestId = "4f0c2a8e-3a4b-4d0e-9a7c-1b2c3d4e5f60";

describe("createChatRequestSchema", () => {
  it("accepts a message with a UUID idempotency key and trims the content", () => {
    expect(createChatRequestSchema.parse({ content: "  Churn dashboard  ", clientRequestId })).toEqual({
      content: "Churn dashboard",
      clientRequestId,
    });
  });

  it("accepts an optional assistant role", () => {
    const parsed = createChatRequestSchema.parse({
      content: "Hi",
      clientRequestId,
      assistantRole: "XY_PROBLEM_DIAGNOSTIC",
    });
    expect(parsed.assistantRole).toBe("XY_PROBLEM_DIAGNOSTIC");
  });

  it.each([
    ["empty content", { content: "   ", clientRequestId }],
    ["too long content", { content: "a".repeat(MAX_MESSAGE_LENGTH + 1), clientRequestId }],
    ["missing key", { content: "Hi" }],
    ["non-UUID key", { content: "Hi", clientRequestId: "abc" }],
    ["unknown role", { content: "Hi", clientRequestId, assistantRole: "ORACLE" }],
    ["unknown field", { content: "Hi", clientRequestId, scenario: "CUSTOMER_CHURN" }],
  ])("rejects %s", (_label, body) => {
    expect(createChatRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("updateChatRequestSchema", () => {
  it("normalizes whitespace in titles", () => {
    expect(updateChatRequestSchema.parse({ title: "  Churn \n analysis  " })).toEqual({ title: "Churn analysis" });
  });

  it("rejects blank, overly long and missing titles", () => {
    expect(updateChatRequestSchema.safeParse({ title: "  " }).success).toBe(false);
    expect(updateChatRequestSchema.safeParse({ title: "a".repeat(121) }).success).toBe(false);
    expect(updateChatRequestSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a role change, alone or with a title, and rejects unknown roles", () => {
    expect(updateChatRequestSchema.parse({ assistantRole: "DATA_REQUIREMENTS_ANALYST" })).toEqual({
      assistantRole: "DATA_REQUIREMENTS_ANALYST",
    });
    expect(updateChatRequestSchema.safeParse({ title: "Churn", assistantRole: "BRD_GENERATOR" }).success).toBe(true);
    expect(updateChatRequestSchema.safeParse({ assistantRole: "ORACLE" }).success).toBe(false);
    expect(updateChatRequestSchema.safeParse({ assistantRole: null }).success).toBe(false);
  });
});

describe("sessionIdSchema", () => {
  it("accepts cuids and rejects other values", () => {
    expect(sessionIdSchema.safeParse("cmh3x8k2f0000abcd1234efgh").success).toBe(true);
    expect(sessionIdSchema.safeParse("not a cuid!").success).toBe(false);
    expect(sessionIdSchema.safeParse("").success).toBe(false);
  });
});
