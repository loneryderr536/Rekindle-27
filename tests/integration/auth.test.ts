import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { db } from "@/db/client";
import { adminSessions, adminUsers } from "@/db/schema";
import { AppError } from "@/lib/errors";
import * as password from "@/server/auth/password";
import { requireRole } from "@/server/auth/guard";
import { createSession, getSession } from "@/server/auth/session";
import { POST as login } from "@/app/api/admin/login/route";
import { POST as logout } from "@/app/api/admin/logout/route";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "correct horse battery";

async function seedUser(email = "boss@example.com", role: "admin" | "scanner" = "admin") {
  const [u] = await db
    .insert(adminUsers)
    .values({ email, role, passwordHash: await password.hashPassword(PASSWORD) })
    .returning();
  return u;
}

function loginReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "1.2.3.4", ...headers },
    body: JSON.stringify(body),
  });
}

function cookieValue(res: Response): string {
  const set = res.headers.get("set-cookie") ?? "";
  return /admin_session=([^;]*)/.exec(set)?.[1] ?? "";
}

function authed(token: string, method = "GET", headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/admin/thing`, {
    method,
    headers: { cookie: `admin_session=${token}`, ...headers },
  });
}

async function codeOf(p: Promise<unknown>): Promise<{ code: string; status: number } | null> {
  try {
    await p;
    return null;
  } catch (e) {
    if (e instanceof AppError) return { code: e.code, status: e.status };
    throw e;
  }
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

test("login with correct password sets cookie", async () => {
  await seedUser();
  const res = await login(loginReq({ email: "  Boss@Example.com ", password: PASSWORD }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ role: "admin" });
  const set = res.headers.get("set-cookie") ?? "";
  expect(set).toMatch(/admin_session=[^;]+/);
  expect(set).toMatch(/HttpOnly/i);
  expect(set).toMatch(/SameSite=lax/i);
  expect(set).toMatch(/Path=\//);
  expect(set).toMatch(/Max-Age=43200/);
  expect(set).not.toMatch(/Secure/i); // NODE_ENV is "test"
});

test("session row stores a hash, not the raw cookie token", async () => {
  await seedUser();
  const res = await login(loginReq({ email: "boss@example.com", password: PASSWORD }));
  const token = cookieValue(res);
  const rows = await db.select().from(adminSessions);
  expect(rows).toHaveLength(1);
  expect(rows[0].id).not.toBe(token);
  expect(rows[0].id).toMatch(/^[0-9a-f]{64}$/);
  const ms = rows[0].expiresAt.getTime() - Date.now();
  expect(ms).toBeGreaterThan(11.9 * 3600_000);
  expect(ms).toBeLessThanOrEqual(12 * 3600_000);
  expect(await getSession(token)).toMatchObject({ role: "admin", email: "boss@example.com" });
});

test("wrong password → 401, generic message", async () => {
  await seedUser();
  const res = await login(loginReq({ email: "boss@example.com", password: "nope nope nope" }));
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
  expect(res.headers.get("set-cookie")).toBeNull();
});

test("unknown email takes the same path and returns the same 401", async () => {
  await seedUser();
  const spy = vi.spyOn(password, "verifyPassword");
  const res = await login(loginReq({ email: "ghost@example.com", password: PASSWORD }));
  expect(spy).toHaveBeenCalledTimes(1);
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
});

test("login from another site or without Origin → 403 BAD_ORIGIN", async () => {
  await db.insert(adminUsers).values({ email: "a@example.com", role: "admin", passwordHash: await password.hashPassword("pw") });
  for (const origin of ["https://evil.example", ""]) {
    const req = new Request(`${ORIGIN}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
      body: JSON.stringify({ email: "a@example.com", password: "pw" }),
    });
    const res = await login(req);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("BAD_ORIGIN");
    expect(res.headers.get("set-cookie")).toBeNull();
  }
});

test("invalid body → 400", async () => {
  const res = await login(loginReq({ email: "x" }));
  expect(res.status).toBe(400);
});

test("6th attempt → 429", async () => {
  await seedUser();
  for (let i = 0; i < 5; i++) {
    const r = await login(loginReq({ email: "boss@example.com", password: "wrong wrong wrong" }));
    expect(r.status).toBe(401);
  }
  // even the correct password is refused once the limit is hit
  const res = await login(loginReq({ email: "boss@example.com", password: PASSWORD }));
  expect(res.status).toBe(429);
  expect((await res.json()).error.code).toBe("RATE_LIMITED");
});

test("per-IP limit applies across emails", async () => {
  for (let i = 0; i < 20; i++) {
    const r = await login(loginReq({ email: `u${i}@example.com`, password: "whatever whatever" }));
    expect(r.status).toBe(401);
  }
  const res = await login(loginReq({ email: "u99@example.com", password: "whatever whatever" }));
  expect(res.status).toBe(429);
});

test("scanner calling admin API → 403", async () => {
  const u = await seedUser("scan@example.com", "scanner");
  const token = await createSession(u.id);
  expect(await codeOf(requireRole(authed(token), ["admin"]))).toEqual({ code: "FORBIDDEN", status: 403 });
  expect(await requireRole(authed(token), ["admin", "scanner"])).toEqual({
    adminUserId: u.id,
    role: "scanner",
    email: "scan@example.com",
  });
});

test("no cookie or garbage cookie → 401", async () => {
  expect(await codeOf(requireRole(new Request(`${ORIGIN}/x`), ["admin"]))).toEqual({ code: "UNAUTHORIZED", status: 401 });
  expect(await codeOf(requireRole(authed("garbage"), ["admin"]))).toEqual({ code: "UNAUTHORIZED", status: 401 });
});

test("expired session → 401 and the row is deleted", async () => {
  const u = await seedUser();
  const token = await createSession(u.id);
  await db.update(adminSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(adminSessions.adminUserId, u.id));
  expect(await codeOf(requireRole(authed(token), ["admin"]))).toEqual({ code: "UNAUTHORIZED", status: 401 });
  expect(await db.select().from(adminSessions)).toHaveLength(0);
});

test("cross-origin POST → 403, missing Origin → 403, same origin OK", async () => {
  const u = await seedUser();
  const token = await createSession(u.id);
  expect(await codeOf(requireRole(authed(token, "POST", { origin: "https://evil.example" }), ["admin"]))).toEqual({
    code: "BAD_ORIGIN",
    status: 403,
  });
  expect(await codeOf(requireRole(authed(token, "POST"), ["admin"]))).toEqual({ code: "BAD_ORIGIN", status: 403 });
  expect((await requireRole(authed(token, "POST", { origin: ORIGIN }), ["admin"])).adminUserId).toBe(u.id);
  // GET needs no Origin
  expect((await requireRole(authed(token), ["admin"])).adminUserId).toBe(u.id);
});

test("origin is checked before the session lookup", async () => {
  expect(await codeOf(requireRole(authed("garbage", "POST", { origin: "https://evil.example" }), ["admin"]))).toEqual({
    code: "BAD_ORIGIN",
    status: 403,
  });
});

test("logout clears the cookie and the session row", async () => {
  const u = await seedUser();
  const token = await createSession(u.id);
  const res = await logout(authed(token, "POST", { origin: ORIGIN }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(res.headers.get("set-cookie")).toMatch(/admin_session=;.*Max-Age=0/i);
  expect(await db.select().from(adminSessions)).toHaveLength(0);
  expect(await getSession(token)).toBeNull();
});

test("logout without Origin → 403 and the session survives", async () => {
  const u = await seedUser();
  const token = await createSession(u.id);
  const res = await logout(authed(token, "POST"));
  expect(res.status).toBe(403);
  expect(await db.select().from(adminSessions)).toHaveLength(1);
});
