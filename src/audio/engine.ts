// The live engine: one AudioContext, the master chain, song crossfades, sfx, and the iOS unlock dance.

import type { Audio, SfxId, SongId } from "./index";
import { SongPlayer } from "./player";
import { SFX, type SfxHandle } from "./sfx";
import { SONGS } from "./songs";
import { createChain, type Chain } from "./synth";

/** Calls closer together than this are dropped, so rapid-fire UI sounds do not pile up. */
const MIN_GAP: Partial<Record<SfxId, number>> = {
  tap: 0.03,
  select: 0.03,
  back: 0.03,
  whoosh: 0.06,
  swipe: 0.06,
  tick: 0.06,
  tickUrgent: 0.06,
  points: 0.035,
  pop: 0.025,
};

const SONG_CROSSFADE = 0.7;
const DUCK_LEVEL = 0.3;

/** Perceptual taper for 0..1 sliders. */
const taper = (v: number) => {
  const x = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  return x * x;
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

function setPlaybackSession(): void {
  try {
    // iOS 16.4+: "playback" keeps sound on when the ringer/silent switch is set to silent.
    const s = (navigator as AudioSessionNavigator).audioSession;
    if (s && s.type !== "playback") s.type = "playback";
  } catch {
    // not supported
  }
}

export class Engine implements Audio {
  private ctx: AudioContext | null = null;
  private chain: Chain | null = null;
  private meter: AnalyserNode | null = null;
  private meterBuf: Float32Array<ArrayBuffer> | null = null;
  private song: { id: SongId; player: SongPlayer } | null = null;
  private pending: SongId | null = null;
  private roll: SfxHandle | null = null;
  private readonly lastAt = new Map<SfxId, number>();
  private readonly runs = new Map<SfxId, number>();
  private count = 0;
  private musicVolume = 0.6;
  private sfxVolume = 0.8;
  private ducked = false;
  private wasUnlocked = false;
  private hiddenSuspend = false;
  private gestureArmed = false;

  get unlocked(): boolean {
    return this.wasUnlocked;
  }

  /** For the sound lab. */
  get status(): { state: string; song: SongId | null; pending: SongId | null; ducked: boolean; sampleRate: number } {
    return {
      state: this.ctx?.state ?? "not created",
      song: this.song?.id ?? null,
      pending: this.pending,
      ducked: this.ducked,
      sampleRate: this.ctx?.sampleRate ?? 0,
    };
  }

  /** Output level right now, RMS 0..1. For the sound lab meter and QA. */
  level(): number {
    if (!this.meter || !this.meterBuf) return 0;
    this.meter.getFloatTimeDomainData(this.meterBuf);
    let sum = 0;
    for (const v of this.meterBuf) sum += v * v;
    return Math.sqrt(sum / this.meterBuf.length);
  }

  unlock(): Promise<void> {
    try {
      setPlaybackSession();
      const ctx = this.ensureContext();
      if (!ctx) return Promise.resolve();
      const resumed = this.nudge(ctx);
      if (ctx.state === "running") {
        this.markUnlocked();
        return Promise.resolve();
      }
      // Never hang the caller: iOS can leave resume() pending forever outside a gesture.
      return Promise.race([resumed, wait(900)]).then(() => {
        if (ctx.state === "running") this.markUnlocked();
        else this.armGestureResume();
      });
    } catch {
      return Promise.resolve();
    }
  }

  playSong(id: SongId): void {
    try {
      const song = SONGS[id];
      if (!song) return;
      if (!this.ready()) {
        this.pending = id;
        return;
      }
      if (this.song?.id === id) return;
      this.pending = null;
      const ctx = this.ctx!;
      const prev = this.song;
      prev?.player.fadeOut(SONG_CROSSFADE);
      const player = new SongPlayer(ctx, song, this.chain!.music);
      player.start(ctx.currentTime + 0.06, prev ? SONG_CROSSFADE * 0.8 : 0.03);
      player.run();
      this.song = { id, player };
    } catch {
      // never throw into the UI
    }
  }

  stopSong(fadeMs = 600): void {
    try {
      this.pending = null;
      const cur = this.song;
      this.song = null;
      cur?.player.fadeOut(Math.max(0, fadeMs) / 1000);
    } catch {
      // never throw into the UI
    }
  }

  sfx(id: SfxId): void {
    try {
      const ctx = this.ctx;
      const fx = SFX[id];
      if (!fx || !ctx || !this.chain || !this.wasUnlocked || ctx.state !== "running") return;
      const now = ctx.currentTime;
      this.stopRoll(now);
      const last = this.lastAt.get(id) ?? -Infinity;
      if (now - last < (MIN_GAP[id] ?? 0)) return;
      // `points` climbs in pitch while calls keep coming; other sounds get a fresh counter for variety.
      const run = now - last < 0.3 ? (this.runs.get(id) ?? 0) + 1 : 0;
      this.lastAt.set(id, now);
      this.runs.set(id, run);
      const handle = fx(ctx, this.chain.sfx, now + 0.005, id === "points" ? run : this.count++);
      if (handle) this.roll = handle;
    } catch {
      // never throw into the UI
    }
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    this.ramp(this.chain?.music.gain, taper(v), 0.03);
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = v;
    this.ramp(this.chain?.sfx.gain, taper(v), 0.03);
  }

  duck(on: boolean): void {
    this.ducked = on;
    this.ramp(this.chain?.duck.gain, on ? DUCK_LEVEL : 1, on ? 0.06 : 0.25);
  }

  // ---------- internals ----------

  private ready(): boolean {
    return !!(this.ctx && this.chain && this.wasUnlocked);
  }

  private ramp(p: AudioParam | undefined, value: number, tau: number): void {
    try {
      if (!p || !this.ctx) return;
      p.setTargetAtTime(value, this.ctx.currentTime, tau);
    } catch {
      // ignore
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === "undefined") return null;
    const C: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    let ctx: AudioContext;
    try {
      ctx = new C({ latencyHint: "interactive" });
    } catch {
      ctx = new C();
    }
    this.ctx = ctx;
    this.chain = createChain(ctx);
    this.chain.music.gain.value = taper(this.musicVolume);
    this.chain.sfx.gain.value = taper(this.sfxVolume);
    this.chain.duck.gain.value = this.ducked ? DUCK_LEVEL : 1;
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 2048;
    this.meterBuf = new Float32Array(this.meter.fftSize);
    this.chain.out.connect(this.meter);
    ctx.onstatechange = () => this.onState();
    document.addEventListener("visibilitychange", () => this.onVisibility());
    return ctx;
  }

  /** Play one silent sample and resume. Must run inside a user gesture to count on iOS. */
  private nudge(ctx: AudioContext): Promise<void> {
    try {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      // ignore
    }
    if (ctx.state === "running") return Promise.resolve();
    try {
      return ctx.resume().catch(() => {});
    } catch {
      return Promise.resolve();
    }
  }

  private markUnlocked(): void {
    if (this.wasUnlocked) return;
    this.wasUnlocked = true;
    const p = this.pending;
    if (p) this.playSong(p);
  }

  private onState(): void {
    const ctx = this.ctx;
    if (!ctx || !this.wasUnlocked || this.hiddenSuspend || document.hidden) return;
    const st = ctx.state as string;
    // iOS reports "interrupted" after a call, Siri, or another app grabbing audio.
    if (st === "interrupted" || st === "suspended") {
      ctx.resume().catch(() => {});
      this.armGestureResume();
    }
  }

  private onVisibility(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (document.hidden) {
      this.hiddenSuspend = true;
      this.stopRoll(ctx.currentTime);
      ctx.suspend().catch(() => {});
      return;
    }
    this.hiddenSuspend = false;
    if (!this.wasUnlocked) return;
    ctx.resume().catch(() => {});
    setTimeout(() => {
      if (ctx.state !== "running") this.armGestureResume();
    }, 400);
  }

  /** Resume on the next tap or key press, for when iOS will not resume without one. */
  private armGestureResume(): void {
    if (this.gestureArmed || typeof window === "undefined") return;
    this.gestureArmed = true;
    const events = ["pointerdown", "pointerup", "touchend", "keydown", "click"] as const;
    const done = () => {
      this.gestureArmed = false;
      for (const e of events) window.removeEventListener(e, handler, true);
    };
    const handler = () => {
      const ctx = this.ctx;
      if (!ctx) return done();
      setPlaybackSession();
      this.nudge(ctx).then(() => {
        if (ctx.state === "running") {
          done();
          this.markUnlocked();
        }
      });
    };
    for (const e of events) window.addEventListener(e, handler, { capture: true, passive: true });
  }

  private stopRoll(at: number): void {
    if (!this.roll) return;
    this.roll.stop(at);
    this.roll = null;
  }
}
