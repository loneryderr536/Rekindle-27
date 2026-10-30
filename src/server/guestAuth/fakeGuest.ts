import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import type { Guest } from "./getGuest";

/** Cookie set by the fake sign-in used when GUEST_AUTH=fake (E2E only). */
export const FAKE_GUEST_COOKIE = "guest_fake";

function sign(payload: string): Buffer {
  return createHmac("sha256", env.SESSION_SECRET).update(payload).digest();
}

/** `base64url(JSON) + "." + base64url(HMAC-SHA256(SESSION_SECRET))`. */
export function signFakeGuest(g: Guest): string {
  const payload = Buffer.from(JSON.stringify(g)).toString("base64url");
  return `${payload}.${sign(payload).toString("base64url")}`;
}

export function readFakeGuest(v: string | undefined): Guest | null {
  if (!v) return null;
  const parts = v.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const given = Buffer.from(sig, "base64url");
  const expected = sign(payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const g = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<Guest>;
    if (typeof g.userId !== "string" || typeof g.email !== "string") return null;
    return { userId: g.userId, email: g.email, name: typeof g.name === "string" ? g.name : null };
  } catch {
    return null;
  }
}
