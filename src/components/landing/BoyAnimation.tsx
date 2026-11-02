"use client";

import { useEffect, useRef } from "react";
import { createBoyAnimation, type BoyHandle } from "@/components/landing/boyEngine";

/** The story drives the boy through this (seek to a time, set the extra height); it is set while BoyAnimation is mounted. */
export const boyPlayer: { current: BoyHandle | null } = { current: null };

/**
 * The snapping boy on a transparent canvas. The story sizes it to the visible window of the 1920×1080 scene
 * and scrubs it with scrolling (see StoryIntro); it draws his rise, blinks, push-in, snap, sparks, ring and fade.
 */
export function BoyAnimation() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const boy = createBoyAnimation(canvas, "/landing/boy");
    boyPlayer.current = boy;
    return () => {
      boy.destroy();
      boyPlayer.current = null;
    };
  }, []);

  return <canvas ref={ref} id="o26-boy" className="o26-boy" />;
}
