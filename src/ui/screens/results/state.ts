// UI state the results and leaderboard screens share: which game already had its prize
// ceremony, whether it was saved, and which leaderboard row to highlight.
import { create } from "zustand";
import type { GameConfig } from "../../../game/deck";

export type ResultsView = "summary" | "name";

interface ResultsUi {
  /** gameKey() of the game these flags belong to. A new game resets them. */
  key: string | null;
  view: ResultsView;
  /** The drumroll and prize reveal already played for this game; coming back skips them. */
  celebrated: boolean;
  /** Leaderboard entry saved from this game, so "Add my name" turns into "Saved!". */
  savedId: string | null;
  /** Leaderboard row to highlight. Not tied to `key`: it outlives the results screen. */
  highlight: { id: string; at: number } | null;
  /** One-shot: the next results screen skips the drumroll and opens on the prize (demos, screenshots). */
  instant: boolean;
}

export const useResultsUi = create<ResultsUi>(() => ({
  key: null,
  view: "summary",
  celebrated: false,
  savedId: null,
  highlight: null,
  instant: false,
}));

/** How long a just-saved row stays highlighted on the leaderboard. */
export const HIGHLIGHT_MS = 10 * 60 * 1000;

export function gameKey(game: { config: GameConfig | null; rounds: readonly unknown[]; score: number }): string | null {
  const { config } = game;
  return config ? `${config.mode}|${config.seed}|${game.rounds.length}|${game.score}` : null;
}

/** Makes the flags belong to `key`, resetting them when a different game shows up. */
export function claimGame(key: string | null): void {
  if (useResultsUi.getState().key !== key) useResultsUi.setState({ key, view: "summary", celebrated: false, savedId: null });
}

export function freshHighlight(now = Date.now()): string | null {
  const h = useResultsUi.getState().highlight;
  return h && now - h.at < HIGHLIGHT_MS ? h.id : null;
}
