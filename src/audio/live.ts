// The live singletons behind `audio` and `announcer`, plus extras for the sound lab.
// Volumes and the announcer switch follow useSettings.

import { network } from "../lib/network";
import { useSettings } from "../state/settings";
import { Speech } from "./announcer";
import { Clips } from "./clips";
import { Engine } from "./engine";
import { CORE_KEYS } from "./lines";
import { Voice } from "./voice";

export const engine = new Engine();

/** Speech and the recorded voice each hold the duck; the music comes back once neither does. */
const ducking = { speech: false, voice: false };
const duckFor = (who: keyof typeof ducking) => (on: boolean) => {
  ducking[who] = on;
  engine.duck(ducking.speech || ducking.voice);
};

export const speech = new Speech(duckFor("speech"));
export const clips = new Clips(
  () => engine.context,
  () => engine.voiceOut(),
);
export const voice = new Voice(clips, speech, duckFor("voice"), () => network.quality);

export function unlockAll(): Promise<void> {
  voice.warmUp();
  const unlocked = engine.unlock();
  // Decoding needs the context the unlock creates. The core takes stay decoded all night.
  void unlocked.then(() => clips.pin(CORE_KEYS));
  return unlocked;
}

function followSettings(): void {
  try {
    const s = useSettings.getState();
    engine.setMusicVolume(s.musicVolume);
    engine.setSfxVolume(s.sfxVolume);
    voice.setEnabled(s.voice);
    useSettings.subscribe((next, prev) => {
      if (next.musicVolume !== prev.musicVolume) engine.setMusicVolume(next.musicVolume);
      if (next.sfxVolume !== prev.sfxVolume) engine.setSfxVolume(next.sfxVolume);
      if (next.voice !== prev.voice) voice.setEnabled(next.voice);
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
// The index is small; the clips download and decode later, per question.
void clips.load();
