import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { GUEST_AUTH: "fake", SESSION_SECRET: "s".repeat(40) } }));
let impl: () => Promise<unknown> = async () => ({ get: () => undefined });
let calls = 0;
vi.mock("next/headers", () => ({
  cookies: () => {
    calls++;
    return impl();
  },
}));

import { getGuest, setGuestForTests } from "@/server/guestAuth/getGuest";

const guest = { userId: "u1", email: "asha@example.com", name: null };

beforeEach(() => {
  calls = 0;
  impl = async () => ({ get: () => undefined });
});
afterEach(() => {
  setGuestForTests(null);
  vi.restoreAllMocks();
});

test("the override path returns the override, even null", async () => {
  setGuestForTests({ guest });
  expect(await getGuest()).toEqual(guest);
  setGuestForTests({ guest: null });
  expect(await getGuest()).toBeNull();
  expect(calls).toBe(0);
});

test("setGuestForTests(null) removes the override", async () => {
  setGuestForTests({ guest });
  setGuestForTests(null);
  expect(await getGuest()).toBeNull();
  expect(calls).toBe(1);
});

test("an error inside the lookup returns null and logs", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  impl = async () => {
    throw new Error("boom");
  };
  expect(await getGuest()).toBeNull();
  expect(log).toHaveBeenCalledWith("getGuest failed", expect.any(Error));
});

test("Next redirect and dynamic-usage errors are rethrown, not swallowed", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const redirectErr = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/x;307;" });
  impl = async () => {
    throw redirectErr;
  };
  await expect(getGuest()).rejects.toBe(redirectErr);

  const dynErr = Object.assign(new Error("Dynamic server usage"), { digest: "DYNAMIC_SERVER_USAGE" });
  impl = async () => {
    throw dynErr;
  };
  await expect(getGuest()).rejects.toBe(dynErr);
  expect(log).not.toHaveBeenCalled();
});
