import { beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({
  delete: vi.fn(),
  getAll: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => store }));
const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/server/guestAuth/supabaseServer", () => ({ createSupabaseServer: async () => ({ auth: { signOut } }) }));

import { POST } from "@/app/api/auth/sign-out/route";

const call = () => POST(new Request("http://localhost/api/auth/sign-out", { method: "POST", headers: { origin: process.env.APP_URL! } }));

beforeEach(() => {
  store.delete.mockReset();
  store.getAll.mockReset().mockReturnValue([{ name: "sb-x-auth-token" }, { name: "sb-x-auth-token.1" }, { name: "other" }]);
  signOut.mockReset();
});

test("a clean sign-out returns ok and deletes only the fake cookie", async () => {
  signOut.mockResolvedValue({ error: null });
  const res = await call();
  expect(res.status).toBe(200);
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(store.delete.mock.calls).toEqual([["guest_fake"]]);
});

test("a global failure falls back to a local sign-out", async () => {
  signOut.mockResolvedValueOnce({ error: new Error("down") }).mockResolvedValueOnce({ error: null });
  const res = await call();
  expect(res.status).toBe(200);
  expect(signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
  expect(store.delete.mock.calls).toEqual([["guest_fake"]]);
});

test("when both fail the sb- cookies are deleted and the route answers 502", async () => {
  signOut.mockResolvedValue({ error: new Error("down") });
  const res = await call();
  expect(res.status).toBe(502);
  const deleted = store.delete.mock.calls.map((c) => c[0]);
  expect(deleted).toEqual(["guest_fake", "sb-x-auth-token", "sb-x-auth-token.1"]);
});
