import { expect, test } from "vitest";
import { parseAttendee } from "@/lib/attendee";

const ok = { name: "Asha Rao", email: "asha@example.com", phone: "9876543210", participants: 3 };

test("parses stored details", () => {
  expect(parseAttendee(JSON.stringify(ok))).toEqual(ok);
});

test("missing, malformed or out-of-range details read as none", () => {
  expect(parseAttendee(null)).toBeNull();
  expect(parseAttendee(undefined)).toBeNull();
  expect(parseAttendee("{not json")).toBeNull();
  expect(parseAttendee(JSON.stringify({ ...ok, email: 5 }))).toBeNull();
  expect(parseAttendee(JSON.stringify({ ...ok, participants: 0 }))).toBeNull();
  expect(parseAttendee(JSON.stringify({ ...ok, participants: 7 }))).toBeNull();
  expect(parseAttendee(JSON.stringify({ ...ok, participants: 1.5 }))).toBeNull();
});
