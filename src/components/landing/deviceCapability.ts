/**
 * Heavier canvas work (extra draw passes, higher-res offscreen buffers) needs to scale
 * down on any device with limited headroom, not just "an iPhone" — a budget Android
 * phone or an older iPad hits the same wall. `constrainedDevice()` combines the known
 * WebKit-specific canvas/memory behavior on iOS with general core-count/screen-size
 * signals so the throttle applies adaptively everywhere it's actually needed.
 */
export function isIOSSafariEngine(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function constrainedDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (isIOSSafariEngine()) return true;
  const cores = navigator.hardwareConcurrency || 4;
  const dpr = window.devicePixelRatio || 1;
  const screenPixels = window.screen.width * window.screen.height * dpr;
  return cores <= 4 || screenPixels < 2_000_000;
}
