import { useCallback, useSyncExternalStore } from "react";

interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
}
interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

const doc = () => document as WebkitDocument;

function current(): Element | null {
  return doc().fullscreenElement ?? doc().webkitFullscreenElement ?? null;
}

function supported(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(doc().fullscreenEnabled ?? doc().webkitFullscreenEnabled);
}

function subscribe(onChange: () => void): () => void {
  document.addEventListener("fullscreenchange", onChange);
  document.addEventListener("webkitfullscreenchange", onChange);
  return () => {
    document.removeEventListener("fullscreenchange", onChange);
    document.removeEventListener("webkitfullscreenchange", onChange);
  };
}

const isActive = () => current() !== null;

export interface Fullscreen {
  /** False on iPhone Safari and in some embeds. enter() is then a no-op. */
  supported: boolean;
  active: boolean;
  enter(): Promise<void>;
  exit(): Promise<void>;
  toggle(): Promise<void>;
}

/** Element fullscreen with WebKit prefixes. Must be called from a user gesture. Never throws. */
export function useFullscreen(): Fullscreen {
  const active = useSyncExternalStore(subscribe, isActive, () => false);

  const enter = useCallback(async () => {
    if (!supported() || current()) return;
    const el = document.documentElement as WebkitElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
      else await el.webkitRequestFullscreen?.();
    } catch {
      // Denied or not allowed here. Stay windowed.
    }
  }, []);

  const exit = useCallback(async () => {
    if (!current()) return;
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else await doc().webkitExitFullscreen?.();
    } catch {
      // Already out.
    }
  }, []);

  const toggle = useCallback(() => (current() ? exit() : enter()), [enter, exit]);

  return { supported: supported(), active, enter, exit, toggle };
}
