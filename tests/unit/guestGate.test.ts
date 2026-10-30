import { expect, test } from "vitest";
import { guestGate } from "@/server/guestAuth/guestGate";

test("/register/seats signed out goes to /register", () => {
  expect(guestGate("/register/seats", "", false)).toBe("/register");
});

test("/my-bookings signed out goes to sign-in and keeps the query", () => {
  expect(guestGate("/my-bookings", "?new=K7MQ2X", false)).toBe("/sign-in?next=%2Fmy-bookings%3Fnew%3DK7MQ2X");
  expect(guestGate("/my-bookings", "", false)).toBe("/sign-in?next=%2Fmy-bookings");
});

test("signed in is never redirected", () => {
  expect(guestGate("/register/seats", "", true)).toBeNull();
  expect(guestGate("/my-bookings", "", true)).toBeNull();
});

test("/register signed out is left to the page", () => {
  expect(guestGate("/register", "", false)).toBeNull();
  expect(guestGate("/sign-in", "", false)).toBeNull();
});
