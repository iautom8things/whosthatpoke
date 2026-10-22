import { useSyncExternalStore } from "react";

export type Orientation = "portrait" | "landscape";
/**
 * phone:  smaller side under 500 px (phones, and the 854x480 projector)
 * tablet: everything up to 1400 px wide (iPads, 1280x720 projector)
 * wide:   desktop and 1080p projectors
 */
export type ViewportSize = "phone" | "tablet" | "wide";

export interface Viewport {
  w: number;
  h: number;
  orientation: Orientation;
  size: ViewportSize;
  /** Height under 560 px: phone landscape and 480p projectors. Keep headers compact. */
  short: boolean;
}

function measure(): Viewport {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const min = Math.min(w, h);
  const max = Math.max(w, h);
  return {
    w,
    h,
    orientation: w >= h ? "landscape" : "portrait",
    size: min < 500 ? "phone" : max < 1400 ? "tablet" : "wide",
    short: h < 560,
  };
}

let snapshot: Viewport | null = null;
const listeners = new Set<() => void>();

function onResize() {
  const next = measure();
  if (snapshot && next.w === snapshot.w && next.h === snapshot.h) return;
  snapshot = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    }
  };
}

function getSnapshot(): Viewport {
  snapshot ??= measure();
  return snapshot;
}

const SERVER: Viewport = { w: 1280, h: 720, orientation: "landscape", size: "tablet", short: false };

/** Live viewport size and class. Prefer CSS media queries for layout; use this for logic. */
export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER);
}
