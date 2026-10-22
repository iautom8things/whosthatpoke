// Original music, written for this game. Five loops plus two short jingles used as sfx.
// Melodies are composed in the DSL from ./dsl (16 steps per bar). Bar lines are checked by tests.

import type { SongId } from "./index";
import { bars, type Song, type Track } from "./player";
import {
  arp,
  bassline,
  beat,
  beats,
  mel,
  mute,
  prog,
  scaleVel,
  shift,
  stabs,
  transpose,
  type Ev,
} from "./dsl";
import type { Inst, ToneInst } from "./synth";

// ---------- instruments ----------

const LEAD: ToneInst = {
  kind: "tone",
  wave: "pulse25",
  env: { a: 0.005, d: 0.14, s: 0.68, r: 0.07 },
  vib: { rate: 5.6, cents: 14, delay: 0.16 },
  lp: 5200,
};
const SOFT_LEAD: Inst = {
  kind: "tone",
  wave: "pulse50",
  env: { a: 0.012, d: 0.25, s: 0.6, r: 0.14 },
  vib: { rate: 5, cents: 12, delay: 0.22 },
  lp: 3000,
};
const ANSWER: Inst = { kind: "tone", wave: "pulse50", env: { a: 0.003, d: 0.08, s: 0.5, r: 0.05 }, lp: 4200 };
const ARP: Inst = { kind: "tone", wave: "pulse12", env: { a: 0.002, d: 0.05, s: 0.35, r: 0.03 }, lp: 4500 };
const STAB: Inst = { kind: "tone", wave: "pulse12", env: { a: 0.002, d: 0.07, s: 0.2, r: 0.04 }, lp: 4000 };
const PLUCK: Inst = { kind: "tone", wave: "pulse12", env: { a: 0.002, d: 0.11, s: 0, r: 0.05 }, lp: 4200 };
const PAD: Inst = { kind: "tone", wave: "pulse12", env: { a: 0.25, d: 0.4, s: 0.8, r: 0.3 }, lp: 2400 };
const BELL: Inst = { kind: "tone", wave: "triangle", env: { a: 0.003, d: 0.55, s: 0, r: 0.35 } };
const BELL_HI: Inst = { kind: "tone", wave: "sine", env: { a: 0.002, d: 0.3, s: 0, r: 0.25 } };
const SPARKLE: Inst = { kind: "tone", wave: "sine", env: { a: 0.002, d: 0.16, s: 0, r: 0.12 } };
const BASS: Inst = { kind: "tone", wave: "bass", env: { a: 0.004, d: 0.12, s: 0.75, r: 0.05 } };
const PLUCK_BASS: Inst = { kind: "tone", wave: "bass", env: { a: 0.004, d: 0.22, s: 0.45, r: 0.07 } };
const THEREMIN: Inst = {
  kind: "tone",
  wave: "theremin",
  env: { a: 0.07, d: 0.35, s: 0.82, r: 0.16 },
  vib: { rate: 5.8, cents: 30, delay: 0 },
  glide: 0.05,
};
const KICK: Inst = { kind: "kick" };
const SNARE: Inst = { kind: "snare" };
const BRUSH: Inst = { kind: "snare", brush: true };
const HAT: Inst = { kind: "hat", decay: 0.035 };
const OPEN_HAT: Inst = { kind: "hat", decay: 0.11 };
const CRASH: Inst = { kind: "crash", decay: 1.3 };
const BONES: Inst = { kind: "block", freq: 900 };

const track = (name: string, inst: Inst, events: Ev[], gain: number, extra: Partial<Track> = {}): Track => ({
  name,
  inst,
  events,
  gain,
  ...extra,
});

// ---------- "title": heroic adventure, C major, 150 bpm, 32 bars (A A' B B') ----------

function title(): Song {
  const chords = prog(`
    C | F | G | C | Am | F | Dm7 G | G |
    C | F | G | C | Am | F | G | C |
    F | G | Em | Am | F | G | Am | G |
    F | G | Em | Am | Ab | Bb | C | G`);

  const a = `
    c5:2 e5 g5:4 a5:2 g5 e5:4 |
    f5:2 a5 c6:6 a5:2 g5:4 |
    g5:3 f5:1 e5:2 d5 b4:4 d5 |
    e5:2 d5 c5:4 g4 r |
    a4:2 c5 e5:4 a5:2 g5 e5:4 |
    f5:2 e5 f5 a5 c6:4 a5 |`;
  const b = `
    a5:6 g5:2 f5:4 c5 |
    d5:6 e5:2 f5:4 g5 |
    g5:6 f5:2 e5:4 b4 |
    c5:4 e5 a5:8 |`;
  const lead = mel(
    `${a}
    a5:4 f5:2 d5 b4 d5 f5 d5 |
    g5:8 f5:2 e5 d5:4 |
    ${a}
    g5:2 a5 b5 d6 c6 b5 a5 b5 |
    c6:8 r:2 e5 f5 g5 |
    ${b}
    a5:6 g5:2 f5:4 c6 |
    b5:6 a5:2 g5:4 d5 |
    e5:6 f5:2 g5:4 a5 |
    b5:8 d6:4 b5 |
    ${b}
    c6:6 bb5:2 ab5:4 eb5 |
    d6:6 c6:2 bb5:4 f5 |
    e6:4 d6:2 c6 g5:4 e5 |
    g5:2 f5 e5 d5 b4:4 r |`,
    0,
    "title.lead",
  );

  // A sections: 16th-note arpeggios that step aside for the answering fills.
  let harmony = arp(chords, { from: 0, to: bars(16), every: 1, pattern: [0, 1, 2, 3], low: 55, vel: 0.62 });
  harmony = mute(mute(harmony, bars(3) + 12, bars(4)), bars(11) + 12, bars(12));
  // B sections: off-beat chord stabs.
  harmony.push(...stabs(chords, { fromBar: 16, bars: 16, steps: [2, 6, 10, 14], tones: [0, 1, 2], low: 55, len: 1, vel: 0.7 }));

  const answer = [
    ...mel("e5:1 g5 c6:2", bars(3) + 12),
    ...mel("e5:1 g5 c6:2", bars(11) + 12),
    ...mel("g4:1 b4 d5 f5", bars(31) + 12),
  ];

  const bass = [
    ...bassline(chords, "R:2 8 R 8 R 8 R 8", 16, 33),
    ...bassline(chords, "R:4 5 8 5", 16, 33, 16),
  ];

  const fill = "....X.......XxXX";
  return {
    id: "title",
    bpm: 150,
    steps: bars(32),
    loop: true,
    gain: 0.7,
    echo: { beats: 0.75, feedback: 0.28, tone: 2600, wet: 0.5 },
    tracks: [
      track("lead", LEAD, lead, 0.3, { echo: 0.18 }),
      track("harmony", ARP, harmony, 0.12, { pan: -0.15 }),
      track("answer", ANSWER, answer, 0.2, { pan: 0.15, echo: 0.3 }),
      track("bass", BASS, bass, 0.34, { gate: 0.85 }),
      track("kick", KICK, [...beats("X.......X.x.....", 16), ...shift(beats("X...X...X...X...", 16), bars(16))], 0.45),
      track(
        "snare",
        SNARE,
        [...beats("....X.......X...", 16, { 7: fill, 15: fill }), ...shift(beats("....X.......X...", 16, { 7: fill, 15: fill }), bars(16))],
        0.26,
      ),
      track("hat", HAT, [...beats("x.x.x.x.x.x.x.x.", 16), ...shift(beats("xoxoxoxoxoxoxoxo", 16), bars(16))], 0.09),
      track("crash", CRASH, [...beat("X", 0), ...beat("X", bars(16))], 0.1),
    ],
  };
}

// ---------- "spooky": playful haunted shuffle, D harmonic minor, 120 bpm swung, 24 bars (A B A') ----------

function spooky(): Song {
  const chords = prog(`
    Dm | Dm | Gm | A7 | Dm | Bb | Gm6 | A7 |
    Gm | C7 | F | Dm | Gm | A7 | Dm | A7 |
    Dm | Dm | Gm | A7 | Dm | Bb | Gm6 | A7`);

  const a = `
    d5:2 f5 a5:4 g#5:2 a5 f5:4 |
    e5:2 f5 d5:4 a4:8 |
    bb4:2 d5 g5:4 f#5:2 g5 bb5:4 |
    a5:6 g5:2 e5:4 c#5 |
    d5:2 f5 a5:4 g#5:2 a5 d6:4 |
    c6:2 bb5 a5 g5 f5:4 d5 |
    e5:2 g5 bb5:4 a5:2 g5 e5:4 |
    c#5:4 e5 a5 r |`;
  const theremin = mel(
    `${a}
    g5:4 bb5 d6:6 r:2 |
    r:16 |
    a5:4 c6 f5:6 r:2 |
    r:16 |
    bb5:4 a5:2 g5 d5:4 g5 |
    a5:4 g5:2 f5 e5:4 c#5 |
    d5:8 r |
    r:16 |
    ${a}`,
    0,
    "spooky.theremin",
  );

  // The pluck answers the theremin in B and shadows it an octave down in A'.
  const answerA = "g5:1 e5 c#5 a4";
  const pluck = [
    ...mel(answerA, bars(7) + 12),
    ...mel(
      `r:16 |
      e5:1 r g5 r bb5 r c6 r bb5 r g5 r e5:2 r |
      r:16 |
      d5:1 r f5 r a5 r d6 r c#6 r a5 r f5:2 r |
      r:16 |
      r:16 |
      r:8 a4:1 r d5 r f5 r a5:2 |
      c#5:1 r e5 r g5 r a5 r bb5:2 a5 g#5 g5 |`,
      bars(8),
      "spooky.pluck",
    ),
    ...scaleVel(transpose(mel(a, bars(16)), -12), 0.7),
    ...mel(answerA, bars(23) + 12),
  ];

  const walkA = `
    d2:4 f2 a2 f2 |
    d2:4 e2 f2 f#2 |
    g2:4 bb2 d3 bb2 |
    a2:4 g2 f2 e2 |
    d2:4 a2 d3 c#3 |
    bb2:4 f2 d2 f2 |
    g2:4 bb2 d3 e3 |
    a2:4 g2 f2 e2 |`;
  const bass = mel(
    `${walkA}
    g2:4 d2 g2 bb2 |
    c3:4 g2 e2 c2 |
    f2:4 a2 c3 a2 |
    d2:4 f2 a2 d3 |
    g2:4 bb2 d3 bb2 |
    a2:4 c#3 e3 c#3 |
    d3:4 a2 f2 d2 |
    a2:4 g2 f2 e2 |
    ${walkA}`,
    0,
    "spooky.bass",
  );

  const fill = "....x.......x.xx";
  return {
    id: "spooky",
    bpm: 120,
    swing: 0.13,
    steps: bars(24),
    gain: 0.8,
    loop: true,
    echo: { beats: 0.75, feedback: 0.38, tone: 2200, wet: 0.6 },
    tracks: [
      track("theremin", THEREMIN, theremin, 0.3, { echo: 0.4 }),
      track("pluck", PLUCK, pluck, 0.24, { echo: 0.28, pan: 0.15 }),
      track("stabs", STAB, stabs(chords, { fromBar: 0, bars: 24, steps: [4, 12], tones: [1, 2], low: 55, len: 2, vel: 0.7 }), 0.1, { pan: -0.15 }),
      track("bass", PLUCK_BASS, bass, 0.46, { gate: 0.7 }),
      track("kick", KICK, beats("X.......x.......", 24), 0.45),
      track("snare", BRUSH, beats("....x.......x...", 24, { 7: fill, 15: fill, 23: fill }), 0.22),
      track("hat", HAT, beats("x.x.x.x.x.x.x.x.", 24), 0.07),
      track("bones", BONES, shift(beats("..x...x...x...x.", 8), bars(8)), 0.14),
    ],
  };
}

// ---------- "question": suspense loop under a silhouette, E minor, 132 bpm, 4 bars ----------

function question(): Song {
  const bass = mel(
    `e2:2 e2 e3 e2 e2 e2 e3 e2 |
     f2:2 f2 f3 f2 f2 f2 f3 f2 |
     f#2:2 f#2 f#3 f#2 f#2 f#2 f#3 f#2 |
     g2:2 g2 g#2 g#2 a2 a2 b2 b2 |`,
    0,
    "question.bass",
  );
  const rise = mel(
    `r:12 b4:1 e5 g5 b5 |
     r:12 c5:1 f5 a5 c6 |
     r:12 c#5:1 f#5 a5 c#6 |
     r:8 d5:1 g5 b5 d6 d#5 f#5 b5 d#6 |`,
    0,
    "question.rise",
  );
  const pad = mel("b4:16 | c5:16 | c#5:16 | d5:8 d#5:8 |", 0, "question.pad");
  return {
    id: "question",
    bpm: 132,
    steps: bars(4),
    gain: 0.85,
    loop: true,
    echo: { beats: 0.5, feedback: 0.3, tone: 2400, wet: 0.5 },
    tracks: [
      track("rise", PLUCK, rise, 0.4, { echo: 0.35 }),
      track("pad", PAD, pad, 0.13),
      track("bass", BASS, bass, 0.26, { gate: 0.55 }),
      track("kick", KICK, beats("X.x.....X.x.....", 4), 0.26),
      track("hat", HAT, beats("xoxoxoxoxoxoxoxo", 4), 0.07),
    ],
  };
}

// ---------- "results": victory celebration, G major, 140 bpm, 16 bars ----------

function results(): Song {
  const chords = prog(`
    G | C | Am7 | D | G | C | Eb F | G |
    G | C | Am7 | D | Em | C | Eb F | D7`);
  const a = `
    d5:2 g5 b5 g5:1 b5 d6:4 b5 |
    e5:2 g5 c6 g5:1 c6 e6:4 c6 |
    a5:3 g5:1 e5:2 g5 a5:3 b5:1 c6:4 |
    d6:2 c6 a5 f#5 a5:8 |`;
  const lead = mel(
    `${a}
    d5:2 g5 b5 g5:1 b5 d6:4 b5 |
    e5:2 g5 c6 g5:1 c6 e6:4 c6 |
    g5:3 f5:1 eb5:2 g5 a5:3 g5:1 f5:2 a5 |
    b5:4 d6:2 b5 g5:8 |
    ${a}
    g5:2 b5 e6:4 d6:2 b5 g5:4 |
    e5:2 g5 c6:4 b5:2 g5 e5:4 |
    g5:3 f5:1 eb5:2 g5 a5:3 g5:1 f5:2 a5 |
    d6:4 c6:2 a5 f#5 a5 c6 a5 |`,
    0,
    "results.lead",
  );
  const harmony = [
    ...stabs(chords, { fromBar: 0, bars: 8, steps: [2, 6, 10, 14], tones: [0, 1, 2], low: 55, len: 1, vel: 0.7 }),
    ...arp(chords, { from: bars(8), to: bars(16), every: 1, pattern: [0, 1, 2, 3], low: 55, vel: 0.6 }),
  ];
  const fill = "....X...X.X.XXXX";
  return {
    id: "results",
    bpm: 140,
    steps: bars(16),
    loop: true,
    gain: 0.7,
    echo: { beats: 0.75, feedback: 0.25, tone: 2600, wet: 0.5 },
    tracks: [
      track("lead", LEAD, lead, 0.29, { echo: 0.2 }),
      track("harmony", ARP, harmony, 0.12, { pan: -0.15 }),
      track("bass", BASS, bassline(chords, "R:2 r:1 R:1 8:2 R:2 5:2 r:1 5:1 8:2 5:2", 16, 36), 0.34, { gate: 0.9 }),
      track("kick", KICK, beats("X...X...X...X...", 16), 0.42),
      track("snare", SNARE, beats("....X.......X...", 16, { 7: fill, 15: fill }), 0.24),
      track("hat", HAT, beats("x.x.x.x.x.x.x.x.", 16), 0.06),
      track("openhat", OPEN_HAT, beats("..x...x...x...x.", 16), 0.06),
      track("crash", CRASH, [...beat("X", 0), ...beat("X", bars(8))], 0.1),
    ],
  };
}

// ---------- "showcase": cozy, light loop for attract mode, F major, 104 bpm, lightly swung, 24 bars ----------

function showcase(): Song {
  const chords = prog(`
    Fmaj7 | Em7 A7 | Dm7 | Cm7 F7 | Bbmaj7 | Am7 | Gm7 | C7 |
    Fmaj7 | Em7 A7 | Dm7 | Cm7 F7 | Bbmaj7 | Am7 | Gm7 C7 | Fmaj7 |
    Bbmaj7 | C/Bb | Am7 | Dm7 | Gm7 | Am7 | Bbmaj7 | C7`);
  const lead = mel(
    `r:2 c5 f5 a5 g5:4 e5 |
    g5:2 f5 e5:4 c#5 e5 |
    f5:2 e5 d5:4 a4 c5 |
    eb5:4 d5:2 c5 a4:8 |
    d5:2 f5 a5:4 g5 f5 |
    e5:4 g5:2 a5 c6:8 |
    bb5:4 a5:2 g5 f5:4 d5 |
    e5:4 g5 bb5 r |
    r:2 c5 f5 a5 c6:4 a5 |
    g5:2 f5 e5:4 g5 e5 |
    f5:4 a5 d6 c6 |
    bb5:4 a5:2 g5 eb5:8 |
    d5:2 f5 a5:4 c6 a5 |
    g5:4 e5 c5:8 |
    d5:4 f5 e5 g5 |
    f5:12 r:4 |`,
    0,
    "showcase.lead",
  );
  const bell = mel(
    `f5:6 d5:2 f5:4 a5 |
    g5:6 e5:2 g5:4 c6 |
    e5:6 c5:2 e5:4 g5 |
    f5:6 d5:2 a5:8 |
    bb5:4 a5 g5 f5 |
    g5:4 f5 e5 c5 |
    d5:4 f5 a5 bb5 |
    c6:8 bb5:4 g5 |`,
    bars(16),
    "showcase.bell",
  );
  const fill = "....o.......o.oo";
  return {
    id: "showcase",
    bpm: 104,
    swing: 0.07,
    steps: bars(24),
    loop: true,
    gain: 0.72,
    echo: { beats: 0.75, feedback: 0.32, tone: 2200, wet: 0.55 },
    tracks: [
      track("lead", SOFT_LEAD, lead, 0.26, { echo: 0.3 }),
      track("bell", BELL, bell, 0.36, { echo: 0.35 }),
      track("bellHi", BELL_HI, transpose(bell, 12), 0.08, { echo: 0.3 }),
      track("arp", ARP, arp(chords, { from: 0, to: bars(24), every: 2, pattern: [0, 1, 2, 3, 4, 3, 2, 1], low: 48, vel: 0.55 }), 0.1, { pan: -0.2, echo: 0.15 }),
      track("bass", PLUCK_BASS, bassline(chords, "R:3 r:1 5:2 R:2 R:3 r:1 5:2 8:2", 24, 36), 0.4, { gate: 0.85 }),
      track("kick", KICK, [...beats("X.......x.......", 16), ...shift(beats("X.........x.....", 8), bars(16))], 0.34),
      track("snare", BRUSH, beats("....o.......o...", 24, { 15: fill }), 0.2),
      track("hat", HAT, beats("x.o.x.o.x.o.x.o.", 24), 0.05),
    ],
  };
}

// ---------- jingles (played through the sfx bus) ----------

// A I-IV-V-I fanfare with its own contour (deliberately not the famous bVI-bVII-I "level clear" figures).
function fanfare(): Song {
  return {
    id: "fanfare",
    bpm: 160,
    steps: 24,
    loop: false,
    gain: 0.75,
    tracks: [
      track("lead", { ...LEAD, vib: { rate: 6, cents: 18, delay: 0.12 } }, mel("e5:2 g5:1 a5 g5:2 c6:2! b5:1 a5 b5:2 d6:2 c6:10!", 0, "fanfare.lead"), 0.32),
      track("harmony", STAB, mel("[e4,g4]:4 [f4,a4]:4 [f4,g4,b4]:6 [e4,g4,c5]:10", 0, "fanfare.harmony"), 0.13),
      track("bass", BASS, mel("c3:2 r:2 f2:2 r:2 g2:3 g2 c3:10", 0, "fanfare.bass"), 0.45),
      track("kick", KICK, beat("X...X...X..X..X........."), 0.55),
      track("snare", SNARE, beat("......o.....oxX........."), 0.28),
      track("crash", CRASH, beat("..............X........."), 0.14),
    ],
  };
}

// Drum roll and a rising run into a I-vi-V-I flourish, then glitter.
function prize(): Song {
  const roll: Ev[] = Array.from({ length: 12 }, (_, i) => ({ step: i, len: 1, midi: 0, vel: 0.3 + (i / 11) * 0.7 }));
  return {
    id: "prize",
    bpm: 150,
    steps: 40,
    loop: false,
    gain: 0.72,
    echo: { beats: 0.5, feedback: 0.3, tone: 3000, wet: 0.5 },
    tracks: [
      track("run", ARP, mel("r:4 g4:1 a4 b4 c5 d5 e5 f5 g5", 0, "prize.run"), 0.16),
      track("lead", { ...LEAD, vib: { rate: 6, cents: 20, delay: 0.1 } }, mel("r:12 c6:2! g5:1 c6 e6:4! d6:2 b5 c6:12!", 0, "prize.lead"), 0.32, { echo: 0.2 }),
      track("harmony", STAB, mel("r:12 [c5,e5,g5]:4 [c5,e5,a5] [b4,d5,g5] [c5,e5,g5]:12", 0, "prize.harmony"), 0.12),
      track("bass", BASS, mel("r:12 c3:4 a2 g2 c3:12", 0, "prize.bass"), 0.45),
      track("sparkle", SPARKLE, mel("r:24 g6:1 c7 e6 g6 c7 e7 g6 c7 e6 g6 c7 g6", 0, "prize.sparkle"), 0.09, { echo: 0.5 }),
      track("roll", SNARE, roll, 0.24),
      track("kick", KICK, beat("............X...X...X...X..............."), 0.55),
      track("crash", CRASH, beat("............X...........X..............."), 0.15),
    ],
  };
}

export const SONGS: Record<SongId, Song> = {
  title: title(),
  spooky: spooky(),
  question: question(),
  results: results(),
  showcase: showcase(),
};

export const JINGLES = { fanfare: fanfare(), prize: prize() };

/** For the sound lab and the README: what each song is. */
export const SONG_NOTES: Record<SongId, string> = {
  title: "Heroic adventure theme. C major, 150 bpm, 32 bars: A A' B B', with a bVI-bVII-I lift at the end.",
  spooky: "Playful haunted shuffle. D harmonic minor, 120 bpm swung, 24 bars: A B A'. Theremin lead, walking bass.",
  question: "Suspense loop under a silhouette. E minor, 132 bpm, 4 bars. Heartbeat kick, chromatic climb.",
  results: "Victory celebration. G major, 140 bpm, 16 bars, four-on-the-floor.",
  showcase: "Cozy attract-mode loop. F major, 104 bpm, light swing, 24 bars with a bell-tone B section.",
};
