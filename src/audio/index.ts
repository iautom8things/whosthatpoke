// Audio and announcer for the whole game. Everything is synthesized with Web Audio; no audio files.
// All calls are safe before unlock() (songs requested early start on unlock) and never throw.
// Volumes and the announcer switch follow useSettings on their own.

import { engine, speech, unlockAll } from "./live";

export type SongId =
  | "title" // upbeat adventure theme for menus
  | "spooky" // Halloween menu theme (Spooky Night look)
  | "question" // suspense loop while a silhouette is on screen
  | "results" // victory loop on the results screen
  | "showcase"; // light loop for attract mode

export type SfxId =
  | "tap" // generic button press
  | "select" // choosing a card / option
  | "back"
  | "whoosh" // screen or card transition
  | "swipe" // host-mode swipe away
  | "whosThat" // the "Who's that Pokémon?" sting when a silhouette appears
  | "reveal" // silhouette flips to color
  | "correct"
  | "wrong"
  | "timeout"
  | "tick" // last seconds of the timer
  | "tickUrgent"
  | "streak" // 3+ in a row
  | "points" // score counter rolling up
  | "fanfare" // end of game
  | "prize" // big candy moment
  | "drumroll" // before the prize reveal; the next sfx stops it
  | "pop"; // confetti / bubbles

export interface Audio {
  /** Call from the first user gesture (iOS needs it). Resolves when sound can play, or after ~1 s regardless. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  /** Crossfades from the current song. Same song again = no-op. Before unlock, it starts on unlock. */
  playSong(id: SongId): void;
  stopSong(fadeMs?: number): void;
  sfx(id: SfxId): void;
  setMusicVolume(v: number): void;
  setSfxVolume(v: number): void;
  /** Lower the music while the announcer talks. */
  duck(on: boolean): void;
}

export interface Announcer {
  /** Speak a line. Resolves when finished, or immediately if voice is off or unsupported. */
  say(text: string): Promise<void>;
  cancel(): void;
  setEnabled(on: boolean): void;
  readonly supported: boolean;
}

export const audio: Audio = {
  unlock: () => unlockAll(),
  get unlocked() {
    return engine.unlocked;
  },
  playSong: (id) => engine.playSong(id),
  stopSong: (fadeMs) => engine.stopSong(fadeMs),
  sfx: (id) => engine.sfx(id),
  setMusicVolume: (v) => engine.setMusicVolume(v),
  setSfxVolume: (v) => engine.setSfxVolume(v),
  duck: (on) => engine.duck(on),
};

export const announcer: Announcer = speech;
