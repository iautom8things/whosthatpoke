import { beforeEach, describe, expect, it } from "vitest";
import type { Mode } from "../game/deck";
import { peekAhead, peekNext, SURVIVAL_LIVES, useSession } from "./session";

const S = () => useSession.getState();

function startGame(mode: Mode = "classic") {
  S().setSetup({ mode, categoryId: "all", difficulty: "easy" });
  S().start(20261022);
}

beforeEach(() => {
  S().quit();
});

describe("judge (host mode)", () => {
  it("records one round per question, even if called twice", () => {
    startGame();
    S().beginAsking();
    expect(S().judge(true)).not.toBeNull();
    const after = { rounds: S().rounds.length, correct: S().correct, streak: S().streak, score: S().score };
    expect(S().judge(true)).toBeNull();
    expect(S().judge(false)).toBeNull();
    expect({ rounds: S().rounds.length, correct: S().correct, streak: S().streak, score: S().score }).toEqual(after);
    expect(after).toMatchObject({ rounds: 1, correct: 1, streak: 1 });
  });

  it("works from the intro too", () => {
    startGame();
    expect(S().phase).toBe("intro");
    expect(S().judge(false)?.correct).toBe(false);
    expect(S().phase).toBe("revealed");
  });
});

describe("rejudge (host mode, a slipped swipe)", () => {
  it("flips the last verdict and its score, streak and count", () => {
    startGame();
    S().judge(true);
    S().next();
    S().judge(true);
    expect(S()).toMatchObject({ correct: 2, streak: 2, bestStreak: 2 });
    const firstPoints = S().rounds[0].score.points;

    expect(S().rejudge(false)?.correct).toBe(false);
    expect(S()).toMatchObject({ correct: 1, streak: 0, bestStreak: 1, score: firstPoints });
    expect(S().rounds).toHaveLength(2);
    expect(S().rounds[1]).toMatchObject({ picked: null, correct: false });

    S().rejudge(true);
    expect(S()).toMatchObject({ correct: 2, streak: 2, bestStreak: 2 });
    expect(S().rounds[1].score.streakBonus).toBeGreaterThan(0);
  });

  it("gives a survival ball back, or takes one", () => {
    startGame("survival");
    S().judge(false);
    expect(S().lives).toBe(SURVIVAL_LIVES - 1);
    S().rejudge(true);
    expect(S().lives).toBe(SURVIVAL_LIVES);
    S().rejudge(false);
    expect(S().lives).toBe(SURVIVAL_LIVES - 1);
  });

  it("does nothing while the question is still open", () => {
    startGame();
    expect(S().rejudge(true)).toBeNull();
    expect(S().rounds).toHaveLength(0);
  });
});

describe("swapCurrent (art that won't load)", () => {
  it("puts a fresh question at the same spot and records nothing", () => {
    startGame();
    const before = S().current!;
    const upcoming = peekNext()!;
    expect(S().swapCurrent()).toBe(true);
    const now = S().current!;
    expect(now.index).toBe(before.index);
    expect(now.answer.dex).not.toBe(before.answer.dex);
    expect(now.answer.dex).not.toBe(upcoming.answer.dex);
    expect(now.choices.map((m) => m.dex)).toContain(now.answer.dex);
    expect(S()).toMatchObject({ phase: "intro", rounds: [], score: 0 });
    // The game's own deck is untouched: the next question is still the one drawn ahead.
    S().beginAsking();
    S().answer(null, 0, 1);
    S().next();
    expect(S().current?.answer.dex).toBe(upcoming.answer.dex);
  });

  it("never brings back an answer already asked", () => {
    startGame();
    const asked = new Set<number>();
    for (let i = 0; i < 5; i++) {
      asked.add(S().current!.answer.dex);
      S().beginAsking();
      S().answer(null, 0, 1);
      S().next();
    }
    const swappedOut = new Set<number>();
    for (let i = 0; i < 4; i++) {
      swappedOut.add(S().current!.answer.dex);
      expect(S().swapCurrent()).toBe(true);
      expect(asked.has(S().current!.answer.dex)).toBe(false);
      expect(swappedOut.has(S().current!.answer.dex)).toBe(false);
    }
  });

  it("only swaps during the intro", () => {
    startGame();
    S().beginAsking();
    const dex = S().current!.answer.dex;
    expect(S().swapCurrent()).toBe(false);
    expect(S().current!.answer.dex).toBe(dex);
  });
});

describe("peekAhead (fetching ahead)", () => {
  const play = () => {
    S().beginAsking();
    S().answer(null, 0, 1);
    S().next();
  };

  it("shows the questions next() will load, in order, and draws nothing twice", () => {
    startGame();
    const [a, b] = peekAhead(2).map((q) => q.answer.dex);
    expect(peekNext()?.answer.dex).toBe(a);
    expect(peekAhead(2).map((q) => q.answer.dex)).toEqual([a, b]);
    play();
    expect(S().current?.answer.dex).toBe(a);
    play();
    expect(S().current?.answer.dex).toBe(b);
  });

  it("keeps a swap off the questions drawn ahead", () => {
    startGame();
    const ahead = new Set(peekAhead(2).map((q) => q.answer.dex));
    expect(S().swapCurrent()).toBe(true);
    expect(ahead.has(S().current!.answer.dex)).toBe(false);
  });

  it("stops at the end of a classic game", () => {
    startGame();
    for (let i = 1; i < S().config!.rounds - 1; i++) play();
    expect(peekAhead(2)).toHaveLength(1);
    play();
    expect(peekAhead(2)).toEqual([]);
  });
});
