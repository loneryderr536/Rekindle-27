import { z } from "zod";

const secret = z.string().min(1);

const envSchema = z.object({
  DATABASE_URL: secret,
  RAZORPAY_KEY_ID: secret,
  RAZORPAY_KEY_SECRET: secret,
  RAZORPAY_WEBHOOK_SECRET: secret,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: secret,
  RESEND_API_KEY: secret,
  EMAIL_FROM: secret,
  TURNSTILE_SECRET: secret,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: secret,
  CRON_SECRET: secret,
  SESSION_SECRET: secret,
  APP_URL: z.string().url(),
  /** `razorpay` (default) or `fake` (E2E only: in-memory gateway, see src/server/payments/fakeGateway.ts). */
  PAYMENT_GATEWAY: z.enum(["razorpay", "fake"]).default("razorpay"),
  /** Escape hatch so E2E can run `next start` (NODE_ENV=production) with test modes. Ignored on Vercel. */
  ALLOW_TEST_MODES: z.string().optional(),
  /** Staging load runs only: "1" turns off the per-IP hold limits. Needs ALLOW_TEST_MODES=1 as well; refused in production otherwise. */
  LOAD_TEST_DISABLE_RATE_LIMIT: z.string().optional(),
  NODE_ENV: z.string().optional(),
  VERCEL: z.string().optional(),
}).superRefine((e, ctx) => {
  if (e.NODE_ENV !== "production") return;
  // Test modes in production would let anyone skip real payment or the bot check.
  const testModesAllowed = e.ALLOW_TEST_MODES === "1" && !e.VERCEL;
  const hint = "is not allowed when NODE_ENV=production";
  if (e.LOAD_TEST_DISABLE_RATE_LIMIT === "1" && !testModesAllowed) {
    ctx.addIssue({
      code: "custom",
      path: ["LOAD_TEST_DISABLE_RATE_LIMIT"],
      message: `LOAD_TEST_DISABLE_RATE_LIMIT=1 ${hint} without ALLOW_TEST_MODES=1 (and never on Vercel)`,
    });
  }
  if (testModesAllowed) return;
  if (e.PAYMENT_GATEWAY === "fake") {
    ctx.addIssue({ code: "custom", path: ["PAYMENT_GATEWAY"], message: `PAYMENT_GATEWAY=fake ${hint}` });
  }
  if (e.TURNSTILE_SECRET === "test") {
    ctx.addIssue({ code: "custom", path: ["TURNSTILE_SECRET"], message: `TURNSTILE_SECRET=test ${hint}` });
  }
});

export type Env = z.infer<typeof envSchema>;

/** Validates a source (usually process.env). Throws ZodError naming each bad key. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}

/** True only for a staging load run: the flag AND ALLOW_TEST_MODES=1, never on Vercel. */
export function loadTestLimitsDisabled(e: Env): boolean {
  return e.LOAD_TEST_DISABLE_RATE_LIMIT === "1" && e.ALLOW_TEST_MODES === "1" && !e.VERCEL;
}

let cached: Env | undefined;

/** Test hook: forget the parsed env so the next read re-parses process.env. */
export function resetEnvForTests(): void {
  cached = undefined;
}

function getEnv(): Env {
  return (cached ??= parseEnv(process.env));
}

/** Lazily parsed process.env: nothing is validated until a key is read. */
export const env: Env = new Proxy({} as Env, {
  get: (_t, key) => getEnv()[key as keyof Env],
  has: (_t, key) => key in getEnv(),
  ownKeys: () => Reflect.ownKeys(getEnv()),
  getOwnPropertyDescriptor: (_t, key) => Reflect.getOwnPropertyDescriptor(getEnv(), key),
});
