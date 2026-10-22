// Render songs and sfx through the real engine code into an OfflineAudioContext, measure them, and
// encode WAV. Used by the sound lab and by QA to check levels without ears.

import type { SfxId, SongId } from "./index";
import { SongPlayer } from "./player";
import { SFX } from "./sfx";
import { SONGS } from "./songs";
import { createChain, gainNode } from "./synth";

export interface RenderOpts {
  sampleRate?: number;
  /** Bus volume 0..1 through the same taper as the settings sliders. Default 1 (worst case for peaks). */
  volume?: number;
  /** false = skip the master chain (raw mix, to see how hard the limiter works). */
  chain?: boolean;
}

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

function makeOffline(seconds: number, sampleRate: number): OfflineAudioContext {
  const w = window as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  const C = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  if (!C) throw new Error("OfflineAudioContext is not supported");
  return new C(2, Math.ceil(seconds * sampleRate), sampleRate);
}

function render(ctx: OfflineAudioContext): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    ctx.oncomplete = (e) => resolve(e.renderedBuffer);
    const p = ctx.startRendering() as Promise<AudioBuffer> | undefined;
    p?.then(resolve, reject);
  });
}

function outputs(ctx: OfflineAudioContext, o: RenderOpts) {
  const vol = (o.volume ?? 1) ** 2;
  if (o.chain === false) {
    const g = gainNode(ctx, vol);
    g.connect(ctx.destination);
    return { music: g, sfx: g };
  }
  const chain = createChain(ctx);
  chain.music.gain.value = vol;
  chain.sfx.gain.value = vol;
  return { music: chain.music, sfx: chain.sfx };
}

// The compressors start fully clamped and need a moment to settle (they do in the live engine before any
// sound plays), so renders begin with a pre-roll that is cut off afterwards.
const PREROLL = 0.6;

async function renderTrimmed(seconds: number, o: RenderOpts, play: (ctx: OfflineAudioContext, t: number) => void) {
  const sr = o.sampleRate ?? 44100;
  const ctx = makeOffline(seconds + PREROLL, sr);
  play(ctx, PREROLL);
  const full = await render(ctx);
  const skip = Math.round(PREROLL * sr);
  const out = ctx.createBuffer(full.numberOfChannels, full.length - skip, sr);
  for (let c = 0; c < full.numberOfChannels; c++) out.getChannelData(c).set(full.getChannelData(c).subarray(skip));
  return out;
}

export function renderSong(id: SongId, seconds = 20, o: RenderOpts = {}): Promise<AudioBuffer> {
  return renderTrimmed(seconds, o, (ctx, t) => {
    const p = new SongPlayer(ctx, SONGS[id], outputs(ctx, o).music);
    p.start(t, 0.01);
    p.scheduleUntil(t + seconds);
  });
}

export const SFX_SECONDS: Partial<Record<SfxId, number>> = { drumroll: 6.5, prize: 4.5, fanfare: 3.5, whosThat: 2.4 };

export function renderSfx(id: SfxId, seconds = SFX_SECONDS[id] ?? 1.6, o: RenderOpts = {}): Promise<AudioBuffer> {
  return renderTrimmed(seconds, o, (ctx, t) => {
    SFX[id](ctx, outputs(ctx, o).sfx, t + 0.01, 0);
  });
}

export interface Measurement {
  seconds: number;
  /** Sample peak, linear. */
  peak: number;
  peakDb: number;
  /** RMS over the whole render (dBFS). */
  rmsDb: number;
  /** Loudest 400 ms window (dBFS RMS), a rough "momentary loudness". */
  loudDb: number;
  /** Seconds with a 400 ms window above -50 dBFS. */
  activeSec: number;
  /** Samples at or above 0.98. */
  clipped: number;
}

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

export function measure(buf: AudioBuffer): Measurement {
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const n = buf.length;
  let peak = 0;
  let sum = 0;
  let clipped = 0;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (const ch of chans) {
      const v = ch[i];
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.98) clipped++;
      sum += v * v;
      m += v;
    }
    mono[i] = m / chans.length;
  }
  const win = Math.round(buf.sampleRate * 0.4);
  const hop = Math.round(buf.sampleRate * 0.1);
  let loud = 0;
  let active = 0;
  for (let s = 0; s + win <= n; s += hop) {
    let w = 0;
    for (let i = s; i < s + win; i++) w += mono[i] * mono[i];
    const r = Math.sqrt(w / win);
    if (r > loud) loud = r;
    if (db(r) > -50) active++;
  }
  if (n < win) {
    let w = 0;
    for (let i = 0; i < n; i++) w += mono[i] * mono[i];
    loud = Math.sqrt(w / Math.max(1, n));
  }
  return {
    seconds: n / buf.sampleRate,
    peak,
    peakDb: db(peak),
    rmsDb: db(Math.sqrt(sum / (n * chans.length))),
    loudDb: db(loud),
    activeSec: (active * hop) / buf.sampleRate,
    clipped,
  };
}

/** 16-bit PCM WAV. */
export function encodeWav(buf: AudioBuffer): ArrayBuffer {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const bytes = 44 + n * ch * 2;
  const out = new ArrayBuffer(bytes);
  const v = new DataView(out);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, bytes - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return out;
}

/** Trigger a browser download of a rendered buffer. */
export function downloadWav(buf: AudioBuffer, filename: string): void {
  const url = URL.createObjectURL(new Blob([encodeWav(buf)], { type: "audio/wav" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
