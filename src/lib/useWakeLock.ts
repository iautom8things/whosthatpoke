import { useEffect } from "react";

type Listen = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export interface AwakeEnv {
  wakeLock: Pick<WakeLock, "request">;
  doc: Listen & Pick<Document, "visibilityState">;
  win: Listen;
}

/**
 * Holds a screen wake lock until the returned function runs. The OS drops the lock whenever the
 * page is hidden, and Safari grants it only after a user gesture, so it is requested again on
 * every tap, key and return to the page while none is held. Errors (no gesture yet, low battery,
 * not allowed here) are ignored; the next tap tries again.
 */
export function keepScreenAwake(env: AwakeEnv): () => void {
  const { wakeLock, doc, win } = env;
  let lock: WakeLockSentinel | null = null;
  let pending = false;
  let alive = true;

  const request = () => {
    if (!alive || pending || (lock && !lock.released) || doc.visibilityState !== "visible") return;
    pending = true;
    wakeLock
      .request("screen")
      .then((sentinel) => {
        lock = sentinel;
        // Stopped while the request was in flight.
        if (!alive) void sentinel.release().catch(() => {});
      })
      .catch(() => {})
      .finally(() => {
        pending = false;
      });
  };

  request();
  const opts = { capture: true, passive: true } as const;
  win.addEventListener("pointerdown", request, opts);
  win.addEventListener("keydown", request, opts);
  doc.addEventListener("visibilitychange", request);
  return () => {
    alive = false;
    win.removeEventListener("pointerdown", request, opts);
    win.removeEventListener("keydown", request, opts);
    doc.removeEventListener("visibilitychange", request);
    if (lock && !lock.released) void lock.release().catch(() => {});
  };
}

/**
 * Keeps the screen awake while the app is open, so Show-off mode and long Host rounds never let
 * the iPad lock or the laptop display sleep. Does nothing where the API is missing (iOS before
 * 16.4, Home Screen apps before iOS 18.4); Settings tells the host to turn off Auto-Lock there.
 */
export function useWakeLock(enabled = true): void {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    return keepScreenAwake({ wakeLock: navigator.wakeLock, doc: document, win: window });
  }, [enabled]);
}
