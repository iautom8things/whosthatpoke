import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Mode } from "./game/deck";
import type { EventData } from "./lib/metrics";
import { errorMessage, watchGames } from "./metrics";
import { useSession } from "./state/session";
import { useSettings } from "./state/settings";

const S = () => useSession.getState();
const SEED = 20261022;

let events: [string, EventData | undefined][] = [];
let stop = () => {};
const names = () => events.map(([name]) => name);
const named = (name: string) => events.filter(([n]) => n === name).map(([, data]) => data);

function start(mode: Mode) {
  S().setSetup({ mode, categoryId: "all", difficulty: "easy" });
  S().start(SEED);
}

/** Answers the question on screen: the right Pokémon, a wrong one, or none (time ran out). */
function answer(how: "right" | "wrong" | "timeout") {
  const q = S().current!;
  S().beginAsking();
  const wrong = q.choices.find((m) => m.dex !== q.answer.dex)!.dex;
  S().answer(how === "right" ? q.answer.dex : how === "wrong" ? wrong : null, 5000, 20000);
}

beforeEach(() => {
  S().quit();
  useSettings.getState().update({ rounds: 3 });
  events = [];
  stop = watchGames((name, data) => events.push([name, data]));
});

afterEach(() => {
  stop();
  useSettings.getState().reset();
});

describe("game metrics", () => {
  it("counts a finished game, then each Pokémon named or missed", () => {
    start("classic");
    const mons: string[] = [];
    for (const how of ["right", "wrong", "timeout"] as const) {
      mons.push(S().current!.answer.name);
      answer(how);
      S().next();
    }

    expect(names()).toEqual(["game_start", "game_finish", "pokemon_named", "pokemon_missed", "pokemon_missed"]);
    expect(named("game_start")[0]).toMatchObject({ mode: "classic", category: "all", group: "featured", difficulty: "Poké Ball", rounds: 3 });
    expect(named("game_finish")[0]).toMatchObject({ asked: 3, correct: 1, best_streak: 1, prize: "Rookie Trainer" });
    const [wrong, timeout] = named("pokemon_missed");
    expect(named("pokemon_named")[0]).toMatchObject({ pokemon: mons[0], mode: "classic" });
    expect(wrong).toMatchObject({ pokemon: mons[1], how: "wrong", picked: expect.any(String) });
    expect(timeout).toMatchObject({ pokemon: mons[2], how: "timeout", picked: undefined });

    // Play again from the results screen is a new game, not a quit.
    events = [];
    S().start(SEED + 1);
    expect(names()).toEqual(["game_start"]);
  });

  it("counts a quit with the rounds played so far, and no rounds before the game ends", () => {
    start("classic");
    answer("right");
    S().next();
    answer("right");
    S().next();
    expect(names()).toEqual(["game_start"]);

    S().quit();
    expect(names()).toEqual(["game_start", "game_quit", "pokemon_named", "pokemon_named"]);
    expect(named("game_quit")[0]).toMatchObject({ mode: "classic", asked: 2, correct: 2 });
  });

  it("counts a game left unfinished for a new one as quit", () => {
    start("survival");
    answer("wrong");
    start("classic");
    expect(names()).toEqual(["game_start", "game_quit", "pokemon_missed", "game_start"]);
    expect(named("game_quit")[0]).toMatchObject({ mode: "survival", asked: 1, correct: 0 });
    expect(named("game_start")[0]).toMatchObject({ rounds: undefined });
  });

  it("counts host mode verdicts as the host left them", () => {
    start("host");
    const first = S().current!.answer.name;
    S().judge(true);
    S().rejudge(false); // a slipped swipe, fixed
    S().next();
    S().judge(false);
    S().rejudge(true);
    S().next();
    S().judge(true);
    expect(names()).toEqual(["game_start"]);
    S().next();

    expect(named("game_finish")[0]).toMatchObject({ mode: "host", asked: 3, correct: 2 });
    expect(names().slice(2)).toEqual(["pokemon_missed", "pokemon_named", "pokemon_named"]);
    expect(named("pokemon_missed")[0]).toMatchObject({ pokemon: first, how: "host", picked: undefined });
  });

  it("says custom for prize tiers the host wrote", () => {
    useSettings.getState().update({ prizeTiers: [{ minCorrect: 0, title: "Ms. Lee's treat", reward: "Candy", emoji: "🍬", color: "#fff" }] });
    start("classic");
    for (let i = 0; i < 3; i++) {
      answer("right");
      S().next();
    }
    expect(named("game_finish")[0]).toMatchObject({ prize: "custom" });
  });
});

describe("error messages", () => {
  it("keeps them short and drops URLs, which can carry a query string", () => {
    expect(errorMessage(new TypeError("Failed to load https://iautom8things.github.io/whosthatpoke/assets/a.js?demo=x now"))).toBe(
      "TypeError: Failed to load [url] now",
    );
    expect(errorMessage("x".repeat(300))).toHaveLength(100);
    expect(errorMessage(undefined)).toBe("");
  });
});
