// Sound effects, all synthesized. Each one renders into `out` at time `t` on any BaseAudioContext.

import type { SfxId } from "./index";
import { hz, midi } from "./dsl";
import { SongPlayer } from "./player";
import { JINGLES } from "./songs";
import {
  endWith,
  filter,
  gainNode,
  noise,
  playBlock,
  playCrash,
  playKick,
  playSnare,
  setWave,
  type Vibrato,
  type WaveName,
} from "./synth";

export interface SfxHandle {
  /** Stop early with a short fade (the drumroll, the prize and fanfare jingles). */
  stop(at: number): void;
}

type Sfx = (ctx: BaseAudioContext, out: AudioNode, t: number, seq: number) => SfxHandle | void;

interface ToneOpts {
  wave?: WaveName;
  f: number;
  /** Glide to this frequency over `glide` seconds (exponential). */
  to?: number;
  glide?: number;
  a?: number;
  hold?: number;
  /** Decay to silence after attack + hold. */
  d: number;
  peak: number;
  vib?: Vibrato;
  lp?: number;
  detune?: number;
}

function tone(ctx: BaseAudioContext, out: AudioNode, t: number, o: ToneOpts): number {
  const osc = ctx.createOscillator();
  setWave(osc, o.wave ?? "triangle");
  osc.frequency.setValueAtTime(o.f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? o.d));
  if (o.detune) osc.detune.value = o.detune;
  const a = o.a ?? 0.003;
  const hold = o.hold ?? 0;
  const end = t + a + hold + o.d;
  const g = gainNode(ctx, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.peak, t + a);
  if (hold) g.gain.setValueAtTime(o.peak, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0008, end);
  if (o.vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.vib.rate;
    const depth = gainNode(ctx, 0);
    depth.gain.setValueAtTime(0, t + o.vib.delay);
    depth.gain.linearRampToValueAtTime(o.vib.cents, t + o.vib.delay + 0.08);
    lfo.connect(depth).connect(osc.detune);
    lfo.start(t);
    lfo.stop(end + 0.02);
    endWith(lfo, depth);
  }
  let head: AudioNode = osc.connect(g);
  if (o.lp) head = head.connect(filter(ctx, "lowpass", o.lp));
  head.connect(out);
  osc.start(t);
  osc.stop(end + 0.02);
  endWith(osc, head);
  return end;
}

interface NoiseOpts {
  type: BiquadFilterType;
  f: number;
  /** Sweep the filter: [time offset, frequency] points, exponential. */
  sweep?: Array<[number, number]>;
  q?: number;
  a?: number;
  d: number;
  peak: number;
}

function hiss(ctx: BaseAudioContext, out: AudioNode, t: number, o: NoiseOpts): void {
  const a = o.a ?? 0.003;
  const n = noise(ctx, t, a + o.d);
  const f = filter(ctx, o.type, o.f, o.q ?? 0.8);
  f.frequency.setValueAtTime(o.f, t);
  for (const [dt, freq] of o.sweep ?? []) f.frequency.exponentialRampToValueAtTime(freq, t + dt);
  const g = gainNode(ctx, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0008, t + a + o.d);
  n.connect(f).connect(g).connect(out);
  endWith(n, g);
}

const n = (name: string) => hz(midi(name));

/** Deterministic pseudo-random in [0, 1) from a counter, so offline renders are repeatable. */
const rand = (seq: number) => {
  const x = Math.sin(seq * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const isLive = (ctx: BaseAudioContext) => typeof (ctx as AudioContext).close === "function";

/** Fade a bus gain to silence from `at` over `sec`, then unplug it. */
function fadeAway(g: GainNode, at: number, sec: number): void {
  try {
    g.gain.cancelScheduledValues(at);
    g.gain.setValueAtTime(g.gain.value, at);
    g.gain.linearRampToValueAtTime(0, at + sec);
    setTimeout(() => g.disconnect(), sec * 1000 + 260);
  } catch {
    // already gone
  }
}

function jingle(song: (typeof JINGLES)[keyof typeof JINGLES]) {
  return (ctx: BaseAudioContext, out: AudioNode, t: number): SfxHandle => {
    const p = new SongPlayer(ctx, song, out);
    p.start(t, 0.005);
    p.scheduleUntil(Infinity);
    if (isLive(ctx)) setTimeout(() => p.dispose(), (p.loopSeconds + 3) * 1000);
    return { stop: () => p.fadeOut(0.2) };
  };
}

export const SFX: Record<SfxId, Sfx> = {
  tap(ctx, out, t) {
    tone(ctx, out, t, { f: 920, to: 700, glide: 0.05, d: 0.07, peak: 0.34 });
    tone(ctx, out, t, { wave: "pulse50", f: 1840, d: 0.018, peak: 0.05, lp: 4000 });
  },

  select(ctx, out, t) {
    tone(ctx, out, t, { wave: "pulse50", f: n("g5"), d: 0.06, peak: 0.16, lp: 3200 });
    tone(ctx, out, t, { f: n("g4"), d: 0.06, peak: 0.2 });
    tone(ctx, out, t + 0.055, { wave: "pulse50", f: n("d6"), d: 0.13, peak: 0.16, lp: 3200 });
    tone(ctx, out, t + 0.055, { f: n("d5"), d: 0.13, peak: 0.2 });
  },

  back(ctx, out, t) {
    tone(ctx, out, t, { wave: "pulse50", f: n("d6"), d: 0.05, peak: 0.13, lp: 2800 });
    tone(ctx, out, t, { f: n("d5"), d: 0.05, peak: 0.18 });
    tone(ctx, out, t + 0.06, { wave: "pulse50", f: n("g5"), d: 0.12, peak: 0.13, lp: 2800 });
    tone(ctx, out, t + 0.06, { f: n("g4"), d: 0.12, peak: 0.18 });
  },

  whoosh(ctx, out, t) {
    hiss(ctx, out, t, { type: "bandpass", f: 300, q: 1.3, a: 0.16, d: 0.26, peak: 0.55, sweep: [[0.17, 2400], [0.4, 500]] });
  },

  swipe(ctx, out, t) {
    hiss(ctx, out, t, { type: "bandpass", f: 700, q: 1.6, a: 0.05, d: 0.17, peak: 0.7, sweep: [[0.16, 4200]] });
    tone(ctx, out, t, { wave: "sine", f: 320, to: 980, glide: 0.12, a: 0.01, d: 0.12, peak: 0.17 });
  },

  whosThat(ctx, out, t) {
    // Rising sweep for 0.9 s, then a big hit.
    const rise = 0.9;
    for (const [wave, det] of [
      ["pulse25", 0],
      ["pulse50", 9],
    ] as const) {
      const osc = ctx.createOscillator();
      setWave(osc, wave);
      osc.detune.value = det;
      osc.frequency.setValueAtTime(n("c3"), t);
      osc.frequency.exponentialRampToValueAtTime(n("c6"), t + rise);
      const lp = filter(ctx, "lowpass", 500, 2);
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.exponentialRampToValueAtTime(4200, t + rise);
      const g = gainNode(ctx, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.11, t + rise - 0.05);
      g.gain.linearRampToValueAtTime(0, t + rise + 0.02);
      osc.connect(lp).connect(g).connect(out);
      osc.start(t);
      osc.stop(t + rise + 0.05);
      endWith(osc, g);
    }
    hiss(ctx, out, t, { type: "bandpass", f: 700, q: 1, a: rise - 0.05, d: 0.06, peak: 0.16, sweep: [[rise, 6000]] });
    const hit = t + rise;
    playKick(ctx, out, hit, 0.6);
    playCrash(ctx, out, hit, 0.16, 1.1);
    for (const note of ["g4", "b4", "d5", "g5"]) {
      tone(ctx, out, hit, { wave: "pulse25", f: n(note), a: 0.003, hold: 0.08, d: 0.7, peak: 0.085, lp: 4200 });
    }
    tone(ctx, out, hit, { wave: "bass", f: n("g2"), hold: 0.1, d: 0.6, peak: 0.3 });
  },

  reveal(ctx, out, t) {
    for (const note of ["c4", "e4", "g4", "c5", "e5"]) {
      tone(ctx, out, t, { wave: "pulse50", f: n(note), a: 0.008, d: 1.2, peak: 0.065, lp: 2800 });
    }
    tone(ctx, out, t, { wave: "bass", f: n("c3"), a: 0.006, d: 0.9, peak: 0.3 });
    ["g5", "c6", "e6", "g6", "c7", "e6", "g6", "c7", "e7"].forEach((note, i) => {
      tone(ctx, out, t + 0.03 + i * 0.034, { wave: "sine", f: n(note), d: 0.28, peak: 0.08 });
    });
    hiss(ctx, out, t, { type: "highpass", f: 5200, a: 0.03, d: 0.5, peak: 0.05 });
  },

  correct(ctx, out, t) {
    const notes = ["c5", "e5", "g5", "c6"];
    notes.forEach((note, i) => {
      const last = i === notes.length - 1;
      const at = t + i * 0.065;
      tone(ctx, out, at, {
        wave: "pulse25",
        f: n(note),
        hold: last ? 0.18 : 0.03,
        d: last ? 0.35 : 0.08,
        peak: 0.21,
        lp: 4800,
        vib: last ? { rate: 7, cents: 18, delay: 0.08 } : undefined,
      });
      tone(ctx, out, at, { f: n(note) / 2, hold: last ? 0.15 : 0.02, d: last ? 0.3 : 0.08, peak: 0.25 });
    });
    tone(ctx, out, t + 0.2, { wave: "sine", f: n("e6"), d: 0.45, peak: 0.08 });
  },

  wrong(ctx, out, t) {
    // "bwo-womp": two soft falling notes, the second one sagging with a slow wobble.
    tone(ctx, out, t, { f: n("e4"), to: n("d#4"), glide: 0.16, a: 0.01, hold: 0.06, d: 0.13, peak: 0.24 });
    tone(ctx, out, t, { wave: "bass", f: n("e3"), to: n("d#3"), glide: 0.16, a: 0.01, hold: 0.06, d: 0.13, peak: 0.11, lp: 900 });
    const t2 = t + 0.24;
    const v = { rate: 6.5, cents: 35, delay: 0.1 };
    tone(ctx, out, t2, { f: n("c4"), to: n("a3"), glide: 0.45, a: 0.015, hold: 0.2, d: 0.32, peak: 0.26, vib: v });
    tone(ctx, out, t2, { wave: "bass", f: n("c3"), to: n("a2"), glide: 0.45, a: 0.015, hold: 0.2, d: 0.32, peak: 0.12, lp: 800, vib: v });
  },

  timeout(ctx, out, t) {
    // Three buzzes, the last one longer: "bzz bzz bzzzt".
    [
      [0, 0.1],
      [0.16, 0.1],
      [0.32, 0.3],
    ].forEach(([dt, len]) => {
      for (const det of [0, 32]) {
        tone(ctx, out, t + dt, { wave: "pulse50", f: 165, detune: det, a: 0.005, hold: len, d: 0.05, peak: 0.095, lp: 1300 });
      }
      tone(ctx, out, t + dt, { wave: "triangle", f: 82.5, a: 0.005, hold: len, d: 0.05, peak: 0.18 });
    });
  },

  tick(ctx, out, t) {
    playBlock(ctx, out, t, 0.42, 1150);
  },

  tickUrgent(ctx, out, t) {
    playBlock(ctx, out, t, 0.42, 1560);
    playBlock(ctx, out, t, 0.26, 780);
  },

  streak(ctx, out, t) {
    ["g4", "c5", "e5", "g5", "c6", "e6"].forEach((note, i) => {
      tone(ctx, out, t + i * 0.042, { wave: "pulse25", f: n(note), d: 0.09, peak: 0.17, lp: 5000 });
    });
    tone(ctx, out, t, { wave: "sine", f: 330, to: 1320, glide: 0.3, a: 0.02, hold: 0.12, d: 0.2, peak: 0.16, vib: { rate: 14, cents: 60, delay: 0 } });
    const end = t + 0.26;
    for (const note of ["c6", "e6", "g6"]) tone(ctx, out, end, { wave: "sine", f: n(note), a: 0.005, d: 0.5, peak: 0.075 });
    tone(ctx, out, end, { wave: "pulse50", f: n("c5"), hold: 0.05, d: 0.35, peak: 0.14, lp: 3000, vib: { rate: 7, cents: 15, delay: 0.05 } });
  },

  points(ctx, out, t, seq) {
    // Pitch climbs while the counter keeps rolling, like coins piling up.
    const f = n("c6") * 2 ** (Math.min(seq, 12) / 12);
    tone(ctx, out, t, { f, d: 0.045, peak: 0.24 });
    tone(ctx, out, t, { wave: "pulse12", f, d: 0.03, peak: 0.05, lp: 4500 });
  },

  fanfare: jingle(JINGLES.fanfare),

  prize(ctx, out, t) {
    const song = jingle(JINGLES.prize)(ctx, out, t);
    // Extra glitter on the final chord, on its own gain so stopping the prize stops it too.
    const glitter = gainNode(ctx, 1);
    glitter.connect(out);
    const at = t + (24 * 60) / 150 / 4;
    for (let i = 0; i < 14; i++) {
      const notes = ["c7", "g6", "e7", "c7", "g6", "e6"];
      tone(ctx, glitter, at + 0.15 + i * 0.07, { wave: "sine", f: n(notes[i % notes.length]), d: 0.2, peak: 0.05 * (1 - i / 16) });
    }
    if (isLive(ctx)) setTimeout(() => glitter.disconnect(), 7000);
    return {
      stop(when: number) {
        song.stop(when);
        fadeAway(glitter, when, 0.2);
      },
    };
  },

  drumroll(ctx, out, t) {
    const g = gainNode(ctx, 1);
    g.connect(out);
    const max = 6;
    const every = 1 / 22;
    for (let i = 0; i * every < max; i++) {
      const at = t + i * every;
      const swell = Math.min(1, (at - t) / 3);
      playSnare(ctx, g, at, (0.18 + 0.24 * swell) * (i % 2 ? 0.85 : 1), { decay: 0.07, tone: 210 });
    }
    return { stop: (at: number) => fadeAway(g, at, 0.04) };
  },

  pop(ctx, out, t, seq) {
    const f = 380 * 2 ** ((Math.floor(rand(seq) * 7) - 3) / 12);
    tone(ctx, out, t, { wave: "sine", f, to: f * 3.2, glide: 0.035, a: 0.002, d: 0.06, peak: 0.32 });
  },
};

export const SFX_IDS = Object.keys(SFX) as SfxId[];
