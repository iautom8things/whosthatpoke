// Plays a Song (data) on any BaseAudioContext. Live playback uses a lookahead scheduler: a 25 ms timer
// schedules every note that starts within the next 120 ms on the audio clock. Offline rendering calls
// scheduleUntil() once for the whole length.

import { hz, STEPS_PER_BAR, type Ev } from "./dsl";
import { gainNode, MonoVoice, playDrum, playTone, filter, type Inst } from "./synth";

export interface Track {
  name: string;
  inst: Inst;
  events: Ev[];
  gain: number;
  /** Send level into the song's echo. */
  echo?: number;
  pan?: number;
  /** Multiplies note lengths: < 1 plays staccato. */
  gate?: number;
}

export interface Song {
  id: string;
  bpm: number;
  /** 0 = straight. 1/6 = full triplet swing. Delays the off-beat 8th by this fraction of a beat. */
  swing?: number;
  /** Length in 16th steps. */
  steps: number;
  loop: boolean;
  tracks: Track[];
  echo?: { beats: number; feedback: number; tone?: number; wet?: number };
  gain?: number;
}

export const bars = (n: number) => n * STEPS_PER_BAR;

const LOOKAHEAD = 0.12;
const TICK_MS = 25;

export class SongPlayer {
  readonly out: GainNode;
  private readonly byStep: Array<Array<[number, Ev]>>;
  private readonly trackIn: AudioNode[] = [];
  /** Every long-lived node this player made, disconnected on dispose. */
  private readonly owned: AudioNode[] = [];
  private readonly mono: Array<MonoVoice | null> = [];
  private readonly beatDur: number;
  private start0 = 0;
  private next = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly song: Song,
    dest: AudioNode,
  ) {
    this.beatDur = 60 / song.bpm;
    this.out = gainNode(ctx, 0);
    this.out.connect(dest);
    const songGain = song.gain ?? 1;

    let echoIn: AudioNode | null = null;
    if (song.echo) {
      const delay = ctx.createDelay(2);
      delay.delayTime.value = song.echo.beats * this.beatDur;
      const fb = gainNode(ctx, song.echo.feedback);
      const tone = filter(ctx, "lowpass", song.echo.tone ?? 2400);
      const wet = gainNode(ctx, song.echo.wet ?? 0.6);
      delay.connect(tone).connect(fb).connect(delay);
      tone.connect(wet).connect(this.out);
      echoIn = delay;
      this.owned.push(delay, fb, tone, wet);
    }

    this.byStep = Array.from({ length: song.steps }, () => []);
    song.tracks.forEach((tr, i) => {
      const g = gainNode(ctx, tr.gain * songGain);
      let head: AudioNode = g;
      if (tr.inst.kind === "tone" && tr.inst.lp) {
        const lp = filter(ctx, "lowpass", tr.inst.lp);
        g.connect(lp);
        head = lp;
      }
      if (tr.pan && typeof ctx.createStereoPanner === "function") {
        const p = ctx.createStereoPanner();
        p.pan.value = tr.pan;
        head.connect(p);
        head = p;
      }
      head.connect(this.out);
      if (echoIn && tr.echo) {
        const send = gainNode(ctx, tr.echo);
        head.connect(send).connect(echoIn);
        this.owned.push(send);
      }
      this.owned.push(g);
      if (head !== g) this.owned.push(head);
      this.trackIn.push(g);
      this.mono.push(null);
      for (const ev of tr.events) {
        if (ev.step >= 0 && ev.step < song.steps) this.byStep[Math.floor(ev.step)].push([i, ev]);
      }
    });
  }

  /** Audio-clock time of an absolute step (steps keep counting across loops). */
  timeOf(abs: number): number {
    const beat = Math.floor(abs / 4);
    const f = (abs - beat * 4) / 4;
    const sw = this.song.swing ?? 0;
    const swung = sw === 0 ? f : f < 0.5 ? f * ((0.5 + sw) / 0.5) : 0.5 + sw + (f - 0.5) * ((0.5 - sw) / 0.5);
    return this.start0 + (beat + swung) * this.beatDur;
  }

  get loopSeconds(): number {
    return (this.song.steps / 4) * this.beatDur;
  }

  start(at: number, fadeIn = 0.02): void {
    this.start0 = at;
    this.next = 0;
    const g = this.out.gain;
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(1, at + Math.max(0.005, fadeIn));
    this.song.tracks.forEach((tr, i) => {
      if (tr.inst.kind === "tone" && tr.inst.glide) this.mono[i] = new MonoVoice(this.ctx, this.trackIn[i], tr.inst, at);
    });
  }

  /** Schedule every step that starts before `limit`. Steps more than 50 ms in the past are skipped. */
  scheduleUntil(limit: number, now = -Infinity): boolean {
    const { steps, loop } = this.song;
    while (!this.stopped) {
      if (!loop && this.next >= steps) return false;
      const t = this.timeOf(this.next);
      if (t >= limit) break;
      if (t >= now - 0.05) {
        const at = Math.max(t, now);
        for (const [ti, ev] of this.byStep[this.next % steps]) this.play(ti, ev, this.next, at);
      }
      this.next++;
    }
    return true;
  }

  private play(ti: number, ev: Ev, abs: number, t: number): void {
    const tr = this.song.tracks[ti];
    const dest = this.trackIn[ti];
    if (tr.inst.kind !== "tone") {
      playDrum(this.ctx, dest, tr.inst, t, ev.vel);
      return;
    }
    const dur = Math.max(0.02, (this.timeOf(abs + ev.len) - t) * (tr.gate ?? 1));
    const mono = this.mono[ti];
    if (mono) mono.note(hz(ev.midi), t, dur, ev.vel);
    else playTone(this.ctx, dest, tr.inst, hz(ev.midi), t, dur, ev.vel);
  }

  /** Live playback: keep scheduling ahead until stopped. */
  run(): void {
    const tick = () => {
      if (this.stopped) return;
      const now = this.ctx.currentTime;
      const more = this.scheduleUntil(now + LOOKAHEAD, now);
      if (more) this.timer = setTimeout(tick, TICK_MS);
    };
    tick();
  }

  fadeOut(sec: number): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const g = this.out.gain;
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + Math.max(0.01, sec));
    } catch {
      g.value = 0;
    }
    // Keep scheduling through the fade so the tail does not go silent early.
    setTimeout(() => this.dispose(), sec * 1000 + 250);
  }

  dispose(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    const t = this.ctx.currentTime;
    for (const m of this.mono) m?.stop(t);
    setTimeout(() => {
      for (const n of [this.out, ...this.owned]) {
        try {
          n.disconnect();
        } catch {
          // already disconnected
        }
      }
    }, 400);
  }
}
