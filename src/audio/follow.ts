// Volumes and the announcer follow the settings: the saved levels with the sound mode on top (see heard()).
// The mode never writes the levels, so a mute and back plays at the levels the host set.

import { heard, type Settings } from "../state/settings";

export interface SoundOutputs {
  music(level: number): void;
  sfx(level: number): void;
  voice(on: boolean): void;
}

interface SettingsStore {
  getState(): Settings;
  subscribe(listener: (next: Settings, prev: Settings) => void): () => void;
}

/** Applies what should be heard now, then each change to it. Returns the unsubscribe. */
export function followSettings(store: SettingsStore, out: SoundOutputs): () => void {
  const now = heard(store.getState());
  out.music(now.music);
  out.sfx(now.sfx);
  out.voice(now.voice);
  return store.subscribe((nextState, prevState) => {
    const next = heard(nextState);
    const prev = heard(prevState);
    if (next.music !== prev.music) out.music(next.music);
    if (next.sfx !== prev.sfx) out.sfx(next.sfx);
    if (next.voice !== prev.voice) out.voice(next.voice);
  });
}
