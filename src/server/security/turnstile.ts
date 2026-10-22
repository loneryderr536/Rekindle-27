import { env } from "@/lib/env";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Verifies a Cloudflare Turnstile token. With TURNSTILE_SECRET=test, only "test-pass" passes (no network). */
export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (env.TURNSTILE_SECRET === "test") return token === "test-pass";
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
