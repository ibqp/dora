/** HTTP helpers shared by route handlers: body parsing, validation and consistent JSON errors. */
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import type { ApiErrorCode, ApiErrorIssue, ApiErrorResponse } from "@/lib/api/types";
import { isDatabaseUnavailableError } from "@/server/db/errors";
import {
  DatabaseConfigurationError,
  IdempotencyConflictError,
  IncompleteRequirementsError,
  NotFoundError,
  SessionBusyError,
} from "@/server/errors";

/** A request-level error with a fixed HTTP status. */
export class ApiError extends Error {
  override readonly name = "ApiError";
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly issues?: ApiErrorIssue[],
  ) {
    super(message);
  }
}

export function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  issues?: ApiErrorIssue[],
): Response {
  const body: ApiErrorResponse = { error: { code, message, ...(issues ? { issues } : {}) } };
  return Response.json(body, { status });
}

function toIssues(error: z.ZodError): ApiErrorIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

/** Maps any thrown value to a JSON error response. Unexpected errors are logged, never leaked. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return errorResponse(error.status, error.code, error.message, error.issues);
  }
  if (error instanceof z.ZodError) {
    return errorResponse(400, "VALIDATION_ERROR", "The request is invalid", toIssues(error));
  }
  if (error instanceof NotFoundError) {
    return errorResponse(404, "NOT_FOUND", error.message);
  }
  if (error instanceof IdempotencyConflictError) {
    return errorResponse(409, "IDEMPOTENCY_CONFLICT", error.message);
  }
  if (error instanceof IncompleteRequirementsError) {
    return errorResponse(
      409,
      "INCOMPLETE_REQUIREMENTS",
      error.message,
      error.missing.map((field) => ({ path: field.key, message: `${field.label} is not specified` })),
    );
  }
  if (error instanceof SessionBusyError) {
    return errorResponse(409, "SESSION_BUSY", error.message);
  }
  if (error instanceof DatabaseConfigurationError || isDatabaseUnavailableError(error)) {
    console.error("[api] database unavailable:", error);
    return errorResponse(503, "DATABASE_UNAVAILABLE", "The database is currently unavailable. Please try again.");
  }
  console.error("[api] unexpected error:", error);
  return errorResponse(500, "INTERNAL_ERROR", "An unexpected error occurred");
}

/** Wraps a route handler so that every thrown error becomes a consistent JSON response. */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      // Let Next.js control-flow errors (e.g. from connection() during prerendering) propagate.
      unstable_rethrow(error);
      return toErrorResponse(error);
    }
  };
}

/** Reads a JSON request body and validates it; throws ApiError / ZodError on failure. */
export async function parseJsonBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.output<Schema>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request body is not valid JSON");
  }
  return schema.parse(body);
}

/** Validates a route parameter; throws a 400 ApiError naming the parameter on failure. */
export function parseRouteParam<Schema extends z.ZodType>(
  name: string,
  value: unknown,
  schema: Schema,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, "VALIDATION_ERROR", `Invalid route parameter: ${name}`, [
      { path: name, message: result.error.issues[0]?.message ?? "Invalid value" },
    ]);
  }
  return result.data;
}
