import type { User } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { env } from "@/lib/env";
import { FAKE_GUEST_COOKIE, readFakeGuest } from "./fakeGuest";
import { createSupabaseServer } from "./supabaseServer";

export type Guest = { userId: string; email: string; name: string | null };

/** A confirmed Supabase user as a Guest; the email is trimmed and lower-cased. */
export function guestFromUser(user: User | null): Guest | null {
  if (!user || !user.email || !user.email_confirmed_at) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = [meta.full_name, meta.name].find((n): n is string => typeof n === "string" && n !== "") ?? null;
  return { userId: user.id, email: user.email.trim().toLowerCase(), name };
}

let override: { guest: Guest | null } | null = null;

/** Test seam: `{ guest }` forces getGuest()'s result (even `null`); `null` removes the override. */
export function setGuestForTests(o: { guest: Guest | null } | null): void {
  override = o;
}

/** The signed-in guest for this request, or null. The only source of guest identity. */
export async function getGuest(): Promise<Guest | null> {
  if (override) return override.guest;
  try {
    if (env.GUEST_AUTH === "fake") {
      return readFakeGuest((await cookies()).get(FAKE_GUEST_COOKIE)?.value);
    }
    // proxy.ts already verified the session for every route that reaches this function; reuse that
    // result via request headers instead of paying a second supabase.auth.getUser() network round trip.
    const h = await headers();
    const userId = h.get("x-guest-user-id");
    const userEmail = h.get("x-guest-user-email");
    if (userId && userEmail) {
      const nameHeader = h.get("x-guest-user-name");
      return { userId, email: userEmail, name: nameHeader ? decodeURIComponent(nameHeader) : null };
    }
    const supabase = await createSupabaseServer();
    return guestFromUser((await supabase.auth.getUser()).data.user);
  } catch (e) {
    unstable_rethrow(e);
    console.error("getGuest failed", e);
    return null;
  }
}
