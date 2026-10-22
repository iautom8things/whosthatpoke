// What the announcer says, and which recorded clips say it. A clip key is also its id in public/voice/index.json;
// keys never depend on how a name is spelled. No audio here, so tests and the results model can import it.

import type { Mon } from "../data/types";
import type { Mode } from "../game/deck";
import { COPY } from "../ui/screens/game/copy";

export interface Line {
  /** Spoken by speechSynthesis when any clip is missing. */
  text: string;
  /** Clip keys, played back to back. All or nothing. */
  clips: readonly string[];
  /** A recorded stand-in for when `clips` was never recorded at all: "Here's your prize!" for a prize the host typed. */
  standIn?: readonly string[];
  /** Silence between clips. */
  gapMs?: number;
  /** Said right after, as its own line: the prize after the score, the fact after the name. cancel() stops both. */
  then?: Line;
  /**
   * Silence before this line's clips when it follows another: through `then`, or said right after the line before
   * it, like the choices after "Who's that". Clips are trimmed tight; the device voice leaves its own pause.
   */
  pauseMs?: number;
  /**
   * Nice to hear, not needed: the Pokédex entry, which the card shows anyway. With recordings in use it plays from
   * its clip or not at all, and on a poor connection only when the clip is already on the device.
   */
  extra?: boolean;
}

/** Game lengths the Settings screen offers. Score lines are recorded for these only. */
export const RECORDED_LENGTHS: readonly number[] = [5, 10, 15];
/** Survival counts are recorded up to this many. */
export const NAMED_MAX = 150;
/** Kept decoded all night: the "Who's that Pokémon?" takes and "Game over!". */
export const CORE_KEYS: readonly string[] = ["line.whos-that", "line.game-over"];
export const PRIZE_STAND_IN = "prize.custom";

const position = (i: number, n: number) => (i === 0 ? "first" : i === n - 1 ? "last" : "mid");

export const lines = {
  whosThat: (): Line => ({ text: COPY.ask, clips: ["line.whos-that"] }),
  gameOver: (): Line => ({ text: COPY.gameOver, clips: ["line.game-over"] }),
  reveal: (m: Pick<Mon, "dex" | "say">): Line => ({ text: COPY.reveal(m.say), clips: [`reveal.${m.dex}`] }),
  fact: (m: Pick<Mon, "dex" | "fact">): Line | undefined =>
    m.fact ? { text: m.fact, clips: [`fact.${m.dex}`], pauseMs: 250, extra: true } : undefined,
  /** "Is it A, B, C, or D?": each name recorded in its list position, so the joins fall on the commas. */
  choices: (ms: readonly Pick<Mon, "dex" | "say">[]): Line => ({
    text: COPY.choices(ms.map((m) => m.say)),
    clips: ms.length < 2 ? [] : ms.map((m, i) => `choice.${position(i, ms.length)}.${m.dex}`),
    gapMs: 150,
    pauseMs: 300,
  }),
};

/** Null when no recording can exist: survival past NAMED_MAX, a game length outside RECORDED_LENGTHS. */
export function scoreKey(s: { mode: Mode; correct: number; asked: number; perfect: boolean }): string | null {
  const n = s.correct;
  if (n === 0) return "score.nice-try";
  if (s.mode === "survival") return n <= NAMED_MAX ? `score.named.${n}` : null;
  if (!RECORDED_LENGTHS.includes(s.asked)) return null;
  if (s.perfect) return `score.perfect.${s.asked}`;
  return `score.${s.mode === "host" ? "team" : "got"}.${n}-of-${s.asked}`;
}

/** The clip for a spoken prize sentence. A custom tier whose text matches a recorded one finds its clip. */
export const prizeKey = (spokenPrize: string) => `prize.${slug(spokenPrize)}`;

/** 32-bit FNV-1a over UTF-8, as 8 hex digits. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** Accents dropped, lowercase, dashes between words. Over 60 characters: the first 50 plus a hash of the rest. */
export function slug(text: string): string {
  const s = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 60 ? `${s.slice(0, 50).replace(/-+$/, "")}-${fnv1a(s)}` : s;
}

/** Every key the game can ask for with default settings, except the default prizes (see results/model.ts). */
export function expectedKeys(mons: readonly Pick<Mon, "dex" | "fact">[]): string[] {
  const keys = [...CORE_KEYS, PRIZE_STAND_IN, "score.nice-try"];
  for (const m of mons) {
    keys.push(`reveal.${m.dex}`, `choice.first.${m.dex}`, `choice.mid.${m.dex}`, `choice.last.${m.dex}`);
    if (m.fact) keys.push(`fact.${m.dex}`);
  }
  for (const asked of RECORDED_LENGTHS)
    for (let n = 1; n <= asked; n++)
      for (const mode of ["classic", "host"] as const) keys.push(scoreKey({ mode, correct: n, asked, perfect: n === asked })!);
  for (let n = 1; n <= NAMED_MAX; n++) keys.push(`score.named.${n}`);
  return [...new Set(keys)];
}
