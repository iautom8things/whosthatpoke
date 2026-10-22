import { describe, expect, it, vi } from "vitest";
import { createLeaderboard, LEADERBOARD_KEY, MAX_ENTRIES, TONIGHT_MS, type ScoreEntry } from "./leaderboard";
import type { StorageLike } from "./storage";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: StorageLike & { data: Map<string, string> } = {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
  return store;
}

function board(storage: StorageLike | null = fakeStorage(), events: EventTarget | null = null) {
  let clock = 1_000_000;
  return createLeaderboard({ storage: () => storage, events, now: () => (clock += 1000) });
}

type Input = Omit<ScoreEntry, "id" | "at">;
const entry = (patch: Partial<Input>): Input => ({
  name: "Ash",
  buddy: 25,
  mode: "classic",
  points: 0,
  correct: 0,
  total: 10,
  bestStreak: 0,
  difficulty: "easy",
  categoryId: "all",
  ...patch,
});

describe("leaderboard", () => {
  it("add() returns the stored entry with an id and time", () => {
    const lb = board();
    const a = lb.add(entry({ name: "  Misty  ", points: 500 }));
    const b = lb.add(entry({ points: 400 }));
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
    expect(a.at).toBeLessThan(b.at);
    expect(a.name).toBe("Misty");
    expect(lb.top("classic")).toEqual([a, b]);
  });

  it("sorts classic by points, then correct, then who got there first", () => {
    const lb = board();
    const first = lb.add(entry({ name: "first", points: 800, correct: 8 }));
    const low = lb.add(entry({ name: "low", points: 300, correct: 9 }));
    const more = lb.add(entry({ name: "more", points: 800, correct: 9 }));
    const tie = lb.add(entry({ name: "tie", points: 800, correct: 8 }));
    expect(lb.top("classic").map((e) => e.name)).toEqual(["more", "first", "tie", "low"]);
    expect([more, first, tie, low].map((e) => lb.rankOf(e.id))).toEqual([1, 2, 3, 4]);
  });

  it("sorts survival by correct, then points, and keeps modes apart", () => {
    const lb = board();
    lb.add(entry({ name: "a", mode: "survival", correct: 12, points: 900 }));
    lb.add(entry({ name: "b", mode: "survival", correct: 15, points: 100 }));
    lb.add(entry({ name: "c", mode: "survival", correct: 12, points: 1200 }));
    lb.add(entry({ name: "classic", points: 5000, correct: 10 }));
    expect(lb.top("survival").map((e) => e.name)).toEqual(["b", "c", "a"]);
    expect(lb.top("classic").map((e) => e.name)).toEqual(["classic"]);
  });

  it("limits and filters to tonight", () => {
    let now = 0;
    const storage = fakeStorage();
    const lb = createLeaderboard({ storage: () => storage, events: null, now: () => now });
    now = Date.UTC(2026, 9, 21, 20);
    lb.add(entry({ name: "last night", points: 999 }));
    now += 24 * 3600_000;
    for (let i = 0; i < 12; i++) lb.add(entry({ name: `kid ${i}`, points: i * 10 }));
    expect(lb.top("classic")).toHaveLength(10);
    expect(lb.top("classic", 3).map((e) => e.name)).toEqual(["last night", "kid 11", "kid 10"]);
    expect(lb.top("classic", 3, TONIGHT_MS(now)).map((e) => e.name)).toEqual(["kid 11", "kid 10", "kid 9"]);
    expect(TONIGHT_MS(now)).toBe(now - 12 * 3600_000);
  });

  it("rankFor predicts a new result's rank, after ties, or null outside the limit", () => {
    const lb = board();
    for (const points of [900, 700, 500, 300]) lb.add(entry({ points, correct: points / 100 }));
    expect(lb.rankFor("classic", 1000, 10)).toBe(1);
    expect(lb.rankFor("classic", 700, 7)).toBe(3);
    expect(lb.rankFor("classic", 600, 6)).toBe(3);
    expect(lb.rankFor("classic", 100, 1)).toBe(5);
    expect(lb.rankFor("classic", 100, 1, 4)).toBeNull();
    expect(lb.rankFor("survival", 0, 0)).toBe(1);
  });

  it("reads corrupt storage as empty and recovers on the next write", () => {
    const storage = fakeStorage({ [LEADERBOARD_KEY]: "{not json" });
    const lb = board(storage);
    expect(lb.top("classic")).toEqual([]);
    lb.add(entry({ points: 100 }));
    expect(JSON.parse(storage.data.get(LEADERBOARD_KEY)!)).toHaveLength(1);
  });

  it("drops malformed rows but keeps good ones", () => {
    const good: ScoreEntry = { ...entry({ points: 100 }), id: "x", at: 5 };
    const storage = fakeStorage({
      [LEADERBOARD_KEY]: JSON.stringify([good, null, 7, { id: "y" }, { ...good, id: "z", mode: "host" }]),
    });
    expect(board(storage).top("classic")).toEqual([good]);
    expect(board(fakeStorage({ [LEADERBOARD_KEY]: '{"a":1}' })).top("classic")).toEqual([]);
  });

  it("falls back to memory when storage is missing or throws", () => {
    const missing = board(null);
    missing.add(entry({ points: 100 }));
    expect(missing.top("classic")).toHaveLength(1);

    const broken: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {},
    };
    const lb = board(broken);
    lb.add(entry({ points: 100 }));
    lb.add(entry({ points: 200 }));
    expect(lb.top("classic").map((e) => e.points)).toEqual([200, 100]);

    const full = fakeStorage();
    full.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    const quota = board(full);
    quota.add(entry({ points: 300 }));
    expect(quota.top("classic").map((e) => e.points)).toEqual([300]);
  });

  it(`keeps at most ${MAX_ENTRIES} entries, holding on to the best`, () => {
    const lb = board();
    const champ = lb.add(entry({ name: "champ", points: 99_999 }));
    for (let i = 0; i < MAX_ENTRIES + 40; i++) lb.add(entry({ points: i }));
    expect(lb.all()).toHaveLength(MAX_ENTRIES);
    expect(lb.top("classic", 1)[0].id).toBe(champ.id);
  });

  it("clear() empties the board", () => {
    const storage = fakeStorage();
    const lb = board(storage);
    lb.add(entry({ points: 100 }));
    lb.clear();
    expect(lb.top("classic")).toEqual([]);
    expect(storage.data.has(LEADERBOARD_KEY)).toBe(false);
  });

  it("all() keeps the same reference until something changes", () => {
    const lb = board();
    lb.add(entry({ points: 100 }));
    expect(lb.all()).toBe(lb.all());
    const before = lb.all();
    lb.add(entry({ points: 200 }));
    expect(lb.all()).not.toBe(before);
  });

  it("notifies subscribers on add, clear and other tabs' writes", () => {
    const events = new EventTarget();
    const storage = fakeStorage();
    const lb = board(storage, events);
    const fn = vi.fn();
    const off = lb.subscribe(fn);
    lb.add(entry({ points: 100 }));
    lb.clear();
    expect(fn).toHaveBeenCalledTimes(2);

    // Another tab writes a score.
    const other: ScoreEntry = { ...entry({ name: "other tab", points: 700 }), id: "o", at: 1 };
    storage.data.set(LEADERBOARD_KEY, JSON.stringify([other]));
    events.dispatchEvent(Object.assign(new Event("storage"), { key: LEADERBOARD_KEY }));
    expect(fn).toHaveBeenCalledTimes(3);
    expect(lb.top("classic")[0].name).toBe("other tab");

    events.dispatchEvent(Object.assign(new Event("storage"), { key: "something.else" }));
    expect(fn).toHaveBeenCalledTimes(3);

    off();
    lb.add(entry({ points: 1 }));
    events.dispatchEvent(Object.assign(new Event("storage"), { key: LEADERBOARD_KEY }));
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
