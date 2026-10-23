import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { DatabaseConfigurationError } from "@/server/errors";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new DatabaseConfigurationError("DATABASE_URL is not set. Copy .env.example to .env and configure PostgreSQL.");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Shared Prisma client. Created lazily so that importing this module never requires a database
 * (e.g. during `next build`), and cached on globalThis so dev hot reloads reuse one pool.
 */
export function getPrisma(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

export type { PrismaClient };

/** Either the shared client or an interactive transaction client. */
export type DbClient = PrismaClient | Prisma.TransactionClient;
