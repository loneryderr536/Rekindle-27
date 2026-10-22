import { expect, test } from "vitest";
import { rateLimit } from "@/server/security/rateLimit";

const T0 = new Date("2026-01-01T00:00:00Z");

test("rate limit allows N then blocks", async () => {
  for (let i = 0; i < 3; i++) {
    expect((await rateLimit("k", 3, 600, T0)).ok).toBe(true);
  }
  const blocked = await rateLimit("k", 3, 600, new Date(T0.getTime() + 100_000));
  expect(blocked.ok).toBe(false);
  expect(blocked.retryAfter).toBe(500);
});

test("rate limit keys are independent", async () => {
  await rateLimit("a", 1, 600, T0);
  expect((await rateLimit("a", 1, 600, T0)).ok).toBe(false);
  expect((await rateLimit("b", 1, 600, T0)).ok).toBe(true);
});

test("rate limit resets in the next window", async () => {
  await rateLimit("k", 1, 600, T0);
  expect((await rateLimit("k", 1, 600, T0)).ok).toBe(false);
  expect((await rateLimit("k", 1, 600, new Date(T0.getTime() + 600_000))).ok).toBe(true);
});

test("rate limit counts concurrent calls atomically", async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => rateLimit("c", 5, 600, T0)));
  expect(results.filter((r) => r.ok)).toHaveLength(5);
});
