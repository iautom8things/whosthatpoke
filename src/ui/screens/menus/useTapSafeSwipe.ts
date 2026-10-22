import { useRef, type PointerEvent } from "react";
import { useSwipe, type UseSwipeOptions } from "../../../lib/useSwipe";

const SLOP = 8;

/**
 * useSwipe for an area full of buttons. useSwipe captures the pointer on press, and a captured
 * pointer's click lands on the area instead of the card under the finger, so taps would do nothing.
 * This waits until the drag passes the tap slop before capturing. It also swallows the click that
 * ends a drag, so a swipe never picks a card.
 */
export function useTapSafeSwipe(options: UseSwipeOptions) {
  const swipe = useSwipe(options);
  const press = useRef<{ id: number; x: number; y: number; captured: boolean } | null>(null);
  const dragged = useRef(false);

  const bind = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      dragged.current = false;
      press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, captured: false };
      // Shadow the method on this element for the duration of useSwipe's press handler only.
      const el = e.currentTarget as { setPointerCapture?: (id: number) => void };
      el.setPointerCapture = () => {};
      try {
        swipe.bind.onPointerDown(e);
      } finally {
        delete el.setPointerCapture;
      }
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const p = press.current;
      if (p && p.id === e.pointerId && !p.captured && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP) {
        p.captured = true;
        dragged.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // The pointer may already be gone; the drag still works in bounds.
        }
      }
      swipe.bind.onPointerMove(e);
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      press.current = null;
      swipe.bind.onPointerUp(e);
    },
    onPointerCancel(e: PointerEvent<HTMLElement>) {
      press.current = null;
      swipe.bind.onPointerCancel(e);
    },
    onClickCapture(e: { stopPropagation(): void; preventDefault(): void }) {
      if (!dragged.current) return;
      dragged.current = false;
      e.stopPropagation();
      e.preventDefault();
    },
  };

  return { bind, dx: swipe.dx, dragging: swipe.dragging };
}
