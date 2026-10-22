// Chiptune voices and the master chain. Everything takes a BaseAudioContext, so the same code renders
// live (AudioContext) and offline (OfflineAudioContext) for measurement and WAV export.

export type WaveName = "pulse12" | "pulse25" | "pulse50" | "bass" | "theremin" | "triangle" | "sine";

export interface Env {
  /** Attack, decay and release in seconds; sustain is a level 0..1. */
  a: number;
  d: number;
  s: number;
  r: number;
}

export interface Vibrato {
  rate: number;
  cents: number;
  /** Seconds before the vibrato fades in. */
  delay: number;
}

export type Inst =
  | {
      kind: "tone";
      wave: WaveName;
      env: Env;
      vib?: Vibrato;
      /** Monophonic with portamento of this time constant (seconds). */
      glide?: number;
      lp?: number;
    }
  | { kind: "kick" }
  | { kind: "snare"; decay?: number; tone?: number; brush?: boolean }
  | { kind: "hat"; decay: number }
  | { kind: "block"; freq: number }
  | { kind: "crash"; decay?: number };

export type ToneInst = Extract<Inst, { kind: "tone" }>;

// ---------- waves ----------

const waveCache = new WeakMap<BaseAudioContext, Map<WaveName, PeriodicWave>>();

function buildWave(ctx: BaseAudioContext, name: WaveName): PeriodicWave {
  const n = 48;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  const duty = name === "pulse12" ? 0.125 : name === "pulse25" ? 0.25 : 0.5;
  for (let k = 1; k < n; k++) {
    if (name.startsWith("pulse")) {
      // Fourier series of a pulse with the given duty, gently tapered so the top end is not harsh.
      const taper = 1 / (1 + (k / 26) ** 2);
      real[k] = (Math.sin(2 * Math.PI * k * duty) / (Math.PI * k)) * taper;
      imag[k] = ((1 - Math.cos(2 * Math.PI * k * duty)) / (Math.PI * k)) * taper;
    } else if (name === "bass") {
      // Fat triangle: odd harmonics at 1/k^1.6 plus a little 2nd, so it still reads on small speakers.
      if (k % 2 === 1 && k < 24) imag[k] = 1 / k ** 1.6;
      if (k === 2) imag[k] = 0.12;
    } else if (name === "theremin") {
      if (k === 1) imag[k] = 1;
      if (k === 2) imag[k] = 0.14;
      if (k === 3) imag[k] = 0.06;
    }
  }
  return ctx.createPeriodicWave(real, imag);
}

export function setWave(osc: OscillatorNode, name: WaveName): void {
  if (name === "triangle" || name === "sine") {
    osc.type = name;
    return;
  }
  const ctx = osc.context;
  let map = waveCache.get(ctx);
  if (!map) waveCache.set(ctx, (map = new Map()));
  let w = map.get(name);
  if (!w) map.set(name, (w = buildWave(ctx, name)));
  osc.setPeriodicWave(w);
}

// ---------- noise ----------

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (b) return b;
  b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  let seed = 0x2f6b1e3;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    d[i] = seed / 2147483648 - 1;
  }
  noiseCache.set(ctx, b);
  return b;
}

export function noise(ctx: BaseAudioContext, t: number, dur: number): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  s.start(t, (t * 7.31) % 0.9);
  s.stop(t + dur + 0.02);
  return s;
}

/**
 * Disconnect the node that feeds the bus once a voice finishes. WebKit keeps connected nodes alive, so
 * without this a long party slowly leaks finished voices on the iPad.
 */
export function endWith(src: AudioScheduledSourceNode, ...tails: AudioNode[]): void {
  src.onended = () => {
    for (const n of tails) {
      try {
        n.disconnect();
      } catch {
        // already disconnected
      }
    }
  };
}

export function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

export function gainNode(ctx: BaseAudioContext, value = 1): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

// ---------- envelopes ----------

/** ADSR on a gain param. Returns when the voice can stop. */
export function adsr(p: AudioParam, t: number, dur: number, e: Env, peak: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + e.a);
  if (e.s < 1) p.setTargetAtTime(peak * e.s, t + e.a, Math.max(0.002, e.d / 3));
  const off = Math.max(t + e.a, t + dur);
  p.setTargetAtTime(0, off, Math.max(0.002, e.r / 3));
  return off + e.r * 2 + 0.03;
}

function addVibrato(ctx: BaseAudioContext, osc: OscillatorNode, v: Vibrato, t: number, stop: number): void {
  if (stop - t <= v.delay) return;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = v.rate;
  const depth = gainNode(ctx, 0);
  depth.gain.setValueAtTime(0, t + v.delay);
  depth.gain.linearRampToValueAtTime(v.cents, t + v.delay + 0.25);
  lfo.connect(depth).connect(osc.detune);
  lfo.start(t);
  lfo.stop(stop);
  endWith(lfo, depth);
}

// ---------- voices ----------

/** One polyphonic note. */
export function playTone(
  ctx: BaseAudioContext,
  dest: AudioNode,
  inst: ToneInst,
  freq: number,
  t: number,
  dur: number,
  vel: number,
): void {
  const osc = ctx.createOscillator();
  setWave(osc, inst.wave);
  osc.frequency.value = freq;
  const vca = gainNode(ctx, 0);
  const stop = adsr(vca.gain, t, dur, inst.env, vel);
  if (inst.vib) addVibrato(ctx, osc, inst.vib, t, stop);
  osc.connect(vca).connect(dest);
  osc.start(t);
  osc.stop(stop);
  endWith(osc, vca);
}

/** A monophonic voice that glides between notes (the theremin). Lives as long as the song. */
export class MonoVoice {
  private readonly osc: OscillatorNode;
  private readonly vca: GainNode;
  private readonly lfo: OscillatorNode | null = null;
  private started = false;

  constructor(
    ctx: BaseAudioContext,
    dest: AudioNode,
    private readonly inst: ToneInst,
    t: number,
  ) {
    this.osc = ctx.createOscillator();
    setWave(this.osc, inst.wave);
    this.vca = gainNode(ctx, 0);
    this.osc.connect(this.vca).connect(dest);
    this.osc.start(t);
    if (inst.vib) {
      this.lfo = ctx.createOscillator();
      this.lfo.frequency.value = inst.vib.rate;
      const depth = gainNode(ctx, inst.vib.cents);
      this.lfo.connect(depth).connect(this.osc.detune);
      this.lfo.start(t);
    }
  }

  note(freq: number, t: number, dur: number, vel: number): void {
    const { env, glide = 0.04 } = this.inst;
    if (this.started) this.osc.frequency.setTargetAtTime(freq, t, glide);
    else this.osc.frequency.setValueAtTime(freq, t);
    this.started = true;
    const g = this.vca.gain;
    g.setTargetAtTime(vel, t, Math.max(0.003, env.a / 3));
    if (env.s < 1) g.setTargetAtTime(vel * env.s, t + env.a, Math.max(0.003, env.d / 3));
    g.setTargetAtTime(0, t + dur, Math.max(0.003, env.r / 3));
  }

  stop(t: number): void {
    try {
      this.vca.gain.setTargetAtTime(0, t, 0.03);
      endWith(this.osc, this.vca);
      this.osc.stop(t + 0.3);
      this.lfo?.stop(t + 0.3);
    } catch {
      // already stopped
    }
  }
}

export function playKick(ctx: BaseAudioContext, dest: AudioNode, t: number, vel: number): void {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(170, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.1);
  const g = gainNode(ctx, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.24);
  endWith(o, g);
  // A short click so the kick still reads on speakers with no low end.
  const n = noise(ctx, t, 0.012);
  const lp = filter(ctx, "lowpass", 2600);
  const ng = gainNode(ctx, 0);
  ng.gain.setValueAtTime(vel * 0.3, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
  n.connect(lp).connect(ng).connect(dest);
  endWith(n, ng);
}

export function playSnare(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  vel: number,
  o: { decay?: number; tone?: number; brush?: boolean } = {},
): void {
  const decay = o.decay ?? (o.brush ? 0.12 : 0.16);
  const n = noise(ctx, t, decay + 0.02);
  const bp = filter(ctx, "bandpass", o.brush ? 2600 : 1900, 0.7);
  const hp = filter(ctx, "highpass", 500);
  const ng = gainNode(ctx, 0);
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(vel, t + (o.brush ? 0.008 : 0.001));
  ng.gain.exponentialRampToValueAtTime(0.001, t + decay);
  n.connect(bp).connect(hp).connect(ng).connect(dest);
  endWith(n, ng);
  if (o.brush) return;
  const body = ctx.createOscillator();
  body.type = "triangle";
  const f = o.tone ?? 190;
  body.frequency.setValueAtTime(f, t);
  body.frequency.exponentialRampToValueAtTime(f * 0.72, t + 0.06);
  const bg = gainNode(ctx, 0);
  bg.gain.setValueAtTime(vel * 0.7, t);
  bg.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  body.connect(bg).connect(dest);
  body.start(t);
  body.stop(t + 0.1);
  endWith(body, bg);
}

export function playHat(ctx: BaseAudioContext, dest: AudioNode, t: number, vel: number, decay: number): void {
  const n = noise(ctx, t, decay + 0.02);
  const hp = filter(ctx, "highpass", 6500);
  const lp = filter(ctx, "lowpass", 11000);
  const g = gainNode(ctx, 0);
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  n.connect(hp).connect(lp).connect(g).connect(dest);
  endWith(n, g);
}

export function playCrash(ctx: BaseAudioContext, dest: AudioNode, t: number, vel: number, decay = 1.2): void {
  const n = noise(ctx, t, decay + 0.05);
  const hp = filter(ctx, "highpass", 3200);
  const lp = filter(ctx, "lowpass", 10000);
  const g = gainNode(ctx, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  n.connect(hp).connect(lp).connect(g).connect(dest);
  endWith(n, g);
}

/** Woodblock: a sine with an inharmonic partial and a tiny click. */
export function playBlock(ctx: BaseAudioContext, dest: AudioNode, t: number, vel: number, freq: number): void {
  for (const [mul, amp, dec] of [
    [1, 1, 0.06],
    [2.71, 0.35, 0.025],
  ] as const) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq * mul * 1.04, t);
    o.frequency.exponentialRampToValueAtTime(freq * mul, t + 0.012);
    const g = gainNode(ctx, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * amp, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.001, t + dec);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dec + 0.02);
    endWith(o, g);
  }
  const n = noise(ctx, t, 0.006);
  const bp = filter(ctx, "bandpass", freq * 2, 2);
  const ng = gainNode(ctx, 0);
  ng.gain.setValueAtTime(vel * 0.4, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.006);
  n.connect(bp).connect(ng).connect(dest);
  endWith(n, ng);
}

export function playDrum(ctx: BaseAudioContext, dest: AudioNode, inst: Inst, t: number, vel: number): void {
  switch (inst.kind) {
    case "kick":
      return playKick(ctx, dest, t, vel);
    case "snare":
      return playSnare(ctx, dest, t, vel, inst);
    case "hat":
      return playHat(ctx, dest, t, vel, inst.decay);
    case "crash":
      return playCrash(ctx, dest, t, vel, inst.decay);
    case "block":
      return playBlock(ctx, dest, t, vel, inst.freq);
    case "tone":
      return;
  }
}

// ---------- master chain ----------

export interface Chain {
  /** Music volume. */
  music: GainNode;
  /** Announcer ducking, after the music volume. */
  duck: GainNode;
  sfx: GainNode;
  master: GainNode;
  /** The last node before the destination, for meters. */
  out: AudioNode;
}

/** Linear below 0.85, then a soft knee that never passes 0.953. A safety net behind the limiter. */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 4097;
  const c = new Float32Array(n);
  const knee = 0.85;
  const room = 0.12;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

export function createChain(ctx: BaseAudioContext, dest: AudioNode = ctx.destination): Chain {
  const music = gainNode(ctx);
  const duck = gainNode(ctx);
  const sfx = gainNode(ctx);
  const master = gainNode(ctx, 0.8);
  // Soften the top end a little: kinder to small ears and to cheap projector speakers.
  const shelf = ctx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 6500;
  shelf.gain.value = -4;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 12;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.006;
  comp.release.value = 0.2;
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -4;
  limit.knee.value = 0;
  limit.ratio.value = 20;
  limit.attack.value = 0.001;
  limit.release.value = 0.1;
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();
  // The compressors add automatic makeup gain; trim it back so the ceiling sits near -2.5 dBFS.
  const trim = gainNode(ctx, 0.9);
  music.connect(duck).connect(master);
  sfx.connect(master);
  master.connect(shelf).connect(comp).connect(limit).connect(trim).connect(clip).connect(dest);
  return { music, duck, sfx, master, out: clip };
}
