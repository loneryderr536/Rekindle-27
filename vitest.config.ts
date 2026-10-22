import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Integration tests share one Postgres database, so files run serially.
    fileParallelism: false,
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
