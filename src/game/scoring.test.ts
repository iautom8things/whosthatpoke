import { describe, expect, it } from "vitest";
import { DIFFICULTIES, type DifficultyId } from "./difficulty";
import { DEFAULT_PRIZE_TIERS, nextTier, prizeFor, scoreAnswer, type AnswerInput, type PrizeTier } from "./scoring";

const score = (patch: Partial<AnswerInput>) =>
  scoreAnswer({ correct: true, msLeft: 0, totalMs: 10_000, streak: 0, difficulty: "easy", ...patch });

describe("scoreAnswer", () => {
  it("gives nothing for a wrong answer", () => {
    expect(score({ correct: false, msLeft: 10_000, streak: 9, difficulty: "master" })).toEqual({
      points: 0,
      base: 0,
      speedBonus: 0,
      streakBonus: 0,
    });
  });

  it("adds a linear speed bonus up to 100", () => {
    expect(score({ msLeft: 0 }).points).toBe(100);
    expect(score({ msLeft: 5_000 }).points).toBe(150);
    expect(score({ msLeft: 10_000 }).points).toBe(200);
    // Timer off: the session passes msLeft = totalMs.
    expect(score({ msLeft: 1, totalMs: 1 }).points).toBe(200);
  });

  it("adds 25 per prior streak step, capped at 100", () => {
    expect(score({ streak: 2 }).points).toBe(150);
    expect(score({ streak: 4 }).points).toBe(200);
    expect(score({ streak: 12 }).points).toBe(200);
  });

  it("multiplies by difficulty", () => {
    const maxed = (difficulty: DifficultyId) => score({ difficulty, msLeft: 10_000, streak: 4 }).points;
    expect(maxed("easy")).toBe(300);
    expect(maxed("medium")).toBe(450);
    expect(maxed("hard")).toBe(600);
    expect(maxed("master")).toBe(900);
  });

  it("rounds to the nearest 10 and the breakdown adds up", () => {
    for (const { id } of DIFFICULTIES) {
      for (let msLeft = 0; msLeft <= 10_000; msLeft += 333) {
        for (let streak = 0; streak <= 6; streak++) {
          const s = score({ difficulty: id, msLeft, streak });
          expect(s.points % 10).toBe(0);
          expect(s.base + s.speedBonus + s.streakBonus).toBe(s.points);
          expect(Math.min(s.base, s.speedBonus, s.streakBonus)).toBeGreaterThanOrEqual(0);
        }
      }
    }
    expect(score({ msLeft: 3_333, difficulty: "medium" }).points).toBe(200);
  });

  it("survives odd clock values", () => {
    expect(score({ msLeft: 50_000 }).points).toBe(200);
    expect(score({ msLeft: -5 }).points).toBe(100);
    expect(score({ msLeft: 0, totalMs: 0 }).points).toBe(100);
  });
});

describe("prizes", () => {
  const titles = (rounds: number, tiers?: readonly PrizeTier[]) =>
    Array.from({ length: rounds + 1 }, (_, correct) => prizeFor(correct, rounds, tiers).title);

  it("has the four default tiers", () => {
    expect(DEFAULT_PRIZE_TIERS.map((t) => [t.minCorrect, t.title, t.reward, t.emoji])).toEqual([
      [0, "Rookie Trainer", "Grab a treat!", "🍬"],
      [5, "Ace Trainer", "BIG candy!", "🍫"],
      [8, "Gym Leader", "BIG candy + bragging rights!", "🏆"],
      [10, "Pokémon Master", "Pick ANY candy you want!", "👑"],
    ]);
    for (const t of DEFAULT_PRIZE_TIERS) expect(t.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("scales thresholds to 5, 10 and 15 rounds", () => {
    const R = "Rookie Trainer";
    const A = "Ace Trainer";
    const G = "Gym Leader";
    const M = "Pokémon Master";
    expect(titles(10)).toEqual([R, R, R, R, R, A, A, A, G, G, M]);
    expect(titles(5)).toEqual([R, R, R, A, G, M]);
    expect(titles(15)).toEqual([R, R, R, R, R, R, R, R, A, A, A, A, G, G, G, M]);
  });

  it("accepts unsorted tiers and falls back to defaults when empty", () => {
    const shuffled = [DEFAULT_PRIZE_TIERS[2], DEFAULT_PRIZE_TIERS[0], DEFAULT_PRIZE_TIERS[3], DEFAULT_PRIZE_TIERS[1]];
    expect(titles(10, shuffled)).toEqual(titles(10));
    expect(titles(10, [])).toEqual(titles(10));
  });

  it("returns the lowest tier when nothing is reached", () => {
    const tiers: PrizeTier[] = [
      { minCorrect: 3, title: "Bronze", reward: "", emoji: "", color: "#000000" },
      { minCorrect: 7, title: "Gold", reward: "", emoji: "", color: "#000000" },
    ];
    expect(prizeFor(0, 10, tiers).title).toBe("Bronze");
    expect(prizeFor(7, 10, tiers).title).toBe("Gold");
  });

  it("gives the bigger prize when two tiers scale to the same count", () => {
    // 3 rounds: Gym Leader (8) and Master (10) both need 3.
    expect(prizeFor(3, 3).title).toBe("Pokémon Master");
  });

  it("nextTier says how many more for the next prize", () => {
    expect(nextTier(3, 10)).toEqual({ tier: DEFAULT_PRIZE_TIERS[1], needed: 2 });
    expect(nextTier(5, 10)).toEqual({ tier: DEFAULT_PRIZE_TIERS[2], needed: 3 });
    expect(nextTier(8, 15)).toEqual({ tier: DEFAULT_PRIZE_TIERS[2], needed: 4 });
    expect(nextTier(2, 3)).toEqual({ tier: DEFAULT_PRIZE_TIERS[3], needed: 1 });
    expect(nextTier(10, 10)).toBeNull();
  });
});
