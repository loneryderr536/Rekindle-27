import { expect, test } from "vitest";
import { GATES, GATE_WAIT_MS, limitFor, scrollQ, stepGates, storyAt } from "@/components/landing/StoryIntro";

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
  for (const t of [3, 5, 7.2, 9.7, 12, 13.9]) expect(storyAt(scrollQ(t))).toBeCloseTo(t, 6);
});

test("the story waits 3 seconds at the finished logo and again where the logo lands, then lets the guest on", () => {
  expect(GATE_WAIT_MS).toBe(3000);
  expect(GATES.length).toBe(2);
  const [g1, g2] = GATES;
  let st = { idx: 0, arrivedAt: null as number | null };
  // Still on the way: no timer, and the story may not pass the gate.
  st = stepGates(st, g1 - 1, g2, 1000);
  expect(st).toEqual({ idx: 0, arrivedAt: null });
  expect(limitFor(st)).toBe(g1);
  // Arrives at the gate: the wait starts, however far the guest has scrolled.
  st = stepGates(st, g1, g2, 2000);
  expect(st).toEqual({ idx: 0, arrivedAt: 2000 });
  st = stepGates(st, g1, g2, 4999);
  expect(st.idx).toBe(0);
  st = stepGates(st, g1, g2, 5000);
  expect(st).toEqual({ idx: 1, arrivedAt: null });
  expect(limitFor(st)).toBe(g2);
  st = stepGates(st, g2, g2, 6000);
  st = stepGates(st, g2, g2, 9000);
  expect(st.idx).toBe(2);
  expect(limitFor(st)).toBe(Infinity);
});

test("scrolling back before a gate re-arms it", () => {
  const st = stepGates({ idx: 2, arrivedAt: null }, 8, 8, 100);
  expect(st).toEqual({ idx: 0, arrivedAt: null });
});
