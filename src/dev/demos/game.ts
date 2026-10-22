// Game screen states for screenshots: ?demo=game-new, game-intro, game-asking, game-asking-urgent,
// game-revealed-correct, game-revealed-wrong, game-survival, game-over, game-long-names, game-last.
// Add &hold=1 to freeze clocks and auto-advance; &beat=result|fact pins a reveal beat.
import { monByDex } from "../../data/catalog";
import type { Mon } from "../../data/types";
import type { Mode } from "../../game/deck";
import { difficultyById, type DifficultyId } from "../../game/difficulty";
import { useNav } from "../../state/nav";
import { useSession } from "../../state/session";
import { gameDemo } from "../../ui/screens/game/demoHooks";
import { registerDemo } from "../demos";

const SEED = 20261022;

/** Sample facts until the catalog ships its own (mon.fact). */
const FACTS: Record<number, string> = {
  25: "It stores electricity in its red cheeks. When it gets excited, little sparks fly out!",
  94: "On dark nights it hides in your shadow, waiting for the perfect moment to play a trick.",
  740: "It climbed all the way up a snowy mountain looking for food, and grew thick fur to stay warm.",
};

function withFact(mon: Mon): Mon {
  return FACTS[mon.dex] ? { ...mon, fact: FACTS[mon.dex] } : mon;
}

interface Opts {
  mode?: Mode;
  difficulty?: DifficultyId;
  categoryId?: string;
}

function begin({ mode = "classic", difficulty = "easy", categoryId = "all" }: Opts = {}) {
  const params = new URLSearchParams(location.search);
  gameDemo.hold = params.has("hold");
  const beat = params.get("beat");
  gameDemo.beat = beat === "result" || beat === "fact" ? beat : undefined;
  const s = useSession.getState();
  s.setSetup({ mode, difficulty, categoryId });
  s.start(SEED);
  useNav.setState({ screen: "game", history: ["title", "category", "difficulty"] });
}

const totalMs = () => difficultyById(useSession.getState().setup.difficulty).seconds * 1000;

/** Answers the question on screen (right or wrong) and loads the next one. */
function play(results: boolean[]) {
  for (const right of results) {
    const s = useSession.getState();
    const q = s.current;
    if (!q) return;
    s.beginAsking();
    const wrong = q.choices.find((m) => m.dex !== q.answer.dex) ?? q.answer;
    useSession.getState().answer(right ? q.answer.dex : wrong.dex, totalMs() * 0.6, totalMs());
    useSession.getState().next();
  }
}

/** Puts a specific question on screen: `answer` plus three other names, answer in slot `at`. */
function force(answer: number, others: number[], at = 0) {
  const s = useSession.getState();
  const index = s.current?.index ?? 0;
  const choices = others.map(monByDex);
  choices.splice(at, 0, withFact(monByDex(answer)));
  useSession.setState({ current: { index, answer: choices[at], choices } });
}

function ask() {
  useSession.getState().beginAsking();
}

function reveal(right: boolean, msLeftShare = 0.62) {
  const s = useSession.getState();
  const q = s.current;
  if (!q) return;
  s.beginAsking();
  const wrong = q.choices.find((m) => m.dex !== q.answer.dex) ?? q.answer;
  useSession.getState().answer(right ? q.answer.dex : wrong.dex, totalMs() * msLeftShare, totalMs());
}

// A fresh game straight from the menus: ?demo=game-new (&mode=survival&difficulty=hard).
registerDemo("game-new", () => {
  const params = new URLSearchParams(location.search);
  const mode = params.get("mode") === "survival" ? "survival" : "classic";
  const difficulty = (params.get("difficulty") as DifficultyId | null) ?? "easy";
  begin({ mode, difficulty });
});

registerDemo("game-intro", () => {
  begin();
  force(25, [39, 54, 52], 2);
});

registerDemo("game-asking", () => {
  begin();
  play([true, false]);
  force(94, [93, 302, 778], 1);
  ask();
});

registerDemo("game-asking-urgent", () => {
  begin({ difficulty: "medium" });
  play([true, true, false, true]);
  force(6, [149, 5, 130], 3);
  gameDemo.clock = { index: useSession.getState().current?.index ?? 0, ms: 4200 };
  ask();
});

registerDemo("game-revealed-correct", () => {
  begin();
  play([true, true]);
  force(25, [39, 54, 52], 0);
  reveal(true);
});

registerDemo("game-revealed-wrong", () => {
  begin({ difficulty: "medium" });
  play([true, false, true]);
  force(94, [93, 302, 778], 2);
  reveal(false);
});

registerDemo("game-survival", () => {
  begin({ mode: "survival", difficulty: "medium" });
  play([true, true, true, false, true, true, false]);
  ask();
});

registerDemo("game-over", () => {
  begin({ mode: "survival" });
  play([true, true, false, true, true, true, false]);
  force(94, [93, 302, 778], 0);
  reveal(false);
});

registerDemo("game-long-names", () => {
  begin({ difficulty: "hard" });
  play([true]);
  force(740, [662, 823, 115], 0);
  if (new URLSearchParams(location.search).has("reveal")) reveal(false);
  else ask();
});

registerDemo("game-last", () => {
  begin();
  play([true, true, false, true, true, true, true, false, true]);
  force(25, [39, 54, 52], 1);
  reveal(true);
});
