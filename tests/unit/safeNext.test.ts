import { describe, expect, test } from "vitest";
import { safeNext } from "@/lib/safeNext";

describe("safeNext", () => {
  test.each(["/my-bookings", "/register/seats?x=1"])("keeps same-site path %s", (p) => {
    expect(safeNext(p)).toBe(p);
  });

  test.each(["//evil.com", "/\\evil.com", "https://evil.com", "", null, undefined])(
    "falls back for %j",
    (p) => {
      expect(safeNext(p)).toBe("/my-bookings");
    },
  );
});
