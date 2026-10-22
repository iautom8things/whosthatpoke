// CONTRACT: implemented by the game-logic agent.
import type { DifficultyId } from "./difficulty";

export interface AnswerInput {
  correct: boolean;
  /** Time left on the clock when answered, ms. Pass totalMs when the timer is off. */
  msLeft: number;
  totalMs: number;
  /** Streak before this answer. */
  streak: number;
  difficulty: DifficultyId;
}

export interface AnswerScore {
  points: number;
  /** Breakdown for the "+250" popup. */
  base: number;
  speedBonus: number;
  streakBonus: number;
}

export function scoreAnswer(input: AnswerInput): AnswerScore {
  void input;
  throw new Error("scoreAnswer not implemented yet");
}

export interface PrizeTier {
  /** Correct answers needed, out of 10. Scaled for other round counts. */
  minCorrect: number;
  title: string;
  /** What the host hands over, e.g. "BIG candy!". */
  reward: string;
  emoji: string;
  color: string;
}

export const DEFAULT_PRIZE_TIERS: readonly PrizeTier[] = [];

/** Picks the tier for a result. `tiers` may come from settings. */
export function prizeFor(correct: number, rounds: number, tiers: readonly PrizeTier[] = DEFAULT_PRIZE_TIERS): PrizeTier {
  void correct;
  void rounds;
  void tiers;
  throw new Error("prizeFor not implemented yet");
}
