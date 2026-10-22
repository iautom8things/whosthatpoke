// Tonight's scores for the Party tab, so the host can find one bad name and take it off the board.
import { TONIGHT_MS, type Leaderboard, type ScoreEntry } from "../../../game/leaderboard";

/** Each board's best this many tonight. A score below that never shows on a board anyway. */
export const PER_BOARD = 50;
/** Rows shown before "Show all". */
export const COLLAPSED = 10;

/** Tonight's classic and survival scores, newest first: a name that just went up is at the top. */
export function tonightScores(board: Pick<Leaderboard, "top">, now = Date.now()): ScoreEntry[] {
  const since = TONIGHT_MS(now);
  return [...board.top("classic", PER_BOARD, since), ...board.top("survival", PER_BOARD, since)].sort((a, b) => b.at - a.at);
}
