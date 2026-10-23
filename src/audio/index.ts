// Audio and announcer for the whole game. Music and effects are synthesized with Web Audio. The announcer plays
// recorded clips (public/voice) when it has them and falls back to the device voice line by line.
// All calls are safe before unlock() (songs requested early start on unlock) and never throw.
// Volumes and the announcer follow useSettings on their own, sound mode included (see follow.ts).

import { lines, type Line } from "./lines";
import { engine, unlockAll, voice } from "./live";

export { lines, type Line } from "./lines";

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
  | "drumroll" // before the prize reveal; the next sfx stops it, except points, tick and pop
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
  /** Lower the music, and the effects a little, while the announcer talks. */
  duck(on: boolean): void;
}

export interface Announcer {
  /**
   * Speak a line, after `delayMs` if given. Resolves when finished, or at once if voice is off, unsupported or
   * the tab is hidden. A delayed line is dropped (and resolves) if another line or a hidden tab comes first.
   * A plain string has no recording, so the device voice says it.
   */
  say(line: Line | string, delayMs?: number): Promise<void>;
  /** Start decoding the clips these lines need, so they play the moment they are said. Fire and forget. */
  prepare(lines: readonly (Line | undefined | null | false)[]): void;
  /**
   * Download the clips these lines need, questions ahead, without decoding them. The Pokédex entry only on a good
   * connection, and nothing offline. Resolves when the downloads end; never rejects.
   */
  prefetch(lines: readonly (Line | undefined | null | false)[]): Promise<void>;
  /** True when say(line) would leave the line out: the Pokédex entry on a poor connection, with no clip on the device. */
  skips(line: Line): boolean;
  /** Stop the line being spoken and its `then` chain. A delayed line still waiting is left alone; see whosThat().cancel(). */
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

export const announcer: Announcer = voice;

/** The "whosThat" sting hits at 0.9 s; the line starts just after so the hit does not bury it. */
export const WHOS_THAT_LINE_MS = 1000;

/** The line runs about 2 s and answers open 0.25 s in, so the longest a reveal can wait for it is about 1.4 s. */
const WHOS_THAT_FINISH_MS = 1800;

export type WhosThat = Promise<void> & { cancel(): void; finish(): Promise<void> };

/**
 * The "Who's that Pokémon?" moment, timed the same in every mode: the sting, then the line. Resolves when the
 * line ends, or early if another line or a hidden tab drops it. cancel() drops the line if it has not started
 * (call it when the screen that asked leaves); announcer.cancel() stops it once it is speaking. finish() is for
 * the line that comes next: it drops this one if it has not started and otherwise waits for it to end, so a
 * fast answer never cuts the catchphrase off.
 */
export function whosThat(): WhosThat {
  audio.sfx("whosThat");
  const line = announcer.say(lines.whosThat(), WHOS_THAT_LINE_MS);
  const cancel = () => voice.unqueue(line);
  const finish = () => {
    cancel();
    return Promise.race([line, new Promise<void>((r) => setTimeout(r, WHOS_THAT_FINISH_MS))]);
  };
  return Object.assign(line, { cancel, finish });
}
