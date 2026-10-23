import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// The Prisma CLI does not load .env itself. Locally we load it with Node's built-in loader;
// on Railway DATABASE_URL is injected into the environment and no .env file exists.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Read directly (not via env()) so `prisma generate` works without a database configured.
    url: process.env["DATABASE_URL"],
  },
});
