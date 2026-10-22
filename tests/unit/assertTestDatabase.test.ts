import { expect, test } from "vitest";
import { assertTestDatabase } from "../helpers/db";

test("assertTestDatabase refuses non-test databases", () => {
  expect(() => assertTestDatabase("booking")).toThrow(/_test/);
  expect(() => assertTestDatabase("postgres")).toThrow(/booking_test|_test/);
});
test("assertTestDatabase accepts *_test databases", () => {
  expect(() => assertTestDatabase("booking_test")).not.toThrow();
});
