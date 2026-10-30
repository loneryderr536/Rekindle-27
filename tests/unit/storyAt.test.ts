import { expect, test } from "vitest";
import { scrollQ, storyAt } from "@/components/landing/StoryIntro";

test("scroll progress maps to story time that never runs backwards and ends at the end", () => {
  let prev = -1;
  for (let i = 0; i <= 1000; i++) {
    const t = storyAt(i / 1000);
    expect(t).toBeGreaterThanOrEqual(prev);
    prev = t;
  }
  expect(storyAt(1)).toBeCloseTo(14.6, 5);
});

test("scrollQ is the inverse of storyAt", () => {
  for (const t of [3, 5, 7.2, 9.7, 11, 12, 13.9]) expect(storyAt(scrollQ(t))).toBeCloseTo(t, 6);
});

test("the burning logo gets at least 1000px of scrolling, so it plays by scrolling rather than waiting", () => {
  // Story seconds 10.0 to 11.6 (the boy leaves, the logo glows) span this share of the 0.94 of the scroll the story uses.
  const px = (scrollQ(11.6) - scrollQ(10.0)) * 0.94 * 6500;
  expect(px).toBeGreaterThan(1000);
});
