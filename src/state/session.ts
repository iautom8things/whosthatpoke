import { create } from "zustand";
import { createDeck, type Deck, type GameConfig, type Mode, type Question } from "../game/deck";
import type { DifficultyId } from "../game/difficulty";
import { recentAnswers, rememberAnswers } from "../game/history";
import { scoreAnswer, type AnswerScore } from "../game/scoring";
import { useSettings } from "./settings";

export const SURVIVAL_LIVES = 3;

export interface Setup {
  mode: Mode;
  categoryId: string;
  difficulty: DifficultyId;
}

export interface Round {
  question: Question;
  /** Dex the player picked. null = timed out (or host marked it missed). */
  picked: number | null;
  correct: boolean;
  score: AnswerScore;
  msTaken: number;
}

/**
 * intro    silhouette flying in, "Who's that Pokémon?"
 * asking   clock running, answers enabled
 * revealed color art + name shown, waiting for next
 * done     game over, go to results
 */
export type Phase = "idle" | "intro" | "asking" | "revealed" | "done";

interface SessionState {
  setup: Setup;
  config: GameConfig | null;
  current: Question | null;
  phase: Phase;
  rounds: Round[];
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  lives: number;
  askedAt: number;

  setSetup(patch: Partial<Setup>): void;
  /** Builds a deck from setup + settings and loads the first question (phase "intro"). */
  start(seed?: number): void;
  /** Intro animation finished: start the clock. */
  beginAsking(): void;
  /** Player picked `dex` (null = time ran out). Moves to "revealed". */
  answer(dex: number | null, msLeft: number, totalMs: number): Round | null;
  /** Host mode: the parent judged the shout-out. Only while the question is open (intro or asking). */
  judge(correct: boolean): Round | null;
  /** Host mode: flip the verdict on the question just judged (a slipped swipe). Only while revealed. */
  rejudge(correct: boolean): Round | null;
  /**
   * The question's art would not load: put a fresh question in its place, same position, nothing recorded.
   * Only during the intro. False when no replacement is left.
   */
  swapCurrent(): boolean;
  /** Load the next question, or finish. */
  next(): void;
  /** Leave the game early. */
  quit(): void;
}

let deck: Deck | null = null;
/** One question drawn ahead so the screen can preload its art. undefined = not drawn yet. */
let ahead: Question | null | undefined;
/** Stand-ins for questions whose art fails, from a second deck so the game's own deck stays whole. */
let spare: Deck | null = null;

function draw(): Question | null {
  if (ahead !== undefined) {
    const q = ahead;
    ahead = undefined;
    return q;
  }
  return deck?.next() ?? null;
}

/** The question next() will load, without moving the game on. null when the deck has no more. */
export function peekNext(): Question | null {
  if (ahead === undefined) ahead = deck?.next() ?? null;
  return ahead;
}

const isOver = (s: Pick<SessionState, "config" | "lives" | "rounds">) =>
  s.config?.mode === "survival" ? s.lives <= 0 : s.rounds.length >= (s.config?.rounds ?? 0);

export const useSession = create<SessionState>((set, get) => ({
  setup: { mode: "classic", categoryId: "all", difficulty: "easy" },
  config: null,
  current: null,
  phase: "idle",
  rounds: [],
  score: 0,
  streak: 0,
  bestStreak: 0,
  correct: 0,
  lives: SURVIVAL_LIVES,
  askedAt: 0,

  setSetup: (patch) => set({ setup: { ...get().setup, ...patch } }),

  start: (seed = Date.now() % 2147483647) => {
    const { setup } = get();
    const config: GameConfig = { ...setup, rounds: useSettings.getState().rounds, seed };
    deck = createDeck(config, recentAnswers());
    ahead = undefined;
    spare = null;
    const current = draw();
    set({
      config,
      current,
      phase: current ? "intro" : "done",
      rounds: [],
      score: 0,
      streak: 0,
      bestStreak: 0,
      correct: 0,
      lives: SURVIVAL_LIVES,
      askedAt: 0,
    });
  },

  beginAsking: () => {
    if (get().phase === "intro") set({ phase: "asking", askedAt: performance.now() });
  },

  answer: (dex, msLeft, totalMs) => {
    const s = get();
    if (s.phase !== "asking" || !s.current || !s.config) return null;
    const correct = dex === s.current.answer.dex;
    const score = scoreAnswer({ correct, msLeft, totalMs, streak: s.streak, difficulty: s.config.difficulty });
    const round: Round = { question: s.current, picked: dex, correct, score, msTaken: Math.max(0, totalMs - msLeft) };
    const streak = correct ? s.streak + 1 : 0;
    set({
      phase: "revealed",
      rounds: [...s.rounds, round],
      score: s.score + score.points,
      streak,
      bestStreak: Math.max(s.bestStreak, streak),
      correct: s.correct + (correct ? 1 : 0),
      lives: s.config.mode === "survival" && !correct ? s.lives - 1 : s.lives,
    });
    return round;
  },

  judge: (correct) => {
    const s = get();
    if (!s.current || !s.config || (s.phase !== "intro" && s.phase !== "asking")) return null;
    const dex = correct ? s.current.answer.dex : null;
    if (s.phase !== "asking") set({ phase: "asking", askedAt: performance.now() });
    return get().answer(dex, 0, 1);
  },

  rejudge: (correct) => {
    const s = get();
    const last = s.rounds.at(-1);
    if (s.phase !== "revealed" || !s.config || !last || last.question.index !== s.current?.index) return null;
    if (last.correct === correct) return last;
    // The streak this question started from: the run of right answers just before it.
    let before = 0;
    for (let i = s.rounds.length - 2; i >= 0 && s.rounds[i].correct; i--) before++;
    const score = scoreAnswer({ correct, msLeft: 0, totalMs: 1, streak: before, difficulty: s.config.difficulty });
    const round: Round = { ...last, picked: correct ? last.question.answer.dex : null, correct, score };
    const rounds = [...s.rounds.slice(0, -1), round];
    let run = 0;
    let bestStreak = 0;
    for (const r of rounds) {
      run = r.correct ? run + 1 : 0;
      bestStreak = Math.max(bestStreak, run);
    }
    const survival = s.config.mode === "survival";
    set({
      rounds,
      score: s.score - last.score.points + score.points,
      streak: correct ? before + 1 : 0,
      bestStreak,
      correct: s.correct + (correct ? 1 : -1),
      lives: survival ? s.lives + (correct ? 1 : -1) : s.lives,
    });
    return round;
  },

  swapCurrent: () => {
    const s = get();
    if (s.phase !== "intro" || !s.current || !s.config) return false;
    const used = new Set([...s.rounds.map((r) => r.question.answer.dex), s.current.answer.dex]);
    if (ahead) used.add(ahead.answer.dex);
    spare ??= createDeck({ ...s.config, seed: (s.config.seed * 7 + 13) % 2147483647 }, [...used, ...recentAnswers()]);
    for (let q = spare.next(); q; q = spare.next()) {
      if (used.has(q.answer.dex)) continue;
      set({ current: { ...q, index: s.current.index } });
      return true;
    }
    return false;
  },

  next: () => {
    const s = get();
    if (isOver(s)) {
      rememberAnswers(s.rounds.map((r) => r.question.answer.dex));
      set({ phase: "done", current: null });
      return;
    }
    const current = draw();
    if (!current) {
      rememberAnswers(s.rounds.map((r) => r.question.answer.dex));
      set({ phase: "done", current: null });
      return;
    }
    set({ current, phase: "intro", askedAt: 0 });
  },

  quit: () => {
    const s = get();
    if (s.phase !== "done" && s.rounds.length > 0) rememberAnswers(s.rounds.map((r) => r.question.answer.dex));
    deck = null;
    ahead = undefined;
    spare = null;
    set({ phase: "idle", current: null, config: null });
  },
}));
