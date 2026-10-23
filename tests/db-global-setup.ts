import { execFileSync } from "node:child_process";

/** Applies all migrations to the test database before the db test project runs. */
export default function setup(): void {
  const url = process.env["TEST_DATABASE_URL"];
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Point it at a dedicated PostgreSQL database (see .env.example).",
    );
  }
  if (url === process.env["DATABASE_URL"]) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL to protect development data.");
  }
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
