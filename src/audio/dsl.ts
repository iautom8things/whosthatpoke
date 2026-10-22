// A tiny text notation for composing songs as data. The grid is 16 steps per bar (16th notes).
//
//   mel("c5:2 e5 g5:4 | ...")   notes with a length in steps; the length carries over to the next note
//   "[c4,e4,g4]:4"              a chord on one track
//   "r:4"                       rest
//   "!" / "?" suffix            accent / ghost
//   "|"                         bar line, checked against the grid (see dslIssues)
//   beat("X...x...")            one step per character: X accent, x hit, o ghost, . nothing
//   prog("C | Em7 A7 | G/B")    chords per bar; chords inside one bar split it evenly

export interface Ev {
  step: number;
  len: number;
  midi: number;
  vel: number;
}

export const STEPS_PER_BAR = 16;

/** Problems found while parsing (misaligned bar lines, bad tokens). The tests assert it stays empty. */
export const dslIssues: string[] = [];

const PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** "c#4" -> 61, "bb3" -> 58. Middle C is c4 = 60. */
export function midi(name: string): number {
  const m = /^([a-g])(#|b)?(-?\d)$/i.exec(name.trim());
  if (!m) {
    dslIssues.push(`bad note "${name}"`);
    return 60;
  }
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + PC[m[1].toLowerCase()] + acc;
}

export const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

const VEL = { normal: 0.82, accent: 1, ghost: 0.5 };

function velOf(token: string): [string, number] {
  if (token.endsWith("!")) return [token.slice(0, -1), VEL.accent];
  if (token.endsWith("?")) return [token.slice(0, -1), VEL.ghost];
  return [token, VEL.normal];
}

/** Parse a melody line into events starting at `start` (in steps). */
export function mel(src: string, start = 0, label = "mel"): Ev[] {
  const out: Ev[] = [];
  let step = start;
  let len = 2;
  for (const raw of src.trim().split(/\s+/)) {
    if (!raw) continue;
    if (raw === "|") {
      if ((step - start) % STEPS_PER_BAR !== 0) {
        dslIssues.push(`${label}: bar line at step ${step - start} is not on a bar boundary`);
      }
      continue;
    }
    const [token, vel] = velOf(raw);
    const [pitch, lenStr] = token.split(":");
    if (lenStr) {
      const n = Number(lenStr);
      if (!Number.isFinite(n) || n <= 0) dslIssues.push(`${label}: bad length in "${raw}"`);
      else len = n;
    }
    if (pitch !== "r") {
      const notes = pitch.startsWith("[") ? pitch.slice(1, -1).split(",") : [pitch];
      for (const n of notes) out.push({ step, len, midi: midi(n), vel });
    }
    step += len;
  }
  return out;
}

/** Length in steps of a melody string, for checks and concatenation. */
export function melLength(src: string): number {
  let len = 2;
  let total = 0;
  for (const raw of src.trim().split(/\s+/)) {
    if (!raw || raw === "|") continue;
    const lenStr = velOf(raw)[0].split(":")[1];
    if (lenStr) len = Number(lenStr);
    total += len;
  }
  return total;
}

/** Drum pattern: one character per step. */
export function beat(pattern: string, start = 0): Ev[] {
  const out: Ev[] = [];
  let step = start;
  for (const ch of pattern) {
    if (ch === " " || ch === "|") continue;
    if (ch === "X") out.push({ step, len: 1, midi: 0, vel: VEL.accent });
    else if (ch === "x") out.push({ step, len: 1, midi: 0, vel: VEL.normal });
    else if (ch === "o") out.push({ step, len: 1, midi: 0, vel: VEL.ghost });
    step += 1;
  }
  return out;
}

/** Repeat a one-bar (or n-bar) drum pattern over `bars` bars, swapping in fills by bar index. */
export function beats(pattern: string, bars: number, fills: Record<number, string> = {}): Ev[] {
  const span = pattern.replace(/[ |]/g, "").length;
  const per = Math.max(1, Math.round(span / STEPS_PER_BAR));
  const out: Ev[] = [];
  for (let b = 0; b < bars; b += per) {
    const fill = fills[b];
    out.push(...beat(fill ?? pattern, b * STEPS_PER_BAR));
  }
  return out;
}

export const shift = (evs: Ev[], by: number): Ev[] => evs.map((e) => ({ ...e, step: e.step + by }));
export const transpose = (evs: Ev[], semis: number): Ev[] => evs.map((e) => ({ ...e, midi: e.midi + semis }));
export const scaleVel = (evs: Ev[], k: number): Ev[] => evs.map((e) => ({ ...e, vel: e.vel * k }));
/** Drop events that start inside [from, to). */
export const mute = (evs: Ev[], from: number, to: number): Ev[] => evs.filter((e) => e.step < from || e.step >= to);
/** Keep events that start inside [from, to). */
export const only = (evs: Ev[], from: number, to: number): Ev[] => evs.filter((e) => e.step >= from && e.step < to);

// ---------- chords ----------

const QUALITY: Record<string, number[]> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  mmaj7: [0, 3, 7, 11],
  m6: [0, 3, 7, 9],
  "6": [0, 4, 7, 9],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  add9: [0, 4, 7, 14],
};

export interface ChordSeg {
  step: number;
  len: number;
  /** Pitch class of the root, 0 = C. */
  root: number;
  /** Pitch class of the bass note (slash chords), else the root. */
  bass: number;
  /** Intervals above the root. */
  ivals: number[];
  name: string;
}

function pcOf(name: string): number {
  const m = /^([A-G])(#|b)?$/.exec(name);
  if (!m) {
    dslIssues.push(`bad chord root "${name}"`);
    return 0;
  }
  return (PC[m[1].toLowerCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
}

export function chord(name: string): Omit<ChordSeg, "step" | "len"> {
  const [main, slash] = name.split("/");
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(main);
  if (!m || !(m[2] in QUALITY)) {
    dslIssues.push(`bad chord "${name}"`);
    return { root: 0, bass: 0, ivals: QUALITY[""], name };
  }
  const root = pcOf(m[1]);
  return { root, bass: slash ? pcOf(slash) : root, ivals: QUALITY[m[2]], name };
}

/** "C | Em7 A7 | %" -> chord segments. "%" repeats the previous bar. */
export function prog(src: string): ChordSeg[] {
  const out: ChordSeg[] = [];
  let prev: string[] = [];
  src
    .split("|")
    .map((b) => b.trim())
    .filter(Boolean)
    .forEach((bar, i) => {
      const names = bar === "%" ? prev : bar.split(/\s+/).filter(Boolean);
      prev = names;
      const len = STEPS_PER_BAR / names.length;
      names.forEach((n, j) => out.push({ ...chord(n), step: i * STEPS_PER_BAR + j * len, len, name: n }));
    });
  return out;
}

export function chordAt(segs: ChordSeg[], step: number): ChordSeg {
  let found = segs[0];
  for (const s of segs) {
    if (s.step <= step) found = s;
    else break;
  }
  return found;
}

/** Lowest midi >= low with pitch class pc. */
const placeAbove = (pc: number, low: number) => low + ((pc - low) % 12 + 12) % 12;

/** Chord tone i (0 = root) above `low`; indexes past the chord wrap up an octave. */
export function tone(seg: ChordSeg, i: number, low: number): number {
  const n = seg.ivals.length;
  const oct = Math.floor(i / n);
  const r = ((i % n) + n) % n;
  return placeAbove(seg.root, low) + seg.ivals[r] + 12 * oct;
}

/**
 * Bass line from a one-bar template applied to every bar. Degrees resolve against the chord at each note:
 * R bass note, 8 its octave, 3/5/7 chord tones above R, -5 the fifth below, or a literal note like "f#2".
 */
export function bassline(segs: ChordSeg[], template: string, bars: number, low: number, fromBar = 0): Ev[] {
  const out: Ev[] = [];
  for (let b = fromBar; b < fromBar + bars; b++) {
    let step = b * STEPS_PER_BAR;
    let len = 2;
    for (const raw of template.trim().split(/\s+/)) {
      const [token, vel] = velOf(raw);
      const [deg, lenStr] = token.split(":");
      if (lenStr) len = Number(lenStr);
      if (deg !== "r") {
        const seg = chordAt(segs, step);
        const r = placeAbove(seg.bass, low);
        const above = (iv: number | undefined) => (iv === undefined ? r + 12 : placeAbove((seg.root + iv) % 12, r + 1));
        const fifth = above(seg.ivals[2]);
        const map: Record<string, number> = {
          R: r,
          "8": r + 12,
          "3": above(seg.ivals[1]),
          "5": fifth,
          "-5": fifth - 12,
          "7": above(seg.ivals[3]),
        };
        out.push({ step, len, midi: map[deg] ?? midi(deg), vel });
      }
      step += len;
    }
    if (step !== (b + 1) * STEPS_PER_BAR) dslIssues.push(`bassline template "${template}" is ${step - b * STEPS_PER_BAR} steps, not 16`);
  }
  return out;
}

/** Arpeggio: one chord tone every `every` steps following `pattern` (chord-tone indexes). */
export function arp(
  segs: ChordSeg[],
  o: { from: number; to: number; every: number; pattern: number[]; low: number; len?: number; vel?: number },
): Ev[] {
  const out: Ev[] = [];
  let i = 0;
  for (let step = o.from; step < o.to; step += o.every, i++) {
    const seg = chordAt(segs, step);
    out.push({ step, len: o.len ?? o.every, midi: tone(seg, o.pattern[i % o.pattern.length], o.low), vel: o.vel ?? 0.7 });
  }
  return out;
}

/** Chord stabs on the given steps of every bar. */
export function stabs(
  segs: ChordSeg[],
  o: { fromBar: number; bars: number; steps: number[]; tones: number[]; low: number; len: number; vel?: number },
): Ev[] {
  const out: Ev[] = [];
  for (let b = o.fromBar; b < o.fromBar + o.bars; b++) {
    for (const s of o.steps) {
      const step = b * STEPS_PER_BAR + s;
      const seg = chordAt(segs, step);
      for (const t of o.tones) out.push({ step, len: o.len, midi: tone(seg, t, o.low), vel: o.vel ?? 0.7 });
    }
  }
  return out;
}
