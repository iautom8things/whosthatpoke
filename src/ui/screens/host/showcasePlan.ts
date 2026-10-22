// The showcase's pacing: which silhouettes get the full "Who's that Pokémon?", and which board each break shows.
import type { ScoreEntry } from "../../../game/leaderboard";

export type BoardMode = ScoreEntry["mode"];

/** Pokémon between the Top Trainers + "Tap to play!" breaks. */
export const EVERY = 6;

/**
 * The sting and "Who's that Pokémon?" play on the 1st, 4th, 7th... silhouette. Every 10 s for a whole night
 * wears thin, so the others slide in with a soft whoosh.
 */
export const asksAloud = (n: number) => n % 3 === 1;

/**
 * The board for the break after Pokémon `n` (a multiple of EVERY). Classic and Survival take turns, so Survival
 * kids reach the projector too. A board nobody is on yet gives way to the other; null when both are empty.
 */
export function boardFor(n: number, boards: Record<BoardMode, readonly unknown[]>): BoardMode | null {
  const turn: BoardMode = Math.round(n / EVERY) % 2 === 1 ? "classic" : "survival";
  const other: BoardMode = turn === "classic" ? "survival" : "classic";
  if (boards[turn].length > 0) return turn;
  return boards[other].length > 0 ? other : null;
}
