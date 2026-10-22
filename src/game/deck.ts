// CONTRACT: implemented by the game-logic agent. Signatures are fixed; screens build against them.
import type { Mon } from "../data/types";
import type { DifficultyId } from "./difficulty";

export type Mode = "classic" | "survival" | "host";

export interface GameConfig {
  mode: Mode;
  categoryId: string;
  difficulty: DifficultyId;
  /** Questions in a classic or host game. Survival ignores it. */
  rounds: number;
  /** Seed for reproducible decks (demos, tests). */
  seed: number;
}

export interface Question {
  /** 0-based position in the game. */
  index: number;
  answer: Mon;
  /** Shuffled, includes the answer. Empty in host mode. */
  choices: Mon[];
}

export interface Deck {
  /** The next question, or null when the game has no more. */
  next(): Question | null;
  /** How many questions this deck can still produce (Infinity-safe for survival: a large number). */
  remaining(): number;
}

/**
 * Builds a deck for one game.
 * `recent` lists dex numbers shown in earlier games tonight (newest first); avoid them when the pool allows.
 */
export function createDeck(config: GameConfig, recent: readonly number[] = []): Deck {
  void config;
  void recent;
  throw new Error("createDeck not implemented yet");
}
