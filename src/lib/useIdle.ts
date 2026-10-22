import { useCallback, useEffect, useRef } from "react";

const ACTIVITY = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

/**
 * Calls `onIdle` once after `ms` without pointer or key activity, then waits for activity
 * before counting again. `ms` of 0 or null disables it. Returns a function that restarts the count.
 */
export function useIdle(ms: number | null, onIdle: () => void): () => void {
  const saved = useRef(onIdle);
  saved.current = onIdle;
  const timer = useRef(0);

  const restart = useCallback(() => {
    window.clearTimeout(timer.current);
    if (!ms) return;
    timer.current = window.setTimeout(() => saved.current(), ms);
  }, [ms]);

  useEffect(() => {
    if (!ms) return;
    restart();
    for (const type of ACTIVITY) window.addEventListener(type, restart, { passive: true });
    return () => {
      window.clearTimeout(timer.current);
      for (const type of ACTIVITY) window.removeEventListener(type, restart);
    };
  }, [ms, restart]);

  return restart;
}
