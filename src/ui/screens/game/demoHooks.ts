/**
 * Knobs the ?demo= setups (src/dev/demos/game.ts) turn to pin a moment for screenshots.
 * A real game never sets them.
 */
export const gameDemo: {
  /** Start the clock of question `index` with `ms` left. */
  clock?: { index: number; ms: number };
  /** Freeze clocks, keep popups up and skip auto-advance, so a screenshot can wait as long as it likes. */
  hold?: boolean;
  /** On a reveal, jump straight to this beat. */
  beat?: "result" | "fact";
} = {};
