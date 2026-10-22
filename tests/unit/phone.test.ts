import { expect, test } from "vitest";
import { normalizeIndianPhone } from "@/lib/phone";
import { formatInr } from "@/lib/money";

test.each([
  ["98765 43210", "+919876543210"],
  ["+91 9876543210", "+919876543210"],
  ["+91-98765-43210", "+919876543210"],
  ["(98765) 43210", "+919876543210"],
  ["09876543210", "+919876543210"],
  ["919876543210", "+919876543210"],
  ["12345", null],
  ["5876543210", null], // Indian mobiles start 6-9
  ["", null],
  ["98765432101", null],
  ["abcdefghij", null],
])("normalizeIndianPhone(%s)", (i, o) => expect(normalizeIndianPhone(i)).toBe(o));

test("formatInr uses Indian grouping", () => {
  expect(formatInr(150000)).toBe("₹1,500.00");
  expect(formatInr(230000)).toBe("₹2,300.00");
  expect(formatInr(15000000)).toBe("₹1,50,000.00");
});
