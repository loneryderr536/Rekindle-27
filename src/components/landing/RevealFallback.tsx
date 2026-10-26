"use client";

import { useEffect } from "react";

const REVEAL = '#rekindle > div > *,#steps > li,#about > div,#stats > div,#plan > div,#faq h2,#faq [role="img"],#faq details';

/**
 * Sections rise into view with CSS scroll-driven animations (landing.css). Browsers without
 * `animation-timeline: view()` get the same reveal from an IntersectionObserver instead.
 */
export function RevealFallback() {
  useEffect(() => {
    const supported = CSS.supports("animation-timeline: view()");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (supported || reduce || !("IntersectionObserver" in window)) return;
    const els = Array.from(document.querySelectorAll(REVEAL));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("o26-seen");
          io.unobserve(e.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    els.forEach((el) => {
      el.classList.add("o26-io");
      io.observe(el);
    });
    return () => {
      io.disconnect();
      els.forEach((el) => el.classList.remove("o26-io", "o26-seen"));
    };
  }, []);
  return null;
}
