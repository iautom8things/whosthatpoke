import { describe, expect, it } from "vitest";
import { createLeaderboard, TONIGHT_WINDOW_MS, type ScoreEntry } from "../../../game/leaderboard";
import type { StorageLike } from "../../../game/storage";
import { PER_BOARD, tonightScores } from "./partyScores";

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const HOUR = 60 * 60 * 1000;
const NOW = 100 * HOUR;

function board() {
  const storage = memoryStorage();
  let clock = 0;
  const lb = createLeaderboard({ storage: () => storage, events: null, now: () => clock });
  const add = (name: string, mode: ScoreEntry["mode"], points: number, at: number) => {
    clock = at;
    return lb.add({ name, buddy: 25, mode, points, correct: Math.round(points / 250), total: 10, bestStreak: 1, difficulty: "easy", categoryId: "all" });
  };
  return { lb, add };
}

describe("tonightScores", () => {
  it("lists both boards from tonight, newest first", () => {
    const { lb, add } = board();
    add("Old", "classic", 2500, NOW - TONIGHT_WINDOW_MS - HOUR);
    add("Mia", "classic", 2000, NOW - 3 * HOUR);
    add("Max", "survival", 900, NOW - 2 * HOUR);
    add("Leo", "classic", 500, NOW - HOUR);
    expect(tonightScores(lb, NOW).map((e) => e.name)).toEqual(["Leo", "Max", "Mia"]);
  });

  it("drops a removed name and keeps everyone else", () => {
    const { lb, add } = board();
    add("Mia", "classic", 2000, NOW - 2 * HOUR);
    const bad = add("Rude", "classic", 1500, NOW - HOUR);
    add("Max", "survival", 900, NOW - HOUR / 2);
    expect(lb.remove(bad.id)).toBe(true);
    expect(tonightScores(lb, NOW).map((e) => e.name)).toEqual(["Max", "Mia"]);
  });

  it("holds each board's best PER_BOARD, so a busy night stays bounded", () => {
    const { lb, add } = board();
    for (let i = 0; i < PER_BOARD + 5; i++) add(`C${i}`, "classic", 100 + i, NOW - HOUR + i);
    add("S", "survival", 300, NOW - HOUR);
    const list = tonightScores(lb, NOW);
    expect(list).toHaveLength(PER_BOARD + 1);
    expect(list.some((e) => e.name === "C0")).toBe(false);
  });
});
