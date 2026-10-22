// Results, name entry and leaderboard demos. Open with ?demo=<name>.
// Results demos open on the prize; add &intro=full to watch the drumroll first.
import { createDeck, type GameConfig, type Mode } from "../../game/deck";
import { difficultyById, type DifficultyId } from "../../game/difficulty";
import { LEADERBOARD_KEY, type ScoreEntry } from "../../game/leaderboard";
import { scoreAnswer } from "../../game/scoring";
import { useNav } from "../../state/nav";
import { SURVIVAL_LIVES, useSession, type Round } from "../../state/session";
import { preloadArt } from "../../ui/components";
import { gameKey, useResultsUi } from "../../ui/screens/results/state";
import { registerDemo } from "../demos";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "x" = right, "." = wrong. */
function fakeGame(mode: Mode, categoryId: string, difficulty: DifficultyId, pattern: string, seed: number): Promise<void> {
  const marks = [...pattern].map((c) => c === "x");
  const config: GameConfig = { mode, categoryId, difficulty, rounds: mode === "survival" ? 10 : marks.length, seed };
  const deck = createDeck(config, []);
  const totalMs = difficultyById(difficulty).seconds * 1000;
  const rounds: Round[] = [];
  let streak = 0;
  let bestStreak = 0;
  let score = 0;
  let correct = 0;
  marks.forEach((ok, i) => {
    const question = deck.next();
    if (!question) return;
    const msLeft = ok ? Math.round(totalMs * (0.3 + ((i * 37) % 55) / 100)) : 0;
    const points = scoreAnswer({ correct: ok, msLeft, totalMs, streak, difficulty });
    const wrong = question.choices.find((c) => c.dex !== question.answer.dex)?.dex ?? null;
    rounds.push({ question, picked: ok ? question.answer.dex : wrong, correct: ok, score: points, msTaken: totalMs - msLeft });
    streak = ok ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
    score += points.points;
    correct += ok ? 1 : 0;
  });
  useSession.setState({
    setup: { mode, categoryId, difficulty },
    config,
    current: null,
    phase: "done",
    rounds,
    score,
    streak,
    bestStreak,
    correct,
    lives: mode === "survival" ? 0 : SURVIVAL_LIVES,
    askedAt: 0,
  });
  const full = new URLSearchParams(location.search).get("intro") === "full";
  useResultsUi.setState({ key: null, view: "summary", celebrated: false, savedId: null, instant: !full });
  useNav.setState({ screen: "results", history: ["title"] });
  // A real game has shown every answer already; decode them so screenshots match.
  return preloadArt(rounds.map((r) => r.question.answer), 3000);
}

type Seed = [name: string, buddy: number, mode: ScoreEntry["mode"], points: number, correct: number, total: number, best: number, difficulty: DifficultyId, categoryId: string, ago: number];

// Ten classic games tonight, two big older ones (so All time differs), and a few survival runs.
const SEEDS: Seed[] = [
  ["Mia", 25, "classic", 2450, 10, 10, 10, "easy", "all", 12 * MIN],
  ["Twinkle Toes", 700, "classic", 2180, 9, 10, 7, "medium", "spooky", 40 * MIN],
  ["Leo", 4, "classic", 1960, 9, 10, 6, "easy", "region-kanto", 25 * MIN],
  ["Ava", 133, "classic", 1720, 8, 10, 5, "easy", "starters", 70 * MIN],
  ["Noah", 7, "classic", 1540, 7, 10, 4, "easy", "all", 2 * HOUR],
  ["Captain Boo", 94, "classic", 1300, 6, 10, 3, "medium", "spooky", 3 * MIN],
  ["Zoe", 152, "classic", 1120, 5, 10, 3, "easy", "type-grass", 95 * MIN],
  ["Eli", 255, "classic", 900, 4, 10, 2, "easy", "region-hoenn", 3 * HOUR],
  ["Ruby", 1, "classic", 640, 3, 10, 2, "easy", "all", 50 * MIN],
  ["Finn", 393, "classic", 380, 2, 10, 1, "easy", "region-sinnoh", 4 * HOUR],
  ["Grandpa Joe", 150, "classic", 6840, 10, 10, 10, "master", "legendary", 2 * DAY],
  ["Ivy", 658, "classic", 3900, 9, 10, 8, "hard", "region-kalos", 26 * HOUR],
  ["Sofia", 906, "survival", 3120, 14, 17, 9, "medium", "all", 30 * MIN],
  ["Max", 6, "survival", 1800, 8, 11, 5, "easy", "type-fire", 80 * MIN],
  ["Owen", 9, "survival", 940, 4, 7, 3, "easy", "type-water", 2 * HOUR],
  ["Lily", 448, "survival", 5200, 21, 24, 12, "hard", "all", 3 * DAY],
];

function seedBoard(extra: ScoreEntry[] = []): void {
  const now = Date.now();
  const entries: ScoreEntry[] = SEEDS.map(([name, buddy, mode, points, correct, total, bestStreak, difficulty, categoryId, ago], i) => ({
    id: `demo-${i}`,
    name,
    buddy,
    mode,
    points,
    correct,
    total,
    bestStreak,
    difficulty,
    categoryId,
    at: now - ago,
  }));
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify([...entries, ...extra]));
  } catch {
    // storage blocked: the board just starts empty
  }
}

function clearBoard(): void {
  try {
    localStorage.removeItem(LEADERBOARD_KEY);
  } catch {
    // nothing to clear
  }
}

registerDemo("results-treat", () => {
  seedBoard();
  return fakeGame("classic", "all", "easy", "x..x..x...", 31);
});
registerDemo("results-big-candy", () => {
  seedBoard();
  return fakeGame("classic", "region-kanto", "easy", "xx.xx..x.x", 32);
});
registerDemo("results-gym-leader", () => {
  seedBoard();
  return fakeGame("classic", "spooky", "medium", "xxxxx.xxxx", 33);
});
registerDemo("results-master", () => {
  seedBoard();
  return fakeGame("classic", "legendary", "hard", "xxxxxxxxxx", 34);
});
registerDemo("results-survival", () => {
  seedBoard();
  return fakeGame("survival", "all", "medium", "xxxx.xxxxxxx.x.", 35);
});
registerDemo("results-host", () => {
  seedBoard();
  return fakeGame("host", "starters", "easy", "xxx.xxx.xx", 36);
});
registerDemo("name-entry", async () => {
  seedBoard();
  await fakeGame("classic", "all", "easy", "xxxx.xxxx.", 37);
  useResultsUi.setState({ key: gameKey(useSession.getState()), view: "name", celebrated: true, instant: false });
});

function showBoard(): void {
  useResultsUi.setState({ highlight: null });
  useNav.setState({ screen: "leaderboard", history: ["title"] });
}

registerDemo("leaderboard", () => {
  seedBoard();
  showBoard();
});
registerDemo("leaderboard-empty", () => {
  clearBoard();
  showBoard();
});

/** A row saved seconds ago, at `points`: 2000 lands third tonight, 200 falls outside the top 10. */
function savedJustNow(points: number, correct: number): void {
  const at = Date.now() - 20_000;
  const fresh: ScoreEntry = { id: "demo-new", name: "Pumpkin Pal", buddy: 25, mode: "classic", points, correct, total: 10, bestStreak: correct, difficulty: "easy", categoryId: "all", at };
  seedBoard([fresh]);
  useResultsUi.setState({ highlight: { id: fresh.id, at } });
  useNav.setState({ screen: "leaderboard", history: ["title"] });
}
registerDemo("leaderboard-new", () => savedJustNow(2000, 9));
registerDemo("leaderboard-mine", () => savedJustNow(200, 1));
