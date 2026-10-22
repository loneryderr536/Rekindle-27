import { expect, test } from "vitest";
import { checkoutTimeoutSeconds, clockOffsetMs, remainingMs } from "@/lib/countdown";

test("remainingMs corrects the client clock by the server offset", () => {
  const expires = "2026-10-22T10:10:00.000Z";
  const client = Date.parse("2026-10-22T10:05:00.000Z");
  expect(remainingMs(expires, client, 0)).toBe(300_000);
  // Client clock 2 minutes slow: the server is 120 s ahead, so less time is left.
  expect(remainingMs(expires, client, 120_000)).toBe(180_000);
  expect(remainingMs(expires, client, 400_000)).toBe(-100_000);
});

test("clockOffsetMs is serverNow minus clientNow from a Date header, 0 when missing or unparsable", () => {
  const client = Date.parse("2026-10-22T10:00:00.000Z");
  expect(clockOffsetMs("Thu, 22 Oct 2026 10:02:00 GMT", client)).toBe(120_000);
  expect(clockOffsetMs("Thu, 22 Oct 2026 09:59:30 GMT", client)).toBe(-30_000);
  expect(clockOffsetMs(null, client)).toBe(0);
  expect(clockOffsetMs("not a date", client)).toBe(0);
});

test("checkoutTimeoutSeconds caps at 480 s and keeps a 30 s margin before the hold ends", () => {
  expect(checkoutTimeoutSeconds(600_000)).toBe(480);
  expect(checkoutTimeoutSeconds(510_000)).toBe(480);
  expect(checkoutTimeoutSeconds(509_000)).toBe(479);
  expect(checkoutTimeoutSeconds(300_500)).toBe(270);
  expect(checkoutTimeoutSeconds(31_000)).toBe(1);
  expect(checkoutTimeoutSeconds(30_999)).toBeNull();
  expect(checkoutTimeoutSeconds(30_000)).toBeNull();
  expect(checkoutTimeoutSeconds(0)).toBeNull();
  expect(checkoutTimeoutSeconds(-1)).toBeNull();
});
