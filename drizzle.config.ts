import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// DATABASE_URL already in the environment wins (dotenv does not override).
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
