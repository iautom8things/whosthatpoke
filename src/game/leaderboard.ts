// CONTRACT: implemented by the game-logic agent. Persists to localStorage (key "wtp.leaderboard.v1").
import type { DifficultyId } from "./difficulty";
import type { Mode } from "./deck";

export interface ScoreEntry {
  id: string;
  name: string;
  /** Dex number of the trainer's chosen buddy icon. */
  buddy: number;
  mode: Exclude<Mode, "host">;
  points: number;
  correct: number;
  total: number;
  bestStreak: number;
  difficulty: DifficultyId;
  categoryId: string;
  /** epoch ms */
  at: number;
}

export interface Leaderboard {
  add(entry: Omit<ScoreEntry, "id" | "at">): ScoreEntry;
  /** Best first. Classic sorts by points; survival by correct then points. `sinceMs` filters to tonight. */
  top(mode: ScoreEntry["mode"], limit?: number, sinceMs?: number): ScoreEntry[];
  /** 1-based rank this result would get, or null if it misses the top `limit`. */
  rankFor(mode: ScoreEntry["mode"], points: number, correct: number, limit?: number, sinceMs?: number): number | null;
  clear(): void;
  subscribe(fn: () => void): () => void;
}

export const leaderboard: Leaderboard = {
  add: () => { throw new Error("not implemented"); },
  top: () => [],
  rankFor: () => null,
  clear: () => {},
  subscribe: () => () => {},
};
