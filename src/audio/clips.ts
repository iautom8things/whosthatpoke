// The recorded announcer's clips: the voice/index.json map, file reads, a decode cache and Web Audio playback.
// Each take is its own small file (a pack of one, at offset 0), read when a round needs it: from the device when it
// is saved there, else downloaded through the service worker, which keeps it. Packs of many clips still work.
// Everything fails soft. A missing index, file or decode only means that line falls back to speechSynthesis.
// Playback rides the engine's context and unlock, so it works on iOS with the silent switch on (no <audio>).

import { readFile } from "../lib/network";

/** Set by vite.config.ts: whether public/voice/index.json existed at build (or dev server start). */
declare const __VOICE_INDEX__: boolean | undefined;

/** One take: `[pack, offset, bytes, ms]`. The byte range is a complete MP3 file inside the pack. */
export type Take = readonly [pack: number, offset: number, bytes: number, ms: number];

export interface VoiceIndex {
  v: 1;
  /** The recording voice and model, for the sound lab. */
  voice?: string;
  model?: string;
  /** File names next to index.json. */
  packs: readonly string[];
  /** Key to interchangeable takes; most keys have one. */
  clips: Readonly<Record<string, readonly Take[]>>;
}

export interface Playing {
  /** Resolves when the last clip ends, on stop(), or from a safety timer if `ended` never fires. */
  done: Promise<void>;
  stop(): void;
}

const INDEX_URL = typeof __VOICE_INDEX__ !== "undefined" && __VOICE_INDEX__ ? `${import.meta.env.BASE_URL}voice/index.json` : null;
/** Decoded audio kept in memory, in sample frames: about 85 s at 48 kHz, 16 MB. */
const CACHE_FRAMES = 4_000_000;
/** Bytes of read files kept, so a decode after a fetch ahead needs no second read. */
const FILE_MEMO_BYTES = 4 * 1024 * 1024;
/** WebKit can leave a decode hanging; past this the take counts as missing. */
const DECODE_TIMEOUT_MS = 8000;
/** The first clip starts this far ahead, so it is never scheduled in the past. */
const LEAD_S = 0.03;
/** stop() fades out over this long, so a cut never clicks. */
const FADE_S = 0.025;
/** On top of the clip length, in case iOS suspends the context mid-clip and `ended` never fires. */
const SAFETY_MS = 500;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isTake(t: unknown): t is Take {
  return Array.isArray(t) && t.length === 4 && t.every((n) => Number.isInteger(n) && n >= 0);
}

function parseIndex(data: unknown): VoiceIndex | null {
  const d = data as Partial<VoiceIndex> | null;
  if (!d || d.v !== 1 || !Array.isArray(d.packs) || !d.clips || typeof d.clips !== "object") return null;
  for (const takes of Object.values(d.clips)) if (!Array.isArray(takes) || !takes.every(isTake)) return null;
  return d as VoiceIndex;
}

function hasWebAudio(): boolean {
  return typeof window !== "undefined" && !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
}

/** decodeAudioData in both its callback and promise shapes (older WebKit only calls back), never hanging. */
function decode(ctx: BaseAudioContext, bytes: ArrayBuffer): Promise<AudioBuffer | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), DECODE_TIMEOUT_MS);
    const done = (b: AudioBuffer | null) => {
      clearTimeout(timer);
      resolve(b);
    };
    try {
      const p = ctx.decodeAudioData(bytes, done, () => done(null)) as Promise<AudioBuffer> | undefined;
      p?.catch(() => done(null));
    } catch {
      done(null);
    }
  });
}

const frames = (b: AudioBuffer) => b.length * b.numberOfChannels;

export interface ReadOpts {
  /** False: only files the device already has. Default true. */
  download?: boolean;
}

/** A pack file read or being read. `download` false: it looked only on the device. */
interface FileRead {
  job: Promise<ArrayBuffer | null>;
  download: boolean;
  bytes: number;
}

export class Clips {
  private index: VoiceIndex | null = null;
  private loading: Promise<void> | null = null;
  /** Decoded takes by `key#take`, least recently used first. */
  private readonly buffers = new Map<string, AudioBuffer>();
  private cached = 0;
  /** Keys whose takes are never evicted. */
  private readonly pinned = new Set<string>();
  private readonly decoding = new Map<string, Promise<AudioBuffer | null>>();
  /** Pack files by index, least recently used first. */
  private readonly files = new Map<number, FileRead>();
  private fileBytes = 0;
  private readonly lastTake = new Map<string, number>();

  constructor(
    private readonly ctx: () => AudioContext | null,
    private readonly out: () => AudioNode | null,
    private readonly indexUrl: string | null = INDEX_URL,
  ) {}

  /** True once an index is loaded and the browser has Web Audio. */
  get available(): boolean {
    return this.index !== null && hasWebAudio();
  }

  /** What the lab shows: who recorded the clips, and how many keys there are. Null without an index. */
  get info(): { voice?: string; model?: string; keys: number; packs: number } | null {
    const i = this.index;
    return i && { voice: i.voice, model: i.model, keys: Object.keys(i.clips).length, packs: i.packs.length };
  }

  /** Fetch voice/index.json once. Never throws; a failure leaves every line on speechSynthesis. */
  load(): Promise<void> {
    this.loading ??= this.fetchIndex();
    return this.loading;
  }

  /** True when every key has a recording. Says nothing about whether it is decoded yet. */
  has(keys: readonly string[]): boolean {
    const clips = this.index?.clips;
    return !!clips && keys.length > 0 && keys.every((k) => (clips[k]?.length ?? 0) > 0);
  }

  /** The keys with no recording. */
  missing(keys: readonly string[]): string[] {
    return keys.filter((k) => !this.has([k]));
  }

  /** True when every key has a take decoded, so play() can start it now. */
  ready(keys: readonly string[]): boolean {
    const clips = this.index?.clips;
    return !!clips && keys.length > 0 && keys.every((k) => clips[k]?.some((_, i) => this.buffers.has(`${k}#${i}`)));
  }

  /** Read the files these keys need without decoding them: a fetch ahead. Resolves true when every take was read. */
  async fetch(keys: readonly string[], opts: ReadOpts = {}): Promise<boolean> {
    await this.loading;
    const clips = this.index?.clips;
    if (!clips || !this.has(keys)) return false;
    const reads = await Promise.all(keys.flatMap((k) => clips[k].map(([pack]) => this.pack(pack, opts.download ?? true))));
    return reads.every(Boolean);
  }

  /** Decode the takes these keys need. Resolves true when all are ready within deadlineMs (they keep decoding after). */
  prepare(keys: readonly string[], deadlineMs?: number, opts: ReadOpts = {}): Promise<boolean> {
    const all = this.decodeAll(keys, opts.download ?? true);
    return deadlineMs === undefined ? all : Promise.race([all, wait(deadlineMs).then(() => false)]);
  }

  /** Like prepare(), and the takes are never evicted. */
  pin(keys: readonly string[]): Promise<boolean> {
    for (const k of keys) this.pinned.add(k);
    return this.prepare(keys);
  }

  /** Start after `leadMs`, back to back with `gapMs` between. Null if a clip is not decoded or the context is not running. */
  play(keys: readonly string[], gapMs: number, leadMs = 0): Playing | null {
    const ctx = this.ctx();
    const out = this.out();
    if (!ctx || !out || ctx.state !== "running" || keys.length === 0) return null;
    const bufs: AudioBuffer[] = [];
    for (const k of keys) {
      const b = this.take(k);
      if (!b) return null;
      bufs.push(b);
    }
    try {
      const gain = ctx.createGain();
      gain.connect(out);
      // Each source starts where the last one ends plus the gap, so the stitch is sample-accurate.
      let t = ctx.currentTime + LEAD_S + leadMs / 1000;
      const sources = bufs.map((b, i) => {
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(gain);
        s.start(t);
        t += b.duration + (i < bufs.length - 1 ? gapMs / 1000 : 0);
        return s;
      });
      let finish: (fade: boolean) => void = () => {};
      const done = new Promise<void>((resolve) => {
        let over = false;
        const timer = setTimeout(() => finish(false), (t - ctx.currentTime) * 1000 + SAFETY_MS);
        finish = (fade) => {
          if (over) return;
          over = true;
          clearTimeout(timer);
          const now = ctx.currentTime;
          try {
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.linearRampToValueAtTime(0, now + (fade ? FADE_S : 0.005));
          } catch {
            // ignore
          }
          for (const s of sources) {
            s.onended = null;
            try {
              s.stop(now + FADE_S);
            } catch {
              // already stopped
            }
          }
          // WebKit keeps connected nodes alive; let the fade finish, then let go.
          setTimeout(() => {
            try {
              gain.disconnect();
            } catch {
              // already disconnected
            }
          }, 100);
          resolve();
        };
        sources[sources.length - 1].onended = () => finish(false);
      });
      return { done, stop: () => finish(true) };
    } catch {
      return null;
    }
  }

  // ---------- internals ----------

  private async fetchIndex(): Promise<void> {
    if (!this.indexUrl || !hasWebAudio()) return;
    try {
      const res = await fetch(this.indexUrl);
      if (res.ok) this.index = parseIndex(await res.json());
    } catch {
      // offline with no saved copy, or not JSON: stay on speechSynthesis
    }
  }

  private async decodeAll(keys: readonly string[], download: boolean): Promise<boolean> {
    await this.loading;
    const ctx = this.ctx();
    const clips = this.index?.clips;
    if (!ctx || !clips || !this.has(keys)) return false;
    // A key is ready when any of its takes decoded.
    const ready = await Promise.all(
      keys.map(async (k) => (await Promise.all(clips[k].map((take, i) => this.decodeTake(ctx, `${k}#${i}`, take, download)))).some(Boolean)),
    );
    return ready.every(Boolean);
  }

  private decodeTake(ctx: BaseAudioContext, id: string, take: Take, download: boolean): Promise<AudioBuffer | null> {
    const have = this.buffers.get(id);
    if (have) {
      this.touch(id, have);
      return Promise.resolve(have);
    }
    let job = this.decoding.get(id);
    if (!job) {
      job = this.slice(take, download)
        .then((bytes) => (bytes ? decode(ctx, bytes) : null))
        .catch(() => null)
        .then((buf) => {
          this.decoding.delete(id);
          if (buf) this.keep(id, buf);
          return buf;
        });
      this.decoding.set(id, job);
    }
    return job;
  }

  /** A copy of the take's bytes: decoding detaches the buffer it is given. */
  private async slice([pack, offset, bytes]: Take, download: boolean): Promise<ArrayBuffer | null> {
    const data = await this.pack(pack, download);
    if (!data || offset + bytes > data.byteLength) return null;
    return data.slice(offset, offset + bytes);
  }

  private pack(i: number, download: boolean): Promise<ArrayBuffer | null> {
    const memo = this.files.get(i);
    if (memo) this.forget(i);
    if (memo && (memo.download || !download)) {
      this.files.set(i, memo);
      this.fileBytes += memo.bytes;
      return memo.job;
    }
    const name = this.index?.packs[i];
    if (!name || !this.indexUrl) return Promise.resolve(null);
    const url = this.indexUrl.slice(0, this.indexUrl.lastIndexOf("/") + 1) + name;
    // A look on the device still running goes on to a download if it finds nothing.
    const job = (memo?.job ?? Promise.resolve(null)).then((b) => b ?? readFile(url, { kind: "clip", download }));
    const read: FileRead = { job, download, bytes: 0 };
    this.files.set(i, read);
    void job.then((b) => {
      if (this.files.get(i) !== read) return;
      // A failed read is forgotten, so the next question tries again.
      if (!b) {
        this.forget(i);
        return;
      }
      read.bytes = b.byteLength;
      this.fileBytes += b.byteLength;
      for (const k of this.files.keys()) if (this.fileBytes > FILE_MEMO_BYTES && k !== i) this.forget(k);
    });
    return job;
  }

  private forget(i: number): void {
    const read = this.files.get(i);
    if (!read) return;
    this.files.delete(i);
    this.fileBytes -= read.bytes;
  }

  /** A decoded take for the key, at random among its ready takes, never the one played last when there is a choice. */
  private take(key: string): AudioBuffer | null {
    const takes = this.index?.clips[key];
    if (!takes) return null;
    const ready = takes.map((_, i) => i).filter((i) => this.buffers.has(`${key}#${i}`));
    if (ready.length === 0) return null;
    const last = this.lastTake.get(key);
    const pool = ready.length > 1 ? ready.filter((i) => i !== last) : ready;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this.lastTake.set(key, pick);
    const id = `${key}#${pick}`;
    const buf = this.buffers.get(id)!;
    this.touch(id, buf);
    return buf;
  }

  private touch(id: string, buf: AudioBuffer): void {
    this.buffers.delete(id);
    this.buffers.set(id, buf);
  }

  private keep(id: string, buf: AudioBuffer): void {
    if (this.buffers.has(id)) return;
    this.buffers.set(id, buf);
    this.cached += frames(buf);
    for (const [k, b] of this.buffers) {
      if (this.cached <= CACHE_FRAMES) break;
      if (k === id || this.pinned.has(k.slice(0, k.lastIndexOf("#")))) continue;
      this.buffers.delete(k);
      this.cached -= frames(b);
    }
  }
}
