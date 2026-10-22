import { describe, expect, test } from "vitest";
import { loadTestLimitsDisabled, parseEnv } from "@/lib/env";

const fullEnvFixture = {
  DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5433/booking_test",
  RAZORPAY_KEY_ID: "rzp_test_dummy",
  RAZORPAY_KEY_SECRET: "test_key_secret",
  RAZORPAY_WEBHOOK_SECRET: "test_webhook_secret",
  NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_dummy",
  RESEND_API_KEY: "test",
  EMAIL_FROM: "tickets@example.com",
  TURNSTILE_SECRET: "test",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "test",
  CRON_SECRET: "test_cron",
  SESSION_SECRET: "test_session_secret_at_least_32_chars_long",
  APP_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  test("rejects missing secrets", () => {
    expect(() => parseEnv({})).toThrow(/RAZORPAY_KEY_SECRET/);
  });
  test("accepts full env", () => {
    const e = parseEnv(fullEnvFixture);
    expect(e.APP_URL).toBe("http://localhost:3000");
  });
  test("rejects empty values and invalid APP_URL", () => {
    expect(() => parseEnv({ ...fullEnvFixture, CRON_SECRET: "" })).toThrow(/CRON_SECRET/);
    expect(() => parseEnv({ ...fullEnvFixture, APP_URL: "not a url" })).toThrow(/APP_URL/);
  });
});

describe("production guard for test modes", () => {
  const prod = { ...fullEnvFixture, NODE_ENV: "production" };
  test("fake payment gateway is refused in production", () => {
    expect(() => parseEnv({ ...prod, TURNSTILE_SECRET: "real", PAYMENT_GATEWAY: "fake" })).toThrow(/PAYMENT_GATEWAY/);
  });
  test("TURNSTILE_SECRET=test is refused in production", () => {
    expect(() => parseEnv(prod)).toThrow(/TURNSTILE_SECRET/);
  });
  test("real settings pass in production", () => {
    expect(parseEnv({ ...prod, TURNSTILE_SECRET: "real" }).PAYMENT_GATEWAY).toBe("razorpay");
  });
  test("test modes are fine outside production", () => {
    const e = parseEnv({ ...fullEnvFixture, NODE_ENV: "development", PAYMENT_GATEWAY: "fake" });
    expect(e.PAYMENT_GATEWAY).toBe("fake");
  });
  test("ALLOW_TEST_MODES=1 opts in off Vercel", () => {
    const e = parseEnv({ ...prod, PAYMENT_GATEWAY: "fake", ALLOW_TEST_MODES: "1" });
    expect(e.PAYMENT_GATEWAY).toBe("fake");
  });
  test("ALLOW_TEST_MODES=1 is ignored on Vercel", () => {
    expect(() => parseEnv({ ...prod, PAYMENT_GATEWAY: "fake", ALLOW_TEST_MODES: "1", VERCEL: "1" })).toThrow(/PAYMENT_GATEWAY/);
  });
  test("LOAD_TEST_DISABLE_RATE_LIMIT is refused in production without ALLOW_TEST_MODES", () => {
    const real = { ...prod, TURNSTILE_SECRET: "real" };
    expect(() => parseEnv({ ...real, LOAD_TEST_DISABLE_RATE_LIMIT: "1" })).toThrow(/LOAD_TEST_DISABLE_RATE_LIMIT/);
    expect(() => parseEnv({ ...real, LOAD_TEST_DISABLE_RATE_LIMIT: "1", ALLOW_TEST_MODES: "1", VERCEL: "1" })).toThrow(
      /LOAD_TEST_DISABLE_RATE_LIMIT/,
    );
    expect(parseEnv({ ...real, LOAD_TEST_DISABLE_RATE_LIMIT: "1", ALLOW_TEST_MODES: "1" }).LOAD_TEST_DISABLE_RATE_LIMIT).toBe("1");
  });
  test("loadTestLimitsDisabled needs both flags and no Vercel", () => {
    expect(loadTestLimitsDisabled(parseEnv({ ...fullEnvFixture, LOAD_TEST_DISABLE_RATE_LIMIT: "1" }))).toBe(false);
    expect(loadTestLimitsDisabled(parseEnv({ ...fullEnvFixture, ALLOW_TEST_MODES: "1" }))).toBe(false);
    expect(loadTestLimitsDisabled(parseEnv({ ...fullEnvFixture, LOAD_TEST_DISABLE_RATE_LIMIT: "1", ALLOW_TEST_MODES: "1" }))).toBe(true);
    expect(
      loadTestLimitsDisabled(parseEnv({ ...fullEnvFixture, LOAD_TEST_DISABLE_RATE_LIMIT: "1", ALLOW_TEST_MODES: "1", VERCEL: "1" })),
    ).toBe(false);
  });
  test("unknown PAYMENT_GATEWAY value is rejected", () => {
    expect(() => parseEnv({ ...fullEnvFixture, PAYMENT_GATEWAY: "stripe" })).toThrow(/PAYMENT_GATEWAY/);
  });
});

describe("env export", () => {
  test("importing the module does not throw without a full env", async () => {
    await expect(import("@/lib/env")).resolves.toHaveProperty("env");
  });
});
