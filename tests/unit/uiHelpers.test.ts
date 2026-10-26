import { expect, test } from "vitest";
import { bookingStatus } from "@/db/schema";
import { bookingStatusLabel } from "@/lib/bookingStatus";
import { formatCountdown } from "@/lib/countdown";
import { holdErrorMessage } from "@/lib/holdErrors";

test("every booking status has a friendly label", () => {
  const labels = Object.fromEntries(bookingStatus.enumValues.map((s) => [s, bookingStatusLabel(s)]));
  expect(labels).toEqual({
    pending: "Payment processing", paid: "Confirmed", expired: "Expired", comp: "Confirmed",
    refund_due: "Refund in progress", refunded: "Refunded", cancelled: "Cancelled",
  });
});

test("countdown formats remaining milliseconds as mm:ss, rounding up and never negative", () => {
  expect(formatCountdown(600_000)).toBe("10:00");
  expect(formatCountdown(65_000)).toBe("01:05");
  expect(formatCountdown(59_001)).toBe("01:00");
  expect(formatCountdown(999)).toBe("00:01");
  expect(formatCountdown(0)).toBe("00:00");
  expect(formatCountdown(-5_000)).toBe("00:00");
});

test("hold error codes map to friendly messages", () => {
  expect(holdErrorMessage("ACTIVE_HOLD_EXISTS", "x")).toBe(
    "You already have a booking in progress. Finish it or wait 10 minutes.",
  );
  expect(holdErrorMessage("SEATS_TAKEN", "x")).toBe("Some seats were just taken — please pick again");
  expect(holdErrorMessage("VALIDATION", "phone: Invalid Indian mobile number")).toBe(
    "phone: Invalid Indian mobile number",
  );
  for (const code of ["RATE_LIMITED", "TURNSTILE_FAILED", "PAYMENT_UNAVAILABLE", "INVALID_SEATS", "NETWORK", "internal_error"]) {
    const msg = holdErrorMessage(code, "raw server text");
    expect(msg).not.toBe("raw server text");
    expect(msg.length).toBeGreaterThan(10);
  }
  expect(holdErrorMessage("RATE_LIMITED", "")).toMatch(/too many/i);
  expect(holdErrorMessage("TURNSTILE_FAILED", "")).toMatch(/human/i);
  expect(holdErrorMessage("PAYMENT_UNAVAILABLE", "")).toMatch(/payment/i);
});
