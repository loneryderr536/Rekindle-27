import { expect, test } from "vitest";
import { discountAmountPaise, normalizeDiscountCode } from "@/lib/discount";

test("normalizes spacing, case and punctuation", () => {
  for (const raw of ["rekindle 10", "Rekindle10", "REKINDLE-10", "  rekindle_10 "]) {
    expect(normalizeDiscountCode(raw)).toBe("REKINDLE10");
  }
  expect(normalizeDiscountCode(" -- ")).toBe("");
});

test("discount is a rounded percentage of the subtotal", () => {
  expect(discountAmountPaise(150000, 20)).toBe(30000);
  expect(discountAmountPaise(150000, 10)).toBe(15000);
  expect(discountAmountPaise(999, 10)).toBe(100); // 99.9 rounds up
});
