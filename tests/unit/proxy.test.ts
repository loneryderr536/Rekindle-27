import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { GUEST_AUTH: "supabase", NEXT_PUBLIC_SUPABASE_URL: "http://sb.test", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k", SESSION_SECRET: "s".repeat(40) },
}));

const getUser = vi.fn();
const createServerClient = vi.fn();
vi.mock("@supabase/ssr", () => ({ createServerClient: (...a: unknown[]) => createServerClient(...a) }));

import { proxy } from "@/proxy";

const HEADERS = { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0", Expires: "0", Pragma: "no-cache" };

beforeEach(() => {
  getUser.mockReset();
  createServerClient.mockReset();
  createServerClient.mockImplementation((_u: string, _k: string, opts: { cookies: { setAll: (l: unknown[], h: Record<string, string>) => void } }) => ({
    auth: {
      getUser: async () => {
        opts.cookies.setAll([{ name: "sb-x-auth-token", value: "v", options: {} }], HEADERS);
        return getUser();
      },
    },
  }));
});

const req = (path: string) => new NextRequest(`http://localhost${path}`);

test("redirect to sign-in keeps refreshed cookie and no-store headers", async () => {
  getUser.mockResolvedValue({ data: { user: null } });
  const res = await proxy(req("/my-bookings"));
  const loc = new URL(res.headers.get("location")!);
  expect(loc.pathname + loc.search).toBe("/sign-in?next=%2Fmy-bookings");
  expect(res.cookies.get("sb-x-auth-token")?.value).toBe("v");
  expect(res.headers.get("cache-control")).toContain("no-store");
  expect(res.headers.get("pragma")).toBe("no-cache");
});

test("signed-in /register passes through with the headers", async () => {
  getUser.mockResolvedValue({ data: { user: { id: "u", email: "a@example.com", email_confirmed_at: "2026-01-01" } } });
  const res = await proxy(req("/register"));
  expect(res.headers.get("location")).toBeNull();
  expect(res.cookies.get("sb-x-auth-token")?.value).toBe("v");
  expect(res.headers.get("cache-control")).toContain("no-store");
});

test("getUser throwing counts as signed out without crashing", async () => {
  getUser.mockRejectedValue(new Error("unreachable"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const res = await proxy(req("/register/seats"));
  expect(new URL(res.headers.get("location")!).pathname).toBe("/register");
});

test("admin without a session redirects to login and skips Supabase", async () => {
  const res = await proxy(req("/admin/x"));
  expect(new URL(res.headers.get("location")!).pathname).toBe("/admin/login");
  expect(createServerClient).not.toHaveBeenCalled();
});
