import { expect, test } from "vitest";
import { z } from "zod";
import { AppError, jsonError } from "@/lib/errors";

test("AppError defaults status to 400 and has no details", () => {
  const e = new AppError("X", "msg");
  expect(e.status).toBe(400);
  expect(e.details).toBeUndefined();
});

test("jsonError serialises code and message without details", async () => {
  const res = jsonError(new AppError("SEATS_TAKEN", "taken", 409));
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: { code: "SEATS_TAKEN", message: "taken" } });
});

test("jsonError includes details when present", async () => {
  const res = jsonError(new AppError("SEATS_TAKEN", "taken", 409, { seatIds: ["a"] }));
  expect(await res.json()).toEqual({
    error: { code: "SEATS_TAKEN", message: "taken", details: { seatIds: ["a"] } },
  });
});

test("jsonError maps ZodError to 400 VALIDATION with a readable message", async () => {
  const parsed = z.object({ email: z.string().email() }).safeParse({ email: "x" });
  if (parsed.success) throw new Error("expected failure");
  const res = jsonError(parsed.error);
  expect(res.status).toBe(400);
  const { error } = await res.json();
  expect(error.code).toBe("VALIDATION");
  expect(error.message).toContain("email");
});
