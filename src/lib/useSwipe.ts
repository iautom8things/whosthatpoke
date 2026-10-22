import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

export type SwipeDirection = "left" | "right" | "up" | "down";

export interface SwipeInfo {
  direction: SwipeDirection;
  /** Offset from the start point at release, px. */
  dx: number;
  dy: number;
  /** Release speed along the swipe axis, px/ms. */
  velocity: number;
  pointerType: string;
}

export interface UseSwipeOptions {
  onSwipe?: (direction: SwipeDirection, info: SwipeInfo) => void;
  /** Finger lifted without a swipe (snap back). */
  onCancel?: () => void;
  /** px. Default: 25% of the element's size on that axis, at least 60. */
  distance?: number;
  /** A flick faster than this (px/ms) counts even when short. Default 0.55. */
  velocity?: number;
  axis?: "x" | "y" | "both";
  enabled?: boolean;
}

export interface SwipeBind {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
  style: CSSProperties;
}

export interface UseSwipeResult {
  /** Spread on the element: <div {...swipe.bind}>. Merge `bind.style` if you pass your own style. */
  bind: SwipeBind;
  /** Live drag offset for feedback (tilt, translate). Back to 0 on release. */
  dx: number;
  dy: number;
  /** True once the pointer moved past the tap slop. */
  dragging: boolean;
}

const SLOP = 8;
const MIN_FLICK = 24;
const SAMPLE_MS = 100;

interface Gesture {
  id: number;
  x0: number;
  y0: number;
  w: number;
  h: number;
  type: string;
  samples: { t: number; x: number; y: number }[];
  moved: boolean;
}

/**
 * Pointer-events swipe detection for touch, pen and mouse.
 * One finger only: a second finger cancels the gesture. The element gets touch-action: none
 * so iOS does not scroll or zoom while dragging.
 */
export function useSwipe(options: UseSwipeOptions = {}): UseSwipeResult {
  const opts = useRef(options);
  opts.current = options;
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Set<number>());
  const cancelled = useRef(false);
  const frame = useRef(0);
  const pending = useRef({ dx: 0, dy: 0, dragging: false });
  const [live, setLive] = useState({ dx: 0, dy: 0, dragging: false });

  const flush = useCallback((next: { dx: number; dy: number; dragging: boolean }, now = false) => {
    pending.current = next;
    if (now) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      setLive(next);
      return;
    }
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        setLive(pending.current);
      });
    }
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const reset = useCallback(() => {
    gesture.current = null;
    flush({ dx: 0, dy: 0, dragging: false }, true);
  }, [flush]);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (opts.current.enabled === false) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointers.current.add(e.pointerId);
      if (pointers.current.size > 1) {
        // Pinch or two-finger tap: drop the whole gesture.
        cancelled.current = true;
        reset();
        return;
      }
      cancelled.current = false;
      const rect = e.currentTarget.getBoundingClientRect();
      gesture.current = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        w: rect.width,
        h: rect.height,
        type: e.pointerType,
        samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
        moved: false,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Capture can fail if the pointer is already gone; the gesture still works in-bounds.
      }
    },
    [reset],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId || cancelled.current) return;
      const axis = opts.current.axis ?? "both";
      let dx = e.clientX - g.x0;
      let dy = e.clientY - g.y0;
      if (axis === "x") dy = 0;
      if (axis === "y") dx = 0;
      if (!g.moved && Math.hypot(dx, dy) < SLOP) return;
      g.moved = true;
      g.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
      while (g.samples.length > 2 && e.timeStamp - g.samples[0].t > SAMPLE_MS) g.samples.shift();
      flush({ dx, dy, dragging: true });
    },
    [flush],
  );

  const finish = useCallback(
    (e: PointerEvent<HTMLElement>, canceled: boolean) => {
      pointers.current.delete(e.pointerId);
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      gesture.current = null;
      const o = opts.current;
      const axis = o.axis ?? "both";
      const dxRaw = e.clientX - g.x0;
      const dyRaw = e.clientY - g.y0;
      const dx = axis === "y" ? 0 : dxRaw;
      const dy = axis === "x" ? 0 : dyRaw;
      flush({ dx: 0, dy: 0, dragging: false }, true);
      if (canceled || cancelled.current || !g.moved) {
        if (g.moved) o.onCancel?.();
        return;
      }

      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const along = horizontal ? dx : dy;
      const size = horizontal ? g.w : g.h;
      const distance = o.distance ?? Math.max(60, size * 0.25);

      const first = g.samples[0];
      const dt = Math.max(1, e.timeStamp - first.t);
      const speed = (horizontal ? e.clientX - first.x : e.clientY - first.y) / dt;
      const flick = Math.abs(speed) >= (o.velocity ?? 0.55) && Math.abs(along) >= MIN_FLICK && Math.sign(speed) === Math.sign(along);

      if (Math.abs(along) >= distance || flick) {
        const direction: SwipeDirection = horizontal ? (along > 0 ? "right" : "left") : along > 0 ? "down" : "up";
        o.onSwipe?.(direction, { direction, dx, dy, velocity: Math.abs(speed), pointerType: g.type });
      } else {
        o.onCancel?.();
      }
    },
    [flush],
  );

  const onPointerUp = useCallback((e: PointerEvent<HTMLElement>) => finish(e, false), [finish]);
  const onPointerCancel = useCallback((e: PointerEvent<HTMLElement>) => finish(e, true), [finish]);

  return {
    bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, style: { touchAction: "none" } },
    dx: live.dx,
    dy: live.dy,
    dragging: live.dragging,
  };
}
