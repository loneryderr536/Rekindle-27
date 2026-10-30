import { describe, expect, test } from "vitest";
import type { User } from "@supabase/supabase-js";
import { guestFromUser, type Guest } from "@/server/guestAuth/getGuest";
import { readFakeGuest, signFakeGuest } from "@/server/guestAuth/fakeGuest";

const user = (over: Record<string, unknown>) => ({ id: "u1", ...over }) as unknown as User;

describe("guestFromUser", () => {
  test("null user gives null", () => {
    expect(guestFromUser(null)).toBeNull();
  });

  test("unconfirmed email gives null", () => {
    expect(guestFromUser(user({ email: "a@b.com" }))).toBeNull();
  });

  test("normalises email and reads the name", () => {
    const g = guestFromUser(
      user({
        id: "u-123",
        email: " Asha@Example.COM ",
        email_confirmed_at: "2026-10-30T00:00:00Z",
        user_metadata: { full_name: "Asha Rao" },
      }),
    );
    expect(g).toEqual({ userId: "u-123", email: "asha@example.com", name: "Asha Rao" });
  });

  test("falls back to metadata name, then null", () => {
    const base = { id: "u2", email: "a@b.com", email_confirmed_at: "x" };
    expect(guestFromUser(user({ ...base, user_metadata: { name: "N" } }))?.name).toBe("N");
    expect(guestFromUser(user(base))?.name).toBeNull();
  });
});

describe("fake guest cookie", () => {
  const g: Guest = { userId: "fake-1", email: "asha@example.com", name: "Asha Rao" };

  test("round-trips", () => {
    expect(readFakeGuest(signFakeGuest(g))).toEqual(g);
  });

  test("rejects tampered payload, tampered signature and undefined", () => {
    const [payload, sig] = signFakeGuest(g).split(".");
    const forged = Buffer.from(JSON.stringify({ ...g, email: "x@evil.com" })).toString("base64url");
    expect(readFakeGuest(`${forged}.${sig}`)).toBeNull();
    expect(readFakeGuest(`${payload}.${sig.slice(0, -2)}AA`)).toBeNull();
    expect(readFakeGuest(`${payload}.`)).toBeNull();
    expect(readFakeGuest("nodot")).toBeNull();
    expect(readFakeGuest(undefined)).toBeNull();
  });
});
