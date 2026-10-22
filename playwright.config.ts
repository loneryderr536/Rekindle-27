import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// The dummy values in .env.test (booking_test database, test keys) win over anything in the shell.
loadEnv({ path: path.resolve(import.meta.dirname, ".env.test"), override: true, quiet: true });

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // One shared database, and tests book specific seats: run them one at a time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build, like launch. NODE_ENV is production here, so the test modes need
    // ALLOW_TEST_MODES=1 (ignored on Vercel) to get past the parseEnv production guard.
    command: "npx next build && npx next start",
    url: BASE_URL,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      ...(process.env as Record<string, string>),
      PORT: String(PORT),
      APP_URL: BASE_URL,
      PAYMENT_GATEWAY: "fake",
      TURNSTILE_SECRET: "test",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "test",
      ALLOW_TEST_MODES: "1",
    },
  },
});
