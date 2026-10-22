import { useSyncExternalStore } from "react";
import { useSettings } from "../state/settings";

const QUERY = "(prefers-reduced-motion: reduce)";

function media(): MediaQueryList | null {
  return typeof window !== "undefined" && window.matchMedia ? window.matchMedia(QUERY) : null;
}

function subscribe(onChange: () => void): () => void {
  const mq = media();
  mq?.addEventListener("change", onChange);
  return () => mq?.removeEventListener("change", onChange);
}

const osPrefers = () => media()?.matches ?? false;

/** True when the OS asks for less motion or the host turned on settings.reduceMotion. */
export function useReducedMotion(): boolean {
  const os = useSyncExternalStore(subscribe, osPrefers, () => false);
  const setting = useSettings((s) => s.reduceMotion);
  return os || setting;
}

/** Non-hook version for imperative code (confetti, timers). */
export function isReducedMotion(): boolean {
  return osPrefers() || useSettings.getState().reduceMotion;
}
