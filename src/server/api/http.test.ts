import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { DatabaseConfigurationError, IdempotencyConflictError, NotFoundError } from "@/server/errors";

import { parseJsonBody, toErrorResponse, withErrorHandling } from "./http";

function jsonRequest(body: string, contentType = "application/json") {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

describe("toErrorResponse", () => {
  it.each([
    [new NotFoundError("Session"), 404, "NOT_FOUND"],
    [new IdempotencyConflictError(), 409, "IDEMPOTENCY_CONFLICT"],
    [new DatabaseConfigurationError("missing"), 503, "DATABASE_UNAVAILABLE"],
    [new Prisma.PrismaClientKnownRequestError("down", { code: "P1001", clientVersion: "7" }), 503, "DATABASE_UNAVAILABLE"],
    // Shape produced by @prisma/adapter-pg when PostgreSQL refuses the connection.
    [new Prisma.PrismaClientKnownRequestError("down", { code: "ECONNREFUSED", clientVersion: "7" }), 503, "DATABASE_UNAVAILABLE"],
    [new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "7" }), 500, "INTERNAL_ERROR"],
    [new Error("boom"), 500, "INTERNAL_ERROR"],
  ])("maps %s to %i", async (error, status, code) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = toErrorResponse(error);
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });

  it("returns validation issues for Zod errors", async () => {
    const result = z.object({ title: z.string() }).safeParse({ title: 1 });
    const response = toErrorResponse(result.error);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.issues).toEqual([{ path: "title", message: expect.any(String) }]);
  });

  it("does not leak messages of unexpected errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const body = await toErrorResponse(new Error("secret connection string")).json();
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});

describe("parseJsonBody", () => {
  const schema = z.object({ title: z.string() });

  it("parses and validates JSON", async () => {
    await expect(parseJsonBody(jsonRequest('{"title":"x"}'), schema)).resolves.toEqual({ title: "x" });
  });

  it("rejects non-JSON content types with 415", async () => {
    const handler = withErrorHandling(() => parseJsonBody(jsonRequest("title=x", "text/plain"), schema).then(() => new Response()));
    expect((await handler()).status).toBe(415);
  });

  it("rejects malformed JSON with 400 INVALID_JSON", async () => {
    const handler = withErrorHandling(() => parseJsonBody(jsonRequest("{"), schema).then(() => new Response()));
    const response = await handler();
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_JSON");
  });
});
