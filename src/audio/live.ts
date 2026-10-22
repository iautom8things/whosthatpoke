// The live singletons behind `audio` and `announcer`, plus extras for the sound lab.
// Volumes and the announcer switch follow useSettings.

import { useSettings } from "../state/settings";
import { Speech } from "./announcer";
import { Engine } from "./engine";

export const engine = new Engine();
export const speech = new Speech((on) => engine.duck(on));

export function unlockAll(): Promise<void> {
  speech.warmUp();
  return engine.unlock();
}

function followSettings(): void {
  try {
    const s = useSettings.getState();
    engine.setMusicVolume(s.musicVolume);
    engine.setSfxVolume(s.sfxVolume);
    speech.setEnabled(s.voice);
    useSettings.subscribe((next, prev) => {
      if (next.musicVolume !== prev.musicVolume) engine.setMusicVolume(next.musicVolume);
      if (next.sfxVolume !== prev.sfxVolume) engine.setSfxVolume(next.sfxVolume);
      if (next.voice !== prev.voice) speech.setEnabled(next.voice);
    });
  } catch {
    // settings unavailable (tests): keep defaults
  }
}

/** Belt and braces: the first tap or key press anywhere unlocks audio, even if a screen forgets to. */
function unlockOnFirstGesture(): void {
  if (typeof window === "undefined") return;
  const events = ["pointerup", "touchend", "click", "keydown"] as const;
  const handler = () => {
    if (!engine.unlocked) void unlockAll();
    if (engine.unlocked) for (const e of events) window.removeEventListener(e, handler, true);
  };
  for (const e of events) window.addEventListener(e, handler, { capture: true, passive: true });
}

followSettings();
unlockOnFirstGesture();
