// Menu demos: ?demo=splash | title | title-empty | category | category-regions | category-types | difficulty | difficulty-host
import { leaderboard, TONIGHT_MS } from "../../game/leaderboard";
import { useNav } from "../../state/nav";
import { useSession } from "../../state/session";
import { registerDemo } from "../demos";

registerDemo("splash", () => {
  useNav.setState({ screen: "splash", history: [] });
});

registerDemo("title", () => {
  // The top-trainer banner needs one score from tonight. Demo URLs run on sessionStorage
  // (see dev/sandbox.ts), so this never lands on the real board.
  if (leaderboard.top("classic", 1, TONIGHT_MS()).length === 0) {
    leaderboard.add({ name: "Maya", buddy: 25, mode: "classic", points: 2350, correct: 9, total: 10, bestStreak: 6, difficulty: "medium", categoryId: "spooky" });
  }
  useNav.setState({ screen: "title", history: [] });
});

registerDemo("title-empty", () => {
  leaderboard.clear();
  useNav.setState({ screen: "title", history: [] });
});

registerDemo("category", () => {
  useSession.getState().setSetup({ mode: "classic", categoryId: "all" });
  useNav.setState({ screen: "category", history: ["title"] });
});

registerDemo("category-regions", () => {
  useSession.getState().setSetup({ mode: "host", categoryId: "region-kanto" });
  useNav.setState({ screen: "category", history: ["title"] });
});

registerDemo("category-types", () => {
  useSession.getState().setSetup({ mode: "survival", categoryId: "type-ghost" });
  useNav.setState({ screen: "category", history: ["title"] });
});

registerDemo("difficulty", () => {
  useSession.getState().setSetup({ mode: "classic", categoryId: "spooky", difficulty: "easy" });
  useNav.setState({ screen: "difficulty", history: ["title", "category"] });
});

registerDemo("difficulty-host", () => {
  useSession.getState().setSetup({ mode: "host", categoryId: "region-kanto", difficulty: "medium" });
  useNav.setState({ screen: "difficulty", history: ["title", "category"] });
});
