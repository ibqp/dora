import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.db.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          // Integration tests against a real PostgreSQL database (TEST_DATABASE_URL).
          name: "db",
          include: ["src/**/*.db.test.ts"],
          environment: "node",
          globalSetup: ["./tests/db-global-setup.ts"],
          setupFiles: ["./tests/db-setup.ts"],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
