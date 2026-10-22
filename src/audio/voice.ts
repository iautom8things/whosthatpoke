// The announcer: recorded clips first, speechSynthesis second, decided line by line. A line plays from clips only
// when every clip it needs is decoded in time; otherwise Speech says its whole text, so voices never mix inside a
// sentence. An `extra` line (the Pokédex entry) is the exception: with recordings in use it plays from its clip or
// not at all, and on a poor connection only a clip already on the device plays.
// say() always resolves: clip end, cancel, hidden tab, voice off, or a safety timer.

import type { NetQuality } from "../lib/network";
import type { Announcer } from "./index";
import type { Clips } from "./clips";
import type { Line } from "./lines";
import type { Speech } from "./announcer";

/** A line's clips must be decoded this soon after its cue, or Speech says it. */
const READY_MS = 400;
/** Silence before a `then` line that has no pauseMs of its own. */
const PAUSE_MS = 250;
/** Same as Speech: the music comes back this long after the last clip, unless another line starts. */
const RELEASE_MS = 150;

type ClipsLike = Pick<Clips, "available" | "has" | "load" | "ready" | "fetch" | "prepare" | "play">;
type SpeechLike = Pick<Speech, "supported" | "say" | "cancel" | "setEnabled" | "warmUp">;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const hidden = () => typeof document !== "undefined" && document.hidden;

/** Each line and the `then` lines chained after it, in order. */
function partsOf(lines: readonly (Line | undefined | null | false)[]): Line[] {
  const parts: Line[] = [];
  for (const line of lines) for (let p = line || undefined; p; p = p.then) parts.push(p);
  return parts;
}

export class Voice implements Announcer {
  private enabled = true;
  private useClips = true;
  /** Bumped by every new line and every cancel(), so a line still decoding knows it lost. */
  private gen = 0;
  /** Stops what is sounding now. A speech line stays here after a newer line takes over, until it is stopped. */
  private current: { stop(): void; speech: boolean } | null = null;
  /** Resolves the say() of the line in progress, for a cancel that lands while it decodes or pauses. */
  private abort: (() => void) | null = null;
  /** A line waiting for its delay. Same rules as Speech: cancel() leaves it, unqueue() and newer lines drop it. */
  private queued: { timer: ReturnType<typeof setTimeout>; resolve: () => void; done: Promise<void> } | null = null;
  private held = false;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly clips: ClipsLike,
    private readonly speech: SpeechLike,
    private readonly duck: (on: boolean) => void,
    private readonly net: () => NetQuality = () => "good",
  ) {
    if (typeof document === "undefined") return;
    // The engine suspends on hide; a clip frozen mid-word must not pick up again later.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) return;
      this.dropQueued();
      this.cancel();
    });
  }

  get supported(): boolean {
    return this.speech.supported || this.clips.available;
  }

  say(line: Line | string, delayMs = 0): Promise<void> {
    const first: Line = typeof line === "string" ? { text: line, clips: [] } : line;
    this.dropQueued();
    if (!this.enabled || hidden() || !this.supported) return Promise.resolve();
    if (delayMs > 0) {
      // Decoding starts now, so the line has the whole delay as a head start.
      this.prepare([first]);
      let resolve = () => {};
      const done = new Promise<void>((r) => (resolve = r));
      const timer = setTimeout(() => {
        this.queued = null;
        void this.run(first).then(resolve);
      }, delayMs);
      this.queued = { timer, resolve, done };
      return done;
    }
    return this.run(first);
  }

  /** Start decoding what these lines need, so they are ready when said. Fire and forget. */
  prepare(lines: readonly (Line | undefined | null | false)[]): void {
    if (!this.useClips) return;
    const parts = partsOf(lines);
    if (parts.length === 0) return;
    void this.clips.load().then(() => {
      for (const p of parts) {
        const keys = this.keysFor(p);
        if (keys) void this.clips.prepare(keys, undefined, { download: this.downloads(p) });
      }
    });
  }

  /**
   * Download the clips these lines need without decoding them, questions ahead. An `extra` line is left out unless
   * the connection is good; offline, nothing is downloaded. Resolves when the downloads end. Never rejects.
   */
  prefetch(lines: readonly (Line | undefined | null | false)[]): Promise<void> {
    if (!this.useClips) return Promise.resolve();
    const parts = partsOf(lines);
    return this.clips.load().then(async () => {
      const online = this.net() !== "offline";
      await Promise.all(
        parts.map((p) => {
          const keys = this.keysFor(p);
          return keys && this.downloads(p) ? this.clips.fetch(keys, { download: online }) : null;
        }),
      );
    });
  }

  /** True when say(line) would leave this line out: an `extra` line whose clip can't play now. */
  skips(line: Line): boolean {
    if (!line.extra || !this.recorded) return false;
    const keys = this.keysFor(line);
    return !keys || (!this.downloads(line) && !this.clips.ready(keys));
  }

  /** Drop a delayed line from say() before it starts, if it is still waiting. */
  unqueue(line: Promise<void>): void {
    if (this.queued?.done === line) this.dropQueued();
  }

  /** Stop the line being said and its `then` chain. A delayed line still waiting is left alone. */
  cancel(): void {
    const c = this.current;
    this.current = null;
    this.preempt();
    try {
      c?.stop();
    } catch {
      // ignore
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.speech.setEnabled(on);
    if (on) return;
    this.dropQueued();
    this.cancel();
  }

  /** Off: every line goes to Speech, to compare in the sound lab. */
  setClipsEnabled(on: boolean): void {
    this.useClips = on;
  }

  get clipsEnabled(): boolean {
    return this.useClips;
  }

  /** Call inside a user gesture, like Speech.warmUp(). Also starts loading the clip index. */
  warmUp(): void {
    this.speech.warmUp();
    void this.clips.load();
  }

  // ---------- internals ----------

  /** Recordings are in use: an index loaded, and the sound lab has not switched them off. */
  private get recorded(): boolean {
    return this.useClips && this.clips.available;
  }

  /** Whether this line's clips may be downloaded now. An `extra` line's only on a good connection. */
  private downloads(line: Line): boolean {
    return !line.extra || this.net() === "good";
  }

  /** The clips this line plays: its own, else its stand-in. Null when it has none, so Speech says it. */
  private keysFor(line: Line): readonly string[] | null {
    if (!this.useClips) return null;
    if (this.clips.has(line.clips)) return line.clips;
    if (line.standIn && this.clips.has(line.standIn)) return line.standIn;
    return null;
  }

  /** End the line in progress: its say() resolves and its chain stops. Speech still talking is left to the next line. */
  private preempt(): number {
    this.abort?.();
    this.abort = null;
    const c = this.current;
    if (c && !c.speech) {
      this.current = null;
      c.stop();
    }
    if (this.held) this.release();
    return ++this.gen;
  }

  private run(first: Line): Promise<void> {
    const gen = this.preempt();
    let abort = () => {};
    const aborted = new Promise<void>((r) => (abort = r));
    this.abort = abort;
    this.prepare([first.then]);
    const work = this.parts(first, gen, aborted).catch(() => {});
    return Promise.race([work, aborted]).then(() => {
      if (gen !== this.gen) return;
      this.abort = null;
      this.current = null;
      if (this.held) this.release();
    });
  }

  private async parts(first: Line, gen: number, aborted: Promise<void>): Promise<void> {
    let afterClip = false;
    for (let part: Line | undefined = first; part; part = part.then) {
      const keys = this.keysFor(part);
      // With recordings in use, an extra line plays from its clip or not at all: never in the device voice.
      const clipOnly = part.extra === true && this.recorded;
      if (clipOnly && !keys) continue;
      // Clips are trimmed tight, so they get their breath here. Speech leaves its own between two spoken lines.
      if (part !== first && (afterClip || keys)) await Promise.race([wait(part.pauseMs ?? PAUSE_MS), aborted]);
      if (gen !== this.gen) return;
      const download = this.downloads(part);
      const ready = keys !== null && (await Promise.race([this.clips.prepare(keys, READY_MS, { download }), aborted.then(() => false)]));
      if (gen !== this.gen) return;
      // The first part's pause rides the audio clock; a `then` part already waited for its own above.
      const clip = ready && keys ? this.clips.play(keys, part.gapMs ?? 0, part === first ? (part.pauseMs ?? 0) : 0) : null;
      if (clip) {
        if (this.current?.speech) this.current.stop();
        this.current = { stop: clip.stop, speech: false };
        this.hold();
        await clip.done;
      } else if (clipOnly) {
        continue;
      } else {
        // A first part with no clips gets here without awaiting anything, so it speaks in the caller's task.
        this.current = { stop: () => this.speech.cancel(), speech: true };
        await this.speech.say(part.text);
      }
      if (gen !== this.gen) return;
      afterClip = clip !== null;
    }
  }

  private dropQueued(): void {
    const q = this.queued;
    this.queued = null;
    if (!q) return;
    clearTimeout(q.timer);
    q.resolve();
  }

  private hold(): void {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    this.held = true;
    this.duck(true);
  }

  private release(): void {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      this.held = false;
      this.duck(false);
    }, RELEASE_MS);
  }
}
