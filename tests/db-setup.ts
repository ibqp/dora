import { afterAll } from "vitest";

import { getPrisma } from "@/server/db/client";

// Route the shared client to the test database (validated in db-global-setup.ts).
process.env["DATABASE_URL"] = process.env["TEST_DATABASE_URL"];

afterAll(async () => {
  await getPrisma().$disconnect();
});
