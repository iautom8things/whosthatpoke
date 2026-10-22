// Small shared state for host mode and the showcase: the "seen the help" flag and demo overrides.
import type { Mon } from "../../../data/types";
import type { ScoreEntry } from "../../../game/leaderboard";

const HELP_KEY = "wtp.hostHelp.v1";

export function hostHelpSeen(): boolean {
  try {
    return localStorage.getItem(HELP_KEY) === "1";
  } catch {
    return false;
  }
}

export function markHostHelpSeen(seen = true): void {
  try {
    if (seen) localStorage.setItem(HELP_KEY, "1");
    else localStorage.removeItem(HELP_KEY);
  } catch {
    // Private mode: the help shows again next time. Fine.
  }
}

/** Demo overrides (src/dev/demos/host.ts). Never set in normal play. */
export const hostDemo: {
  /** Keep the reveal on screen instead of auto-advancing. */
  holdReveal: boolean;
} = { holdReveal: false };

export type ShowcaseStart = "ask" | "reveal" | "board" | "cta";

export const showcaseDemo: {
  start?: ShowcaseStart;
  /** Stay on the first slide (stable screenshots). */
  hold?: boolean;
  seed?: number;
  /** Shown on the Top Trainers slide instead of the real leaderboard. */
  entries?: ScoreEntry[];
  /** The first Pokémon shown (long-name checks). */
  firstMon?: Mon;
  /** Runs the loop this many times faster (soak tests). */
  speed?: number;
} = {};
