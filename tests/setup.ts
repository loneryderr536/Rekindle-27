import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeEach } from "vitest";

config({ path: path.resolve(import.meta.dirname, "../.env.test"), override: true, quiet: true });

beforeEach(async () => {
  const { resetDb } = await import("./helpers/db");
  await resetDb();
});

afterAll(async () => {
  const { closeDb } = await import("@/db/client");
  await closeDb();
});
