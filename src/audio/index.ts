// CONTRACT: implemented by the audio agent. Everything is synthesized with Web Audio; no audio files.
// All calls are safe before unlock() (they no-op) and never throw.

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
  | "drumroll" // before the prize reveal
  | "pop"; // confetti / bubbles

export interface Audio {
  /** Call from the first user gesture (iOS needs it). Resolves when sound can play. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
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

const noop = () => {};

export const audio: Audio = {
  unlock: async () => {},
  unlocked: false,
  playSong: noop,
  stopSong: noop,
  sfx: noop,
  setMusicVolume: noop,
  setSfxVolume: noop,
  duck: noop,
};

export const announcer: Announcer = {
  say: async () => {},
  cancel: noop,
  setEnabled: noop,
  supported: false,
};
