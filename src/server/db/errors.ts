import { Prisma } from "@/generated/prisma/client";

/** Prisma error codes used by the services (https://pris.ly/d/prisma-error-codes). */
export const PrismaErrorCode = {
  UniqueConstraintViolation: "P2002",
  ForeignKeyViolation: "P2003",
  RecordNotFound: "P2025",
} as const;

export function hasPrismaErrorCode(
  error: unknown,
  code: (typeof PrismaErrorCode)[keyof typeof PrismaErrorCode],
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

const NETWORK_ERROR_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN"]);

/** True for errors meaning the database cannot be reached or is not configured correctly. */
export function isDatabaseUnavailableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (!(error instanceof Error)) return false;
  // With the pg driver adapter, connection failures surface as PrismaClientKnownRequestError
  // carrying the socket error code (e.g. ECONNREFUSED); P1xxx are Prisma's connection errors.
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === "string" && (code.startsWith("P1") || NETWORK_ERROR_CODES.has(code));
}
