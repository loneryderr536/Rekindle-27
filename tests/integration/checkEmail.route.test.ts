import { afterEach, beforeEach, expect, test } from "vitest";
import { POST } from "@/app/api/auth/check-email/route";
import { setMailResolverForTests } from "@/server/guestAuth/checkEmail";

beforeEach(() => {
  setMailResolverForTests({
    resolveMx: async () => [{ exchange: "mx.example.com", priority: 10 }],
    resolve4: async () => [],
  });
});
afterEach(() => setMailResolverForTests(null));

function call(body: unknown, headers: Record<string, string> = {}, raw?: string) {
  return POST(
    new Request("http://localhost/api/auth/check-email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: process.env.APP_URL!,
        "x-forwarded-for": "9.9.9.9",
        ...headers,
      },
      body: raw ?? JSON.stringify(body),
    }),
  );
}

test("wrong Origin is refused with 403", async () => {
  const res = await call({ email: "a@example.com" }, { origin: "https://evil.example" });
  expect(res.status).toBe(403);
});

test("valid body returns the EmailCheck", async () => {
  const res = await call({ email: " Asha@Example.com " });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, email: "asha@example.com" });
});

test("ignoreTypo: true skips the typo check", async () => {
  expect(await (await call({ email: "asha@gmial.com" })).json()).toMatchObject({ ok: false, reason: "typo" });
  const res = await call({ email: "asha@gmial.com", ignoreTypo: true });
  expect(await res.json()).toEqual({ ok: true, email: "asha@gmial.com" });
});

test("non-boolean ignoreTypo is a 400", async () => {
  expect((await call({ email: "a@example.com", ignoreTypo: "yes" })).status).toBe(400);
});

test("bad JSON is a 400", async () => {
  const res = await call(null, {}, "{nope");
  expect(res.status).toBe(400);
});

test("missing email is a 400", async () => {
  const res = await call({});
  expect(res.status).toBe(400);
});

test("21st call from one IP is 429 with Retry-After", async () => {
  for (let i = 0; i < 20; i++) expect((await call({ email: "a@example.com" })).status).toBe(200);
  const res = await call({ email: "a@example.com" });
  expect(res.status).toBe(429);
  expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
});
