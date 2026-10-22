import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adminSessions, adminUsers } from "@/db/schema";
import { randomToken } from "@/lib/random";

export const SESSION_COOKIE = "admin_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export type AdminRole = "admin" | "scanner";
export type SessionInfo = { adminUserId: string; role: AdminRole; email: string };

/** The DB stores only this hash, so a leaked table cannot be replayed as a cookie. */
function sessionId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Returns the raw token for the cookie; the row id is sha256(token). */
export async function createSession(adminUserId: string): Promise<string> {
  const token = randomToken();
  await db.insert(adminSessions).values({
    id: sessionId(token),
    adminUserId,
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
  });
  return token;
}

export async function getSession(token: string): Promise<SessionInfo | null> {
  if (!token) return null;
  const id = sessionId(token);
  const [row] = await db
    .select({
      adminUserId: adminSessions.adminUserId,
      expiresAt: adminSessions.expiresAt,
      role: adminUsers.role,
      email: adminUsers.email,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminUserId))
    .where(eq(adminSessions.id, id));
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(adminSessions).where(eq(adminSessions.id, id));
    return null;
  }
  return { adminUserId: row.adminUserId, role: row.role, email: row.email };
}

export async function destroySession(token: string): Promise<void> {
  if (!token) return;
  await db.delete(adminSessions).where(eq(adminSessions.id, sessionId(token)));
}

/** Reads one cookie value out of a raw `Cookie` header. */
export function readCookie(header: string | null, name: string): string {
  if (!header) return "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

function cookieAttrs(maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}${cookieAttrs(SESSION_TTL_SECONDS)}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=${cookieAttrs(0)}`;
}
